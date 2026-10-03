/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_UnifiedResourceService.ts
 * 所属层：后端 / 业务逻辑层
 * 路由：G_Resource
 * 模块：iGM_UnifiedResourceService
 * 作用：本站资源与 Modrinth 资源的融合搜索编排
 * 内容：并发拉取两源候选（Promise.allSettled 容错）、统一 DTO 映射、
 *       跨源去重（仅同源源内）、按下载量降序合并、内存分页、降级标记
 * 说明：
 *   - 上游 Modrinth 单次搜索只能按单一 project_type 分页，all 模式按五类
 *     各取前 N 条合并；本站侧一次查询取前 100 条；
 *   - 排序基于两源候选窗口（非全量），候选窗口外的结果不进入分页，
 *     属于「热度优先浏览」口径，total 为窗口内合并条数；
 *   - 任一来源整体失败不影响另一来源，响应恒为 200 并通过 degraded 告知前端
 */

// 导入依赖 //
import { iGM_ListMinecraftResourcesService } from "./iGM_ResourceService";
import { iGM_ModrinthSearchResources } from "./iGM_ModrinthService";
import type { iGM_ResourceListItemDto } from "../iGM_Types/iGM_Resource";
import type { iGM_ThirdPartyResourceRow } from "../iGM_Types/iGM_ThirdParty";
import {
  iGM_MapSiteResourceType,
  iGM_MapUnifiedTypeToSiteType,
  iGM_NormalizeUnifiedResourceType,
  iGM_UnifiedResourceDefaultPageSize,
  iGM_UnifiedResourceKeywordMax,
  iGM_UnifiedResourceMaxPageSize,
  iGM_UnifiedResourceTypes,
} from "../iGM_Types/iGM_UnifiedResource";
import type {
  iGM_UnifiedResourceDto,
  iGM_UnifiedResourceSearchData,
  iGM_UnifiedResourceSource,
  iGM_UnifiedResourceType,
  iGM_UnifiedResourceTypeFilter,
} from "../iGM_Types/iGM_UnifiedResource";

// 类型定义 //
/** 融合搜索入参 */
export interface iGM_UnifiedResourceSearchInput {
  q?: string;
  type?: iGM_UnifiedResourceTypeFilter;
  page?: number;
  pageSize?: number;
}

// 核心逻辑 //
/** 本站候选窗口大小 */
const iGM_SiteFetchLimit = 100;
/** 指定单一类型时 Modrinth 候选窗口大小（上游单页上限 50） */
const iGM_ModrinthFetchLimit = 50;
/** all 模式下每个 Modrinth 类型的候选窗口大小（5 类合计至多 60） */
const iGM_ModrinthMixedFetchPerType = 12;

/** 本站资源条目映射为统一 DTO；不在类型白名单内返回 null */
function iGM_MapSiteItem(
  item: iGM_ResourceListItemDto,
): iGM_UnifiedResourceDto | null {
  const type = iGM_MapSiteResourceType(item.resourceType);
  if (!type) return null;
  return {
    source: "site",
    sourceId: item.id,
    slug: null,
    name: item.title,
    summary: item.excerpt,
    type,
    coverUrl: item.cover
      ? `/G_File/preview?fileId=${encodeURIComponent(item.cover.id)}`
      : null,
    author: {
      name: item.uploader.displayName ?? item.uploader.username,
      id: item.uploader.id,
    },
    downloads: item.downloadCount,
    versions: item.mcVersions,
    detailUrl: `/G_ResourceDetail?resourceId=${encodeURIComponent(item.id)}`,
    updatedAt: item.updatedAt,
  };
}

/** Modrinth 缓存行映射为统一 DTO */
function iGM_MapModrinthItem(
  row: iGM_ThirdPartyResourceRow,
): iGM_UnifiedResourceDto {
  return {
    source: "modrinth",
    sourceId: row.iGM_SourceId,
    slug: row.iGM_Slug,
    name: row.iGM_Name,
    summary: row.iGM_Description ?? "",
    type: row.iGM_Type as iGM_UnifiedResourceType,
    coverUrl: row.iGM_CoverUrl,
    author: { name: row.iGM_Author, id: null },
    downloads: row.iGM_Downloads ?? 0,
    // 搜索命中项不含版本列表，留空，版本在详情接口提供
    versions: [],
    detailUrl: `/G_ThirdPartyDetail?id=${encodeURIComponent(
      row.iGM_Slug ?? row.iGM_SourceId,
    )}`,
    updatedAt: row.iGM_UpdatedAt,
  };
}

/** 拉取本站候选；异常时抛出，由 allSettled 统一判定降级 */
async function iGM_FetchSiteCandidates(
  keyword: string,
  type: iGM_UnifiedResourceTypeFilter,
): Promise<iGM_UnifiedResourceDto[]> {
  const siteType =
    type === "all" ? null : iGM_MapUnifiedTypeToSiteType(type);
  // shader 在本站无分区：直接不查询
  if (type === "shader") return [];
  const data = await iGM_ListMinecraftResourcesService(null, {
    search: keyword || undefined,
    type: siteType ?? undefined,
    page: 1,
    pageSize: iGM_SiteFetchLimit,
  });
  return data.items
    .map(iGM_MapSiteItem)
    .filter((item): item is iGM_UnifiedResourceDto => item !== null);
}

/**
 * 拉取 Modrinth 候选：指定类型取一类，all 模式并发五类。
 * 仅当全部类型请求失败时才视为该来源整体失败（抛出），部分失败静默收窄。
 */
async function iGM_FetchModrinthCandidates(
  keyword: string,
  type: iGM_UnifiedResourceTypeFilter,
): Promise<iGM_UnifiedResourceDto[]> {
  const types: iGM_UnifiedResourceType[] =
    type === "all" ? [...iGM_UnifiedResourceTypes] : [type];
  const results = await Promise.allSettled(
    types.map((resourceType) =>
      iGM_ModrinthSearchResources({
        query: keyword,
        type: resourceType,
        page: 1,
        pageSize:
          type === "all"
            ? iGM_ModrinthMixedFetchPerType
            : iGM_ModrinthFetchLimit,
      }),
    ),
  );

  const rows: iGM_ThirdPartyResourceRow[] = [];
  let failureCount = 0;
  results.forEach((result) => {
    if (result.status === "fulfilled") {
      rows.push(...result.value.items);
    } else {
      failureCount += 1;
    }
  });
  if (failureCount === types.length) {
    throw new Error("iGM_UnifiedResource: modrinth source unavailable");
  }

  // all 模式下 map 与 datapack 的 facets 存在交集，按源内 sourceId 去重
  const deduped = new Map<string, iGM_ThirdPartyResourceRow>();
  for (const row of rows) {
    const existing = deduped.get(row.iGM_SourceId);
    if (!existing || (row.iGM_Downloads ?? 0) > (existing.iGM_Downloads ?? 0)) {
      deduped.set(row.iGM_SourceId, row);
    }
  }
  return Array.from(deduped.values()).map(iGM_MapModrinthItem);
}

/**
 * 融合搜索：并发本站 + Modrinth，合并后按下载量降序排序并内存分页。
 * 响应永不因上游故障抛错：两源均失败时返回空页并标记双源降级。
 */
export async function iGM_SearchUnifiedResourcesService(
  input: iGM_UnifiedResourceSearchInput,
): Promise<iGM_UnifiedResourceSearchData> {
  // 服务边界再次归一化：白名单外的类型一律回退 all，保证内部调用同样安全
  const type: iGM_UnifiedResourceTypeFilter = iGM_NormalizeUnifiedResourceType(
    input.type,
  );
  const keyword = (input.q ?? "").trim().slice(0, iGM_UnifiedResourceKeywordMax);
  const page =
    Number.isFinite(input.page) && (input.page as number) >= 1
      ? Math.floor(input.page as number)
      : 1;
  const pageSize =
    Number.isFinite(input.pageSize) &&
    (input.pageSize as number) >= 1 &&
    (input.pageSize as number) <= iGM_UnifiedResourceMaxPageSize
      ? Math.floor(input.pageSize as number)
      : iGM_UnifiedResourceDefaultPageSize;

  const [siteResult, modrinthResult] = await Promise.allSettled([
    iGM_FetchSiteCandidates(keyword, type),
    iGM_FetchModrinthCandidates(keyword, type),
  ]);

  const merged: iGM_UnifiedResourceDto[] = [];
  const degradedSources: iGM_UnifiedResourceSource[] = [];
  if (siteResult.status === "fulfilled") {
    merged.push(...siteResult.value);
  } else {
    degradedSources.push("site");
  }
  if (modrinthResult.status === "fulfilled") {
    merged.push(...modrinthResult.value);
  } else {
    degradedSources.push("modrinth");
  }

  merged.sort((a, b) => {
    if (a.downloads !== b.downloads) return b.downloads - a.downloads;
    const nameOrder = a.name.localeCompare(b.name);
    if (nameOrder !== 0) return nameOrder;
    if (a.source !== b.source) return a.source < b.source ? -1 : 1;
    return a.sourceId < b.sourceId ? -1 : 1;
  });

  const total = merged.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;

  return {
    items: merged.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    totalPages,
    type,
    degraded: degradedSources.length > 0,
    degradedSources,
  };
}

// 导出 //
export default { iGM_SearchUnifiedResourcesService };
