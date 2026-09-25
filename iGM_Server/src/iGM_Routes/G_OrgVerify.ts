/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_OrgVerify.ts
 * 所属层：后端 / 路由层
 * 路由：/G_OrgVerify/*
 * 模块：G_OrgVerify
 * 作用：模块七组织认证用户侧接口集合
 * 内容：受信任组织列表、公开组织详情、我的组织详情、提交认证申请、
 *       我的申请记录、取消待审核申请、退出组织、负责人编辑“关于组织”
 * 权限：组织列表与组织详情公开可读；其余要求登录；写操作限流
 * 说明：管理端审核接口在 G_Admin 路由（/G_Admin/org-verifications/*）；
 *       业务错误统一抛 iGM_OrgVerifyError / iGM_AuthError，
 *       由 iGM_ServerMain 全局错误处理器格式化为统一响应体
 */

// 导入依赖 //
import { Elysia } from "elysia";
import { iGM_Ok } from "../iGM_Types/iGM_Response";
import { iGM_RequireUser } from "../iGM_Middleware/iGM_AuthGuard";
import {
  iGM_ClientIp,
  iGM_CurrentUser,
  iGM_EnforceRateLimit,
  iGM_Field,
  iGM_Query,
  iGM_RequestLocale,
  type iGM_RouteContext,
} from "./iGM_RouteSupport";
import {
  iGM_CancelVerificationService,
  iGM_GetMyOrgService,
  iGM_GetOrganizationDetailService,
  iGM_LeaveOrgService,
  iGM_ListMyVerificationsService,
  iGM_ListTrustedOrgsService,
  iGM_SubmitVerificationService,
  iGM_UpdateOrgAboutService,
  iGM_OrgVerifyError,
} from "../iGM_Services/iGM_OrgVerifyService";

// 类型定义 //
// （路由层无额外类型，统一响应类型见 iGM_Types/iGM_Response.ts）

// 核心逻辑 //
/* ---------- 受信任组织列表（公开） ---------- */
function iGM_HandleOrganizations() {
  return iGM_Ok({ items: iGM_ListTrustedOrgsService() });
}

/* ---------- 公开组织详情（G_OrgDetails，支持 id 或 slug） ---------- */
function iGM_HandleOrgDetail(ctx: iGM_RouteContext) {
  const organization = iGM_GetOrganizationDetailService({
    id: iGM_Query(ctx.query, "orgId") || null,
    slug: iGM_Query(ctx.query, "slug") || null,
  });
  return iGM_Ok({ organization });
}

/* ---------- 我的组织详情（登录，附负责人标记） ---------- */
function iGM_HandleMyOrg(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  return iGM_Ok(iGM_GetMyOrgService(user));
}

/* ---------- 提交认证申请 ---------- */
function iGM_HandleSubmit(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "orgVerifyWrite", `user:${user.iGM_Id}:${iGM_ClientIp(ctx)}`);
  const orgId = iGM_Field(ctx.body, "orgId");
  const reason = iGM_Field(ctx.body, "reason");
  const proofRaw = iGM_Field(ctx.body, "proof");
  const verification = iGM_SubmitVerificationService(
    user,
    { orgId, reason, proof: proofRaw || null },
    iGM_RequestLocale(ctx),
  );
  return iGM_Ok({ verification }, "orgVerify.messages.submitted");
}

/* ---------- 我的申请记录 ---------- */
function iGM_HandleMine(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  return iGM_Ok({ items: iGM_ListMyVerificationsService(user) });
}

/* ---------- 取消待审核申请 ---------- */
function iGM_HandleCancel(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "orgVerifyWrite", `user:${user.iGM_Id}:${iGM_ClientIp(ctx)}`);
  const verificationId = iGM_Field(ctx.body, "verificationId");
  if (!verificationId.trim()) {
    throw new iGM_OrgVerifyError("orgVerify.errors.badRequest", 422);
  }
  iGM_CancelVerificationService(user, verificationId);
  return iGM_Ok({ verificationId }, "orgVerify.messages.cancelled");
}

/* ---------- 退出已认证组织 ---------- */
function iGM_HandleLeave(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "orgVerifyWrite", `user:${user.iGM_Id}:${iGM_ClientIp(ctx)}`);
  const reasonRaw = iGM_Field(ctx.body, "reason");
  iGM_LeaveOrgService(user, reasonRaw || null, iGM_RequestLocale(ctx));
  return iGM_Ok(null, "orgVerify.messages.left");
}

/* ---------- 负责人编辑“关于组织” ---------- */
function iGM_HandleUpdateAbout(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "orgVerifyWrite", `user:${user.iGM_Id}:${iGM_ClientIp(ctx)}`);
  const orgId = iGM_Field(ctx.body, "orgId");
  const aboutContent = iGM_Field(ctx.body, "aboutContent");
  if (!orgId.trim()) {
    throw new iGM_OrgVerifyError("orgVerify.errors.badRequest", 422);
  }
  const organization = iGM_UpdateOrgAboutService(user, orgId, aboutContent);
  return iGM_Ok({ organization }, "orgVerify.messages.aboutUpdated");
}

/** G_OrgVerify 组织认证用户侧路由集合 */
export const G_OrgVerify = new Elysia({ name: "G_OrgVerify" })
  .get("/G_OrgVerify/organizations", iGM_HandleOrganizations as never)
  .get("/G_OrgVerify/org-detail", iGM_HandleOrgDetail as never)
  .get("/G_OrgVerify/my-org", iGM_HandleMyOrg as never)
  .post("/G_OrgVerify/submit", iGM_HandleSubmit as never)
  .get("/G_OrgVerify/my", iGM_HandleMine as never)
  .post("/G_OrgVerify/cancel", iGM_HandleCancel as never)
  .post("/G_OrgVerify/leave", iGM_HandleLeave as never)
  .post("/G_OrgVerify/update-about", iGM_HandleUpdateAbout as never);

// 导出 //
export default G_OrgVerify;
