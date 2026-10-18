/**
 * 文件路径：apps/shell/src/iGM_LauncherV2_Versions.ts
 * 所属层：桌面外壳 / 资源中心数据层
 * 路由：全局
 * 模块：iGM_LauncherV2_Versions
 * 作用：多源获取 Minecraft 全量版本列表与加载器（Fabric / Forge）列表
 * 内容：配置三个下载源（Mojang 官方源、BMCLAPI 镜像源、备用镜像源）；
 *       每次取列表先对各源做测速（限时请求清单文件），择优使用可用且延迟最低的源；
 *       下载阶段提供后台自动测速选源（iGM_LauncherV2_SourceOrder，结果缓存 60 秒），
 *       按延迟升序给出候选源顺序，供多源容灾按序尝试；
 *       同时提供 BMCLAPI 等价地址换算，供下载阶段生成每份文件的多源候选地址
 * 说明：本模块只负责「取列表」「测速排序」与「地址换算」，不执行实际文件下载
 */

// 导入依赖 //
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  IGM_LAUNCHERV2_COMMUNITY_ISSUER,
} from "./iGM_LauncherV2_Constants";
import { iGM_LauncherV2_GameRootPath } from "./iGM_LauncherV2_Paths";

// 类型定义 //

/** 下载源：由下载引擎后台自动测速选源，按延迟升序依次尝试，不向用户暴露选择 */
export type iGM_LauncherV2_DownloadSource = "mojang" | "bmclapi" | "backup";

/** 下载源定义 */
interface iGM_LauncherV2_VersionSourceDef {
  id: string;
  label: string;
  /** 版本清单地址 */
  manifest: string;
  /** Fabric 加载器列表地址（{v} 替换为游戏版本号） */
  fabric: string;
}

/** 单个源的测速结果 */
export interface iGM_LauncherV2_VersionSource {
  id: string;
  label: string;
  /** 往返耗时（毫秒）；不可用为 null */
  ms: number | null;
  /** 是否可用 */
  ok: boolean;
}

/** 版本条目（只向界面暴露必要字段） */
export interface iGM_LauncherV2_VersionEntry {
  id: string;
  /** release 正式版 / snapshot 快照 / old 远古版本 */
  type: "release" | "snapshot" | "old";
  releaseTime: string;
}

/** 版本列表结果 */
export interface iGM_LauncherV2_VersionListResult {
  versions: iGM_LauncherV2_VersionEntry[];
  sources: iGM_LauncherV2_VersionSource[];
  activeSourceId: string;
  /** 当前采用源的展示名 */
  activeSourceLabel: string;
  message: string;
}

/** 加载器条目 */
export interface iGM_LauncherV2_LoaderEntry {
  /** 加载器版本号；原版为空串 */
  id: string;
  label: string;
  kind: "vanilla" | "fabric" | "forge" | "neoforge";
  /** 是否为最新版本（列表按版本号降序，首项为最新） */
  recommended: boolean;
}

/** 加载器列表结果 */
export interface iGM_LauncherV2_LoaderListResult {
  gameVersion: string;
  loaders: iGM_LauncherV2_LoaderEntry[];
  message: string;
}

/** 单个版本的详情（由版本清单 JSON 解析） */
export interface iGM_LauncherV2_VersionDetail {
  versionId: string;
  /** 发布时间（ISO 字符串） */
  releaseTime: string;
  /** 客户端 JAR 大小（字节）；未知为 0 */
  clientSize: number;
  /** 客户端 JAR 下载地址；未知为空串 */
  clientUrl: string;
  message: string;
}

// 核心逻辑 //

/** 单次网络请求超时（毫秒） */
const IGM_VERSIONS_TIMEOUT_MS = 8000;

/** 测速超时（毫秒）：超过即视为该源不可用 */
const IGM_VERSIONS_SPEED_TIMEOUT_MS = 5000;

/** 三个下载源：官方源、BMCLAPI 镜像源、备用镜像源 */
const IGM_VERSIONS_SOURCES: iGM_LauncherV2_VersionSourceDef[] = [
  {
    id: "mojang",
    label: "Mojang 官方源",
    manifest: "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json",
    fabric: "https://meta.fabricmc.net/v2/versions/loader/{v}",
  },
  {
    id: "bmclapi",
    label: "BMCLAPI 镜像源",
    manifest: "https://bmclapi2.bangbang93.com/mc/game/version_manifest_v2.json",
    fabric: "https://bmclapi2.bangbang93.com/fabric-meta/v2/versions/loader/{v}",
  },
  {
    id: "backup",
    label: "备用镜像源",
    manifest: "https://bmclapi.bangbang93.com/mc/game/version_manifest_v2.json",
    fabric: "https://bmclapi.bangbang93.com/fabric-meta/v2/versions/loader/{v}",
  },
];

/** 三个下载源的中文展示名 */
export const IGM_VERSIONS_SOURCE_LABELS: Record<iGM_LauncherV2_DownloadSource, string> = {
  mojang: "Mojang 官方源",
  bmclapi: "BMCLAPI 镜像源",
  backup: "备用镜像源",
};

/** 下载源默认回退顺序：测速探测失败时使用 */
export const IGM_VERSIONS_SOURCE_FALLBACK_ORDER: iGM_LauncherV2_DownloadSource[] = [
  "mojang",
  "bmclapi",
  "backup",
];

/**
 * 把官方地址按所选下载源换算为源专属地址。
 * mojang 原样返回；bmclapi 映射到 bmclapi2.bangbang93.com；backup 映射到 bmclapi.bangbang93.com。
 * 必须覆盖 piston-data.mojang.com（客户端 JAR 所在域，此前漏掉导致 client.jar 走镜像失败）。
 */
export function iGM_LauncherV2_SourceUrl(
  url: string,
  source: iGM_LauncherV2_DownloadSource,
): string {
  const host =
    source === "bmclapi" ? "bmclapi2.bangbang93.com" : source === "backup" ? "bmclapi.bangbang93.com" : "";
  if (!host) return url;
  const pairs: [string, string][] = [
    ["https://piston-meta.mojang.com/", `https://${host}/`],
    ["https://piston-data.mojang.com/", `https://${host}/`],
    ["https://launchermeta.mojang.com/", `https://${host}/`],
    ["https://launcher.mojang.com/", `https://${host}/`],
    ["https://resources.download.minecraft.net/", `https://${host}/assets/`],
    ["https://libraries.minecraft.net/", `https://${host}/maven/`],
  ];
  for (const [from, to] of pairs) {
    if (url.startsWith(from)) return url.replace(from, to);
  }
  return url;
}

/** 探测三个下载源（供 Step 4 测速按钮使用），返回各源延迟与可用性。 */
export async function iGM_LauncherV2_ProbeSources(): Promise<iGM_LauncherV2_VersionSource[]> {
  const probes = await Promise.all(IGM_VERSIONS_SOURCES.map((source) => iGM_LauncherV2_ProbeSource(source)));
  return probes.map((item) => item.speed);
}

/** 测速结果缓存时长（毫秒）：避免每个任务重复探测 */
const IGM_VERSIONS_PROBE_CACHE_MS = 60_000;

/** 上次测速得到的源顺序与时间戳（缓存 60 秒） */
let iGM_VersionsSourceOrderCache: iGM_LauncherV2_DownloadSource[] | null = null;
let iGM_VersionsSourceOrderAt = 0;

/** 判定字符串是否为合法下载源 id */
function iGM_LauncherV2_IsDownloadSource(value: string): value is iGM_LauncherV2_DownloadSource {
  return value === "mojang" || value === "bmclapi" || value === "backup";
}

/**
 * 取得按延迟升序排列的下载源顺序（不可用的排在最后）。
 * 结果缓存 60 秒；探测失败时回退为 mojang / bmclapi / backup 的默认顺序。
 */
export async function iGM_LauncherV2_SourceOrder(): Promise<iGM_LauncherV2_DownloadSource[]> {
  const now = Date.now();
  if (
    iGM_VersionsSourceOrderCache &&
    now - iGM_VersionsSourceOrderAt < IGM_VERSIONS_PROBE_CACHE_MS
  ) {
    return [...iGM_VersionsSourceOrderCache];
  }
  try {
    const probes = await iGM_LauncherV2_ProbeSources();
    // 可用且延迟已知的源按延迟升序排在前；其余源按默认顺序补到末尾
    const ready = probes
      .filter((item) => item.ok && item.ms != null && iGM_LauncherV2_IsDownloadSource(item.id))
      .sort((a, b) => (a.ms as number) - (b.ms as number))
      .map((item) => item.id as iGM_LauncherV2_DownloadSource);
    if (ready.length === 0) return [...IGM_VERSIONS_SOURCE_FALLBACK_ORDER];
    const order = [
      ...ready,
      ...IGM_VERSIONS_SOURCE_FALLBACK_ORDER.filter((id) => !ready.includes(id)),
    ];
    iGM_VersionsSourceOrderCache = order;
    iGM_VersionsSourceOrderAt = now;
    return [...order];
  } catch {
    return [...IGM_VERSIONS_SOURCE_FALLBACK_ORDER];
  }
}

/** Forge 加载器清单地址（{v} 替换为游戏版本号），按顺序回退 */
const IGM_VERSIONS_FORGE_URLS = [
  "https://bmclapi2.bangbang93.com/forge/minecraft/{v}",
  "https://bmclapi.bangbang93.com/forge/minecraft/{v}",
];

/** NeoForge 加载器清单地址（{v} 替换为游戏版本号），按顺序回退 */
const IGM_VERSIONS_NEOFORGE_URLS = [
  "https://bmclapi2.bangbang93.com/neoforge/list/{v}",
];

/** 版本清单缓存：id -> 清单中的版本详情地址（供下载阶段解析依赖） */
const iGM_VersionsManifestCache = new Map<string, string>();

/** 当前采用的源 id */
let iGM_VersionsActiveSourceId = "";

/** 带超时的 JSON 请求；失败或超时返回 null */
async function iGM_LauncherV2_FetchJson<T>(
  url: string,
  timeoutMs: number,
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 测速单个源：返回耗时毫秒与清单内容 */
async function iGM_LauncherV2_ProbeSource(
  source: iGM_LauncherV2_VersionSourceDef,
): Promise<{ speed: iGM_LauncherV2_VersionSource; manifest: unknown | null }> {
  const started = Date.now();
  const manifest = await iGM_LauncherV2_FetchJson<unknown>(
    source.manifest,
    IGM_VERSIONS_SPEED_TIMEOUT_MS,
  );
  const ms = Date.now() - started;
  return {
    speed: { id: source.id, label: source.label, ms: manifest ? ms : null, ok: Boolean(manifest) },
    manifest,
  };
}

/** 规范化版本类型：非 release / snapshot 一律归为 old（远古版本） */
function iGM_LauncherV2_NormalizeType(raw: string): iGM_LauncherV2_VersionEntry["type"] {
  if (raw === "release") return "release";
  if (raw === "snapshot") return "snapshot";
  return "old";
}

/** 从清单中解析版本条目 */
function iGM_LauncherV2_ParseVersions(manifest: unknown): iGM_LauncherV2_VersionEntry[] {
  const raw = (manifest as { versions?: unknown })?.versions;
  if (!Array.isArray(raw)) return [];
  const entries: iGM_LauncherV2_VersionEntry[] = [];
  for (const item of raw) {
    const value = item as { id?: unknown; type?: unknown; releaseTime?: unknown; url?: unknown };
    if (typeof value.id !== "string" || typeof value.url !== "string") continue;
    entries.push({
      id: value.id,
      type: iGM_LauncherV2_NormalizeType(typeof value.type === "string" ? value.type : ""),
      releaseTime: typeof value.releaseTime === "string" ? value.releaseTime : "",
    });
    iGM_VersionsManifestCache.set(value.id, value.url);
  }
  return entries;
}

/** 取版本清单地址（供下载阶段复用）；未缓存时返回空串 */
export function iGM_LauncherV2_VersionDetailUrl(versionId: string): string {
  return iGM_VersionsManifestCache.get(versionId) ?? "";
}

/**
 * 获取全量版本列表。
 * 流程：并行测速三个源 -> 取「可用且最快」的源拉取清单 -> 若首选源在拉取阶段失败，
 * 按延迟顺序依次回退到其余可用源；全部不可用时抛出由界面提示。
 */
export async function iGM_LauncherV2_Versions_List(): Promise<iGM_LauncherV2_VersionListResult> {
  const probes = await Promise.all(IGM_VERSIONS_SOURCES.map((source) => iGM_LauncherV2_ProbeSource(source)));
  const sources = probes.map((item) => item.speed);

  const usable = probes
    .filter((item) => item.manifest)
    .sort((a, b) => (a.speed.ms ?? 0) - (b.speed.ms ?? 0));

  for (const candidate of usable) {
    const versions = iGM_LauncherV2_ParseVersions(candidate.manifest);
    if (versions.length === 0) continue;
    iGM_VersionsActiveSourceId = candidate.speed.id;
    return {
      versions,
      sources,
      activeSourceId: candidate.speed.id,
      activeSourceLabel: candidate.speed.label,
      message: `已采用 ${candidate.speed.label}（${candidate.speed.ms} ms），共 ${versions.length} 个版本`,
    };
  }

  iGM_VersionsActiveSourceId = usable[0]?.speed.id ?? "";
  return {
    versions: [],
    sources,
    activeSourceId: iGM_VersionsActiveSourceId,
    activeSourceLabel: usable[0]?.speed.label ?? "",
    message: "全部下载源当前不可用，请检查网络后重试",
  };
}

/** 版本号降序比较：按 . - + 分段数值比较，无法解析的段按 0 处理 */
function iGM_LauncherV2_CompareVersionDesc(a: string, b: string): number {
  const pa = a.split(/[.\-+]/);
  const pb = b.split(/[.\-+]/);
  for (let index = 0; index < Math.max(pa.length, pb.length); index += 1) {
    const va = Number.parseInt(pa[index] ?? "", 10);
    const vb = Number.parseInt(pb[index] ?? "", 10);
    const na = Number.isFinite(va) ? va : 0;
    const nb = Number.isFinite(vb) ? vb : 0;
    if (na !== nb) return nb - na;
  }
  return 0;
}

/** 按版本号降序整理加载器条目，并把最新一条标记为 recommended */
function iGM_LauncherV2_RankLoaders(
  ids: string[],
  kind: "fabric" | "forge" | "neoforge",
  labelOf: (id: string) => string,
): iGM_LauncherV2_LoaderEntry[] {
  const unique = Array.from(new Set(ids.filter((item) => item.trim())));
  unique.sort(iGM_LauncherV2_CompareVersionDesc);
  return unique.map((id, index) => ({
    id,
    label: labelOf(id),
    kind,
    recommended: index === 0,
  }));
}

/**
 * 加载器列表：原版 + Fabric + Forge + NeoForge。
 * Fabric 优先取官方 FabricMeta，失败回退 BMCLAPI 镜像；
 * Forge / NeoForge 走 BMCLAPI（官方 Maven 在国内可达性差）；
 * 任一加载器源失败只影响该款加载器，其余照常返回。
 */
export async function iGM_LauncherV2_Loaders_List(
  gameVersion: string,
): Promise<iGM_LauncherV2_LoaderListResult> {
  const version = gameVersion.trim();
  if (!version) return { gameVersion: "", loaders: [], message: "未选择游戏版本" };

  const loaders: iGM_LauncherV2_LoaderEntry[] = [
    { id: "", label: `${version} 原版`, kind: "vanilla", recommended: false },
  ];

  // Fabric：按源顺序回退，取全部 loader 版本号
  const fabricIds: string[] = [];
  for (const source of IGM_VERSIONS_SOURCES) {
    const url = source.fabric.replace("{v}", encodeURIComponent(version));
    const data = await iGM_LauncherV2_FetchJson<unknown>(url, IGM_VERSIONS_TIMEOUT_MS);
    if (!Array.isArray(data)) continue;
    for (const item of data) {
      const value = item as { loader?: { version?: unknown } };
      if (typeof value.loader?.version === "string") fabricIds.push(value.loader.version);
    }
    break;
  }
  loaders.push(...iGM_LauncherV2_RankLoaders(fabricIds, "fabric", (id) => `Fabric ${id}`));

  // Forge：按镜像顺序回退
  const forgeIds: string[] = [];
  for (const template of IGM_VERSIONS_FORGE_URLS) {
    const url = template.replace("{v}", encodeURIComponent(version));
    const data = await iGM_LauncherV2_FetchJson<unknown>(url, IGM_VERSIONS_TIMEOUT_MS);
    if (!Array.isArray(data)) continue;
    for (const item of data) {
      const value =
        typeof item === "string" ? item : ((item as { version?: unknown })?.version as string);
      if (typeof value === "string" && value) forgeIds.push(value);
    }
    break;
  }
  loaders.push(...iGM_LauncherV2_RankLoaders(forgeIds, "forge", (id) => `Forge ${id}`));

  // NeoForge：按镜像顺序回退
  const neoForgeIds: string[] = [];
  for (const template of IGM_VERSIONS_NEOFORGE_URLS) {
    const url = template.replace("{v}", encodeURIComponent(version));
    const data = await iGM_LauncherV2_FetchJson<unknown>(url, IGM_VERSIONS_TIMEOUT_MS);
    if (!Array.isArray(data)) continue;
    for (const item of data) {
      const value =
        typeof item === "string" ? item : ((item as { version?: unknown })?.version as string);
      if (typeof value === "string" && value) neoForgeIds.push(value);
    }
    break;
  }
  loaders.push(...iGM_LauncherV2_RankLoaders(neoForgeIds, "neoforge", (id) => `NeoForge ${id}`));

  const countOf = (kind: iGM_LauncherV2_LoaderEntry["kind"]): number =>
    loaders.filter((item) => item.kind === kind).length;

  return {
    gameVersion: version,
    loaders,
    message: `Fabric ${countOf("fabric")} 个 / Forge ${countOf("forge")} 个 / NeoForge ${countOf("neoforge")} 个`,
  };
}

/**
 * 把官方地址换算为多源备选地址列表（首选官方，其次 BMCLAPI 镜像）。
 * 供下载阶段对每一份文件做多源回退，任一源成功即可继续。
 */
export function iGM_LauncherV2_MirrorUrls(url: string): string[] {
  const list = [url];
  if (url.startsWith("https://piston-meta.mojang.com/")) {
    list.push(url.replace("https://piston-meta.mojang.com/", "https://bmclapi2.bangbang93.com/"));
  } else if (url.startsWith("https://launcher.mojang.com/")) {
    list.push(url.replace("https://launcher.mojang.com/", "https://bmclapi2.bangbang93.com/"));
  } else if (url.startsWith("https://resources.download.minecraft.net/")) {
    list.push(url.replace("https://resources.download.minecraft.net/", "https://bmclapi2.bangbang93.com/assets/"));
  } else if (url.startsWith("https://libraries.minecraft.net/")) {
    list.push(url.replace("https://libraries.minecraft.net/", "https://bmclapi2.bangbang93.com/maven/"));
  }
  return list;
}

/**
 * 通道 A（iGCraftLit SDK）代理地址：由主站后端转发下载。
 * 后端不可用或返回非 2xx 时，下载模块会按「用户所选通道不可用」处理，
 * 只提示不自动切换通道。
 */
export function iGM_LauncherV2_SdkProxyUrl(originUrl: string): string {
  return `${IGM_LAUNCHERV2_COMMUNITY_ISSUER}/api/launcher/download-proxy?url=${encodeURIComponent(originUrl)}`;
}

/** 当前采用的源 id（供界面展示） */
export function iGM_LauncherV2_ActiveSourceId(): string {
  return iGM_VersionsActiveSourceId;
}

/**
 * 获取单个版本详情（发布时间与客户端 JAR 大小）。
 * 清单地址来自上一次版本列表拉取的缓存；缓存缺失时先补拉一次列表，
 * 随后按官方地址 + BMCLAPI 镜像顺序取版本 JSON。
 */
export async function iGM_LauncherV2_Version_Detail(
  versionId: string,
): Promise<iGM_LauncherV2_VersionDetail> {
  const version = versionId.trim();
  const base: iGM_LauncherV2_VersionDetail = {
    versionId: version,
    releaseTime: "",
    clientSize: 0,
    clientUrl: "",
    message: "",
  };
  if (!version) return { ...base, message: "未指定版本" };

  if (!iGM_VersionsManifestCache.has(version)) {
    await iGM_LauncherV2_Versions_List();
  }
  const official = iGM_LauncherV2_VersionDetailUrl(version);
  if (!official) return { ...base, message: "未找到该版本的清单地址，请重新测速后重试" };

  let json: unknown = null;
  for (const url of iGM_LauncherV2_MirrorUrls(official)) {
    json = await iGM_LauncherV2_FetchJson<unknown>(url, IGM_VERSIONS_TIMEOUT_MS);
    if (json) break;
  }
  if (!json) return { ...base, message: "获取版本详情失败，请检查网络后重试" };

  const value = json as {
    releaseTime?: unknown;
    downloads?: { client?: { size?: unknown; url?: unknown } };
  };
  const client = value.downloads?.client;
  return {
    versionId: version,
    releaseTime: typeof value.releaseTime === "string" ? value.releaseTime : "",
    clientSize: typeof client?.size === "number" ? client.size : 0,
    clientUrl: typeof client?.url === "string" ? client.url : "",
    message: "已获取版本详情",
  };
}

/**
 * 列举本地已下载（已完整落盘）的版本 id。
 * 口径：游戏根目录 versions/ 下，目录名与版本 id 一致，且该目录内存在客户端 JAR
 * （<id>.jar）时视为已下载；结果按版本号倒序（新版在前），供「新建视界」选择版本。
 */
export async function iGM_LauncherV2_InstalledVersions(): Promise<string[]> {
  const root = join(iGM_LauncherV2_GameRootPath(), "versions");
  let entries: string[] = [];
  try {
    const dirs = await readdir(root, { withFileTypes: true });
    entries = dirs.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    return [];
  }

  const installed: string[] = [];
  for (const id of entries) {
    try {
      const info = await stat(join(root, id, `${id}.jar`));
      if (info.isFile()) installed.push(id);
    } catch {
      // 无 <id>.jar 时跳过，视为未完整下载
    }
  }

  installed.sort((a, b) => iGM_LauncherV2_CompareVersionDesc(a, b));
  return installed;
}

// 导出 //
export default iGM_LauncherV2_Versions_List;