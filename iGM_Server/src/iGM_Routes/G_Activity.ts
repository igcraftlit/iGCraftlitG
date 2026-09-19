/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_Activity.ts
 * 所属层：后端 / 路由层
 * 路由：/G_Activity/*
 * 模块：G_Activity
 * 作用：社区活动列表、详情、创建、编辑、删除与报名接口集合
 * 内容：活动分页列表（状态筛选与关键词搜索）、活动详情、创建活动、
 *       编辑活动、删除活动、报名、取消报名、报名列表
 * 约束：统一响应 { success, code, message, data }；
 *       写入与报名要求登录并做基础限流；权限校验在业务层完成
 */

// 导入依赖 //
import { Elysia } from "elysia";
import { iGM_Ok } from "../iGM_Types/iGM_Response";
import { iGM_RequireUser } from "../iGM_Middleware/iGM_AuthGuard";
import {
  iGM_CurrentUser,
  iGM_EnforceRateLimit,
  iGM_Field,
  iGM_PageQuery,
  iGM_Query,
  iGM_RequestLocale,
  type iGM_RouteContext,
} from "./iGM_RouteSupport";
import { iGM_ContentError } from "../iGM_Services/iGM_ContentService";
import {
  iGM_CancelRegistrationService,
  iGM_CreateActivityService,
  iGM_DeleteActivityService,
  iGM_GetActivityDetailService,
  iGM_ListActivitiesService,
  iGM_ListRegistrationsService,
  iGM_RegisterActivityService,
  iGM_UpdateActivityService,
} from "../iGM_Services/iGM_ActivityService";
import type { iGM_ActivityInput } from "../iGM_Types/iGM_Activity";

// 类型定义 //
// （路由层无额外类型，统一响应类型见 iGM_Types/iGM_Response.ts）

// 核心逻辑 //
/** 从请求体提取活动写入入参（创建与编辑共用） */
function iGM_ReadActivityInput(body: unknown): iGM_ActivityInput {
  return {
    title: iGM_Field(body, "title"),
    description: iGM_Field(body, "description"),
    coverFileId: iGM_Field(body, "coverFileId"),
    location: iGM_Field(body, "location"),
    startTime: iGM_Field(body, "startTime"),
    endTime: iGM_Field(body, "endTime"),
    status: iGM_Field(body, "status"),
    maxParticipants: iGM_Field(body, "maxParticipants"),
  };
}

/* ---------- 活动列表 ---------- */
function iGM_HandleList(ctx: iGM_RouteContext) {
  const { page, pageSize } = iGM_PageQuery(ctx);
  return iGM_Ok(
    iGM_ListActivitiesService(iGM_CurrentUser(ctx), {
      status: iGM_Query(ctx.query, "status") || undefined,
      search: iGM_Query(ctx.query, "search") || undefined,
      page,
      pageSize,
    }),
  );
}

/* ---------- 活动详情 ---------- */
function iGM_HandleDetail(ctx: iGM_RouteContext) {
  const activityId = iGM_Query(ctx.query, "activityId");
  if (!activityId) throw new iGM_ContentError("activity.errors.notFound", 404);
  const detail = iGM_GetActivityDetailService(iGM_CurrentUser(ctx), activityId);
  if (!detail) throw new iGM_ContentError("activity.errors.notFound", 404);
  return iGM_Ok({ activity: detail });
}

/* ---------- 创建活动 ---------- */
function iGM_HandleCreate(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "activityWrite", `user:${user.iGM_Id}`);
  const detail = iGM_CreateActivityService(user, iGM_ReadActivityInput(ctx.body));
  ctx.set.status = 201;
  return iGM_Ok({ activity: detail }, "activity.messages.created");
}

/* ---------- 编辑活动 ---------- */
function iGM_HandleEdit(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "activityWrite", `user:${user.iGM_Id}`);
  const activityId = iGM_Field(ctx.body, "activityId").trim();
  if (!activityId) throw new iGM_ContentError("activity.errors.notFound", 404);
  const detail = iGM_UpdateActivityService(
    user,
    activityId,
    iGM_ReadActivityInput(ctx.body),
  );
  return iGM_Ok({ activity: detail }, "activity.messages.updated");
}

/* ---------- 删除活动 ---------- */
function iGM_HandleDelete(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "activityWrite", `user:${user.iGM_Id}`);
  const activityId = iGM_Query(ctx.query, "activityId");
  if (!activityId) throw new iGM_ContentError("activity.errors.notFound", 404);
  iGM_DeleteActivityService(user, activityId);
  return iGM_Ok({ deleted: true }, "activity.messages.deleted");
}

/* ---------- 报名活动 ---------- */
function iGM_HandleRegister(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "activityRegister", `user:${user.iGM_Id}`);
  const activityId = iGM_Field(ctx.body, "activityId").trim();
  if (!activityId) throw new iGM_ContentError("activity.errors.notFound", 404);
  const detail = iGM_RegisterActivityService(
    user,
    activityId,
    iGM_RequestLocale(ctx),
  );
  return iGM_Ok({ activity: detail }, "activity.messages.registered");
}

/* ---------- 取消报名 ---------- */
function iGM_HandleCancel(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "activityRegister", `user:${user.iGM_Id}`);
  const activityId = iGM_Field(ctx.body, "activityId").trim();
  if (!activityId) throw new iGM_ContentError("activity.errors.notFound", 404);
  const detail = iGM_CancelRegistrationService(user, activityId);
  return iGM_Ok({ activity: detail }, "activity.messages.cancelled");
}

/* ---------- 报名列表 ---------- */
function iGM_HandleRegistrations(ctx: iGM_RouteContext) {
  const activityId = iGM_Query(ctx.query, "activityId");
  if (!activityId) throw new iGM_ContentError("activity.errors.notFound", 404);
  return iGM_Ok({ items: iGM_ListRegistrationsService(activityId) });
}

/**
 * G_Activity 活动路由集合
 * 业务错误统一抛 iGM_ContentError / iGM_AuthError，
 * 由 iGM_ServerMain 全局错误处理器格式化为统一响应体
 */
export const G_Activity = new Elysia({ name: "G_Activity" })
  .get("/G_Activity/list", iGM_HandleList as never)
  .get("/G_Activity/detail", iGM_HandleDetail as never)
  .post("/G_Activity/create", iGM_HandleCreate as never)
  .put("/G_Activity/edit", iGM_HandleEdit as never)
  .delete("/G_Activity/delete", iGM_HandleDelete as never)
  .post("/G_Activity/register", iGM_HandleRegister as never)
  .post("/G_Activity/cancel", iGM_HandleCancel as never)
  .get("/G_Activity/registrations", iGM_HandleRegistrations as never);

// 导出 //
export default G_Activity;
