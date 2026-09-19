/**
 * 文件路径：iGM_Server/src/iGM_Types/iGM_Activity.ts
 * 所属层：后端 / 类型定义层
 * 路由：G_Activity
 * 模块：iGM_Activity
 * 作用：定义社区活动与活动报名的数据库行类型与对外 DTO
 * 内容：活动状态与报名状态枚举、活动行/报名行、活动列表项与详情 DTO、
 *       报名者 DTO、分页数据
 */

// 导入依赖 //
import type { iGM_AuthorDto } from "./iGM_Community";
import type { iGM_FileDto } from "./iGM_File";
import type { iGM_ResourceListItemDto } from "./iGM_Resource";

// 类型定义 //
/** 活动状态：draft 草稿 / open 报名中 / closed 已结束 */
export type iGM_ActivityStatus = "draft" | "open" | "closed";

/** 报名状态：registered 已报名 / cancelled 已取消 */
export type iGM_ActivityRegistrationStatus = "registered" | "cancelled";

/* ---------- 数据库行类型 ---------- */

export interface iGM_ActivityRow {
  iGM_Id: string;
  iGM_CreatorId: string;
  iGM_Title: string;
  iGM_Description: string;
  iGM_CoverFileId: string | null;
  iGM_Location: string | null;
  iGM_StartTime: string | null;
  iGM_EndTime: string | null;
  iGM_Status: iGM_ActivityStatus;
  iGM_MaxParticipants: number | null;
  iGM_CreatedAt: string;
  iGM_UpdatedAt: string;
}

export interface iGM_ActivityRegistrationRow {
  iGM_Id: string;
  iGM_ActivityId: string;
  iGM_UserId: string;
  iGM_Status: iGM_ActivityRegistrationStatus;
  iGM_CreatedAt: string;
}

/* ---------- 对外 DTO ---------- */

/** 活动列表项 DTO */
export interface iGM_ActivityListItemDto {
  id: string;
  title: string;
  excerpt: string;
  status: iGM_ActivityStatus;
  location: string | null;
  startTime: string | null;
  endTime: string | null;
  maxParticipants: number | null;
  registeredCount: number;
  creator: iGM_AuthorDto;
  cover: iGM_FileDto | null;
  createdAt: string;
  updatedAt: string;
}

/** 活动详情 DTO：含完整描述与当前用户报名状态 */
export interface iGM_ActivityDetailDto extends Omit<iGM_ActivityListItemDto, "excerpt"> {
  description: string;
  /** 当前登录用户是否已报名 */
  registeredByMe: boolean;
  /** 当前登录用户是否有编辑权限（创建者或协管员及以上） */
  canEdit: boolean;
  /** 关联到本活动的已发布资源（活动资源） */
  resources: iGM_ResourceListItemDto[];
}

/** 活动报名者 DTO */
export interface iGM_ActivityRegistrationDto {
  id: string;
  status: iGM_ActivityRegistrationStatus;
  createdAt: string;
  user: iGM_AuthorDto;
}

/** 活动分页数据 */
export interface iGM_ActivityListData {
  items: iGM_ActivityListItemDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 活动写入入参（创建/编辑共用） */
export interface iGM_ActivityInput {
  title: string;
  description: string;
  coverFileId?: string | null;
  location?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  status?: string;
  maxParticipants?: string | number | null;
}

// 核心逻辑 //
/** 允许的活动状态常量 */
export const iGM_ActivityStatuses: iGM_ActivityStatus[] = [
  "draft",
  "open",
  "closed",
];

/** 判断未知字符串是否为合法活动状态 */
export function iGM_IsActivityStatus(
  value: unknown,
): value is iGM_ActivityStatus {
  return (
    typeof value === "string" &&
    iGM_ActivityStatuses.includes(value as iGM_ActivityStatus)
  );
}

// 导出 //
export default { iGM_ActivityStatuses, iGM_IsActivityStatus };
