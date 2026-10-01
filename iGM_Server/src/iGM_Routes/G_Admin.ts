/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_Admin.ts
 * 所属层：后端 / 路由层
 * 路由：/G_Admin/*
 * 模块：G_Admin
 * 作用：管理后台接口集合
 * 内容：数据概览、用户列表、封禁/解封、修改角色、删除用户账号、内容列表、审核与删除、
 *       举报列表与处理、测试邮件、操作日志、系统信息
 * 权限：moderator 及以上可读与审核；用户封禁/角色/删除账号/系统信息/测试邮件仅 admin；
 *       全部写操作限流并写入 iGM_AdminLogs
 */

// 导入依赖 //
import { Elysia } from "elysia";
import { iGM_Ok } from "../iGM_Types/iGM_Response";
import { iGM_RequireRole, iGM_RequireUser } from "../iGM_Middleware/iGM_AuthGuard";
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
  iGM_DeleteUserService,
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
import {
  iGM_AdminGetVerificationService,
  iGM_AdminListVerificationsService,
  iGM_ReviewVerificationService,
  iGM_OrgVerifyError,
  type iGM_OrgReviewAction,
} from "../iGM_Services/iGM_OrgVerifyService";
import {
  iGM_AdminListExamsService,
  iGM_ReviewExamService,
} from "../iGM_Services/iGM_PointsService";
import {
  iGM_AdminListDevelopersService,
  iGM_DeveloperError,
  iGM_ReviewDeveloperService,
} from "../iGM_Services/iGM_DeveloperService";

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

/* ---------- 删除用户账号（模块七第三轮：管理员直接删除，无需验证码） ---------- */
function iGM_HandleUserDelete(ctx: iGM_RouteContext) {
  const admin = iGM_RequireRole(iGM_CurrentUser(ctx), "admin");
  iGM_EnforceRateLimit(ctx, "adminWrite", `user:${admin.iGM_Id}:${iGM_ClientIp(ctx)}`);
  const userId = iGM_Field(ctx.body, "userId").trim();
  if (!userId) {
    throw new iGM_AdminError("admin.errors.userNotFound", 404);
  }
  iGM_DeleteUserService(admin, userId, iGM_RequestLocale(ctx));
  return iGM_Ok({ userId }, "admin.messages.userDeleted");
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

/* ---------- 模块七：组织认证申请列表（admin 全部；负责人仅本组织） ---------- */
function iGM_HandleOrgVerifications(ctx: iGM_RouteContext) {
  // 权限在 service 内按 admin / 组织负责人判定，路由层仅要求登录
  const reviewer = iGM_RequireUser(iGM_CurrentUser(ctx));
  const page = Number(iGM_Query(ctx.query, "page", "1"));
  const pageSize = Number(iGM_Query(ctx.query, "pageSize", "10"));
  return iGM_Ok(
    iGM_AdminListVerificationsService(
      reviewer,
      iGM_Query(ctx.query, "status") || null,
      iGM_Query(ctx.query, "orgId") || null,
      page,
      pageSize,
    ),
  );
}

/* ---------- 模块七：组织认证申请详情（admin / 对应组织负责人） ---------- */
function iGM_HandleOrgVerificationDetail(ctx: iGM_RouteContext) {
  const reviewer = iGM_RequireUser(iGM_CurrentUser(ctx));
  const id = iGM_Query(ctx.query, "id");
  if (!id) throw new iGM_OrgVerifyError("orgVerify.errors.badRequest", 422);
  return iGM_Ok({
    verification: iGM_AdminGetVerificationService(reviewer, id),
  });
}

/* ---------- 模块七：审核组织认证申请 ---------- */
function iGM_HandleOrgVerificationReview(ctx: iGM_RouteContext) {
  // 负责人可能是普通角色：仅要求登录，具体 admin/owner 权限由 service 判定
  const reviewer = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "adminWrite", `user:${reviewer.iGM_Id}:${iGM_ClientIp(ctx)}`);
  const verificationId = iGM_Field(ctx.body, "verificationId").trim();
  const action = iGM_Field(ctx.body, "action").trim() as iGM_OrgReviewAction;
  const comment = iGM_Field(ctx.body, "comment").trim() || null;
  if (!verificationId || (action !== "approve" && action !== "reject")) {
    throw new iGM_OrgVerifyError("orgVerify.errors.badRequest", 422);
  }
  iGM_ReviewVerificationService(
    reviewer,
    verificationId,
    action,
    comment,
    iGM_RequestLocale(ctx),
  );
  return iGM_Ok(
    { verificationId, action },
    action === "approve"
      ? "orgVerify.messages.approved"
      : "orgVerify.messages.rejected",
  );
}

/* ---------- 模块十五：等级考核申请列表 ---------- */
function iGM_HandleLevelExams(ctx: iGM_RouteContext) {
  iGM_RequireRole(iGM_CurrentUser(ctx), "moderator");
  const page = Number(iGM_Query(ctx.query, "page", "1"));
  const pageSize = Number(iGM_Query(ctx.query, "pageSize", "10"));
  return iGM_Ok(
    iGM_AdminListExamsService(iGM_Query(ctx.query, "status") || null, page, pageSize),
  );
}

/* ---------- 模块十五：审核等级考核申请 ---------- */
function iGM_HandleLevelExamReview(ctx: iGM_RouteContext) {
  const admin = iGM_RequireRole(iGM_CurrentUser(ctx), "moderator");
  iGM_EnforceRateLimit(ctx, "adminWrite", `user:${admin.iGM_Id}:${iGM_ClientIp(ctx)}`);
  const examId = iGM_Field(ctx.body, "examId").trim();
  const action = iGM_Field(ctx.body, "action").trim();
  const note = iGM_Field(ctx.body, "note").trim() || null;
  if (!examId || (action !== "approve" && action !== "reject")) {
    throw new iGM_AdminError("admin.errors.badRequest", 422);
  }
  iGM_ReviewExamService(admin.iGM_Id, examId, action, note);
  return iGM_Ok(
    { examId, action },
    action === "approve"
      ? "levels.messages.examApproved"
      : "levels.messages.examRejected",
  );
}

/* ---------- 模块十五：开发者申请列表 ---------- */
function iGM_HandleDevelopers(ctx: iGM_RouteContext) {
  iGM_RequireRole(iGM_CurrentUser(ctx), "moderator");
  const page = Number(iGM_Query(ctx.query, "page", "1"));
  const pageSize = Number(iGM_Query(ctx.query, "pageSize", "10"));
  return iGM_Ok(
    iGM_AdminListDevelopersService(iGM_Query(ctx.query, "status") || null, page, pageSize),
  );
}

/* ---------- 模块十五：审核开发者申请 ---------- */
function iGM_HandleDeveloperReview(ctx: iGM_RouteContext) {
  const admin = iGM_RequireRole(iGM_CurrentUser(ctx), "moderator");
  iGM_EnforceRateLimit(ctx, "adminWrite", `user:${admin.iGM_Id}:${iGM_ClientIp(ctx)}`);
  const developerId = iGM_Field(ctx.body, "developerId").trim();
  const action = iGM_Field(ctx.body, "action").trim();
  if (!developerId || (action !== "approve" && action !== "reject")) {
    throw new iGM_DeveloperError("developer.errors.badRequest", 422);
  }
  iGM_ReviewDeveloperService(admin.iGM_Id, developerId, action);
  return iGM_Ok(
    { developerId, action },
    action === "approve"
      ? "developer.messages.approved"
      : "developer.messages.rejected",
  );
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
  .post("/G_Admin/users/delete", iGM_HandleUserDelete as never)
  .get("/G_Admin/contents", iGM_HandleContents as never)
  .post("/G_Admin/contents/review", iGM_HandleReview as never)
  .get("/G_Admin/reports", iGM_HandleReports as never)
  .post("/G_Admin/reports/handle", iGM_HandleReport as never)
  .post("/G_Admin/mails/test", iGM_HandleMailTest as never)
  .get("/G_Admin/logs", iGM_HandleLogs as never)
  .get("/G_Admin/settings", iGM_HandleSettings as never)
  // 模块七：组织认证审核
  .get("/G_Admin/org-verifications", iGM_HandleOrgVerifications as never)
  .get("/G_Admin/org-verifications/detail", iGM_HandleOrgVerificationDetail as never)
  .post("/G_Admin/org-verifications/review", iGM_HandleOrgVerificationReview as never)
  // 模块十五：等级考核审核、开发者申请审核
  .get("/G_Admin/level-exams", iGM_HandleLevelExams as never)
  .post("/G_Admin/level-exams/review", iGM_HandleLevelExamReview as never)
  .get("/G_Admin/developers", iGM_HandleDevelopers as never)
  .post("/G_Admin/developers/review", iGM_HandleDeveloperReview as never);

// 导出 //
export default G_Admin;
