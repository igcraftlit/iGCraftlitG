/**
 * 文件路径：apps/shell/src/iGM_LauncherV2_Servers.ts
 * 所属层：桌面外壳 / 服务器大厅数据层
 * 路由：全局
 * 模块：iGM_LauncherV2_Servers
 * 作用：服务器大厅的数据来源与本地持久化（公开数据动态拉取 + 内置主流服兜底）
 * 内容：公开服务器列表由本地进程请求第三方公开接口动态拉取，请求一律携带 User-Agent；
 *       拉取成功后在 launcher_data 内缓存一份，断网或接口不可用时降级读取缓存；
 *       内置一份知名服务器（Hypixel、2b2t 等）作为兜底，无论接口是否可用都固定展示；
 *       用户自定义服务器写入本地 SQLite（launcher_data/launcher.sqlite 的 my_servers 表），
 *       列表合并时自定义项恒排在最前（custom 为 true），并按 主机:端口 去重；
 *       单台服务器实时状态统一请求 mcsrvstat.us 取得（同样携带 User-Agent）并测量延迟，
 *       另提供批量状态查询，供界面按在线人数从高到低排序；
 *       另提供按 id 反查条目能力，供「一键进服」拼装 --server / --port 参数；
 *       自定义条目支持记录「客户端同步清单 URL」（manifest），供「启动并同步」直连外部清单
 * 说明：第三方接口可能限流或变更，任何网络失败都不抛异常，而是回退缓存并给出可读文案；
 *       自定义服务器为纯本地数据，不随社区账号同步
 */

// 导入依赖 //
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { IGM_LAUNCHERV2_APP_NAME, IGM_LAUNCHERV2_VERSION } from "./iGM_LauncherV2_Constants";
import type {
  iGM_LauncherV2_ServerEntry,
  iGM_LauncherV2_ServerListSource,
  iGM_LauncherV2_ServerStatus,
} from "./iGM_LauncherV2_Ipc";
import { iGM_LauncherV2_DataRoot, iGM_LauncherV2_JsonRead, iGM_LauncherV2_JsonWrite } from "./iGM_LauncherV2_Store";

// 类型定义 //

/** my_servers 表行结构（用户自定义服务器） */
interface iGM_LauncherV2_MyServerRow {
  id: string;
  name: string;
  ip: string;
  port: number;
  site: string;
  /** 客户端同步清单 URL（外部托管直链 JSON）；无则为空串 */
  manifest: string;
  created_at: string;
}

/** 列表接口返回的服务器对象（第三方公开接口字段，按需取用） */
interface iGM_LauncherV2_RemoteServer {
  slug?: unknown;
  name?: unknown;
  address?: unknown;
  port?: unknown;
  currentPlayers?: unknown;
  maxPlayers?: unknown;
  version?: unknown;
  iconUrl?: unknown;
}

/** 列表接口响应包 */
interface iGM_LauncherV2_RemoteListResponse {
  success?: unknown;
  data?: { servers?: unknown };
}

/** mcsrvstat.us v3 状态响应 */
interface iGM_LauncherV2_StatusResponse {
  online?: unknown;
  version?: unknown;
  players?: { online?: unknown; max?: unknown };
  motd?: { clean?: unknown; raw?: unknown };
}

/** 本地缓存的列表载荷 */
interface iGM_LauncherV2_ServerCachePayload {
  version: number;
  fetchedAt: string;
  items: iGM_LauncherV2_ServerEntry[];
}

/** 服务器大厅列表结果 */
export interface iGM_LauncherV2_ServerListResult {
  items: iGM_LauncherV2_ServerEntry[];
  source: iGM_LauncherV2_ServerListSource;
  message: string;
}

/** 单台服务器状态查询结果 */
export interface iGM_LauncherV2_ServerStatusResult {
  status: iGM_LauncherV2_ServerStatus | null;
  message: string;
}

/** 自定义服务器增删结果 */
export interface iGM_LauncherV2_ServerMutationResult {
  ok: boolean;
  message: string;
}

/** 一键进服的连接目标 */
export interface iGM_LauncherV2_ServerTarget {
  name: string;
  ip: string;
  port: number;
}

// 核心逻辑 //

/** 本地 SQLite 文件名（位于 launcher_data 内） */
const IGM_LAUNCHERV2_SERVERS_DB_FILE = "launcher.sqlite";

/** 公开服务器列表缓存文件名（位于 launcher_data 内） */
const IGM_LAUNCHERV2_SERVERS_CACHE_FILE = "servers_cache.json";

/** 缓存载荷结构版本 */
const IGM_LAUNCHERV2_SERVERS_CACHE_VERSION = 1;

/**
 * 第三方公开服务器列表接口（免密钥、只读，需署名）。
 * edition=JAVA 仅取 Java 版；sort=players 取当前在线人数最多的服务器，保证大厅内容有实际价值。
 */
const IGM_LAUNCHERV2_SERVERS_LIST_URL =
  "https://api.minecraftserver.id/api/v1/public/servers?edition=JAVA&sort=players&limit=50";

/** 实时状态接口（该源要求请求头携带 User-Agent，缺失会被直接拒绝） */
const IGM_LAUNCHERV2_SERVERS_STATUS_URL = "https://api.mcsrvstat.us/3";

/**
 * 请求统一使用的 User-Agent。
 * 两个第三方源都要求在请求头中标识调用方，缺失会被拒绝，故此处固定携带。
 */
const IGM_LAUNCHERV2_SERVERS_USER_AGENT = `${IGM_LAUNCHERV2_APP_NAME}/${IGM_LAUNCHERV2_VERSION} (+https://igcraftlit.com)`;

/** 网络请求超时（毫秒）：超时即视为该源不可用，交由上层降级 */
const IGM_LAUNCHERV2_SERVERS_TIMEOUT_MS = 12000;

/** 默认端口：未显式指定时按 Java 版默认端口处理 */
const IGM_LAUNCHERV2_SERVERS_DEFAULT_PORT = 25565;

/** 自定义服务器 id 前缀（用于稳定标识并区分来源） */
const IGM_LAUNCHERV2_SERVERS_MY_PREFIX = "my:";

/** 远端服务器 id 前缀 */
const IGM_LAUNCHERV2_SERVERS_NET_PREFIX = "net:";

/** 自定义服务器名称长度上限 */
const IGM_LAUNCHERV2_SERVERS_NAME_MAX = 48;

/**
 * 内置知名服务器。
 * 公开接口不可用（例如断网）时，大厅依然要有可玩内容，故固定内置一批主流服务器。
 * 这些条目始终参与展示，与远端列表按「主机:端口」去重。
 */
const IGM_LAUNCHERV2_SERVERS_BUILTIN: {
  name: string;
  ip: string;
  port: number;
  site: string;
}[] = [
  { name: "Hypixel", ip: "mc.hypixel.net", port: 25565, site: "https://hypixel.net" },
  { name: "2b2t", ip: "2b2t.org", port: 25565, site: "https://2b2t.org" },
  { name: "Wynncraft", ip: "play.wynncraft.com", port: 25565, site: "https://wynncraft.com" },
  { name: "CubeCraft", ip: "play.cubecraft.net", port: 25565, site: "https://cubecraft.net" },
  { name: "ManaCube", ip: "play.manacube.com", port: 25565, site: "https://manacube.com" },
];

/** 批量状态查询的单次最大条目数（避免对公开源造成过大压力） */
const IGM_LAUNCHERV2_SERVERS_STATUS_MAX = 60;

/** 批量状态查询的并发上限（公开源对高频请求敏感） */
const IGM_LAUNCHERV2_SERVERS_STATUS_CONCURRENCY = 6;

/** 惰性打开的 SQLite 句柄（进程内复用，避免反复开关文件） */
let iGM_LauncherV2_ServersDb: Database | null = null;

/** 本地缓存绝对路径 */
function iGM_LauncherV2_ServersCachePath(): string {
  return join(iGM_LauncherV2_DataRoot(), IGM_LAUNCHERV2_SERVERS_CACHE_FILE);
}

/** 本地 SQLite 绝对路径 */
function iGM_LauncherV2_ServersDbPath(): string {
  return join(iGM_LauncherV2_DataRoot(), IGM_LAUNCHERV2_SERVERS_DB_FILE);
}

/** 取（并首次创建）SQLite 句柄，同时确保 my_servers 表存在 */
function iGM_LauncherV2_ServersDbGet(): Database {
  if (iGM_LauncherV2_ServersDb) return iGM_LauncherV2_ServersDb;

  mkdirSync(iGM_LauncherV2_DataRoot(), { recursive: true });
  const db = new Database(iGM_LauncherV2_ServersDbPath(), { create: true });
  db.exec(`CREATE TABLE IF NOT EXISTS my_servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    ip TEXT NOT NULL,
    port INTEGER NOT NULL,
    site TEXT NOT NULL DEFAULT '',
    manifest TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );`);
  // 旧版本库可能缺 manifest 列：按列信息检测后补齐，保证既有自定义服务器不丢数据
  const columns = db.query("PRAGMA table_info(my_servers)").all() as { name?: unknown }[];
  if (!columns.some((column) => column.name === "manifest")) {
    db.exec("ALTER TABLE my_servers ADD COLUMN manifest TEXT NOT NULL DEFAULT '';");
  }
  iGM_LauncherV2_ServersDb = db;
  return db;
}

/** 规范化主机名：去空格、去协议前缀与结尾斜杠 */
function iGM_LauncherV2_ServersHost(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
}

/** 端口规范化：非法或越界时回退默认端口 */
function iGM_LauncherV2_ServersPort(raw: unknown): number {
  const value = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(value)) return IGM_LAUNCHERV2_SERVERS_DEFAULT_PORT;
  const port = Math.floor(value);
  return port >= 1 && port <= 65535 ? port : IGM_LAUNCHERV2_SERVERS_DEFAULT_PORT;
}

/** 数值字段规范化：未知统一记为 -1 */
function iGM_LauncherV2_ServersCount(raw: unknown): number {
  const value = typeof raw === "number" ? raw : Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : -1;
}

/** 文本字段规范化：非字符串或空值时回退 */
function iGM_LauncherV2_ServersText(raw: unknown, fallback = ""): string {
  return typeof raw === "string" && raw.trim() ? raw.trim() : fallback;
}

/** 条目 id：来源前缀 + 主机 + 端口，保证同名不同址的服务器不会相互覆盖 */
function iGM_LauncherV2_ServersId(prefix: string, ip: string, port: number): string {
  return `${prefix}${ip.toLowerCase()}:${port}`;
}

/** 带超时与 User-Agent 的 JSON 请求；失败时抛出可读错误 */
async function iGM_LauncherV2_ServersFetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": IGM_LAUNCHERV2_SERVERS_USER_AGENT,
    },
    signal: AbortSignal.timeout(IGM_LAUNCHERV2_SERVERS_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}

/** 读取自定义服务器列表（自定义项恒为 custom: true） */
function iGM_LauncherV2_ServersCustomList(): iGM_LauncherV2_ServerEntry[] {
  const rows = iGM_LauncherV2_ServersDbGet()
    .query("SELECT id, name, ip, port, site, manifest, created_at FROM my_servers ORDER BY created_at DESC")
    .all() as iGM_LauncherV2_MyServerRow[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    ip: row.ip,
    port: iGM_LauncherV2_ServersPort(row.port),
    site: row.site ?? "",
    players: -1,
    maxPlayers: -1,
    version: "",
    icon: "",
    manifest: iGM_LauncherV2_ServersText(row.manifest),
    custom: true,
  }));
}

/** 把第三方列表响应规范化为条目数组；结构不符时返回空数组 */
function iGM_LauncherV2_ServersNormalize(raw: unknown): iGM_LauncherV2_ServerEntry[] {
  const payload = raw as iGM_LauncherV2_RemoteListResponse | null;
  const list = payload?.data?.servers;
  if (!Array.isArray(list)) return [];

  const items: iGM_LauncherV2_ServerEntry[] = [];
  const seen = new Set<string>();

  for (const entry of list as iGM_LauncherV2_RemoteServer[]) {
    const ip = iGM_LauncherV2_ServersHost(iGM_LauncherV2_ServersText(entry?.address));
    if (!ip) continue;
    const port = iGM_LauncherV2_ServersPort(entry?.port);
    const id = iGM_LauncherV2_ServersId(IGM_LAUNCHERV2_SERVERS_NET_PREFIX, ip, port);
    if (seen.has(id)) continue;
    seen.add(id);

    items.push({
      id,
      name: iGM_LauncherV2_ServersText(entry?.name, ip),
      ip,
      port,
      site: "",
      players: iGM_LauncherV2_ServersCount(entry?.currentPlayers),
      maxPlayers: iGM_LauncherV2_ServersCount(entry?.maxPlayers),
      version: iGM_LauncherV2_ServersText(entry?.version),
      icon: iGM_LauncherV2_ServersText(entry?.iconUrl),
      // 远端公开列表条目不提供客户端同步清单，manifest 一律为空串
      manifest: "",
      custom: false,
    });
  }
  return items;
}

/** 读取本地缓存的公开列表（损坏或缺失返回空数组） */
async function iGM_LauncherV2_ServersCacheRead(): Promise<iGM_LauncherV2_ServerEntry[]> {
  const payload = await iGM_LauncherV2_JsonRead<iGM_LauncherV2_ServerCachePayload>(
    iGM_LauncherV2_ServersCachePath(),
  );
  if (!payload || !Array.isArray(payload.items)) return [];
  return payload.items
    .filter((item) => Boolean(item?.id && item?.ip))
    // 旧缓存可能缺 manifest 字段：统一补齐为空串，保证调用方拿到的条目结构一致
    .map((item) => ({ ...item, manifest: typeof item.manifest === "string" ? item.manifest : "" }));
}

/** 写入本地缓存（写入失败不影响本次结果） */
async function iGM_LauncherV2_ServersCacheWrite(items: iGM_LauncherV2_ServerEntry[]): Promise<void> {
  try {
    const payload: iGM_LauncherV2_ServerCachePayload = {
      version: IGM_LAUNCHERV2_SERVERS_CACHE_VERSION,
      fetchedAt: new Date().toISOString(),
      items,
    };
    await iGM_LauncherV2_JsonWrite(iGM_LauncherV2_ServersCachePath(), payload);
  } catch (error) {
    console.warn("[iGM CraftCeon Launcher] 服务器列表缓存写入失败：", error);
  }
}

/** 按在线人数降序排列（未知人数排在最后），保证大厅首屏是活跃服务器 */
function iGM_LauncherV2_ServersSort(items: iGM_LauncherV2_ServerEntry[]): iGM_LauncherV2_ServerEntry[] {
  return [...items].sort((a, b) => {
    const left = a.players >= 0 ? a.players : -1;
    const right = b.players >= 0 ? b.players : -1;
    if (right !== left) return right - left;
    return a.name.localeCompare(b.name, "zh-CN");
  });
}

/** 内置知名服务器转成标准条目（custom 为 false，id 与远端条目采用同一 net: 前缀） */
function iGM_LauncherV2_ServersBuiltinList(): iGM_LauncherV2_ServerEntry[] {
  return IGM_LAUNCHERV2_SERVERS_BUILTIN.map((item) => ({
    id: iGM_LauncherV2_ServersId(IGM_LAUNCHERV2_SERVERS_NET_PREFIX, item.ip, item.port),
    name: item.name,
    ip: item.ip,
    port: item.port,
    site: item.site,
    players: -1,
    maxPlayers: -1,
    version: "",
    icon: "",
    manifest: "",
    custom: false,
  }));
}

/** 按「主机:端口」对多组条目去重（靠前者优先，保证自定义项不被内置 / 远端覆盖） */
function iGM_LauncherV2_ServersDedupe(
  groups: iGM_LauncherV2_ServerEntry[][],
): iGM_LauncherV2_ServerEntry[] {
  const seen = new Set<string>();
  const output: iGM_LauncherV2_ServerEntry[] = [];
  for (const group of groups) {
    for (const item of group) {
      const key = `${item.ip.toLowerCase()}:${item.port}`;
      if (seen.has(key)) continue;
      seen.add(key);
      output.push(item);
    }
  }
  return output;
}

/**
 * 获取服务器大厅列表。
 * 顺序为：自定义项（恒在最前） -> 内置主流服 -> 公开服务器（优先远端接口，失败降级缓存）。
 * 三组之间按「主机:端口」去重，保证同一台服务器不会重复出现。
 */
export async function iGM_LauncherV2_Servers_List(): Promise<iGM_LauncherV2_ServerListResult> {
  let custom: iGM_LauncherV2_ServerEntry[] = [];
  try {
    custom = iGM_LauncherV2_ServersCustomList();
  } catch (error) {
    console.warn("[iGM CraftCeon Launcher] 读取自定义服务器失败：", error);
  }

  const builtin = iGM_LauncherV2_ServersBuiltinList();

  let remote: iGM_LauncherV2_ServerEntry[] = [];
  let remoteError = "";
  try {
    remote = iGM_LauncherV2_ServersNormalize(
      await iGM_LauncherV2_ServersFetchJson(IGM_LAUNCHERV2_SERVERS_LIST_URL),
    );
  } catch (error) {
    remoteError = error instanceof Error ? error.message : "请求失败";
  }

  // 远端成功：写缓存并以远端为准；远端失败：读缓存降级
  if (remote.length > 0) {
    await iGM_LauncherV2_ServersCacheWrite(remote);
    return {
      items: iGM_LauncherV2_ServersDedupe([
        custom,
        builtin,
        iGM_LauncherV2_ServersSort(remote),
      ]),
      source: "remote",
      message: `已从第三方公开接口获取服务器列表（数据来源：minecraftserver.id），另内置 ${builtin.length} 台知名服务器`,
    };
  }

  const cached = await iGM_LauncherV2_ServersCacheRead();
  if (cached.length > 0) {
    return {
      items: iGM_LauncherV2_ServersDedupe([
        custom,
        builtin,
        iGM_LauncherV2_ServersSort(cached),
      ]),
      source: "cache",
      message: `公共接口暂不可用（${remoteError || "无返回数据"}），已展示本地缓存的 ${cached.length} 台公开服务器与内置主流服`,
    };
  }

  return {
    items: iGM_LauncherV2_ServersDedupe([custom, builtin]),
    source: "empty",
    message: remoteError
      ? `暂未获取到公开服务器列表（${remoteError}），当前展示内置主流服，也可点击「添加服务器」手动录入`
      : "暂未获取到公开服务器列表，当前展示内置主流服，也可点击「添加服务器」手动录入",
  };
}

/** 添加自定义服务器（名称与地址必填，重复地址视为同一条目并覆盖名称与清单） */
export async function iGM_LauncherV2_Servers_Add(input: {
  name: string;
  ip: string;
  port: number;
  site: string;
  /** 客户端同步清单 URL（外部托管直链 JSON）；可留空 */
  manifest: string;
}): Promise<iGM_LauncherV2_ServerMutationResult> {
  const name = input.name.trim().slice(0, IGM_LAUNCHERV2_SERVERS_NAME_MAX);
  const ip = iGM_LauncherV2_ServersHost(input.ip);
  if (!ip) return { ok: false, message: "服务器地址不可为空" };

  const port = iGM_LauncherV2_ServersPort(input.port);
  const site = input.site.trim();
  if (site && !/^https?:\/\//i.test(site)) {
    return { ok: false, message: "官网链接需以 http:// 或 https:// 开头" };
  }

  // 客户端同步清单 URL 可留空；填写时须为 http(s) 直链
  const manifest = input.manifest.trim();
  if (manifest && !/^https?:\/\//i.test(manifest)) {
    return { ok: false, message: "客户端同步清单 URL 需以 http:// 或 https:// 开头" };
  }

  const id = iGM_LauncherV2_ServersId(IGM_LAUNCHERV2_SERVERS_MY_PREFIX, ip, port);
  try {
    iGM_LauncherV2_ServersDbGet()
      .query(
        `INSERT INTO my_servers (id, name, ip, port, site, manifest, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, site = excluded.site, manifest = excluded.manifest`,
      )
      .run(id, name || ip, ip, port, site, manifest, new Date().toISOString());
    return { ok: true, message: `已添加服务器：${name || ip}` };
  } catch (error) {
    const text = error instanceof Error ? error.message : "写入本地数据库失败";
    return { ok: false, message: `添加服务器失败：${text}` };
  }
}

/** 移除自定义服务器 */
export function iGM_LauncherV2_Servers_Remove(id: string): iGM_LauncherV2_ServerMutationResult {
  if (!id.startsWith(IGM_LAUNCHERV2_SERVERS_MY_PREFIX)) {
    return { ok: false, message: "仅可删除自行添加的服务器" };
  }
  try {
    iGM_LauncherV2_ServersDbGet().query("DELETE FROM my_servers WHERE id = ?").run(id);
    return { ok: true, message: "已删除该服务器" };
  } catch (error) {
    const text = error instanceof Error ? error.message : "删除失败";
    return { ok: false, message: `删除服务器失败：${text}` };
  }
}

/** 按 id 反查条目：先查自定义，再查内置主流服，最后查本地缓存（供一键进服与状态查询确定目标） */
export async function iGM_LauncherV2_Servers_Find(
  id: string,
): Promise<iGM_LauncherV2_ServerEntry | null> {
  try {
    const hit = iGM_LauncherV2_ServersCustomList().find((item) => item.id === id);
    if (hit) return hit;
  } catch {
    // 本地数据库不可用时继续尝试内置与缓存
  }
  const builtin = iGM_LauncherV2_ServersBuiltinList().find((item) => item.id === id);
  if (builtin) return builtin;
  const cached = await iGM_LauncherV2_ServersCacheRead();
  return cached.find((item) => item.id === id) ?? null;
}

/**
 * 解析一键进服所需的最小目标信息。
 * 条目既可能来自本地自定义库，也可能来自远端缓存，故两者都查。
 */
export async function iGM_LauncherV2_Servers_Target(
  id: string,
): Promise<iGM_LauncherV2_ServerTarget | null> {
  const entry = await iGM_LauncherV2_Servers_Find(id);
  if (!entry) return null;
  return { name: entry.name, ip: entry.ip, port: entry.port };
}

/** 状态响应中的 MOTD 取纯文本（clean 优先，退化为 raw 数组拼接） */
function iGM_LauncherV2_ServersMotd(raw: iGM_LauncherV2_StatusResponse): string {
  const clean = raw?.motd?.clean;
  if (typeof clean === "string") return clean;
  const lines = raw?.motd?.raw;
  if (Array.isArray(lines)) {
    return lines.filter((line): line is string => typeof line === "string").join(" ");
  }
  return "";
}

/**
 * 查询单台服务器的实时状态。
 * 直达 mcsrvstat.us（携带 User-Agent），并以前后时间差测量往返延迟；
 * 任何网络异常都归为「离线」而非抛出，保证界面始终能拿到一次明确结果。
 */
export async function iGM_LauncherV2_Servers_Status(
  ip: string,
  port: number,
): Promise<iGM_LauncherV2_ServerStatusResult> {
  const host = iGM_LauncherV2_ServersHost(ip);
  if (!host) return { status: null, message: "服务器地址无效" };

  const target = `${host}:${iGM_LauncherV2_ServersPort(port)}`;
  const started = Date.now();
  try {
    const payload = (await iGM_LauncherV2_ServersFetchJson(
      `${IGM_LAUNCHERV2_SERVERS_STATUS_URL}/${encodeURIComponent(target)}`,
    )) as iGM_LauncherV2_StatusResponse;
    const latency = Date.now() - started;
    const online = payload?.online === true;

    return {
      status: {
        online,
        players: online ? iGM_LauncherV2_ServersCount(payload?.players?.online) : -1,
        maxPlayers: online ? iGM_LauncherV2_ServersCount(payload?.players?.max) : -1,
        version: iGM_LauncherV2_ServersText(payload?.version),
        motd: iGM_LauncherV2_ServersMotd(payload),
        latency,
      },
      message: online ? `${target} 在线（${latency} ms）` : `${target} 当前离线`,
    };
  } catch (error) {
    const text = error instanceof Error ? error.message : "请求失败";
    return {
      status: { online: false, players: -1, maxPlayers: -1, version: "", motd: "", latency: -1 },
      message: `状态查询失败（${text}）`,
    };
  }
}

/** 批量状态查询结果项 */
export interface iGM_LauncherV2_ServerStatusBatchItem {
  id: string;
  status: iGM_LauncherV2_ServerStatus | null;
}

/** 批量状态查询结果 */
export interface iGM_LauncherV2_ServerStatusBatchResult {
  items: iGM_LauncherV2_ServerStatusBatchItem[];
  message: string;
}

/**
 * 批量查询服务器实时状态。
 * 用于界面按在线人数（players.online）从高到低排序，同时控制并发与总量，
 * 避免对公开状态源造成压力；单台失败不影响其余条目，失败项 status 为 null。
 */
export async function iGM_LauncherV2_Servers_StatusAll(
  ids: string[],
): Promise<iGM_LauncherV2_ServerStatusBatchResult> {
  const unique = [...new Set(ids.filter((id) => Boolean(id)))].slice(
    0,
    IGM_LAUNCHERV2_SERVERS_STATUS_MAX,
  );
  if (unique.length === 0) return { items: [], message: "没有可查询的服务器" };

  const items: iGM_LauncherV2_ServerStatusBatchItem[] = [];

  // 分片并发：每片最多 IGM_LAUNCHERV2_SERVERS_STATUS_CONCURRENCY 台同时查询
  for (let index = 0; index < unique.length; index += IGM_LAUNCHERV2_SERVERS_STATUS_CONCURRENCY) {
    const chunk = unique.slice(index, index + IGM_LAUNCHERV2_SERVERS_STATUS_CONCURRENCY);
    const settled = await Promise.all(
      chunk.map(async (id) => {
        const target = await iGM_LauncherV2_Servers_Target(id);
        if (!target) return { id, status: null } as iGM_LauncherV2_ServerStatusBatchItem;
        const result = await iGM_LauncherV2_Servers_Status(target.ip, target.port);
        return { id, status: result.status } as iGM_LauncherV2_ServerStatusBatchItem;
      }),
    );
    items.push(...settled);
  }

  const online = items.filter((item) => item.status?.online === true).length;
  return {
    items,
    message: `已刷新 ${items.length} 台服务器状态（在线 ${online} 台，按在线人数排序）`,
  };
}

// 导出 //
export default iGM_LauncherV2_Servers_List;