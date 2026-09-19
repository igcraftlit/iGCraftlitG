/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_Points.ts
 * 所属层：后端 / 路由层
 * 路由：/G_Points/*
 * 模块：G_Points
 * 作用：积分、等级、勋章、签到与任务接口集合
 * 内容：我的积分、积分记录、签到、签到状态、等级规则、勋章列表、
 *       任务列表与进度、排行榜
 * 约束：统一响应 { success, code, message, data }；
 *       签到写入接口有限流；查询接口登录与否均可（勋章/任务附带我方状态）
 */

// 导入依赖 //
import { Elysia } from "elysia";
import { iGM_Ok } from "../iGM_Types/iGM_Response";
import { iGM_RequireUser } from "../iGM_Middleware/iGM_AuthGuard";
import {
  iGM_CurrentUser,
  iGM_EnforceRateLimit,
  iGM_Query,
  type iGM_RouteContext,
} from "./iGM_RouteSupport";
import {
  iGM_CheckinService,
  iGM_GetBadgesService,
  iGM_GetCheckinStatusService,
  iGM_GetLeaderboardService,
  iGM_GetLevelRulesService,
  iGM_GetMyPointsService,
  iGM_GetTasksService,
  iGM_ListMyRecordsService,
} from "../iGM_Services/iGM_PointsService";

// 类型定义 //
// （路由层无额外类型，统一响应类型见 iGM_Types/iGM_Response.ts）

// 核心逻辑 //
/* ---------- 我的积分概览 ---------- */
function iGM_HandleMyPoints(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  return iGM_Ok(iGM_GetMyPointsService(user.iGM_Id));
}

/* ---------- 积分记录 ---------- */
function iGM_HandleRecords(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  const page = Number(iGM_Query(ctx.query, "page", "1"));
  const pageSize = Number(iGM_Query(ctx.query, "pageSize", "10"));
  return iGM_Ok(iGM_ListMyRecordsService(user.iGM_Id, page, pageSize));
}

/* ---------- 签到 ---------- */
function iGM_HandleCheckin(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "checkin", `user:${user.iGM_Id}`);
  return iGM_Ok(iGM_CheckinService(user.iGM_Id), "points.messages.checkedIn");
}

/* ---------- 签到状态 ---------- */
function iGM_HandleCheckinStatus(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  return iGM_Ok(iGM_GetCheckinStatusService(user.iGM_Id));
}

/* ---------- 等级规则 ---------- */
function iGM_HandleLevels(_ctx: iGM_RouteContext) {
  return iGM_Ok({ levels: iGM_GetLevelRulesService() });
}

/* ---------- 勋章列表（含我的状态） ---------- */
function iGM_HandleBadges(ctx: iGM_RouteContext) {
  const user = iGM_CurrentUser(ctx);
  return iGM_Ok({ badges: iGM_GetBadgesService(user?.iGM_Id ?? null) });
}

/* ---------- 任务列表与进度 ---------- */
function iGM_HandleTasks(ctx: iGM_RouteContext) {
  const user = iGM_CurrentUser(ctx);
  return iGM_Ok({ tasks: iGM_GetTasksService(user?.iGM_Id ?? null) });
}

/* ---------- 排行榜 ---------- */
function iGM_HandleLeaderboard(ctx: iGM_RouteContext) {
  const sort = iGM_Query(ctx.query, "sort", "total");
  const limit = Number(iGM_Query(ctx.query, "limit", "20"));
  return iGM_Ok({
    sort: sort === "weekly" ? "weekly" : "total",
    items: iGM_GetLeaderboardService(sort, limit),
  });
}

/**
 * G_Points 积分与勋章路由集合
 * 业务错误统一抛 iGM_PointsError / iGM_AuthError，
 * 由 iGM_ServerMain 全局错误处理器格式化为统一响应体
 */
export const G_Points = new Elysia({ name: "G_Points" })
  .get("/G_Points/me", iGM_HandleMyPoints as never)
  .get("/G_Points/records", iGM_HandleRecords as never)
  .post("/G_Points/checkin", iGM_HandleCheckin as never)
  .get("/G_Points/checkin-status", iGM_HandleCheckinStatus as never)
  .get("/G_Points/levels", iGM_HandleLevels as never)
  .get("/G_Points/badges", iGM_HandleBadges as never)
  .get("/G_Points/tasks", iGM_HandleTasks as never)
  .get("/G_Points/leaderboard", iGM_HandleLeaderboard as never);

// 导出 //
export default G_Points;
