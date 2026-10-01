/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_Developer.ts
 * 所属层：后端 / 路由层
 * 路由：/G_Developer/*
 * 模块：G_Developer
 * 作用：开发者资格（SDK / 适配器协议）申请接口集合
 * 内容：申请提交 / 重新申请、我的申请状态与历史、撤回申请、
 *       待审核列表与审核（仅组织所有者与管理员）、开发者能力说明
 * 约束：统一响应 { success, code, message, data }；申请须登录；
 *       审核只变更状态与意见，通过即授予开发者接入资格（不发放 API Key）
 */

// 导入依赖 //
import { Elysia } from "elysia";
import { iGM_Ok } from "../iGM_Types/iGM_Response";
import { iGM_RequireUser } from "../iGM_Middleware/iGM_AuthGuard";
import {
  iGM_BoolField,
  iGM_ClientIp,
  iGM_CurrentUser,
  iGM_EnforceRateLimit,
  iGM_Field,
  iGM_PageQuery,
  iGM_Query,
  type iGM_RouteContext,
} from "./iGM_RouteSupport";
import {
  iGM_AdminListDevelopersService,
  iGM_DeveloperError,
  iGM_GetMyDeveloperService,
  iGM_IsDeveloperReviewer,
  iGM_ListMyDevelopersService,
  iGM_ReviewDeveloperService,
  iGM_SubmitDeveloperApplyService,
  iGM_WithdrawDeveloperApplyService,
} from "../iGM_Services/iGM_DeveloperService";

// 类型定义 //
// （路由层无额外类型，统一响应类型见 iGM_Types/iGM_Response.ts）

// 核心逻辑 //
/** 要求当前用户具备审核资格（组织所有者或管理员），否则抛 403 */
function iGM_RequireReviewer(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  if (!iGM_IsDeveloperReviewer(user)) {
    throw new iGM_DeveloperError("auth.errors.forbidden", 403);
  }
  return user;
}

/** 从请求体读取申请表单字段 */
function iGM_ReadApplyInput(ctx: iGM_RouteContext) {
  return {
    projectName: iGM_Field(ctx.body, "projectName"),
    projectType: iGM_Field(ctx.body, "projectType"),
    projectDesc: iGM_Field(ctx.body, "projectDesc"),
    projectUrl: iGM_Field(ctx.body, "projectUrl") || null,
    contact: iGM_Field(ctx.body, "contact"),
    expectedQuota: iGM_Field(ctx.body, "expectedQuota") || null,
    reason: iGM_Field(ctx.body, "reason"),
    agreeRules: iGM_BoolField(ctx.body, "agreeRules"),
  };
}

/* ---------- 开发者能力说明（公开） ---------- */
function iGM_HandleIntro(_ctx: iGM_RouteContext) {
  return iGM_Ok({
    // 说明条目由前端语言包渲染，此处仅提供稳定的能力标识
    capabilities: ["sdk", "adapter-protocol"],
    /** 审核分发规则说明：申请提交后由任意一位组织所有者审核，任一位同意即可通过 */
    reviewBy: "organization-owners",
    /** 当前是否仍完全放开调用（模块十六：true，后期逐步收紧） */
    openAccess: true,
  });
}

/* ---------- 提交开发者申请 ---------- */
function iGM_HandleApply(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "developerApply", `user:${user.iGM_Id}`);
  const application = iGM_SubmitDeveloperApplyService(
    user.iGM_Id,
    iGM_ReadApplyInput(ctx),
  );
  return iGM_Ok(application, "developer.messages.submitted");
}

/* ---------- 重新申请（仅最近一条为已拒绝 / 已撤回时允许） ---------- */
function iGM_HandleReapply(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "developerApply", `user:${user.iGM_Id}`);
  const application = iGM_SubmitDeveloperApplyService(
    user.iGM_Id,
    iGM_ReadApplyInput(ctx),
    "reapply",
  );
  return iGM_Ok(application, "developer.messages.submitted");
}

/* ---------- 我的申请状态与历史 ---------- */
function iGM_HandleMyDeveloper(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  return iGM_Ok({
    latest: iGM_GetMyDeveloperService(user.iGM_Id),
    history: iGM_ListMyDevelopersService(user.iGM_Id),
    /** 当前用户是否具备审核资格（前端据此决定是否展示审核入口） */
    canReview: iGM_IsDeveloperReviewer(user),
  });
}

/* ---------- 撤回本人待审核申请 ---------- */
function iGM_HandleWithdraw(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  const applicationId = iGM_Field(ctx.body, "applicationId").trim();
  if (!applicationId) {
    throw new iGM_DeveloperError("developer.errors.badRequest", 422);
  }
  iGM_WithdrawDeveloperApplyService(user.iGM_Id, applicationId);
  return iGM_Ok({ applicationId }, "developer.messages.withdrawn");
}

/* ---------- 待审核申请列表（仅组织所有者与管理员） ---------- */
function iGM_HandleApplications(ctx: iGM_RouteContext) {
  iGM_RequireReviewer(ctx);
  const { page, pageSize } = iGM_PageQuery(ctx);
  return iGM_Ok(
    iGM_AdminListDevelopersService(
      iGM_Query(ctx.query, "status") || null,
      page,
      pageSize,
    ),
  );
}

/* ---------- 审核申请（通过 / 拒绝） ---------- */
function iGM_HandleReview(ctx: iGM_RouteContext) {
  const reviewer = iGM_RequireReviewer(ctx);
  iGM_EnforceRateLimit(
    ctx,
    "adminWrite",
    `user:${reviewer.iGM_Id}:${iGM_ClientIp(ctx)}`,
  );
  const applicationId = iGM_Field(ctx.body, "applicationId").trim();
  const action = iGM_Field(ctx.body, "action").trim();
  const comment = iGM_Field(ctx.body, "comment") || undefined;
  if (!applicationId || (action !== "approve" && action !== "reject")) {
    throw new iGM_DeveloperError("developer.errors.badRequest", 422);
  }
  iGM_ReviewDeveloperService(reviewer.iGM_Id, applicationId, action, comment);
  return iGM_Ok(
    { applicationId, action },
    action === "approve"
      ? "developer.messages.approved"
      : "developer.messages.rejected",
  );
}

/**
 * G_Developer 开发者申请路由集合
 * 业务错误统一抛 iGM_DeveloperError / iGM_AuthError，
 * 由 iGM_ServerMain 全局错误处理器格式化为统一响应体
 */
export const G_Developer = new Elysia({ name: "G_Developer" })
  .get("/G_Developer/intro", iGM_HandleIntro as never)
  .post("/G_Developer/apply", iGM_HandleApply as never)
  .post("/G_Developer/reapply", iGM_HandleReapply as never)
  .get("/G_Developer/me", iGM_HandleMyDeveloper as never)
  .post("/G_Developer/withdraw", iGM_HandleWithdraw as never)
  .get("/G_Developer/applications", iGM_HandleApplications as never)
  .post("/G_Developer/review", iGM_HandleReview as never);

// 导出 //
export default G_Developer;