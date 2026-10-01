/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_FabricService.ts
 * 所属层：后端 / 业务逻辑层（可复用引擎）
 * 路由：G_Game（由 iGM_GameService 调用）
 * 模块：iGM_FabricService
 * 作用：Fabric 加载器元数据获取与 profile 解析——Loader 版本列表、默认稳定版、
 *       profile JSON 拉取、依赖库 Maven 地址推导
 * 内容：Loader 列表拉取与进程内缓存、默认稳定版挑选、兼容性校验、
 *       profile JSON 拉取、依赖库条目解析（name → Maven 路径）
 * 说明：仅依赖标准 fetch，不依赖 HTTP 框架与数据库上下文，便于启动器复用；
 *       Minecraft 术语保留英文原名（Fabric、Loader、Maven）
 */

// 导入依赖 //
import { iGM_Config } from "../iGM_Config/iGM_Config";

// 类型定义 //
/** Fabric 加载器版本条目 */
export interface iGM_FabricLoaderVersion {
  version: string;
  stable: boolean;
}

/** Fabric profile JSON 中的依赖库条目 */
export interface iGM_FabricLibraryEntry {
  name: string;
  url?: string;
  sha1?: string;
  size?: number;
  path?: string;
}

/** Fabric profile JSON（仅声明本引擎使用到的字段） */
export interface iGM_FabricProfileJson {
  id?: string;
  inheritsFrom?: string;
  mainClass?: string;
  libraries?: iGM_FabricLibraryEntry[];
  [key: string]: unknown;
}

/** 解析后的依赖库下载信息 */
export interface iGM_FabricLibraryPlan {
  relativePath: string;
  url: string;
  sha1: string | null;
  size: number;
}

/** Fabric 元数据业务错误：message 为前端 i18n 文案键 */
export class iGM_FabricError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "iGM_FabricError";
  }
}

// 核心逻辑 //
/** Loader 列表进程内缓存（Fabric 元数据更新不频繁，避免每次安装都重新拉取） */
const iGM_FabricCacheTtlMs = 10 * 60 * 1000;
let iGM_FabricLoaderCache: {
  at: number;
  list: iGM_FabricLoaderVersion[];
} | null = null;

/** 拉取 JSON，非 2xx 抛业务错误 */
async function iGM_FetchJson<T>(url: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": "iGCraftLit-Community/1.0 (fabric-meta)" },
    });
  } catch {
    throw new iGM_FabricError("game.errors.fabricUnreachable", 502);
  }
  if (!response.ok) {
    throw new iGM_FabricError("game.errors.fabricUnreachable", 502);
  }
  return (await response.json()) as T;
}

/**
 * 拉取 Fabric Loader 版本列表（含是否稳定），带进程内缓存
 * 说明：Fabric 官方 v2 接口返回按时间倒序，首项为最新
 */
export async function iGM_ListFabricLoaders(): Promise<iGM_FabricLoaderVersion[]> {
  const now = Date.now();
  if (
    iGM_FabricLoaderCache &&
    now - iGM_FabricLoaderCache.at < iGM_FabricCacheTtlMs
  ) {
    return iGM_FabricLoaderCache.list;
  }
  const url = `${iGM_Config.game.fabricMetaUrl}/versions/loader`;
  const raw = await iGM_FetchJson<
    { version?: string; stable?: boolean }[]
  >(url);
  const list = Array.isArray(raw)
    ? raw
        .filter((item) => typeof item?.version === "string")
        .map((item) => ({ version: item.version as string, stable: item.stable === true }))
    : [];
  if (list.length === 0) {
    throw new iGM_FabricError("game.errors.fabricLoaderEmpty", 502);
  }
  iGM_FabricLoaderCache = { at: now, list };
  return list;
}

/** 默认 Loader 版本：优先标记 stable 的最新一项 */
export function iGM_DefaultFabricLoader(
  list: iGM_FabricLoaderVersion[],
): string {
  const stable = list.find((item) => item.stable);
  return (stable ?? list[0]).version;
}

/** 校验用户指定的 Loader 版本是否在官方列表中（不在则回退默认稳定版） */
export function iGM_ResolveFabricLoaderVersion(
  list: iGM_FabricLoaderVersion[],
  requested: string | undefined,
): string {
  const wanted = (requested ?? "").trim();
  if (wanted && list.some((item) => item.version === wanted)) return wanted;
  return iGM_DefaultFabricLoader(list);
}

/**
 * 拉取指定「游戏版本 + Loader 版本」的 Fabric profile JSON
 * 地址：<meta>/versions/loader/{mcVersion}/{loaderVersion}/profile/json
 */
export async function iGM_FetchFabricProfile(
  mcVersion: string,
  loaderVersion: string,
): Promise<iGM_FabricProfileJson> {
  const url =
    `${iGM_Config.game.fabricMetaUrl}/versions/loader/` +
    `${encodeURIComponent(mcVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`;
  const profile = await iGM_FetchJson<iGM_FabricProfileJson>(url);
  if (!profile || typeof profile !== "object") {
    throw new iGM_FabricError("game.errors.fabricProfileInvalid", 502);
  }
  return profile;
}

/**
 * 规范化 Fabric profile JSON（模块十八）
 * 说明：官方 profile 的 id 为 loader 标识，需改写为版本目录名（<版本号>-fabric），
 *       并确保 inheritsFrom 指向原版版本号，保证启动器能正确合并原版与 Fabric 配置
 */
export function iGM_NormalizeFabricProfile(
  profile: iGM_FabricProfileJson,
  versionDir: string,
  fallbackInherits: string,
): iGM_FabricProfileJson {
  return {
    ...profile,
    id: versionDir,
    inheritsFrom: profile.inheritsFrom ?? fallbackInherits,
  };
}

/**
 * 解析 Fabric 依赖库条目为可下载项
 * 路径优先取条目自带的 path，缺失时按 Maven 坐标推导：
 *   group:artifact:version → <group 路径>/<artifact>/<version>/<artifact>-<version>.jar
 * 地址基址优先取条目 url，缺失时回退 Fabric Maven 仓库
 */
export function iGM_ResolveFabricLibrary(
  entry: iGM_FabricLibraryEntry,
): iGM_FabricLibraryPlan | null {
  const parts = (entry.name ?? "").split(":");
  if (parts.length < 3) return null;
  const [group, artifact, version] = parts;
  if (!group || !artifact || !version) return null;

  const relativePath =
    entry.path && entry.path.trim().length > 0
      ? entry.path.trim()
      : `${group.replace(/\./g, "/")}/${artifact}/${version}/${artifact}-${version}.jar`;

  const base = (entry.url ?? "").trim() || "https://maven.fabricmc.net/";
  const url = base.endsWith("/") ? `${base}${relativePath}` : `${base}/${relativePath}`;

  return {
    relativePath,
    url,
    sha1: entry.sha1 ?? null,
    size: typeof entry.size === "number" ? entry.size : 0,
  };
}

// 导出 //
export default {
  iGM_ListFabricLoaders,
  iGM_DefaultFabricLoader,
  iGM_ResolveFabricLoaderVersion,
  iGM_FetchFabricProfile,
  iGM_NormalizeFabricProfile,
  iGM_ResolveFabricLibrary,
};