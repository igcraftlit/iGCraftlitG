/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_Admin.ts
 * 所属层：后端 / 路由层
 * 路由：/G_Admin/*
 * 模块：G_Admin
 * 作用：管理后台接口集合
 * 内容：数据概览、用户列表、封禁/解封、修改角色、内容列表、审核与删除、
 *       举报列表与处理、测试邮件、操作日志、系统信息
 * 权限：moderator 及以上可读与审核；用户封禁/角色/系统信息/测试邮件仅 admin；
 *       全部写操作限流并写入 iGM_AdminLogs
 */

// 导入依赖 //
import { Elysia } from "elysia";
import { iGM_Ok } from "../iGM_Types/iGM_Response";
import { iGM_RequireRole } from "../iGM_Middleware/iGM_AuthGuard";
import {
  iGM_ClientIp,
  iGM_CurrentUser,
  iGM_EnforceRateLimit,
  iGM_Field,
  iGM_Query,
  iGM_RequestLocale,
  type iGM_RouteContext,
} from "./iGM_RouteSupport";
import { iGM_AdminError } from "../iGM_Services/iGM_AdminService";
import {
  iGM_GetOverviewService,
  iGM_GetSettingsService,
  iGM_HandleReportService,
  iGM_ListContentsService,
  iGM_ListLogsService,
  iGM_ListReportsService,
  iGM_ListUsersService,
  iGM_ReviewContentService,
  iGM_SendTestMailService,
  iGM_SetUserRoleService,
  iGM_SetUserStatusService,
  type iGM_ReviewAction,
} from "../iGM_Services/iGM_AdminService";

// 类型定义 //
// （路由层无额外类型，统一响应类型见 iGM_Types/iGM_Response.ts）

// 核心逻辑 //
/* ---------- 数据概览 ---------- */
function iGM_HandleOverview(ctx: iGM_RouteContext) {
  iGM_RequireRole(iGM_CurrentUser(ctx), "moderator");
  return iGM_Ok(iGM_GetOverviewService());
}

/* ---------- 用户列表 ---------- */
function iGM_HandleUsers(ctx: iGM_RouteContext) {
  iGM_RequireRole(iGM_CurrentUser(ctx), "moderator");
  const page = Number(iGM_Query(ctx.query, "page", "1"));
  const pageSize = Number(iGM_Query(ctx.query, "pageSize", "10"));
  return iGM_Ok(iGM_ListUsersService(iGM_Query(ctx.query, "query"), page, pageSize));
}

/* ---------- 封禁 / 解封 ---------- */
function iGM_HandleUserStatus(ctx: iGM_RouteContext) {
  const admin = iGM_RequireRole(iGM_CurrentUser(ctx), "admin");
  iGM_EnforceRateLimit(ctx, "adminWrite", `user:${admin.iGM_Id}:${iGM_ClientIp(ctx)}`);
  const userId = iGM_Field(ctx.body, "userId").trim();
  const suspend = iGM_Field(ctx.body, "status").trim() === "suspended";
  if (!userId) {
    throw new iGM_AdminError("admin.errors.userNotFound", 404);
  }
  iGM_SetUserStatusService(admin, userId, suspend ? "suspended" : "active");
  return iGM_Ok(
    { userId, status: suspend ? "suspended" : "active" },
    suspend ? "admin.messages.userBanned" : "admin.messages.userUnbanned",
  );
}

/* ---------- 修改角色 ---------- */
function iGM_HandleUserRole(ctx: iGM_RouteContext) {
  const admin = iGM_RequireRole(iGM_CurrentUser(ctx), "admin");
  iGM_EnforceRateLimit(ctx, "adminWrite", `user:${admin.iGM_Id}:${iGM_ClientIp(ctx)}`);
  const userId = iGM_Field(ctx.body, "userId").trim();
  const role = iGM_Field(ctx.body, "role").trim();
  if (!userId || (role !== "user" && role !== "moderator" && role !== "admin")) {
    throw new iGM_AdminError("admin.errors.badRequest", 422);
  }
  iGM_SetUserRoleService(admin, userId, role);
  return iGM_Ok({ userId, role }, "admin.messages.roleUpdated");
}

/* ---------- 内容列表 ---------- */
function iGM_HandleContents(ctx: iGM_RouteContext) {
  iGM_RequireRole(iGM_CurrentUser(ctx), "moderator");
  const page = Number(iGM_Query(ctx.query, "page", "1"));
  const pageSize = Number(iGM_Query(ctx.query, "pageSize", "10"));
  return iGM_Ok(
    iGM_ListContentsService(
      iGM_Query(ctx.query, "type", "post"),
      iGM_Query(ctx.query, "search") || null,
      iGM_Query(ctx.query, "status") || null,
      page,
      pageSize,
    ),
  );
}

/* ---------- 内容审核（隐藏/恢复/删除） ---------- */
function iGM_HandleReview(ctx: iGM_RouteContext) {
  const admin = iGM_RequireRole(iGM_CurrentUser(ctx), "moderator");
  iGM_EnforceRateLimit(ctx, "adminWrite", `user:${admin.iGM_Id}:${iGM_ClientIp(ctx)}`);
  const type = iGM_Field(ctx.body, "type").trim();
  const contentId = iGM_Field(ctx.body, "contentId").trim();
  const action = iGM_Field(ctx.body, "action").trim() as iGM_ReviewAction;
  if (
    (type !== "post" && type !== "comment") ||
    !contentId ||
    (action !== "hide" && action !== "restore" && action !== "delete")
  ) {
    throw new iGM_AdminError("admin.errors.badRequest", 422);
  }
  iGM_ReviewContentService(admin, type, contentId, action);
  return iGM_Ok({ type, contentId, action }, "admin.messages.contentReviewed");
}

/* ---------- 举报列表 ---------- */
function iGM_HandleReports(ctx: iGM_RouteContext) {
  iGM_RequireRole(iGM_CurrentUser(ctx), "moderator");
  const page = Number(iGM_Query(ctx.query, "page", "1"));
  const pageSize = Number(iGM_Query(ctx.query, "pageSize", "10"));
  return iGM_Ok(
    iGM_ListReportsService(iGM_Query(ctx.query, "status") || null, page, pageSize),
  );
}

/* ---------- 处理举报 ---------- */
function iGM_HandleReport(ctx: iGM_RouteContext) {
  const admin = iGM_RequireRole(iGM_CurrentUser(ctx), "moderator");
  iGM_EnforceRateLimit(ctx, "adminWrite", `user:${admin.iGM_Id}:${iGM_ClientIp(ctx)}`);
  const reportId = iGM_Field(ctx.body, "reportId").trim();
  const decision = iGM_Field(ctx.body, "decision").trim();
  const contentAction = iGM_Field(ctx.body, "contentAction").trim() || "none";
  if (
    !reportId ||
    (decision !== "resolved" && decision !== "dismissed") ||
    (contentAction !== "none" && contentAction !== "hide" && contentAction !== "delete")
  ) {
    throw new iGM_AdminError("admin.errors.badRequest", 422);
  }
  iGM_HandleReportService(
    admin,
    reportId,
    decision === "resolved" ? "resolved" : "dismissed",
    contentAction as "none" | "hide" | "delete",
  );
  return iGM_Ok({ reportId, decision }, "admin.messages.reportHandled");
}

/* ---------- 测试邮件 ---------- */
async function iGM_HandleMailTest(ctx: iGM_RouteContext) {
  const admin = iGM_RequireRole(iGM_CurrentUser(ctx), "admin");
  iGM_EnforceRateLimit(ctx, "mailTest", `user:${admin.iGM_Id}`);
  const to = iGM_Field(ctx.body, "to");
  await iGM_SendTestMailService(admin, to, iGM_RequestLocale(ctx));
  return iGM_Ok({ sent: true }, "admin.messages.mailTestSent");
}

/* ---------- 操作日志 ---------- */
function iGM_HandleLogs(ctx: iGM_RouteContext) {
  iGM_RequireRole(iGM_CurrentUser(ctx), "moderator");
  const page = Number(iGM_Query(ctx.query, "page", "1"));
  const pageSize = Number(iGM_Query(ctx.query, "pageSize", "20"));
  return iGM_Ok(iGM_ListLogsService(page, pageSize));
}

/* ---------- 系统信息 ---------- */
function iGM_HandleSettings(ctx: iGM_RouteContext) {
  iGM_RequireRole(iGM_CurrentUser(ctx), "admin");
  return iGM_Ok(iGM_GetSettingsService());
}

/**
 * G_Admin 管理后台路由集合
 * 业务错误统一抛 iGM_AdminError / iGM_AuthError，
 * 由 iGM_ServerMain 全局错误处理器格式化为统一响应体
 */
export const G_Admin = new Elysia({ name: "G_Admin" })
  .get("/G_Admin/overview", iGM_HandleOverview as never)
  .get("/G_Admin/users", iGM_HandleUsers as never)
  .post("/G_Admin/users/status", iGM_HandleUserStatus as never)
  .post("/G_Admin/users/role", iGM_HandleUserRole as never)
  .get("/G_Admin/contents", iGM_HandleContents as never)
  .post("/G_Admin/contents/review", iGM_HandleReview as never)
  .get("/G_Admin/reports", iGM_HandleReports as never)
  .post("/G_Admin/reports/handle", iGM_HandleReport as never)
  .post("/G_Admin/mails/test", iGM_HandleMailTest as never)
  .get("/G_Admin/logs", iGM_HandleLogs as never)
  .get("/G_Admin/settings", iGM_HandleSettings as never);

// 导出 //
export default G_Admin;
