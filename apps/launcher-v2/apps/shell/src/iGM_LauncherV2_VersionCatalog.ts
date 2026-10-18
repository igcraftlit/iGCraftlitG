/**
 * 文件路径：apps/shell/src/iGM_LauncherV2_VersionCatalog.ts
 * 所属层：桌面外壳 / 本地开服数据层
 * 路由：全局
 * 模块：iGM_LauncherV2_VersionCatalog
 * 作用：按服务端核心从上游动态拉取全量可用的游戏版本列表（彻底废除硬编码版本数组）
 * 内容：Vanilla 取 piston-meta 的 version_manifest_v2.json，收集全部 release 与 snapshot 的 id，按原序返回；
 *       Paper 取 api.papermc.io 的 versions 数组并倒序；
 *       Fabric 取 meta.fabricmc.net 的 game 列表，仅保留 stable 为 true 的版本；
 *       Forge 从 promotions_slim.json 的 promos 键中提取 <mcVersion>-latest / -recommended 前缀，
 *       得到受支持的 MC 版本集合并按语义化版本降序；
 *       NeoForge 取 maven.neoforged.net 的版本列表，按主版本 X.Y.Z -> MC 1.X.Y 规则映射后去重降序；
 *       所有请求携带 User-Agent 且超时 20 秒，任一失败均不抛出，而是返回空列表与可读中文说明；
 *       进程内按核心名做 10 分钟 TTL 内存缓存，命中即直接返回，避免频繁打上游
 * 说明：上游接口可能限流或变更，故仅作为「展示与选择」的目录来源，真正下载仍由开服创建流程逐版本校验
 */

// 导入依赖 //
import { IGM_LAUNCHERV2_APP_NAME, IGM_LAUNCHERV2_VERSION } from "./iGM_LauncherV2_Constants";
import type { iGM_LauncherV2_ServerCore } from "./iGM_LauncherV2_Ipc";

// 类型定义 //

/** 单核心版本目录结果 */
export interface iGM_LauncherV2_VersionCatalogResult {
  /** 该核心支持的全部游戏版本（最新在前） */
  versions: string[];
  /** 可读中文结论文案 */
  message: string;
}

/** 内存缓存条目 */
interface iGM_LauncherV2_VersionCatalogCacheEntry {
  /** 写入时间（毫秒时间戳） */
  at: number;
  /** 缓存结果 */
  result: iGM_LauncherV2_VersionCatalogResult;
}

// 核心逻辑 //

/** 请求统一使用的 User-Agent（上游接口要求可识别调用方） */
const IGM_LAUNCHERV2_VERSIONCATALOG_USER_AGENT = `${IGM_LAUNCHERV2_APP_NAME}/${IGM_LAUNCHERV2_VERSION} (+https://igcraftlit.com)`;

/** 单次请求超时（毫秒） */
const IGM_LAUNCHERV2_VERSIONCATALOG_TIMEOUT_MS = 20000;

/** 缓存有效期（毫秒）：10 分钟 */
const IGM_LAUNCHERV2_VERSIONCATALOG_TTL_MS = 10 * 60 * 1000;

/** Vanilla 版本清单地址 */
const IGM_LAUNCHERV2_VERSIONCATALOG_VANILLA_URL =
  "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

/** Paper 项目信息地址 */
const IGM_LAUNCHERV2_VERSIONCATALOG_PAPER_URL = "https://api.papermc.io/v2/projects/paper";

/** Fabric 游戏版本列表地址 */
const IGM_LAUNCHERV2_VERSIONCATALOG_FABRIC_URL = "https://meta.fabricmc.net/v2/versions/game";

/** Forge 支持版本（promotions_slim）地址 */
const IGM_LAUNCHERV2_VERSIONCATALOG_FORGE_URL =
  "https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json";

/** NeoForge 版本列表地址 */
const IGM_LAUNCHERV2_VERSIONCATALOG_NEOFORGE_URL =
  "https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge";

/** 核心中文标签（用于组织可读文案） */
const IGM_LAUNCHERV2_VERSIONCATALOG_LABELS: Record<iGM_LauncherV2_ServerCore, string> = {
  vanilla: "Vanilla",
  paper: "Paper",
  fabric: "Fabric",
  forge: "Forge",
  neoforge: "NeoForge",
};

/** 各核心的版本目录内存缓存 */
const iGM_LauncherV2_VersionCatalogCache = new Map<
  iGM_LauncherV2_ServerCore,
  iGM_LauncherV2_VersionCatalogCacheEntry
>();

/** 带超时与 User-Agent 的 JSON 请求；失败或超时抛出可读错误 */
async function iGM_LauncherV2_VersionCatalogFetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": IGM_LAUNCHERV2_VERSIONCATALOG_USER_AGENT,
    },
    signal: AbortSignal.timeout(IGM_LAUNCHERV2_VERSIONCATALOG_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
}

/**
 * 版本号降序比较。
 * 按 . - + 分段数值比较，兼容长度不一（1.9.4 与 1.21.10）与两位数段（1.21.10）场景。
 */
function iGM_LauncherV2_VersionCatalogCompareDesc(a: string, b: string): number {
  const pa = a.split(/[.\-+]/);
  const pb = b.split(/[.\-+]/);
  for (let index = 0; index < Math.max(pa.length, pb.length); index += 1) {
    const na = Number.parseInt(pa[index] ?? "", 10) || 0;
    const nb = Number.parseInt(pb[index] ?? "", 10) || 0;
    if (na !== nb) return nb - na;
  }
  return 0;
}

/** 文本数组过滤：仅保留非空字符串 */
function iGM_LauncherV2_VersionCatalogStrings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string" && item.trim() !== "");
}

/** Vanilla：取版本清单中全部 release 与 snapshot 的 id，按数组原序返回 */
async function iGM_LauncherV2_VersionCatalogVanilla(): Promise<iGM_LauncherV2_VersionCatalogResult> {
  const raw = (await iGM_LauncherV2_VersionCatalogFetchJson(
    IGM_LAUNCHERV2_VERSIONCATALOG_VANILLA_URL,
  )) as { versions?: unknown };
  const list = Array.isArray(raw?.versions) ? raw.versions : [];
  const versions: string[] = [];
  for (const item of list as { id?: unknown; type?: unknown }[]) {
    const type = item?.type;
    if ((type === "release" || type === "snapshot") && typeof item?.id === "string" && item.id) {
      versions.push(item.id);
    }
  }
  if (versions.length === 0) throw new Error("上游未返回任何可用版本");
  return { versions, message: `已拉取 Vanilla 全部 ${versions.length} 个版本` };
}

/** Paper：取 versions 数组并倒序（接口为旧版在前） */
async function iGM_LauncherV2_VersionCatalogPaper(): Promise<iGM_LauncherV2_VersionCatalogResult> {
  const raw = (await iGM_LauncherV2_VersionCatalogFetchJson(
    IGM_LAUNCHERV2_VERSIONCATALOG_PAPER_URL,
  )) as { versions?: unknown };
  const versions = iGM_LauncherV2_VersionCatalogStrings(raw?.versions).reverse();
  if (versions.length === 0) throw new Error("上游未返回任何可用版本");
  return { versions, message: `已拉取 Paper 全部 ${versions.length} 个版本` };
}

/** Fabric：过滤 stable 为 true 的版本（接口已为最新在前） */
async function iGM_LauncherV2_VersionCatalogFabric(): Promise<iGM_LauncherV2_VersionCatalogResult> {
  const raw = await iGM_LauncherV2_VersionCatalogFetchJson(
    IGM_LAUNCHERV2_VERSIONCATALOG_FABRIC_URL,
  );
  const list = Array.isArray(raw) ? raw : [];
  const versions: string[] = [];
  for (const item of list as { version?: unknown; stable?: unknown }[]) {
    if (item?.stable === true && typeof item?.version === "string" && item.version) {
      versions.push(item.version);
    }
  }
  if (versions.length === 0) throw new Error("上游未返回任何稳定版本");
  return { versions, message: `已拉取 Fabric 全部 ${versions.length} 个稳定版本` };
}

/** Forge：从 promos 键提取 <mcVersion>-latest / -recommended 前缀，去重后降序 */
async function iGM_LauncherV2_VersionCatalogForge(): Promise<iGM_LauncherV2_VersionCatalogResult> {
  const raw = (await iGM_LauncherV2_VersionCatalogFetchJson(
    IGM_LAUNCHERV2_VERSIONCATALOG_FORGE_URL,
  )) as { promos?: unknown };
  const promos =
    raw?.promos && typeof raw.promos === "object" ? (raw.promos as Record<string, unknown>) : {};
  const set = new Set<string>();
  for (const key of Object.keys(promos)) {
    const matched = /^(.+)-(?:latest|recommended)$/.exec(key);
    if (matched) set.add(matched[1]);
  }
  const versions = [...set].sort(iGM_LauncherV2_VersionCatalogCompareDesc);
  if (versions.length === 0) throw new Error("上游未返回任何受支持版本");
  return { versions, message: `已拉取 Forge 支持的全部 ${versions.length} 个游戏版本` };
}

/**
 * NeoForge：主版本 X.Y.Z -> MC 1.X.Y。
 * 形如 21.1.66 -> 1.21.1、20.4.237 -> 1.20.4；若次版本段为 0（21.0.x）则映射为 1.21。
 */
async function iGM_LauncherV2_VersionCatalogNeoForge(): Promise<iGM_LauncherV2_VersionCatalogResult> {
  const raw = (await iGM_LauncherV2_VersionCatalogFetchJson(
    IGM_LAUNCHERV2_VERSIONCATALOG_NEOFORGE_URL,
  )) as { versions?: unknown };
  const list = iGM_LauncherV2_VersionCatalogStrings(raw?.versions);
  const set = new Set<string>();
  for (const item of list) {
    const parts = item.split(".");
    if (parts.length < 2) continue;
    const major = Number.parseInt(parts[0], 10);
    const minor = Number.parseInt(parts[1], 10);
    if (!Number.isFinite(major) || !Number.isFinite(minor) || major < 1) continue;
    set.add(minor === 0 ? `1.${major}` : `1.${major}.${minor}`);
  }
  const versions = [...set].sort(iGM_LauncherV2_VersionCatalogCompareDesc);
  if (versions.length === 0) throw new Error("上游未返回任何受支持版本");
  return { versions, message: `已拉取 NeoForge 支持的全部 ${versions.length} 个游戏版本` };
}

/** 按核心分派拉取（失败抛出可读错误） */
async function iGM_LauncherV2_VersionCatalogResolve(
  core: iGM_LauncherV2_ServerCore,
): Promise<iGM_LauncherV2_VersionCatalogResult> {
  switch (core) {
    case "vanilla":
      return iGM_LauncherV2_VersionCatalogVanilla();
    case "paper":
      return iGM_LauncherV2_VersionCatalogPaper();
    case "fabric":
      return iGM_LauncherV2_VersionCatalogFabric();
    case "forge":
      return iGM_LauncherV2_VersionCatalogForge();
    case "neoforge":
      return iGM_LauncherV2_VersionCatalogNeoForge();
    default:
      throw new Error("不支持的服务端核心");
  }
}

/**
 * 拉取指定核心的全量游戏版本目录。
 * 命中 10 分钟内的内存缓存则直接返回，避免频繁访问上游；
 * 任一失败（网络异常、超时、结构不符）都不抛出，返回空列表与可读中文说明。
 */
export async function iGM_LauncherV2_VersionCatalog_List(
  core: iGM_LauncherV2_ServerCore,
): Promise<iGM_LauncherV2_VersionCatalogResult> {
  const label = IGM_LAUNCHERV2_VERSIONCATALOG_LABELS[core] ?? String(core);

  const cached = iGM_LauncherV2_VersionCatalogCache.get(core);
  if (cached && cached.result.versions.length > 0) {
    if (Date.now() - cached.at < IGM_LAUNCHERV2_VERSIONCATALOG_TTL_MS) return cached.result;
  }

  try {
    const result = await iGM_LauncherV2_VersionCatalogResolve(core);
    iGM_LauncherV2_VersionCatalogCache.set(core, { at: Date.now(), result });
    return result;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "请求失败";
    return { versions: [], message: `拉取 ${label} 版本列表失败：${reason}，请检查网络后重试` };
  }
}

// 导出 //
export default iGM_LauncherV2_VersionCatalog_List;
