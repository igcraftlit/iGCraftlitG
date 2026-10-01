/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_Stats.ts
 * 所属层：后端 / 路由层
 * 路由：/G_Stats/*
 * 模块：G_Stats
 * 作用：运营统计接口集合
 * 内容：核心指标概览、趋势序列（users/posts/comments/activity）、
 *       排行榜（热门帖子/热门资源/活跃用户）、活动参与统计
 * 约束：统一响应 { success, code, message, data }；
 *       全部接口仅 moderator 及以上角色可访问，并按用户限流
 */

// 导入依赖 //
import { Elysia } from "elysia";
import { iGM_Ok } from "../iGM_Types/iGM_Response";
import { iGM_RequireRole } from "../iGM_Middleware/iGM_AuthGuard";
import {
  iGM_CurrentUser,
  iGM_EnforceRateLimit,
  iGM_Query,
  type iGM_RouteContext,
} from "./iGM_RouteSupport";
import {
  iGM_GetStatsActivities,
  iGM_GetStatsLeaderboards,
  iGM_GetStatsOverview,
  iGM_GetStatsTrend,
  iGM_ParseRange,
} from "../iGM_Services/iGM_StatsService";
import { iGM_BuildOnlineList } from "../iGM_Services/iGM_RealtimeService";
import { iGM_ContentError } from "../iGM_Services/iGM_ContentService";

// 类型定义 //
// （路由层无额外类型，统一响应类型见 iGM_Types/iGM_Response.ts）

// 核心逻辑 //
/** 公共守卫：moderator 及以上 + 按用户限流，返回用户 ID */
async function iGM_GuardStats(ctx: iGM_RouteContext): Promise<string> {
  const user = iGM_RequireRole(await iGM_CurrentUser(ctx), "moderator");
  iGM_EnforceRateLimit(ctx, "statsQuery", `user:${user.iGM_Id}`);
  return user.iGM_Id;
}

/* ---------- 核心指标概览 ---------- */
async function iGM_HandleOverview(ctx: iGM_RouteContext) {
  await iGM_GuardStats(ctx);
  // 在线人数取实时去重用户列表长度
  const onlineUsers = (await iGM_BuildOnlineList()).length;
  return iGM_Ok({ overview: await iGM_GetStatsOverview(onlineUsers) });
}

/* ---------- 趋势序列 ---------- */
async function iGM_HandleTrends(ctx: iGM_RouteContext) {
  await iGM_GuardStats(ctx);
  const metricRaw = iGM_Query(ctx.query, "metric", "users");
  if (!["users", "posts", "comments", "activity"].includes(metricRaw)) {
    throw new iGM_ContentError("stats.errors.badMetric", 400);
  }
  const { range } = iGM_ParseRange(iGM_Query(ctx.query, "range", "7d"));
  return iGM_Ok({
    metric: metricRaw,
    range,
    series: await iGM_GetStatsTrend(metricRaw as never, range),
  });
}

/* ---------- 排行榜 ---------- */
async function iGM_HandleLeaderboards(ctx: iGM_RouteContext) {
  await iGM_GuardStats(ctx);
  const { range } = iGM_ParseRange(iGM_Query(ctx.query, "range", "7d"));
  return iGM_Ok({ range, ...(await iGM_GetStatsLeaderboards(range)) });
}

/* ---------- 活动参与统计 ---------- */
async function iGM_HandleActivities(ctx: iGM_RouteContext) {
  await iGM_GuardStats(ctx);
  const { range } = iGM_ParseRange(iGM_Query(ctx.query, "range", "30d"));
  return iGM_Ok({ range, ...(await iGM_GetStatsActivities(range)) });
}

/**
 * G_Stats 运营统计路由集合
 * 业务错误统一抛 iGM_AuthError / iGM_ContentError，
 * 由 iGM_ServerMain 全局错误处理器格式化为统一响应体
 */
export const G_Stats = new Elysia({ name: "G_Stats" })
  .get("/G_Stats/overview", iGM_HandleOverview as never)
  .get("/G_Stats/trends", iGM_HandleTrends as never)
  .get("/G_Stats/leaderboards", iGM_HandleLeaderboards as never)
  .get("/G_Stats/activities", iGM_HandleActivities as never);

// 导出 //
export default G_Stats;
