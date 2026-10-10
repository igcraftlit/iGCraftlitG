/**
 * 文件路径：apps/web/src/iGM_Services/iGM_SearchClient.ts
 * 所属层：前端 / 基础服务层
 * 路由：调用后端 /G_Search
 * 模块：iGM_SearchClient
 * 作用：全站聚合搜索接口的唯一前端调用出口
 * 内容：搜索实体类型、统一结果条目、聚合分页数据类型与搜索请求方法
 * 约束：只经 iGM_Request 发请求；类型与后端 iGM_Types/iGM_Search.ts 保持一致
 */

// 导入依赖 //
import { iGM_Get, type iGM_ApiResponse } from "./iGM_Request";

// 类型定义 //
/** 可搜索实体类型 */
export type iGM_SearchType = "post" | "resource" | "user" | "org";

/** 类型过滤参数：具体类型或 all 全类型 */
export type iGM_SearchTypeFilter = iGM_SearchType | "all";

/** 统一搜索结果条目（四类实体同构） */
export interface iGM_SearchItem {
  type: iGM_SearchType;
  id: string;
  /** 展示标题：帖子标题 / 资源名称 / 用户名或昵称 / 组织名称 */
  title: string;
  /** 命中摘要（可按关键词高亮） */
  excerpt: string;
  /** 头像/标识图：用户头像与组织 Logo，其余为 null */
  avatar: string | null;
  /** 前端详情路由（不带语言前缀） */
  url: string;
}

/** 聚合搜索分页数据 */
export interface iGM_SearchData {
  items: iGM_SearchItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** 实际生效的类型过滤 */
  type: iGM_SearchTypeFilter;
  /** 生效关键词 */
  query: string;
}

/** 搜索查询参数 */
export interface iGM_SearchQuery {
  q: string;
  type?: iGM_SearchTypeFilter;
  page?: number;
  pageSize?: number;
}

// 核心逻辑 //
/** 聚合搜索（公开只读，未登录可访问） */
export function iGM_ApiSearch(
  query: iGM_SearchQuery,
): Promise<iGM_ApiResponse<iGM_SearchData>> {
  const search = new URLSearchParams();
  search.set("q", query.q);
  if (query.type) search.set("type", query.type);
  if (query.page) search.set("page", String(query.page));
  if (query.pageSize) search.set("pageSize", String(query.pageSize));
  return iGM_Get(`/G_Search?${search.toString()}`);
}

// 导出 //
export default { iGM_ApiSearch };
