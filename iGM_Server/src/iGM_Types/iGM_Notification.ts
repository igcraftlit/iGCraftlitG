/**
 * 文件路径：iGM_Server/src/iGM_Types/iGM_Notification.ts
 * 所属层：后端 / 类型定义层
 * 路由：G_Notification
 * 模块：iGM_Notification
 * 作用：定义站内通知与通知偏好的数据库行类型与对外 DTO
 * 内容：通知类型枚举、通知行/偏好行、通知 DTO、偏好 DTO 与分页数据
 */

// 导入依赖 //
// （本文件仅依赖基础类型）

// 类型定义 //
/**
 * 通知类型：
 * comment 帖子被评论 / reply 评论被回复 / activity 活动报名成功 /
 * resource 资源被下载 / system 系统消息
 */
export type iGM_NotificationType =
  | "comment"
  | "reply"
  | "activity"
  | "resource"
  | "system";

/* ---------- 数据库行类型 ---------- */

export interface iGM_NotificationRow {
  iGM_Id: string;
  iGM_UserId: string;
  iGM_Type: iGM_NotificationType;
  iGM_Title: string;
  iGM_Content: string;
  iGM_Link: string | null;
  iGM_IsRead: number;
  iGM_CreatedAt: string;
}

export interface iGM_NotificationPreferenceRow {
  iGM_Id: string;
  iGM_UserId: string;
  iGM_SiteEnabled: number;
  iGM_EmailEnabled: number;
  iGM_UpdatedAt: string;
}

/* ---------- 对外 DTO ---------- */

/** 通知 DTO：isRead 已转换为布尔 */
export interface iGM_NotificationDto {
  id: string;
  type: iGM_NotificationType;
  title: string;
  content: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

/** 通知偏好 DTO */
export interface iGM_NotificationPreferenceDto {
  siteEnabled: boolean;
  emailEnabled: boolean;
  updatedAt: string | null;
}

/** 通知分页数据 */
export interface iGM_NotificationListData {
  items: iGM_NotificationDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  unreadCount: number;
}

/** 创建通知的内部入参 */
export interface iGM_CreateNotificationInput {
  userId: string;
  type: iGM_NotificationType;
  title: string;
  content: string;
  link?: string | null;
  now: string;
}

// 核心逻辑 //
/** 允许的通知类型常量 */
export const iGM_NotificationTypes: iGM_NotificationType[] = [
  "comment",
  "reply",
  "activity",
  "resource",
  "system",
];

/** 通知行转 DTO */
export function iGM_ToNotificationDto(
  row: iGM_NotificationRow,
): iGM_NotificationDto {
  return {
    id: row.iGM_Id,
    type: row.iGM_Type,
    title: row.iGM_Title,
    content: row.iGM_Content,
    link: row.iGM_Link,
    isRead: row.iGM_IsRead === 1,
    createdAt: row.iGM_CreatedAt,
  };
}

/** 偏好行转 DTO（缺失时由服务层传入默认值） */
export function iGM_ToNotificationPreferenceDto(
  row: iGM_NotificationPreferenceRow | null,
): iGM_NotificationPreferenceDto {
  if (!row) {
    // 从未设置过的用户：站内通知默认开启，邮件通知默认关闭
    return { siteEnabled: true, emailEnabled: false, updatedAt: null };
  }
  return {
    siteEnabled: row.iGM_SiteEnabled === 1,
    emailEnabled: row.iGM_EmailEnabled === 1,
    updatedAt: row.iGM_UpdatedAt,
  };
}

// 导出 //
export default {
  iGM_NotificationTypes,
  iGM_ToNotificationDto,
  iGM_ToNotificationPreferenceDto,
};
