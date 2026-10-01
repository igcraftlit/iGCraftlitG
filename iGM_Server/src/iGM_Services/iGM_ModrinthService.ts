/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_ModrinthService.ts
 * 所属层：后端 / 业务逻辑层（第三方平台适配）
 * 路由：G_ThirdParty（由 iGM_ThirdPartyService 调用）
 * 模块：iGM_ModrinthService
 * 作用：Modrinth 公开 API 的适配层——资源搜索、项目详情、版本列表，
 *       并把结果归一化后缓存进本地数据库，避免重复请求上游
 * 内容：统一请求（User-Agent / 请求间隔 100~300ms / 429 指数退避 / 超时）、
 *       按资源类型组装 facets、命中结果幂等落库、Fabric 兼容性判定、
 *       项目详情与版本列表归一化
 * 说明：
 *   - 无需 API Key，全部为 Modrinth 公开端点；
 *   - 本站只缓存元数据（名称/类型/描述/作者/版本/下载直链/SHA1/大小/封面），
 *     不缓存任何资源文件本身；
 *   - facets 行为依据实测：
 *       · mod 与 datapack 使用 categories:fabric 收紧到 Fabric；
 *       · shader 与 resourcepack 若叠加 categories:fabric 会误杀（实测不足 5 条），
 *         故只用 project_type，二者本身与加载器无关；
 *       · Modrinth 没有 map 类型，地图以数据包形式分发，
 *         故 map 映射为 project_type:datapack + categories:worldgen；
 *   - Modrinth 的 /project 端点不返回 author（只有 team），
 *     而 /search 命中项带 author，故详情刷新时保留库中已有作者。
 */

// 导入依赖 //
import { iGM_Config } from "../iGM_Config/iGM_Config";
import {
  iGM_FindThirdPartyResourceById,
  iGM_FindThirdPartyResourceBySourceId,
  iGM_ListThirdPartyVersions,
  iGM_UpsertThirdPartyResource,
  iGM_UpsertThirdPartyVersions,
  type iGM_UpsertVersionInput,
} from "../iGM_Repositories/iGM_ThirdPartyRepository";
import {
  iGM_NormalizeThirdPartyResourceType,
  iGM_NormalizeThirdPartyVersionType,
  iGM_ThirdPartySource,
  type iGM_ThirdPartyResourceRow,
  type iGM_ThirdPartyResourceType,
  type iGM_ThirdPartyVersionRow,
} from "../iGM_Types/iGM_ThirdParty";
import { iGM_ThirdPartyError } from "./iGM_ThirdPartyDownloadService";

// 类型定义 //
/** Modrinth 搜索命中项（仅声明本模块使用到的字段） */
interface iGM_ModrinthSearchHit {
  project_id: string;
  slug?: string;
  author?: string;
  title?: string;
  description?: string;
  project_type?: string;
  categories?: string[];
  downloads?: number;
  icon_url?: string | null;
  date_modified?: string;
}

/** Modrinth 搜索响应 */
interface iGM_ModrinthSearchResponse {
  hits?: iGM_ModrinthSearchHit[];
  offset?: number;
  limit?: number;
  total_hits?: number;
}

/** Modrinth 项目详情（无 author，只有 team） */
interface iGM_ModrinthProject {
  id: string;
  slug?: string;
  title?: string;
  description?: string;
  project_type?: string;
  downloads?: number;
  icon_url?: string | null;
  updated?: string;
}

/** Modrinth 版本对象 */
interface iGM_ModrinthVersion {
  id: string;
  project_id?: string;
  version_number?: string;
  name?: string;
  date_published?: string;
  /** 版本发布类型：release / beta / alpha */
  version_type?: string;
  game_versions?: string[];
  loaders?: string[];
  files?: {
    url?: string;
    filename?: string;
    size?: number;
    primary?: boolean;
    hashes?: { sha1?: string; sha512?: string };
  }[];
}

/** 搜索结果 */
export interface iGM_ModrinthSearchResult {
  items: iGM_ThirdPartyResourceRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 资源详情结果 */
export interface iGM_ModrinthResourceResult {
  resource: iGM_ThirdPartyResourceRow;
  versions: iGM_ThirdPartyVersionRow[];
}

// 核心逻辑 //
/** 上游请求串行闸门与最近一次请求时刻 */
let iGM_ModrinthQueue: Promise<void> = Promise.resolve();
let iGM_ModrinthLastRequestAt = 0;

/** 休眠 */
function iGM_Sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

/**
 * 请求间隔闸门：串行化上游请求，且相邻两次请求间隔 100~300 毫秒随机
 * 说明：既满足 Modrinth 的频率要求，也避免并发请求被识别为网络攻击
 */
async function iGM_ModrinthWaitSlot(): Promise<void> {
  const previous = iGM_ModrinthQueue;
  let release: () => void = () => undefined;
  iGM_ModrinthQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;

  const { minRequestIntervalMs, maxRequestIntervalMs } = iGM_Config.thirdParty;
  const low = Math.min(minRequestIntervalMs, maxRequestIntervalMs);
  const high = Math.max(minRequestIntervalMs, maxRequestIntervalMs);
  const gap = low + Math.random() * (high - low);
  const wait = iGM_ModrinthLastRequestAt + gap - Date.now();
  if (wait > 0) await iGM_Sleep(wait);
  iGM_ModrinthLastRequestAt = Date.now();
  release();
}

/** 组装请求地址 */
function iGM_ModrinthUrl(
  path: string,
  params?: Record<string, string>,
): string {
  const base = iGM_Config.thirdParty.modrinthApiUrl.replace(/\/+$/, "");
  const query = new URLSearchParams(params ?? {}).toString();
  return query.length > 0 ? `${base}${path}?${query}` : `${base}${path}`;
}

/**
 * 统一上游请求：携带 User-Agent、请求间隔闸门、超时与 429/503 指数退避
 * 404 直接抛资源不存在；其余失败抛上游异常
 */
async function iGM_ModrinthRequest<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = iGM_ModrinthUrl(path, params);
  const maxRetries = Math.max(1, iGM_Config.thirdParty.maxRetries);
  let lastError: iGM_ThirdPartyError | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    await iGM_ModrinthWaitSlot();
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      iGM_Config.thirdParty.timeoutMs,
    );
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": iGM_Config.thirdParty.userAgent,
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      if (response.status === 429 || response.status === 503) {
        lastError = new iGM_ThirdPartyError("thirdParty.errors.rateLimited", 429);
      } else if (response.status === 404) {
        throw new iGM_ThirdPartyError("thirdParty.errors.resourceNotFound", 404);
      } else if (!response.ok) {
        lastError = new iGM_ThirdPartyError("thirdParty.errors.upstreamFailed", 502);
      } else {
        return (await response.json()) as T;
      }
    } catch (error) {
      if (error instanceof iGM_ThirdPartyError && error.status === 404) throw error;
      lastError =
        error instanceof iGM_ThirdPartyError
          ? error
          : new iGM_ThirdPartyError("thirdParty.errors.upstreamFailed", 502);
    } finally {
      clearTimeout(timer);
    }

    if (attempt >= maxRetries) break;
    lastError = lastError ?? new iGM_ThirdPartyError("thirdParty.errors.upstreamFailed", 502);
    // 指数退避：1s、2s、4s、8s…
    await iGM_Sleep(1000 * 2 ** (attempt - 1));
  }

  throw lastError ?? new iGM_ThirdPartyError("thirdParty.errors.upstreamFailed", 502);
}

/**
 * 把上游 project_type 归一化为本模块的资源类型
 * 说明：map 在本模块映射为 datapack，故上游类型无法反向区分 map 与 datapack；
 *       搜索时以用户选择的类型为准，详情页以库中已存类型为准
 */
function iGM_FromModrinthProjectType(projectType: string | undefined): iGM_ThirdPartyResourceType {
  if (projectType === "shader") return "shader";
  if (projectType === "resourcepack") return "resourcepack";
  if (projectType === "datapack") return "datapack";
  return "mod";
}

/** 按资源类型组装 Modrinth facets（二维数组：外层 AND，内层 OR） */
export function iGM_BuildModrinthFacets(type: iGM_ThirdPartyResourceType): string {
  const facets: string[][] = [];
  switch (type) {
    case "shader":
      facets.push(["project_type:shader"]);
      break;
    case "resourcepack":
      facets.push(["project_type:resourcepack"]);
      break;
    case "datapack":
      facets.push(["project_type:datapack"], ["categories:fabric"]);
      break;
    case "map":
      facets.push(["project_type:datapack"], ["categories:worldgen"]);
      break;
    case "mod":
    default:
      facets.push(["categories:fabric"], ["project_type:mod"]);
      break;
  }
  return JSON.stringify(facets);
}

/**
 * 判断版本是否可用于指定资源类型
 *
 * 说明：不同资源类型在 Modrinth 上的 loaders 取值完全不同，若一律要求 fabric
 *       会把光影与材质包全部丢弃（这正是此前「暂无可下载的版本」的原因）：
 *       - mod        依赖 Fabric 加载器，loaders 含 fabric（空数组视为通用，保留）
 *       - datapack   数据包由游戏本体加载，loaders 为 datapack（空数组保留）
 *       - shader     光影由 Iris / OptiFine 渲染，loaders 为 iris、optifine 等
 *       - resourcepack 材质包与加载器无关，loaders 为 minecraft（空数组保留）
 *       - map        地图与加载器无关，loaders 为 minecraft / datapack
 */
export function iGM_IsLoaderCompatible(
  loaders: string[],
  type: iGM_ThirdPartyResourceType,
): boolean {
  if (!Array.isArray(loaders) || loaders.length === 0) return true;
  const list = loaders.map((loader) => loader.toLowerCase());
  const hit = (...names: string[]) => names.some((name) => list.includes(name));

  switch (type) {
    case "mod":
      return hit("fabric");
    case "datapack":
      return hit("datapack", "fabric");
    case "shader":
      // 光影走 Iris 渲染管线；同时兼容 OptiFine / Canvas，避免漏掉可用资源
      return hit("iris", "optifine", "canvas", "fabric");
    case "resourcepack":
      return hit("minecraft", "fabric");
    case "map":
      return hit("minecraft", "datapack", "fabric");
    default:
      return true;
  }
}

/** Modrinth 版本文件条目 */
type iGM_ModrinthVersionFile = NonNullable<iGM_ModrinthVersion["files"]>[number];

/** 从版本对象的 files 中挑选主文件（优先 primary，其次首个带 url 的条目） */
function iGM_PickPrimaryFile(
  version: iGM_ModrinthVersion,
): iGM_ModrinthVersionFile | null {
  const files = (version.files ?? []).filter((file) => Boolean(file?.url));
  if (files.length === 0) return null;
  return files.find((file) => file.primary) ?? files[0];
}

/** 归一化单个版本为落库入参；无可用文件或与资源类型不匹配时返回 null */
function iGM_NormalizeVersion(
  version: iGM_ModrinthVersion,
  type: iGM_ThirdPartyResourceType,
): iGM_UpsertVersionInput | null {
  const file = iGM_PickPrimaryFile(version);
  if (!file?.url) return null;
  const loaders = (version.loaders ?? []).filter(
    (item): item is string => typeof item === "string",
  );
  if (!iGM_IsLoaderCompatible(loaders, type)) return null;

  const gameVersions = (version.game_versions ?? []).filter(
    (item): item is string => typeof item === "string",
  );

  return {
    sourceId: version.id,
    version: version.version_number ?? version.name ?? version.id,
    gameVersions,
    loaders,
    downloadUrl: file.url,
    filename: file.filename ?? `${version.id}.jar`,
    size: Number(file.size ?? 0) || 0,
    sha1: file.hashes?.sha1 ?? null,
    publishedAt: version.date_published ?? null,
    versionType: iGM_NormalizeThirdPartyVersionType(version.version_type),
  };
}

/* ---------- 搜索 ---------- */

/**
 * 搜索 Modrinth 资源（仅 Fabric 兼容）
 * 说明：type 缺省按 mod 处理——不同资源类型需要不同 facets，
 *       单次上游搜索无法混合类型分页，故由前端按类型逐个浏览
 */
export async function iGM_ModrinthSearchResources(input: {
  query: string;
  type: iGM_ThirdPartyResourceType;
  page: number;
  pageSize: number;
}): Promise<iGM_ModrinthSearchResult> {
  const page = Math.max(1, input.page);
  const pageSize = Math.min(50, Math.max(1, input.pageSize));
  const offset = (page - 1) * pageSize;

  const payload = await iGM_ModrinthRequest<iGM_ModrinthSearchResponse>("/search", {
    query: input.query,
    facets: iGM_BuildModrinthFacets(input.type),
    index: "relevance",
    limit: String(pageSize),
    offset: String(offset),
  });

  const hits = Array.isArray(payload.hits) ? payload.hits : [];
  const now = new Date().toISOString();

  // 命中结果幂等落库缓存，供详情页与下载页复用
  const items = await Promise.all(
    hits
      .filter(
        (hit) => typeof hit.project_id === "string" && hit.project_id.length > 0,
      )
      .map((hit) =>
        iGM_UpsertThirdPartyResource({
          source: iGM_ThirdPartySource,
          sourceId: hit.project_id,
          // 搜索时以用户所选类型为准，保证 map 与 datapack 可区分
          slug: hit.slug ?? hit.project_id,
          name: hit.title ?? hit.slug ?? hit.project_id,
          type: input.type,
          description: hit.description ?? null,
          author: hit.author ?? null,
          coverUrl: hit.icon_url ?? null,
          downloads: typeof hit.downloads === "number" ? hit.downloads : null,
          now,
        }),
      ),
  );

  const total = Number(payload.total_hits ?? items.length) || 0;
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/* ---------- 项目详情与版本 ---------- */

/** 拉取项目详情并落库；保留库中已有作者（上游 /project 不含 author） */
async function iGM_FetchAndCacheResource(
  sourceId: string,
  typeHint: iGM_ThirdPartyResourceType | null,
): Promise<iGM_ThirdPartyResourceRow> {
  const project = await iGM_ModrinthRequest<iGM_ModrinthProject>(
    `/project/${encodeURIComponent(sourceId)}`,
  );
  const resolvedId = project.id ?? sourceId;
  const existing = await iGM_FindThirdPartyResourceBySourceId(
    iGM_ThirdPartySource,
    resolvedId,
  );
  const now = new Date().toISOString();

  return await iGM_UpsertThirdPartyResource({
    source: iGM_ThirdPartySource,
    sourceId: resolvedId,
    slug: project.slug ?? resolvedId,
    name: project.title ?? project.slug ?? resolvedId,
    type:
      typeHint ??
      (existing
        ? existing.iGM_Type
        : iGM_FromModrinthProjectType(project.project_type)),
    description: project.description ?? null,
    // 上游项目端点不返回作者，优先沿用库中由搜索缓存下来的作者
    author: existing?.iGM_Author ?? null,
    coverUrl: project.icon_url ?? null,
    downloads:
      typeof project.downloads === "number"
        ? project.downloads
        : (existing?.iGM_Downloads ?? null),
    now,
  });
}

/** 拉取版本列表并落库（按资源类型过滤加载器，如光影保留 iris 版本） */
async function iGM_FetchAndCacheVersions(
  resourceId: string,
  sourceId: string,
  type: iGM_ThirdPartyResourceType,
): Promise<void> {
  const versions = await iGM_ModrinthRequest<iGM_ModrinthVersion[]>(
    `/project/${encodeURIComponent(sourceId)}/version`,
  );
  const normalized = (Array.isArray(versions) ? versions : [])
    .map((version) => iGM_NormalizeVersion(version, type))
    .filter((item): item is iGM_UpsertVersionInput => item !== null);

  // 幂等写入（按 资源 + 上游版本号 去重）；上游暂无匹配版本时不落库，保留原有缓存
  await iGM_UpsertThirdPartyVersions(
    resourceId,
    normalized,
    new Date().toISOString(),
  );
}

/** 缓存是否仍在有效期内 */
function iGM_IsCacheFresh(row: iGM_ThirdPartyResourceRow): boolean {
  const stamp = Date.parse(row.iGM_UpdatedAt);
  if (Number.isNaN(stamp)) return false;
  return Date.now() - stamp < iGM_Config.thirdParty.cacheTtlMs;
}

/**
 * 加载资源详情与版本列表
 * idOrSlug 支持三种形态：本站资源主键、Modrinth 项目 ID、Modrinth slug，
 * 未命中本地缓存时按原值直接请求上游（Modrinth 的 /project 接受 slug）。
 * options.allowStale：允许使用过期缓存（仅要求库中已有版本）。
 *   创建下载任务时使用——用户此时已通过详情页看过版本列表，
 *   再回源请求上游会平白增加数百毫秒到数秒延迟，容易触发调用方超时。
 */
export async function iGM_ModrinthLoadResource(
  idOrSlug: string,
  options?: {
    force?: boolean;
    typeHint?: iGM_ThirdPartyResourceType | null;
    allowStale?: boolean;
  },
): Promise<iGM_ModrinthResourceResult> {
  const key = (idOrSlug ?? "").trim();
  if (!key) throw new iGM_ThirdPartyError("thirdParty.errors.resourceNotFound", 404);

  let resource =
    (await iGM_FindThirdPartyResourceById(key)) ??
    (await iGM_FindThirdPartyResourceBySourceId(iGM_ThirdPartySource, key));

  const cachedVersions = resource
    ? await iGM_ListThirdPartyVersions(resource.iGM_Id)
    : [];
  const fresh =
    resource !== null &&
    cachedVersions.length > 0 &&
    !options?.force &&
    (options?.allowStale === true || iGM_IsCacheFresh(resource));

  if (fresh) {
    return { resource: resource as iGM_ThirdPartyResourceRow, versions: cachedVersions };
  }

  resource = await iGM_FetchAndCacheResource(
    resource?.iGM_SourceId ?? key,
    options?.typeHint ?? null,
  );
  await iGM_FetchAndCacheVersions(
    resource.iGM_Id,
    resource.iGM_SourceId,
    iGM_NormalizeThirdPartyResourceType(resource.iGM_Type),
  );
  return {
    resource,
    versions: await iGM_ListThirdPartyVersions(resource.iGM_Id),
  };
}

// 导出 //
export default {
  iGM_BuildModrinthFacets,
  iGM_IsLoaderCompatible,
  iGM_ModrinthSearchResources,
  iGM_ModrinthLoadResource,
};