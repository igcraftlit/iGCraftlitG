/**
 * 文件路径：apps/shell/src/iGM_LauncherV2_LocalServers.ts
 * 所属层：桌面外壳 / 本地开服数据层
 * 路由：全局
 * 模块：iGM_LauncherV2_LocalServers
 * 作用：本地服务器（本地开服）的目录结构、元数据落盘与核心下载 / 安装编排
 * 内容：服务器存放根目录为 <总目录>/servers（见 iGM_LauncherV2_MatrixRootPath）；
 *       每台服务器一个目录 servers/<id>，元数据集中落盘于 servers/index.json；
 *       创建流程分四阶段并以 server:core 回推进度——
 *       prepare（建目录与 mods/config/plugins(仅 Paper)/world 子目录）、
 *       download（按核心来源直连上游下载服务端核心，流式回推字节进度）、
 *       install（写 eula.txt 与 server.properties；Forge/NeoForge 拿到 installer 时执行安装器）、
 *       done / error；
 *       核心直链全部直连上游（Mojang / PaperMC / FabricMC / MinecraftForge / NeoForged），
 *       绝不经过 api.igcraftlit.com；来源不可用时按 iGM_LauncherV2_MirrorUrls 镜像回退；
 *       进度一律以多语言键 + 占位符参数回推，外壳不产生用户可见文案
 * 说明：本模块只负责本地开服的取数与落盘；界面展示与交互由界面层负责
 */

// 导入依赖 //
import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { IGM_LAUNCHERV2_APP_NAME, IGM_LAUNCHERV2_VERSION } from "./iGM_LauncherV2_Constants";
import type {
  iGM_LauncherV2_InboundMessage,
  iGM_LauncherV2_LocalServer,
  iGM_LauncherV2_ServerCore,
  iGM_LauncherV2_ServerCorePhase,
  iGM_LauncherV2_ServerCoreState,
} from "./iGM_LauncherV2_Ipc";
import { iGM_LauncherV2_Java_List } from "./iGM_LauncherV2_Java";
import { iGM_LauncherV2_MatrixRootPath } from "./iGM_LauncherV2_Paths";
import { iGM_LauncherV2_MirrorUrls } from "./iGM_LauncherV2_Versions";

// 类型定义 //

/** 本地开服回推回调（外壳经契约层回推，供主进程注入 webview 推送） */
type iGM_LauncherV2_LocalServersNotify = (message: iGM_LauncherV2_InboundMessage) => void;

/** 服务端核心解析结果：候选地址、落盘文件名与是否为安装器 */
interface iGM_LauncherV2_LocalServersCorePlan {
  /** 候选下载地址（按序尝试，含镜像回退） */
  urls: string[];
  /** 落盘文件名（位于服务器目录内） */
  fileName: string;
  /** 是否为安装器（Forge / NeoForge 为 true，需 java -jar 执行） */
  installer: boolean;
}

/** 服务器元数据索引文件结构 */
interface iGM_LauncherV2_LocalServersIndex {
  version: number;
  items: iGM_LauncherV2_LocalServer[];
}

// 核心逻辑 //

/** 服务器存放目录名（位于总目录下） */
const IGM_LAUNCHERV2_LOCALSERVERS_DIR = "servers";

/** 服务器元数据索引文件名（位于服务器存放目录内） */
const IGM_LAUNCHERV2_LOCALSERVERS_INDEX_FILE = "index.json";

/** 元数据索引结构版本 */
const IGM_LAUNCHERV2_LOCALSERVERS_INDEX_VERSION = 1;

/** 请求统一使用的 User-Agent */
const IGM_LAUNCHERV2_LOCALSERVERS_USER_AGENT = `${IGM_LAUNCHERV2_APP_NAME}/${IGM_LAUNCHERV2_VERSION} (+https://igcraftlit.com)`;

/** Metadata 请求超时（毫秒） */
const IGM_LAUNCHERV2_LOCALSERVERS_FETCH_TIMEOUT_MS = 15000;

/** 核心下载整体超时（毫秒）：大体积服务端核心需要更长时限 */
const IGM_LAUNCHERV2_LOCALSERVERS_DOWNLOAD_TIMEOUT_MS = 600000;

/** 安装器执行超时（毫秒） */
const IGM_LAUNCHERV2_LOCALSERVERS_INSTALL_TIMEOUT_MS = 900000;

/** 默认服务端端口 */
const IGM_LAUNCHERV2_LOCALSERVERS_DEFAULT_PORT = 25565;

/** 原子落盘的临时文件后缀 */
const IGM_LAUNCHERV2_LOCALSERVERS_PART_SUFFIX = ".igm-part";

/** 服务器存放根目录绝对路径（<总目录>/servers） */
export function iGM_LauncherV2_ServersPath(): string {
  return join(iGM_LauncherV2_MatrixRootPath(), IGM_LAUNCHERV2_LOCALSERVERS_DIR);
}

/** 服务器元数据索引文件绝对路径 */
function iGM_LauncherV2_LocalServersIndexPath(): string {
  return join(iGM_LauncherV2_ServersPath(), IGM_LAUNCHERV2_LOCALSERVERS_INDEX_FILE);
}

/** 文本字段归一化：非字符串或空值时回退 */
function iGM_LocalServersText(raw: unknown, fallback = ""): string {
  return typeof raw === "string" && raw.trim() ? raw.trim() : fallback;
}

/** 校验枚举值是否为合法核心 */
function iGM_LocalServersIsCore(value: unknown): value is iGM_LauncherV2_ServerCore {
  return (
    value === "vanilla" ||
    value === "paper" ||
    value === "fabric" ||
    value === "forge" ||
    value === "neoforge"
  );
}

/** 名称转存储键：仅保留 ASCII 字母数字，其余折叠为连字符 */
function iGM_LocalServersSlug(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (base || "server").slice(0, 32);
}

/** 生成唯一服务器标识：名称 slug + 时间戳 + 短哈希，与既有标识去重 */
function iGM_LocalServersNewId(name: string, existing: Set<string>): string {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const seed = `${name}|${Date.now()}|${attempt}|${Math.random()}`;
    const hash = createHash("sha256").update(seed).digest("hex").slice(0, 6);
    const id = `${iGM_LocalServersSlug(name)}-${Date.now().toString(36)}-${hash}`;
    if (!existing.has(id)) return id;
  }
  return `${iGM_LocalServersSlug(name)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 读取元数据索引；文件缺失或损坏时返回空列表 */
async function iGM_LauncherV2_LocalServersIndexRead(): Promise<iGM_LauncherV2_LocalServer[]> {
  try {
    const text = (await readFile(iGM_LauncherV2_LocalServersIndexPath(), "utf8")).trim();
    if (!text) return [];
    const parsed = JSON.parse(text) as iGM_LauncherV2_LocalServersIndex;
    if (!parsed || !Array.isArray(parsed.items)) return [];
    return parsed.items.filter(
      (item): item is iGM_LauncherV2_LocalServer =>
        Boolean(item && typeof item.id === "string" && iGM_LocalServersIsCore(item.core)),
    );
  } catch {
    return [];
  }
}

/** 写入元数据索引（幂等，覆盖写入） */
async function iGM_LauncherV2_LocalServersIndexWrite(
  items: iGM_LauncherV2_LocalServer[],
): Promise<void> {
  await mkdir(iGM_LauncherV2_ServersPath(), { recursive: true });
  const payload: iGM_LauncherV2_LocalServersIndex = {
    version: IGM_LAUNCHERV2_LOCALSERVERS_INDEX_VERSION,
    items,
  };
  await writeFile(iGM_LauncherV2_LocalServersIndexPath(), JSON.stringify(payload, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}

/** 列举全部本地服务器（按创建时间倒序，最近创建在前） */
export async function iGM_LauncherV2_LocalServers_List(): Promise<iGM_LauncherV2_LocalServer[]> {
  const items = await iGM_LauncherV2_LocalServersIndexRead();
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** 按标识反查本地服务器（供清单工作室定位目录）；不存在返回 null */
export async function iGM_LauncherV2_LocalServers_Find(
  id: string,
): Promise<iGM_LauncherV2_LocalServer | null> {
  const target = iGM_LocalServersText(id);
  if (!target) return null;
  const items = await iGM_LauncherV2_LocalServersIndexRead();
  return items.find((item) => item.id === target) ?? null;
}

/** 删除本地服务器：移除目录并更新元数据索引 */
export async function iGM_LauncherV2_LocalServers_Remove(id: string): Promise<void> {
  const target = iGM_LocalServersText(id);
  if (!target) return;
  const items = await iGM_LauncherV2_LocalServersIndexRead();
  const hit = items.find((item) => item.id === target);
  if (!hit) return;
  await rm(hit.dir || join(iGM_LauncherV2_ServersPath(), target), {
    recursive: true,
    force: true,
  }).catch(() => undefined);
  await iGM_LauncherV2_LocalServersIndexWrite(items.filter((item) => item.id !== target));
}

/** 带超时与 User-Agent 的 JSON 请求；失败或超时返回 null */
async function iGM_LocalServersFetchJson(url: string): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IGM_LAUNCHERV2_LOCALSERVERS_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json", "user-agent": IGM_LAUNCHERV2_LOCALSERVERS_USER_AGENT },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 生成候选地址列表：首选上游原始地址，再并入 iGM_LauncherV2_MirrorUrls 的镜像备选；
 * launchermeta.mojang.com 不在该函数覆盖范围内，此处单独补 BMCLAPI 镜像。
 */
function iGM_LocalServersCandidates(url: string): string[] {
  const list = [url, ...iGM_LauncherV2_MirrorUrls(url)];
  if (url.startsWith("https://launchermeta.mojang.com/")) {
    list.push(url.replace("https://launchermeta.mojang.com/", "https://bmclapi2.bangbang93.com/"));
  }
  return Array.from(new Set(list));
}

/** 按候选地址依次取 JSON，任一成功即返回 */
async function iGM_LocalServersFetchJsonAny(url: string): Promise<unknown | null> {
  for (const candidate of iGM_LocalServersCandidates(url)) {
    const json = await iGM_LocalServersFetchJson(candidate);
    if (json) return json;
  }
  return null;
}

/** 版本号降序比较（复用与资源中心一致的 . - + 分段数值比较口径） */
function iGM_LocalServersCompareVersionDesc(a: string, b: string): number {
  const pa = a.split(/[.\-+]/);
  const pb = b.split(/[.\-+]/);
  for (let index = 0; index < Math.max(pa.length, pb.length); index += 1) {
    const na = Number.parseInt(pa[index] ?? "", 10) || 0;
    const nb = Number.parseInt(pb[index] ?? "", 10) || 0;
    if (na !== nb) return nb - na;
  }
  return 0;
}

/** 解析 Vanilla 核心：版本清单 -> 该版本 JSON -> downloads.server.url */
async function iGM_LocalServersResolveVanilla(
  gameVersion: string,
): Promise<iGM_LauncherV2_LocalServersCorePlan> {
  const manifest = (await iGM_LocalServersFetchJsonAny(
    "https://launchermeta.mojang.com/mc/game/version_manifest_v2.json",
  )) as { versions?: unknown } | null;
  const list = Array.isArray(manifest?.versions) ? manifest?.versions : [];
  let detailUrl = "";
  for (const item of list as { id?: unknown; url?: unknown }[]) {
    if (item?.id === gameVersion && typeof item.url === "string") {
      detailUrl = item.url;
      break;
    }
  }
  if (!detailUrl) throw new Error("version-not-found");

  const detail = (await iGM_LocalServersFetchJsonAny(detailUrl)) as {
    downloads?: { server?: { url?: unknown } };
  } | null;
  const serverUrl = detail?.downloads?.server?.url;
  if (typeof serverUrl !== "string" || !serverUrl) throw new Error("server-jar-missing");

  return { urls: iGM_LocalServersCandidates(serverUrl), fileName: "server.jar", installer: false };
}

/** 解析 Paper 核心：取该版本最后一个 build 的 application 产物 */
async function iGM_LocalServersResolvePaper(
  gameVersion: string,
): Promise<iGM_LauncherV2_LocalServersCorePlan> {
  const base = "https://api.papermc.io/v2/projects/paper/versions";
  const builds = (await iGM_LocalServersFetchJson(
    `${base}/${encodeURIComponent(gameVersion)}/builds`,
  )) as { builds?: unknown } | null;
  const list = Array.isArray(builds?.builds) ? builds?.builds : [];
  if (list.length === 0) throw new Error("build-not-found");

  const last = list[list.length - 1] as {
    build?: unknown;
    downloads?: { application?: { name?: unknown } };
  };
  const name = last?.downloads?.application?.name;
  if (typeof last?.build !== "number" || typeof name !== "string") throw new Error("build-not-found");

  const url = `${base}/${encodeURIComponent(gameVersion)}/builds/${last.build}/downloads/${encodeURIComponent(name)}`;
  return { urls: [url], fileName: "paper.jar", installer: false };
}

/** 解析 Fabric 核心：loader 为空时取最新稳定加载器，再拼服务端 launcher jar 直链 */
async function iGM_LocalServersResolveFabric(
  gameVersion: string,
  loaderVersion: string,
): Promise<iGM_LauncherV2_LocalServersCorePlan> {
  let loader = loaderVersion.trim();
  if (!loader) {
    const list = (await iGM_LocalServersFetchJson("https://meta.fabricmc.net/v2/versions/loader")) as
      | unknown
      | null;
    if (Array.isArray(list)) {
      const first = list[0] as { version?: unknown };
      if (typeof first?.version === "string") loader = first.version;
    }
  }
  if (!loader) throw new Error("loader-not-found");

  const official = `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(gameVersion)}/${encodeURIComponent(loader)}/server/jar`;
  const mirror = `https://bmclapi2.bangbang93.com/fabric-meta/v2/versions/loader/${encodeURIComponent(gameVersion)}/${encodeURIComponent(loader)}/server/jar`;
  return {
    urls: Array.from(new Set([official, mirror])),
    fileName: "fabric-server-launch.jar",
    installer: false,
  };
}

/** 解析 Forge 核心：promotions_slim.json 取版本，再拼 Maven 安装器直链 */
async function iGM_LocalServersResolveForge(
  gameVersion: string,
  loaderVersion: string,
): Promise<iGM_LauncherV2_LocalServersCorePlan> {
  let forgeVer = loaderVersion.trim();
  if (forgeVer.startsWith(`${gameVersion}-`)) forgeVer = forgeVer.slice(gameVersion.length + 1);
  if (!forgeVer) {
    const promos = (await iGM_LocalServersFetchJson(
      "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json",
    )) as { promos?: Record<string, string> } | null;
    const map = promos?.promos ?? {};
    forgeVer = map[`${gameVersion}-latest`] ?? map[`${gameVersion}-recommended`] ?? "";
  }
  if (!forgeVer) throw new Error("forge-version-not-found");

  const artifact = `${gameVersion}-${forgeVer}`;
  const official = `https://maven.minecraftforge.net/net/minecraftforge/forge/${artifact}/forge-${artifact}-installer.jar`;
  const mirror = `https://bmclapi2.bangbang93.com/maven/net/minecraftforge/forge/${artifact}/forge-${artifact}-installer.jar`;
  return {
    urls: Array.from(new Set([official, mirror])),
    fileName: "forge-installer.jar",
    installer: true,
  };
}

/** 解析 NeoForge 核心：取匹配游戏版本前缀的最新版本，再拼 Maven 安装器直链 */
async function iGM_LocalServersResolveNeoForge(
  gameVersion: string,
  loaderVersion: string,
): Promise<iGM_LauncherV2_LocalServersCorePlan> {
  let ver = loaderVersion.trim();
  if (!ver) {
    const data = (await iGM_LocalServersFetchJson(
      "https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge",
    )) as { versions?: unknown } | null;
    const all = Array.isArray(data?.versions)
      ? (data?.versions as unknown[]).filter((item): item is string => typeof item === "string")
      : [];
    const prefix = gameVersion.replace(/^1\./, "");
    const matched = all.filter((item) => item.startsWith(`${prefix}.`)).sort(iGM_LocalServersCompareVersionDesc);
    ver = matched[0] ?? "";
  }
  if (!ver) throw new Error("neoforge-version-not-found");

  const url = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${ver}/neoforge-${ver}-installer.jar`;
  return { urls: [url], fileName: "neoforge-installer.jar", installer: true };
}

/** 按核心类型解析下载计划 */
async function iGM_LocalServersResolveCore(
  core: iGM_LauncherV2_ServerCore,
  gameVersion: string,
  loaderVersion: string,
): Promise<iGM_LauncherV2_LocalServersCorePlan> {
  switch (core) {
    case "vanilla":
      return iGM_LocalServersResolveVanilla(gameVersion);
    case "paper":
      return iGM_LocalServersResolvePaper(gameVersion);
    case "fabric":
      return iGM_LocalServersResolveFabric(gameVersion, loaderVersion);
    case "forge":
      return iGM_LocalServersResolveForge(gameVersion, loaderVersion);
    case "neoforge":
      return iGM_LocalServersResolveNeoForge(gameVersion, loaderVersion);
    default:
      throw new Error("unsupported-core");
  }
}

/**
 * 下载单个核心文件：按候选地址依次尝试，流式写入并以已下载字节 / 总字节回推进度，
 * 成功后原子改名落盘；全部候选失败返回 false。
 */
async function iGM_LocalServersDownloadFile(
  urls: string[],
  targetPath: string,
  onProgress: (percent: number) => void,
): Promise<boolean> {
  const partPath = `${targetPath}${IGM_LAUNCHERV2_LOCALSERVERS_PART_SUFFIX}`;
  await mkdir(dirname(targetPath), { recursive: true });

  for (const url of urls) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      IGM_LAUNCHERV2_LOCALSERVERS_DOWNLOAD_TIMEOUT_MS,
    );
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { "user-agent": IGM_LAUNCHERV2_LOCALSERVERS_USER_AGENT },
      });
      if (!response.ok || !response.body) continue;

      const total = Number(response.headers.get("content-length") ?? 0) || 0;
      const sink = await open(partPath, "w");
      let received = 0;
      let lastPercent = -1;
      try {
        const reader = response.body.getReader();
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          await sink.write(chunk.value);
          received += chunk.value.length;
          const percent = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0;
          if (percent !== lastPercent) {
            lastPercent = percent;
            onProgress(percent);
          }
        }
      } finally {
        await sink.close();
      }

      await rm(targetPath, { force: true }).catch(() => undefined);
      await rename(partPath, targetPath);
      return true;
    } catch {
      await rm(partPath, { force: true }).catch(() => undefined);
    } finally {
      clearTimeout(timer);
    }
  }
  return false;
}

/** 探测本机可用的 java 可执行文件；探测失败返回空串 */
async function iGM_LocalServersJavaPath(): Promise<string> {
  try {
    const list = await iGM_LauncherV2_Java_List();
    const preferred = list.items.find((item) => item.id === list.defaultId) ?? list.items[0];
    if (preferred?.path) return preferred.path;
  } catch {
    // Java 列表不可用时继续尝试 PATH
  }
  const which = Bun.which("java");
  return which ?? "";
}

/** 执行核心安装器（java -jar installer --installServer）；成功返回 true */
async function iGM_LocalServersRunInstaller(
  javaPath: string,
  jarPath: string,
  dir: string,
): Promise<boolean> {
  let proc: ReturnType<typeof Bun.spawn> | null = null;
  try {
    proc = Bun.spawn([javaPath, "-jar", jarPath, "--installServer"], {
      cwd: dir,
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    });
    const timer = setTimeout(() => proc?.kill(), IGM_LAUNCHERV2_LOCALSERVERS_INSTALL_TIMEOUT_MS);
    const code = await proc.exited;
    clearTimeout(timer);
    return code === 0;
  } catch {
    return false;
  }
}

/** 写入 eula.txt 与 server.properties */
async function iGM_LocalServersWriteConfig(dir: string, name: string): Promise<void> {
  await writeFile(join(dir, "eula.txt"), "eula=true\n", "utf8");
  const properties = [
    `server-port=${IGM_LAUNCHERV2_LOCALSERVERS_DEFAULT_PORT}`,
    `motd=${name}`,
    "online-mode=true",
    "enable-command-block=false",
  ].join("\n");
  await writeFile(join(dir, "server.properties"), `${properties}\n`, "utf8");
}

/**
 * 创建本地服务器。
 * 全流程以 server:core 回推进度：准备目录 -> 解析并下载核心 -> 安装（写配置 / 执行安装器）-> 完成；
 * 任一阶段异常回推 error 并携带多语言键与原因占位符。
 */
export async function iGM_LauncherV2_LocalServers_Create(
  name: string,
  core: iGM_LauncherV2_ServerCore,
  gameVersion: string,
  loaderVersion: string,
  notify: iGM_LauncherV2_LocalServersNotify,
): Promise<void> {
  const displayName = iGM_LocalServersText(name);
  const version = iGM_LocalServersText(gameVersion);
  const loader = iGM_LocalServersText(loaderVersion);

  const state: iGM_LauncherV2_ServerCoreState = {
    id: "",
    name: displayName,
    core,
    gameVersion: version,
    phase: "prepare",
    percent: 0,
    messageKey: "server.local.phase.prepare",
    messageParams: {},
    dir: "",
  };

  const emit = (
    phase: iGM_LauncherV2_ServerCorePhase,
    percent: number,
    messageKey: string,
    messageParams: Record<string, string> = {},
  ): void => {
    state.phase = phase;
    state.percent = percent;
    state.messageKey = messageKey;
    state.messageParams = messageParams;
    notify({ type: "server:core", state: { ...state } });
  };

  const fail = (reason: string): void => {
    emit("error", 0, "server.local.phase.error", { reason });
  };

  try {
    if (!displayName) {
      fail("missing-name");
      return;
    }
    if (!version) {
      fail("missing-version");
      return;
    }

    // 1) 准备：生成唯一标识与目录，预建标准子目录
    const existing = new Set((await iGM_LauncherV2_LocalServersIndexRead()).map((item) => item.id));
    const id = iGM_LocalServersNewId(displayName, existing);
    const dir = join(iGM_LauncherV2_ServersPath(), id);
    state.id = id;
    state.dir = dir;
    emit("prepare", 0, "server.local.phase.prepare");

    await mkdir(dir, { recursive: true });
    const subdirs = ["mods", "config", "world"];
    if (core === "paper") subdirs.push("plugins");
    for (const sub of subdirs) {
      await mkdir(join(dir, sub), { recursive: true });
    }

    // 元数据先落盘，保证「创建中」的服务器也能被列表 / 清单工作室定位
    const record: iGM_LauncherV2_LocalServer = {
      id,
      name: displayName,
      core,
      gameVersion: version,
      loaderVersion: loader,
      dir,
      createdAt: new Date().toISOString(),
    };
    const current = await iGM_LauncherV2_LocalServersIndexRead();
    await iGM_LauncherV2_LocalServersIndexWrite([
      record,
      ...current.filter((item) => item.id !== id),
    ]);

    // 2) 下载：解析核心来源并流式下载
    emit("download", 0, "server.local.phase.download", { percent: "0" });
    const plan = await iGM_LocalServersResolveCore(core, version, loader);
    const targetPath = join(dir, plan.fileName);
    const ok = await iGM_LocalServersDownloadFile(plan.urls, targetPath, (percent) => {
      emit("download", percent, "server.local.phase.download", { percent: String(percent) });
    });
    if (!ok) {
      fail("core-download-failed");
      return;
    }

    // 3) 安装：写基础配置；安装器核心在拿到 java 时执行安装
    emit("install", 100, "server.local.phase.install");
    await iGM_LocalServersWriteConfig(dir, displayName);

    if (plan.installer) {
      const javaPath = await iGM_LocalServersJavaPath();
      if (!javaPath) {
        // 未探测到 java：跳过安装但仍置完成，提示需手动执行安装器
        emit("done", 100, "server.local.phase.manualInstall", { name: displayName });
        return;
      }
      const installed = await iGM_LocalServersRunInstaller(javaPath, targetPath, dir);
      if (!installed) {
        fail("core-install-failed");
        return;
      }
    }

    // 4) 完成
    emit("done", 100, "server.local.phase.done", { name: displayName });
  } catch (error) {
    fail(error instanceof Error ? error.message : "unknown");
  }
}

// 导出 //
export default iGM_LauncherV2_LocalServers_List;
