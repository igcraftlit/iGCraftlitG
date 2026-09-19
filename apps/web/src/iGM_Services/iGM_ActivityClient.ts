/**
 * 文件路径：apps/web/src/iGM_Services/iGM_ActivityClient.ts
 * 所属层：前端 / 基础服务层
 * 路由：调用后端 /G_Activity/*
 * 模块：iGM_ActivityClient
 * 作用：社区活动相关后端接口的唯一前端调用出口
 * 内容：活动列表（状态筛选/搜索/分页）、活动详情、创建、编辑、删除、
 *       报名、取消报名、报名列表
 * 约束：只经 iGM_Request 发请求；类型与后端 iGM_Types/iGM_Activity.ts 保持一致
 */

// 导入依赖 //
import {
  iGM_Delete,
  iGM_Get,
  iGM_Post,
  iGM_Put,
  type iGM_ApiResponse,
} from "./iGM_Request";
import type { iGM_Author } from "./iGM_CommunityClient";
import type { iGM_FileItem } from "./iGM_FileClient";
import type { iGM_ResourceListItem } from "./iGM_ResourceClient";

// 类型定义 //
/** 活动状态：draft 草稿 / open 报名中 / closed 已结束 */
export type iGM_ActivityStatus = "draft" | "open" | "closed";

/** 报名状态 */
export type iGM_ActivityRegistrationStatus = "registered" | "cancelled";

/** 活动列表项 */
export interface iGM_ActivityListItem {
  id: string;
  title: string;
  excerpt: string;
  status: iGM_ActivityStatus;
  location: string | null;
  startTime: string | null;
  endTime: string | null;
  maxParticipants: number | null;
  registeredCount: number;
  creator: iGM_Author;
  cover: iGM_FileItem | null;
  createdAt: string;
  updatedAt: string;
}

/** 活动详情 */
export interface iGM_ActivityDetail
  extends Omit<iGM_ActivityListItem, "excerpt"> {
  description: string;
  registeredByMe: boolean;
  canEdit: boolean;
  /** 活动资源：关联到本活动的已发布资源 */
  resources: iGM_ResourceListItem[];
}

/** 活动报名者 */
export interface iGM_ActivityRegistration {
  id: string;
  status: iGM_ActivityRegistrationStatus;
  createdAt: string;
  user: iGM_Author;
}

/** 活动分页数据 */
export interface iGM_ActivityListData {
  items: iGM_ActivityListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 活动列表查询参数 */
export interface iGM_ActivityQuery {
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

/** 活动创建/编辑提交载荷 */
export interface iGM_ActivityPayload {
  activityId?: string;
  title: string;
  description: string;
  coverFileId: string | null;
  location: string;
  startTime: string;
  endTime: string;
  status: string;
  maxParticipants: string;
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

/** 活动列表 */
export function iGM_ApiListActivities(
  query: iGM_ActivityQuery,
): Promise<iGM_ApiResponse<iGM_ActivityListData>> {
  return iGM_Get(
    `/G_Activity/list${iGM_BuildQuery({
      status: query.status,
      search: query.search,
      page: query.page,
      pageSize: query.pageSize,
    })}`,
  );
}

/** 活动详情 */
export function iGM_ApiGetActivity(
  activityId: string,
): Promise<iGM_ApiResponse<{ activity: iGM_ActivityDetail }>> {
  return iGM_Get(
    `/G_Activity/detail?activityId=${encodeURIComponent(activityId)}`,
  );
}

/** 创建活动 */
export function iGM_ApiCreateActivity(
  payload: iGM_ActivityPayload,
): Promise<iGM_ApiResponse<{ activity: iGM_ActivityDetail }>> {
  return iGM_Post("/G_Activity/create", payload);
}

/** 编辑活动 */
export function iGM_ApiUpdateActivity(
  payload: iGM_ActivityPayload,
): Promise<iGM_ApiResponse<{ activity: iGM_ActivityDetail }>> {
  return iGM_Put("/G_Activity/edit", payload);
}

/** 删除活动 */
export function iGM_ApiDeleteActivity(
  activityId: string,
): Promise<iGM_ApiResponse<{ deleted: boolean }>> {
  return iGM_Delete(
    `/G_Activity/delete?activityId=${encodeURIComponent(activityId)}`,
  );
}

/** 报名活动 */
export function iGM_ApiRegisterActivity(
  activityId: string,
): Promise<iGM_ApiResponse<{ activity: iGM_ActivityDetail }>> {
  return iGM_Post("/G_Activity/register", { activityId });
}

/** 取消报名 */
export function iGM_ApiCancelRegistration(
  activityId: string,
): Promise<iGM_ApiResponse<{ activity: iGM_ActivityDetail }>> {
  return iGM_Post("/G_Activity/cancel", { activityId });
}

/** 活动报名列表 */
export function iGM_ApiListRegistrations(
  activityId: string,
): Promise<iGM_ApiResponse<{ items: iGM_ActivityRegistration[] }>> {
  return iGM_Get(
    `/G_Activity/registrations?activityId=${encodeURIComponent(activityId)}`,
  );
}

// 导出 //
export default {
  iGM_ApiListActivities,
  iGM_ApiGetActivity,
  iGM_ApiCreateActivity,
  iGM_ApiUpdateActivity,
  iGM_ApiDeleteActivity,
  iGM_ApiRegisterActivity,
  iGM_ApiCancelRegistration,
  iGM_ApiListRegistrations,
};
