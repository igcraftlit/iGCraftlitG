/**
 * 文件路径：iGM_Server/src/iGM_Types/iGM_Search.ts
 * 所属层：后端 / 类型定义层
 * 路由：G_Search
 * 模块：iGM_Search
 * 作用：定义全站搜索的实体类型、统一结果条目 DTO 与查询归一化规则
 * 内容：搜索实体类型与过滤参数、统一搜索结果条目 DTO、聚合分页数据、
 *       各实体候选行类型、关键词与分页归一化、类型白名单判定
 * 说明：四类实体（帖子/资源/用户/组织）统一映射为同构条目，前端按 type
 *       渲染不同图标并跳转各自详情路由；url 为不带语言前缀的前端路由
 */

// 类型定义 //
/** 可搜索实体类型 */
export type iGM_SearchType = "post" | "resource" | "user" | "org";

/** 类型过滤参数：具体类型或 all 全类型（默认混合） */
export type iGM_SearchTypeFilter = iGM_SearchType | "all";

/** 统一搜索结果条目（四类实体同构，前端据 type 分流展示与跳转） */
export interface iGM_SearchItemDto {
  type: iGM_SearchType;
  /** 实体主键 */
  id: string;
  /** 展示标题：帖子标题 / 资源名称 / 用户名或昵称 / 组织名称 */
  title: string;
  /** 命中摘要（已压缩空白，可按关键词高亮） */
  excerpt: string;
  /** 头像/标识图：用户头像与组织 Logo，其余为 null */
  avatar: string | null;
  /** 前端详情路由（不带语言前缀），由 iGM_Link 自动补前缀 */
  url: string;
}

/** 聚合搜索分页数据 */
export interface iGM_SearchData {
  items: iGM_SearchItemDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** 实际生效的类型过滤（非法入参归一化为 all） */
  type: iGM_SearchTypeFilter;
  /** 生效关键词（已截断去空白） */
  query: string;
}

/** 帖子搜索候选行 */
export interface iGM_SearchPostRow {
  iGM_Id: string;
  iGM_Title: string;
  iGM_Content: string;
  iGM_CreatedAt: string;
  /** 相关度分值：标题精确/前缀/包含/正文命中递减 */
  iGM_Rank: number;
}

/** 资源搜索候选行 */
export interface iGM_SearchResourceRow {
  iGM_Id: string;
  iGM_Title: string;
  iGM_Description: string;
  iGM_CreatedAt: string;
  iGM_Rank: number;
}

/** 用户搜索候选行 */
export interface iGM_SearchUserRow {
  iGM_Id: string;
  iGM_Uid: string | null;
  iGM_Username: string;
  iGM_DisplayName: string | null;
  iGM_Avatar: string | null;
  iGM_Bio: string | null;
  iGM_CreatedAt: string;
  iGM_Rank: number;
}

/** 组织搜索候选行 */
export interface iGM_SearchOrgRow {
  iGM_Id: string;
  iGM_Name: string;
  iGM_Slug: string;
  iGM_Description: string;
  iGM_Logo: string | null;
  iGM_CreatedAt: string;
  iGM_Rank: number;
}

// 核心逻辑 //
/** 允许的实体类型常量 */
export const iGM_SearchTypes: iGM_SearchType[] = [
  "post",
  "resource",
  "user",
  "org",
];

/** 分页与关键词约束：单页默认 20，上限 50；关键词上限 64 字符 */
export const iGM_SearchDefaultPageSize = 20;
export const iGM_SearchMaxPageSize = 50;
export const iGM_SearchKeywordMax = 64;
/** 混合模式下每类实体的候选窗口上限（分页在合并后内存完成） */
export const iGM_SearchCandidateWindow = 200;

/** 归一化类型参数：白名单外的值（含 undefined/空串）一律回退 all */
export function iGM_NormalizeSearchType(raw: unknown): iGM_SearchTypeFilter {
  if (
    typeof raw === "string" &&
    (iGM_SearchTypes as readonly string[]).includes(raw)
  ) {
    return raw as iGM_SearchType;
  }
  return "all";
}

/** 归一化页码：非有限值或小于 1 时回退 1 */
export function iGM_NormalizeSearchPage(raw: unknown): number {
  const value = Number(raw);
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1;
}

/** 归一化每页条数：非法或超限时收敛到 [1, 50]，缺省 20 */
export function iGM_NormalizeSearchPageSize(raw: unknown): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 1) return iGM_SearchDefaultPageSize;
  return Math.min(Math.floor(value), iGM_SearchMaxPageSize);
}

/** 归一化关键词：去首尾空白并截断到上限 */
export function iGM_NormalizeSearchKeyword(raw: unknown): string {
  const text = typeof raw === "string" ? raw.trim() : "";
  return text.slice(0, iGM_SearchKeywordMax);
}

// 导出 //
export default {
  iGM_SearchTypes,
  iGM_SearchDefaultPageSize,
  iGM_SearchMaxPageSize,
  iGM_SearchKeywordMax,
  iGM_SearchCandidateWindow,
  iGM_NormalizeSearchType,
  iGM_NormalizeSearchPage,
  iGM_NormalizeSearchPageSize,
  iGM_NormalizeSearchKeyword,
};
