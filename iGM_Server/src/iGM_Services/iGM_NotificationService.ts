/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_NotificationService.ts
 * 所属层：后端 / 业务逻辑层
 * 路由：G_Notification，并被 G_Post、G_Activity、G_Resource 内部调用
 * 模块：iGM_NotificationService
 * 作用：站内通知的创建、查询、已读与偏好管理，以及可选的邮件通知投递
 * 内容：通知文案本地化（中英双语，繁中归中文，日/俄归英文）、
 *       通知偏好读取与更新、通知列表与未读数、标记已读、删除、
 *       业务触发入口（评论、回复、报名、资源下载）
 * 说明：通知写入为同步操作，邮件投递为异步且失败不阻断主流程；
 *       自我触发（自己评论自己的帖子）不产生通知
 */

// 导入依赖 //
import {
  iGM_CountUnreadNotifications,
  iGM_CreateNotification,
  iGM_DeleteNotification,
  iGM_FindNotificationById,
  iGM_FindNotificationPreference,
  iGM_ListNotificationsByUser,
  iGM_MarkAllNotificationsRead,
  iGM_MarkNotificationRead,
  iGM_UpsertNotificationPreference,
} from "../iGM_Repositories/iGM_NotificationRepository";
import { iGM_FindUserById } from "../iGM_Repositories/iGM_UserRepository";
import { iGM_SendNotificationMail } from "./iGM_MailService";
import { iGM_ContentError } from "./iGM_ContentService";
import {
  iGM_ToNotificationDto,
  iGM_ToNotificationPreferenceDto,
  type iGM_NotificationDto,
  type iGM_NotificationListData,
  type iGM_NotificationPreferenceDto,
  type iGM_NotificationType,
} from "../iGM_Types/iGM_Notification";

// 类型定义 //
/** 通知触发入参 */
export interface iGM_NotifyInput {
  /** 通知接收者 */
  userId: string;
  /** 触发者：与接收者相同则跳过（自我触发不通知） */
  actorId?: string | null;
  /** 触发者显示名，用于文案 */
  actorName?: string;
  type: iGM_NotificationType;
  /** 触发者界面语言，决定通知与邮件文案语言 */
  locale?: string;
  /** 文案参数：title 为对象标题等 */
  title?: string;
  /** 站内跳转链接（相对路径） */
  link?: string | null;
}

/** 已本地化的通知文案 */
interface iGM_NotifyText {
  title: string;
  content: string;
}

// 核心逻辑 //
const iGM_DefaultPageSize = 20;
const iGM_MaxPageSize = 50;

/** 判断是否使用中文文案（繁中归中文，日文/俄文回退英文） */
function iGM_IsChinese(locale: string | undefined): boolean {
  return locale === "zh-CN" || locale === "zh-TW";
}

/** 生成通知标题与正文（中英双语） */
function iGM_BuildNotifyText(input: iGM_NotifyInput): iGM_NotifyText {
  const zh = iGM_IsChinese(input.locale);
  const actor = input.actorName ?? "iGCraftLit";
  const subject = input.title ?? "";

  switch (input.type) {
    case "comment":
      return zh
        ? {
            title: "你的帖子有新评论",
            content: `${actor} 评论了你的帖子《${subject}》`,
          }
        : {
            title: "New comment on your post",
            content: `${actor} commented on your post "${subject}"`,
          };
    case "reply":
      return zh
        ? {
            title: "你的评论有新回复",
            content: `${actor} 回复了你在《${subject}》下的评论`,
          }
        : {
            title: "New reply to your comment",
            content: `${actor} replied to your comment in "${subject}"`,
          };
    case "activity":
      return zh
        ? {
            title: "活动报名成功",
            content: `你已成功报名活动《${subject}》`,
          }
        : {
            title: "Activity registration confirmed",
            content: `You have successfully registered for "${subject}"`,
          };
    case "resource":
      return zh
        ? {
            title: "你的资源被下载",
            content: `${actor} 下载了你的资源《${subject}》`,
          }
        : {
            title: "Your resource was downloaded",
            content: `${actor} downloaded your resource "${subject}"`,
          };
    default:
      return zh
        ? { title: "系统通知", content: subject }
        : { title: "System notification", content: subject };
  }
}

/** 规范化分页参数 */
function iGM_ResolvePagination(
  pageRaw?: number,
  pageSizeRaw?: number,
): { page: number; pageSize: number } {
  const page =
    Number.isFinite(pageRaw) && (pageRaw as number) >= 1
      ? Math.floor(pageRaw as number)
      : 1;
  const pageSize =
    Number.isFinite(pageSizeRaw) &&
    (pageSizeRaw as number) >= 1 &&
    (pageSizeRaw as number) <= iGM_MaxPageSize
      ? Math.floor(pageSizeRaw as number)
      : iGM_DefaultPageSize;
  return { page, pageSize };
}

/* ---------- 偏好 ---------- */

/** 读取某用户通知偏好（未设置时返回默认值） */
export function iGM_GetPreference(userId: string): iGM_NotificationPreferenceDto {
  return iGM_ToNotificationPreferenceDto(
    iGM_FindNotificationPreference(userId),
  );
}

/** 更新某用户通知偏好 */
export function iGM_UpdatePreferenceService(
  userId: string,
  siteEnabled: boolean,
  emailEnabled: boolean,
): iGM_NotificationPreferenceDto {
  const now = new Date().toISOString();
  iGM_UpsertNotificationPreference(userId, siteEnabled, emailEnabled, now);
  return iGM_ToNotificationPreferenceDto(
    iGM_FindNotificationPreference(userId),
  );
}

/* ---------- 通知触发（供其他业务模块调用） ---------- */

/**
 * 创建通知并按偏好投递邮件
 * 同步写入站内通知；邮件为异步发送，失败仅记录日志不阻断业务
 * @returns 实际创建的通知 DTO；未创建（自我触发/关闭站内通知）返回 null
 */
export function iGM_Notify(input: iGM_NotifyInput): iGM_NotificationDto | null {
  // 自我触发不产生通知
  if (input.actorId && input.actorId === input.userId) return null;

  const recipient = iGM_FindUserById(input.userId);
  if (!recipient || recipient.iGM_Status !== "active") return null;

  const preference = iGM_FindNotificationPreference(input.userId);
  const siteEnabled = preference ? preference.iGM_SiteEnabled === 1 : true;
  const emailEnabled = preference ? preference.iGM_EmailEnabled === 1 : false;

  const text = iGM_BuildNotifyText(input);
  const now = new Date().toISOString();

  let created: iGM_NotificationDto | null = null;
  if (siteEnabled) {
    const row = iGM_CreateNotification({
      userId: input.userId,
      type: input.type,
      title: text.title,
      content: text.content,
      link: input.link ?? null,
      now,
    });
    created = iGM_ToNotificationDto(row);
  }

  // 邮件通知：异步投递，失败不影响主流程
  if (emailEnabled && recipient.iGM_Email) {
    void iGM_SendNotificationMail({
      to: recipient.iGM_Email,
      username: recipient.iGM_DisplayName ?? recipient.iGM_Username,
      title: text.title,
      content: text.content,
      link: input.link ?? null,
      locale: input.locale ?? "zh-CN",
    }).catch((error) => {
      console.error(
        `[iGM_NotificationService] 通知邮件发送失败（${input.userId}）：`,
        error instanceof Error ? error.message : error,
      );
    });
  }

  return created;
}

/* ---------- 通知查询与操作 ---------- */

/** 分页查询本人通知列表（含未读数） */
export function iGM_ListMyNotificationsService(
  userId: string,
  onlyUnread: boolean,
  pageRaw?: number,
  pageSizeRaw?: number,
): iGM_NotificationListData {
  const { page, pageSize } = iGM_ResolvePagination(pageRaw, pageSizeRaw);
  const { items, total } = iGM_ListNotificationsByUser(
    userId,
    onlyUnread,
    page,
    pageSize,
  );
  return {
    items: items.map(iGM_ToNotificationDto),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    unreadCount: iGM_CountUnreadNotifications(userId),
  };
}

/** 获取本人未读通知数 */
export function iGM_GetUnreadCountService(userId: string): number {
  return iGM_CountUnreadNotifications(userId);
}

/** 获取单条通知详情（限定本人） */
export function iGM_GetNotificationService(
  userId: string,
  notificationId: string,
): iGM_NotificationDto {
  const row = iGM_FindNotificationById(notificationId);
  if (!row || row.iGM_UserId !== userId) {
    throw new iGM_ContentError("notification.errors.notFound", 404);
  }
  return iGM_ToNotificationDto(row);
}

/** 标记单条通知已读 */
export function iGM_MarkReadService(
  userId: string,
  notificationId: string,
): iGM_NotificationDto {
  const row = iGM_FindNotificationById(notificationId);
  if (!row || row.iGM_UserId !== userId) {
    throw new iGM_ContentError("notification.errors.notFound", 404);
  }
  iGM_MarkNotificationRead(notificationId, userId);
  const updated = iGM_FindNotificationById(notificationId);
  return iGM_ToNotificationDto(updated ?? row);
}

/** 标记本人全部通知已读，返回受影响条数 */
export function iGM_MarkAllReadService(userId: string): number {
  return iGM_MarkAllNotificationsRead(userId);
}

/** 删除单条通知（限定本人） */
export function iGM_DeleteNotificationService(
  userId: string,
  notificationId: string,
): void {
  const row = iGM_FindNotificationById(notificationId);
  if (!row || row.iGM_UserId !== userId) {
    throw new iGM_ContentError("notification.errors.notFound", 404);
  }
  iGM_DeleteNotification(notificationId, userId);
}

// 导出 //
export default {
  iGM_GetPreference,
  iGM_UpdatePreferenceService,
  iGM_Notify,
  iGM_ListMyNotificationsService,
  iGM_GetUnreadCountService,
  iGM_GetNotificationService,
  iGM_MarkReadService,
  iGM_MarkAllReadService,
  iGM_DeleteNotificationService,
};
