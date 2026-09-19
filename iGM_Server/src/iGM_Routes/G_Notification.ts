/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_Notification.ts
 * 所属层：后端 / 路由层
 * 路由：/G_Notification/*
 * 模块：G_Notification
 * 作用：站内通知与通知偏好接口集合
 * 内容：通知列表（含未读数）、未读数、单条详情、标记已读、全部已读、
 *       删除通知、获取与更新通知偏好
 * 约束：统一响应 { success, code, message, data }；
 *       全部接口要求登录，且只能操作本人通知
 */

// 导入依赖 //
import { Elysia } from "elysia";
import { iGM_Ok } from "../iGM_Types/iGM_Response";
import { iGM_RequireUser } from "../iGM_Middleware/iGM_AuthGuard";
import {
  iGM_BoolField,
  iGM_CurrentUser,
  iGM_EnforceRateLimit,
  iGM_Field,
  iGM_PageQuery,
  iGM_Query,
  type iGM_RouteContext,
} from "./iGM_RouteSupport";
import { iGM_ContentError } from "../iGM_Services/iGM_ContentService";
import {
  iGM_DeleteNotificationService,
  iGM_GetNotificationService,
  iGM_GetPreference,
  iGM_GetUnreadCountService,
  iGM_ListMyNotificationsService,
  iGM_MarkAllReadService,
  iGM_MarkReadService,
  iGM_UpdatePreferenceService,
} from "../iGM_Services/iGM_NotificationService";

// 类型定义 //
// （路由层无额外类型，统一响应类型见 iGM_Types/iGM_Response.ts）

// 核心逻辑 //
/* ---------- 通知列表（含未读数） ---------- */
function iGM_HandleList(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  const { page, pageSize } = iGM_PageQuery(ctx);
  const onlyUnread = iGM_Query(ctx.query, "unread") === "true";
  return iGM_Ok(
    iGM_ListMyNotificationsService(user.iGM_Id, onlyUnread, page, pageSize),
  );
}

/* ---------- 未读数 ---------- */
function iGM_HandleUnreadCount(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  return iGM_Ok({ unreadCount: iGM_GetUnreadCountService(user.iGM_Id) });
}

/* ---------- 单条通知详情 ---------- */
function iGM_HandleDetail(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  const notificationId = iGM_Query(ctx.query, "notificationId");
  if (!notificationId) {
    throw new iGM_ContentError("notification.errors.notFound", 404);
  }
  return iGM_Ok({
    notification: iGM_GetNotificationService(user.iGM_Id, notificationId),
  });
}

/* ---------- 标记单条已读 ---------- */
function iGM_HandleMarkRead(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  const notificationId = iGM_Field(ctx.body, "notificationId").trim();
  if (!notificationId) {
    throw new iGM_ContentError("notification.errors.notFound", 404);
  }
  return iGM_Ok(
    { notification: iGM_MarkReadService(user.iGM_Id, notificationId) },
    "notification.messages.markedRead",
  );
}

/* ---------- 全部已读 ---------- */
function iGM_HandleMarkAllRead(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  const affected = iGM_MarkAllReadService(user.iGM_Id);
  return iGM_Ok(
    { affected },
    "notification.messages.allMarkedRead",
  );
}

/* ---------- 删除通知 ---------- */
function iGM_HandleDelete(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  const notificationId = iGM_Query(ctx.query, "notificationId");
  if (!notificationId) {
    throw new iGM_ContentError("notification.errors.notFound", 404);
  }
  iGM_DeleteNotificationService(user.iGM_Id, notificationId);
  return iGM_Ok({ deleted: true }, "notification.messages.deleted");
}

/* ---------- 获取通知偏好 ---------- */
function iGM_HandleGetPreference(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  return iGM_Ok({ preference: iGM_GetPreference(user.iGM_Id) });
}

/* ---------- 更新通知偏好 ---------- */
function iGM_HandleUpdatePreference(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "notificationWrite", `user:${user.iGM_Id}`);
  const preference = iGM_UpdatePreferenceService(
    user.iGM_Id,
    iGM_BoolField(ctx.body, "siteEnabled"),
    iGM_BoolField(ctx.body, "emailEnabled"),
  );
  return iGM_Ok({ preference }, "notification.messages.preferenceUpdated");
}

/**
 * G_Notification 通知路由集合
 * 业务错误统一抛 iGM_ContentError / iGM_AuthError，
 * 由 iGM_ServerMain 全局错误处理器格式化为统一响应体
 */
export const G_Notification = new Elysia({ name: "G_Notification" })
  .get("/G_Notification/list", iGM_HandleList as never)
  .get("/G_Notification/unread-count", iGM_HandleUnreadCount as never)
  .get("/G_Notification/detail", iGM_HandleDetail as never)
  .post("/G_Notification/read", iGM_HandleMarkRead as never)
  .post("/G_Notification/read-all", iGM_HandleMarkAllRead as never)
  .delete("/G_Notification/delete", iGM_HandleDelete as never)
  .get("/G_Notification/preference", iGM_HandleGetPreference as never)
  .post("/G_Notification/preference", iGM_HandleUpdatePreference as never);

// 导出 //
export default G_Notification;
