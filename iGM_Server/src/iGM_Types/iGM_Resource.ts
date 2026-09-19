/**
 * 文件路径：iGM_Server/src/iGM_Types/iGM_Resource.ts
 * 所属层：后端 / 类型定义层
 * 路由：G_Resource
 * 模块：iGM_Resource
 * 作用：定义资源库、资源分类与资源标签的数据库行类型与对外 DTO
 * 内容：资源状态枚举、资源行/分类行/标签行/标签关联行、资源列表项与详情 DTO、
 *       分类 DTO、标签 DTO、分页数据
 */

// 导入依赖 //
import type { iGM_AuthorDto } from "./iGM_Community";
import type { iGM_FileDto } from "./iGM_File";

// 类型定义 //
/** 资源状态：published 已发布 / hidden 已下架 */
export type iGM_ResourceStatus = "published" | "hidden";

/** 资源分类行 */
export interface iGM_ResourceCategoryRow {
  iGM_Id: string;
  iGM_Name: string;
  iGM_Slug: string;
  iGM_SortOrder: number;
}

/** 资源标签行 */
export interface iGM_ResourceTagRow {
  iGM_Id: string;
  iGM_Name: string;
  iGM_Slug: string;
}

/** 资源标签关联行 */
export interface iGM_ResourceTagsMapRow {
  iGM_ResourceId: string;
  iGM_TagId: string;
}

/** 资源行 */
export interface iGM_ResourceRow {
  iGM_Id: string;
  iGM_UploaderId: string;
  iGM_Title: string;
  iGM_Description: string;
  iGM_CategoryId: string | null;
  iGM_FileId: string;
  iGM_CoverFileId: string | null;
  /** 关联活动（可空）；活动详情页按此列出「活动资源」 */
  iGM_ActivityId: string | null;
  iGM_DownloadCount: number;
  iGM_Status: iGM_ResourceStatus;
  iGM_CreatedAt: string;
  iGM_UpdatedAt: string;
}

/* ---------- 对外 DTO ---------- */

/** 资源分类 DTO */
export interface iGM_ResourceCategoryDto {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
}

/** 资源标签 DTO */
export interface iGM_ResourceTagDto {
  id: string;
  name: string;
  slug: string;
}

/** 资源列表项 DTO */
export interface iGM_ResourceListItemDto {
  id: string;
  title: string;
  excerpt: string;
  status: iGM_ResourceStatus;
  category: iGM_ResourceCategoryDto | null;
  tags: iGM_ResourceTagDto[];
  /** 关联活动 ID，无关联时为 null */
  activityId: string | null;
  downloadCount: number;
  uploader: iGM_AuthorDto;
  file: iGM_FileDto;
  cover: iGM_FileDto | null;
  createdAt: string;
  updatedAt: string;
}

/** 资源详情 DTO：含完整描述与当前用户编辑权限 */
export interface iGM_ResourceDetailDto extends Omit<iGM_ResourceListItemDto, "excerpt"> {
  description: string;
  /** 当前登录用户是否有编辑/删除权限（上传者或协管员及以上） */
  canManage: boolean;
}

/** 资源分页数据 */
export interface iGM_ResourceListData {
  items: iGM_ResourceListItemDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 资源写入入参（创建/编辑共用） */
export interface iGM_ResourceInput {
  title: string;
  description: string;
  categoryId?: string | null;
  fileId?: string | null;
  coverFileId?: string | null;
  /** 关联活动 ID，可空；传空字符串或 null 表示解除关联 */
  activityId?: string | null;
  /** 标签原始字符串：逗号/顿号/分号/空白分隔，服务端解析 */
  tags?: string;
  /** 资源状态：仅编辑时可选，缺省沿用原状态 */
  status?: string | null;
}

// 核心逻辑 //
/** 允许的资源状态常量 */
export const iGM_ResourceStatuses: iGM_ResourceStatus[] = [
  "published",
  "hidden",
];

/** 判断未知字符串是否为合法资源状态 */
export function iGM_IsResourceStatus(
  value: unknown,
): value is iGM_ResourceStatus {
  return (
    typeof value === "string" &&
    iGM_ResourceStatuses.includes(value as iGM_ResourceStatus)
  );
}

/** 资源分类行转 DTO */
export function iGM_ToResourceCategoryDto(
  row: iGM_ResourceCategoryRow,
): iGM_ResourceCategoryDto {
  return {
    id: row.iGM_Id,
    name: row.iGM_Name,
    slug: row.iGM_Slug,
    sortOrder: row.iGM_SortOrder,
  };
}

/** 资源标签行转 DTO */
export function iGM_ToResourceTagDto(
  row: iGM_ResourceTagRow,
): iGM_ResourceTagDto {
  return { id: row.iGM_Id, name: row.iGM_Name, slug: row.iGM_Slug };
}

// 导出 //
export default {
  iGM_ResourceStatuses,
  iGM_IsResourceStatus,
  iGM_ToResourceCategoryDto,
  iGM_ToResourceTagDto,
};