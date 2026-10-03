/**
 * 文件路径：iGM_Server/src/iGM_Types/iGM_UnifiedResource.ts
 * 所属层：后端 / 类型定义层
 * 路由：G_Resource
 * 模块：iGM_UnifiedResource
 * 作用：定义本站资源与第三方资源（Modrinth）融合搜索的统一 DTO
 * 内容：资源来源/类型枚举、统一资源条目 DTO、融合搜索分页数据、
 *       本站资源类型与统一类型的双向映射、非法类型归一化
 * 说明：融合搜索不区分来源混合排序；下载量为跨来源唯一可比较的热度指标，
 *       故统一按 downloads 降序；详情页仍按 source 分流到各自详情路由
 */

// 类型定义 //
/** 资源来源：site 本站资源 / modrinth 第三方资源 */
export type iGM_UnifiedResourceSource = "site" | "modrinth";

/** 统一资源类型白名单（与前端过滤项一致） */
export type iGM_UnifiedResourceType =
  | "mod"
  | "shader"
  | "resourcepack"
  | "map"
  | "datapack";

/** 类型过滤参数：具体类型或 all 全类型 */
export type iGM_UnifiedResourceTypeFilter = iGM_UnifiedResourceType | "all";

/** 统一资源作者信息（第三方资源仅有名称） */
export interface iGM_UnifiedResourceAuthor {
  name: string | null;
  /** 本站上传者用户 ID；第三方资源为 null */
  id: string | null;
}

/** 融合搜索统一资源条目 */
export interface iGM_UnifiedResourceDto {
  source: iGM_UnifiedResourceSource;
  /** 来源内唯一标识：本站为资源 ID，Modrinth 为 project id */
  sourceId: string;
  /** 来源内 slug（本站暂无，为 null；Modrinth 可为空） */
  slug: string | null;
  name: string;
  /** 摘要（本站为正文摘要，第三方为上游描述；无内容为空字符串） */
  summary: string;
  type: iGM_UnifiedResourceType;
  coverUrl: string | null;
  author: iGM_UnifiedResourceAuthor;
  /** 归一化下载量（缺失按 0 处理，用于跨来源排序） */
  downloads: number;
  /** 适用游戏版本（搜索阶段第三方资源不返回版本列表，为空数组，详情页提供） */
  versions: string[];
  /** 前端详情分流路由：本站 G_ResourceDetail，第三方 G_ThirdPartyDetail */
  detailUrl: string;
  updatedAt: string;
}

/** 融合搜索分页数据 */
export interface iGM_UnifiedResourceSearchData {
  items: iGM_UnifiedResourceDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** 实际生效的类型过滤（非法入参归一化为 all） */
  type: iGM_UnifiedResourceTypeFilter;
  /** 是否有来源降级（任一来源整体不可用） */
  degraded: boolean;
  /** 降级来源列表 */
  degradedSources: iGM_UnifiedResourceSource[];
}

// 核心逻辑 //
/** 允许的统一资源类型常量 */
export const iGM_UnifiedResourceTypes: iGM_UnifiedResourceType[] = [
  "mod",
  "shader",
  "resourcepack",
  "map",
  "datapack",
];

/** 融合搜索固定页大小与上限 */
export const iGM_UnifiedResourceDefaultPageSize = 24;
export const iGM_UnifiedResourceMaxPageSize = 48;
/** 关键词长度上限（超长截断，避免无意义的上游请求） */
export const iGM_UnifiedResourceKeywordMax = 64;

/**
 * 本站资源类型 → 统一类型映射。
 * 本站独有的 skin/plugin/modpack/other 不进入融合搜索（返回 null 后过滤）。
 */
const iGM_SiteTypeToUnifiedMap: Record<string, iGM_UnifiedResourceType> = {
  mod: "mod",
  shader: "shader",
  texture_pack: "resourcepack",
  map: "map",
  datapack: "datapack",
};

/** 本站资源类型映射为统一类型；不可映射时返回 null */
export function iGM_MapSiteResourceType(
  siteType: string | null,
): iGM_UnifiedResourceType | null {
  if (!siteType) return null;
  return iGM_SiteTypeToUnifiedMap[siteType] ?? null;
}

/**
 * 统一类型映射为本站资源类型，用于本站侧筛选。
 * shader 在本站无对应分区，返回 null 表示本站侧不查询。
 */
export function iGM_MapUnifiedTypeToSiteType(
  type: iGM_UnifiedResourceType,
): string | null {
  switch (type) {
    case "mod":
      return "mod";
    case "resourcepack":
      return "texture_pack";
    case "map":
      return "map";
    case "datapack":
      return "datapack";
    case "shader":
      return null;
  }
}

/** 归一化类型参数：白名单外的值（含 undefined/空串）一律回退 all */
export function iGM_NormalizeUnifiedResourceType(
  raw: unknown,
): iGM_UnifiedResourceTypeFilter {
  if (
    typeof raw === "string" &&
    (iGM_UnifiedResourceTypes as readonly string[]).includes(raw)
  ) {
    return raw as iGM_UnifiedResourceType;
  }
  return "all";
}

// 导出 //
export default {
  iGM_UnifiedResourceTypes,
  iGM_MapSiteResourceType,
  iGM_MapUnifiedTypeToSiteType,
  iGM_NormalizeUnifiedResourceType,
};
