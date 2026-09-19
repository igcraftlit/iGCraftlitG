/**
 * 文件路径：apps/web/src/iGM_Services/iGM_NotificationClient.ts
 * 所属层：前端 / 基础服务层
 * 路由：调用后端 /G_Notification/*
 * 模块：iGM_NotificationClient
 * 作用：站内通知与通知偏好相关后端接口的唯一前端调用出口
 * 内容：通知列表（含未读数）、未读数、通知详情、标记已读、全部已读、
 *       删除通知、获取与更新通知偏好
 * 约束：只经 iGM_Request 发请求；类型与后端 iGM_Types/iGM_Notification.ts 保持一致
 */

// 导入依赖 //
import {
  iGM_Delete,
  iGM_Get,
  iGM_Post,
  type iGM_ApiResponse,
} from "./iGM_Request";

// 类型定义 //
/** 通知类型 */
export type iGM_NotificationType =
  | "comment"
  | "reply"
  | "activity"
  | "resource"
  | "system";

/** 通知条目 */
export interface iGM_Notification {
  id: string;
  type: iGM_NotificationType;
  title: string;
  content: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

/** 通知分页数据（含未读数） */
export interface iGM_NotificationListData {
  items: iGM_Notification[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  unreadCount: number;
}

/** 通知偏好 */
export interface iGM_NotificationPreference {
  siteEnabled: boolean;
  emailEnabled: boolean;
  updatedAt: string | null;
}

// 核心逻辑 //
/** 通知列表（unread 为 true 时仅返回未读） */
export function iGM_ApiListNotifications(
  page = 1,
  unread = false,
): Promise<iGM_ApiResponse<iGM_NotificationListData>> {
  const query = new URLSearchParams({ page: String(page) });
  if (unread) query.set("unread", "true");
  return iGM_Get(`/G_Notification/list?${query.toString()}`);
}

/** 未读通知数 */
export function iGM_ApiUnreadCount(): Promise<
  iGM_ApiResponse<{ unreadCount: number }>
> {
  return iGM_Get("/G_Notification/unread-count");
}

/** 单条通知详情 */
export function iGM_ApiGetNotification(
  notificationId: string,
): Promise<iGM_ApiResponse<{ notification: iGM_Notification }>> {
  return iGM_Get(
    `/G_Notification/detail?notificationId=${encodeURIComponent(notificationId)}`,
  );
}

/** 标记单条已读 */
export function iGM_ApiMarkRead(
  notificationId: string,
): Promise<iGM_ApiResponse<{ notification: iGM_Notification }>> {
  return iGM_Post("/G_Notification/read", { notificationId });
}

/** 全部标记已读 */
export function iGM_ApiMarkAllRead(): Promise<
  iGM_ApiResponse<{ affected: number }>
> {
  return iGM_Post("/G_Notification/read-all", {});
}

/** 删除通知 */
export function iGM_ApiDeleteNotification(
  notificationId: string,
): Promise<iGM_ApiResponse<{ deleted: boolean }>> {
  return iGM_Delete(
    `/G_Notification/delete?notificationId=${encodeURIComponent(notificationId)}`,
  );
}

/** 获取通知偏好 */
export function iGM_ApiGetNotificationPreference(): Promise<
  iGM_ApiResponse<{ preference: iGM_NotificationPreference }>
> {
  return iGM_Get("/G_Notification/preference");
}

/** 更新通知偏好 */
export function iGM_ApiUpdateNotificationPreference(input: {
  siteEnabled: boolean;
  emailEnabled: boolean;
}): Promise<iGM_ApiResponse<{ preference: iGM_NotificationPreference }>> {
  return iGM_Post("/G_Notification/preference", input);
}

// 导出 //
export default {
  iGM_ApiListNotifications,
  iGM_ApiUnreadCount,
  iGM_ApiGetNotification,
  iGM_ApiMarkRead,
  iGM_ApiMarkAllRead,
  iGM_ApiDeleteNotification,
  iGM_ApiGetNotificationPreference,
  iGM_ApiUpdateNotificationPreference,
};
