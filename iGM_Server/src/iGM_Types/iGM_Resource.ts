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
  /** 模块十：Minecraft 资源类型，非 Minecraft 资源为 null */
  iGM_ResourceType: string | null;
  /** 模块十：适用版本/加载器/平台，JSON 数组字符串（行存储原始文本） */
  iGM_McVersions: string | null;
  iGM_Loaders: string | null;
  iGM_Platforms: string | null;
  /** 模块十：许可协议、原作者、原帖链接、更新日志 */
  iGM_License: string | null;
  iGM_OriginalAuthor: string | null;
  iGM_OriginalUrl: string | null;
  iGM_Changelog: string | null;
  /** 模块十三：是否允许通过 iGM CLI 下载 */
  iGM_Downloadable: number;
  /** 模块十三：CLI 下载标识符，格式 u{uid}-{slug}，全局唯一 */
  iGM_Slug: string | null;
  /** 模块十三：版本号（选填），如 1.0.0 */
  iGM_Version: string | null;
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
  /** 模块十：Minecraft 资源类型，非 Minecraft 资源为 null */
  resourceType: string | null;
  /** 模块十：适用版本/加载器/平台（已解析为数组，无则空数组） */
  mcVersions: string[];
  loaders: string[];
  platforms: string[];
  /** 模块十：许可协议、原作者、原帖链接、更新日志 */
  license: string | null;
  originalAuthor: string | null;
  originalUrl: string | null;
  changelog: string | null;
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
  /** 模块十三：是否允许 iGM CLI 下载 */
  downloadable: boolean;
  /** 模块十三：CLI 下载标识符（u{uid}-{slug}），不可下载时为 null */
  slug: string | null;
  /** 模块十三：版本号（选填） */
  version: string | null;
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
  /* ---------- 模块十：Minecraft 字段 ---------- */
  /** Minecraft 分区标记：true 时按 Minecraft 资源校验与写入 */
  minecraft?: boolean;
  resourceType?: string | null;
  /** 多选值：逗号分隔字符串或数组，服务端统一解析 */
  mcVersions?: string | string[];
  loaders?: string | string[];
  platforms?: string | string[];
  license?: string | null;
  originalAuthor?: string | null;
  originalUrl?: string | null;
  changelog?: string | null;
  /* ---------- 模块十三：iGM CLI 下载 ---------- */
  /** 是否允许通过 iGM CLI 下载，勾选后自动生成下载命令 */
  downloadable?: boolean;
  /** 版本号（选填），如 1.0.0；填写后下载命令包含 @version */
  version?: string | null;
}

/** Minecraft 列表筛选参数（列表查询用） */
export interface iGM_MinecraftQuery {
  resourceType?: string;
  mcVersion?: string;
  loader?: string;
  platform?: string;
  search?: string;
  page?: number;
  pageSize?: number;
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

/* ---------- 模块十：Minecraft 常量（术语保留英文） ---------- */
/** 资源类型：模组/材质包/地图/皮肤/插件/整合包/数据包/其他 */
export const iGM_McResourceTypes = [
  "mod",
  "texture_pack",
  "map",
  "skin",
  "plugin",
  "modpack",
  "datapack",
  "other",
] as const;
export type iGM_McResourceType = (typeof iGM_McResourceTypes)[number];

/** 加载器：Forge、Fabric、NeoForge、Quilt、vanilla 原版、none 无 */
export const iGM_McLoaders = [
  "Forge",
  "Fabric",
  "NeoForge",
  "Quilt",
  "vanilla",
  "none",
] as const;
export type iGM_McLoader = (typeof iGM_McLoaders)[number];

/** 支持平台：Java Edition、Bedrock Edition */
export const iGM_McPlatforms = ["Java Edition", "Bedrock Edition"] as const;
export type iGM_McPlatform = (typeof iGM_McPlatforms)[number];

/** 常用 Minecraft 版本选项（前端多选展示，上传可自由填写其它版本） */
export const iGM_McVersionOptions = [
  "1.12.2",
  "1.16.5",
  "1.18.2",
  "1.19.2",
  "1.19.4",
  "1.20.1",
  "1.20.2",
  "1.20.4",
  "1.20.6",
  "1.21",
  "1.21.1",
  "1.21.3",
  "1.21.4",
] as const;

/** 判断值是否为合法 Minecraft 资源类型 */
export function iGM_IsMcResourceType(value: unknown): value is iGM_McResourceType {
  return (
    typeof value === "string" &&
    (iGM_McResourceTypes as readonly string[]).includes(value)
  );
}

/* ---------- 模块十七：Minecraft 本体分区 ---------- */
/**
 * 本体分区类型：资源库 Minecraft 分区下的“游戏本体”子分区。
 * 该类型仅用于分区浏览与筛选，本体数据来自 iGM_MinecraftVersions，
 * 不作为资源上传类型（上传表单仍只提供 iGM_McResourceTypes）
 */
export const iGM_McVersionResourceType = "minecraft_version";

/** 分区筛选可选项：可上传的资源类型 + 本体分区 */
export const iGM_McPartitionTypes = [
  ...iGM_McResourceTypes,
  iGM_McVersionResourceType,
] as const;
export type iGM_McPartitionType = (typeof iGM_McPartitionTypes)[number];

/** 判断值是否为合法分区筛选类型 */
export function iGM_IsMcPartitionType(
  value: unknown,
): value is iGM_McPartitionType {
  return (
    typeof value === "string" &&
    (iGM_McPartitionTypes as readonly string[]).includes(value)
  );
}

/** 判断值是否为合法加载器 */
export function iGM_IsMcLoader(value: unknown): value is iGM_McLoader {
  return (
    typeof value === "string" && (iGM_McLoaders as readonly string[]).includes(value)
  );
}

/** 判断值是否为合法平台 */
export function iGM_IsMcPlatform(value: unknown): value is iGM_McPlatform {
  return (
    typeof value === "string" &&
    (iGM_McPlatforms as readonly string[]).includes(value)
  );
}

/**
 * 解析多选值：数组原样清洗；字符串按逗号/顿号/分号/空白分隔。
 * 返回去重后的非空字符串数组，保持出现顺序。
 */
export function iGM_ParseMultiValue(
  value: string | string[] | null | undefined,
): string[] {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(/[,，、；;\s]+/);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of raw) {
    const trimmed = item.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
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