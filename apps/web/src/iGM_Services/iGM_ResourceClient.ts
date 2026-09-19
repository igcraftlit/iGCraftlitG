/**
 * 文件路径：apps/web/src/iGM_Services/iGM_ResourceClient.ts
 * 所属层：前端 / 基础服务层
 * 路由：调用后端 /G_Resource/*
 * 模块：iGM_ResourceClient
 * 作用：资源库相关后端接口的唯一前端调用出口
 * 内容：资源列表（分类/标签/搜索/分页）、分类字典、资源详情、创建、编辑、
 *       删除、上架下架、下载地址构造
 * 约束：只经 iGM_Request 发请求；类型与后端 iGM_Types/iGM_Resource.ts 保持一致
 */

// 导入依赖 //
import {
  iGM_Delete,
  iGM_Get,
  iGM_Post,
  iGM_Put,
  type iGM_ApiResponse,
} from "./iGM_Request";
import { iGM_Config } from "./iGM_Config";
import type { iGM_Author } from "./iGM_CommunityClient";
import type { iGM_FileItem } from "./iGM_FileClient";

// 类型定义 //
/** 资源状态：published 已发布 / hidden 已下架 */
export type iGM_ResourceStatus = "published" | "hidden";

/** 资源分类 */
export interface iGM_ResourceCategory {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
}

/** 资源标签 */
export interface iGM_ResourceTag {
  id: string;
  name: string;
  slug: string;
}

/** 资源列表项 */
export interface iGM_ResourceListItem {
  id: string;
  title: string;
  excerpt: string;
  status: iGM_ResourceStatus;
  category: iGM_ResourceCategory | null;
  tags: iGM_ResourceTag[];
  /** 关联活动 ID，无关联时为 null */
  activityId: string | null;
  downloadCount: number;
  uploader: iGM_Author;
  file: iGM_FileItem;
  cover: iGM_FileItem | null;
  createdAt: string;
  updatedAt: string;
}

/** 资源详情 */
export interface iGM_ResourceDetail
  extends Omit<iGM_ResourceListItem, "excerpt"> {
  description: string;
  canManage: boolean;
}

/** 资源分页数据 */
export interface iGM_ResourceListData {
  items: iGM_ResourceListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 资源列表查询参数 */
export interface iGM_ResourceQuery {
  category?: string;
  tag?: string;
  /** 仅列出关联到该活动的资源 */
  activityId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

/** 资源创建/编辑提交载荷 */
export interface iGM_ResourcePayload {
  resourceId?: string;
  title: string;
  description: string;
  categoryId: string | null;
  fileId: string;
  coverFileId: string | null;
  /** 关联活动 ID，null 表示不关联 */
  activityId: string | null;
  /** 标签原始字符串，后端解析 */
  tags: string;
  status?: string;
}

// 核心逻辑 //
/** 拼接查询字符串（跳过空值） */
function iGM_BuildQuery(
  params: Record<string, string | number | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

/** 资源列表 */
export function iGM_ApiListResources(
  query: iGM_ResourceQuery,
): Promise<iGM_ApiResponse<iGM_ResourceListData>> {
  return iGM_Get(
    `/G_Resource/list${iGM_BuildQuery({
      category: query.category,
      tag: query.tag,
      activityId: query.activityId,
      search: query.search,
      page: query.page,
      pageSize: query.pageSize,
    })}`,
  );
}

/** 资源分类字典 */
export function iGM_ApiListResourceCategories(): Promise<
  iGM_ApiResponse<{ items: iGM_ResourceCategory[] }>
> {
  return iGM_Get("/G_Resource/categories");
}

/** 资源详情 */
export function iGM_ApiGetResource(
  resourceId: string,
): Promise<iGM_ApiResponse<{ resource: iGM_ResourceDetail }>> {
  return iGM_Get(
    `/G_Resource/detail?resourceId=${encodeURIComponent(resourceId)}`,
  );
}

/** 创建资源 */
export function iGM_ApiCreateResource(
  payload: iGM_ResourcePayload,
): Promise<iGM_ApiResponse<{ resource: iGM_ResourceDetail }>> {
  return iGM_Post("/G_Resource/create", payload);
}

/** 编辑资源 */
export function iGM_ApiUpdateResource(
  payload: iGM_ResourcePayload,
): Promise<iGM_ApiResponse<{ resource: iGM_ResourceDetail }>> {
  return iGM_Put("/G_Resource/edit", payload);
}

/** 删除资源 */
export function iGM_ApiDeleteResource(
  resourceId: string,
): Promise<iGM_ApiResponse<{ deleted: boolean }>> {
  return iGM_Delete(
    `/G_Resource/delete?resourceId=${encodeURIComponent(resourceId)}`,
  );
}

/** 上架/下架资源 */
export function iGM_ApiSetResourceStatus(
  resourceId: string,
  status: iGM_ResourceStatus,
): Promise<iGM_ApiResponse<{ resource: iGM_ResourceDetail }>> {
  return iGM_Post("/G_Resource/status", { resourceId, status });
}

/** 资源下载地址（附件，直接由浏览器打开触发下载） */
export function iGM_ResourceDownloadUrl(resourceId: string): string {
  return `${iGM_Config.apiBase}/G_Resource/download?resourceId=${encodeURIComponent(resourceId)}`;
}

// 导出 //
export default {
  iGM_ApiListResources,
  iGM_ApiListResourceCategories,
  iGM_ApiGetResource,
  iGM_ApiCreateResource,
  iGM_ApiUpdateResource,
  iGM_ApiDeleteResource,
  iGM_ApiSetResourceStatus,
  iGM_ResourceDownloadUrl,
};
