/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_Examiner.ts
 * 所属层：后端 / 路由层
 * 路由：/G_Examiner/status（准入状态）、/api/exam/creator/profile（命题者编号档案）、
 *       /G_Examiner/revoke、
 *       /api/exam/creator/apply（独立申请页提交）、
 *       /api/exam/creator/my-status（独立申请页查状态）、
 *       /api/exam/creator/pending（管理端待审核列表）、
 *       /api/exam/creator/review（管理端审核通过/拒绝）
 * 模块：G_Examiner
 * 作用：命题创作者准入状态、编号档案查询、申请提交/状态查询、管理端审核与撤销
 * 内容：准入状态（/G_Examiner/status，命题管理与试卷上传页的权限闸门）、
 *       命题者编号档案（/api/exam/creator/profile）、
 *       申请提交与状态查询（/apply、/my-status）、
 *       管理端待审核列表与审核（/pending、/review）、
 *       管理端撤销资格
 */

// 导入依赖 //
import { Elysia } from "elysia";
import { iGM_Ok } from "../iGM_Types/iGM_Response";
import {
  iGM_ClientIp,
  iGM_CurrentUser,
  iGM_EnforceRateLimit,
  iGM_Field,
  type iGM_RouteContext,
} from "./iGM_RouteSupport";
import { iGM_IsStaff, iGM_RequireUser } from "../iGM_Middleware/iGM_AuthGuard";
import {
  iGM_ExaminerError,
  iGM_IsActiveExaminer,
  iGM_GetCreatorProfileService,
  iGM_RevokeExaminerService,
  iGM_SubmitExaminerApplyService,
  iGM_GetMyApplicationStatusService,
  iGM_ReviewExaminerApplicationService,
  iGM_ListPendingApplicationsService,
} from "../iGM_Services/iGM_ExaminerService";
import type { iGM_ExaminerApplyInput } from "../iGM_Types/iGM_Examiner";

// 核心逻辑 //
/** 管理端：撤销命题创作者资格 */
async function iGM_HandleRevoke(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  if (!iGM_IsStaff(user)) {
    throw new iGM_ExaminerError("无权执行此操作", 403);
  }
  iGM_EnforceRateLimit(
    ctx,
    "adminWrite",
    `user:${user.iGM_Id}:${iGM_ClientIp(ctx)}`,
  );
  const userId = iGM_Field(ctx.body, "userId").trim();
  if (!userId) throw new iGM_ExaminerError("缺少用户 ID", 400);
  await iGM_RevokeExaminerService(userId);
  return iGM_Ok({ userId }, "命题创作者资格已撤销");
}

/* ---------- 准入状态（登录用户；命题管理/试卷上传页的权限闸门） ---------- */
async function iGM_HandleGateStatus(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  const isExaminer = await iGM_IsActiveExaminer(user.iGM_Id);
  return iGM_Ok({
    isExaminer,
    gate: isExaminer ? ("approved" as const) : ("none" as const),
  });
}

/* ---------- 命题者编号档案（登录用户；非命题创作者返回 NOT_EXAMINER） ---------- */
async function iGM_HandleCreatorProfile(ctx: iGM_RouteContext) {
  const user = await iGM_CurrentUser(ctx);
  const profile = user
    ? await iGM_GetCreatorProfileService(user.iGM_Id)
    : null;
  // 未登录 / 非在册命题创作者：HTTP 200 + success:false + 字符串码，不抛错
  if (!profile) {
    return {
      success: false as const,
      code: "NOT_EXAMINER",
      message: "当前账号不是命题创作者",
      data: null,
    };
  }
  return iGM_Ok(profile);
}

/* ---------- 独立申请页：提交 ---------- */
async function iGM_HandleApplySubmit(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const input: iGM_ExaminerApplyInput = {
    realName: String(body.realName ?? ""),
    contact: String(body.contact ?? ""),
    bio: String(body.bio ?? ""),
    directions: Array.isArray(body.directions)
      ? (body.directions as string[]).map((s) => String(s))
      : [],
    portfolioUrl: body.portfolioUrl ? String(body.portfolioUrl) : undefined,
    reason: String(body.reason ?? ""),
    agreedToRules: Boolean(body.agreedToRules),
  };
  const id = await iGM_SubmitExaminerApplyService(user.iGM_Id, input);
  return iGM_Ok({ id }, "申请已提交");
}

/* ---------- 独立申请页：我的申请状态 ---------- */
async function iGM_HandleMyApplyStatus(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  const status = await iGM_GetMyApplicationStatusService(user.iGM_Id);
  return iGM_Ok(status);
}

/* ---------- 管理端：待审核列表 ---------- */
async function iGM_HandlePendingList(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  if (!iGM_IsStaff(user)) {
    throw new iGM_ExaminerError("无权执行此操作", 403);
  }
  const list = await iGM_ListPendingApplicationsService();
  return iGM_Ok(list);
}

/* ---------- 管理端：审核通过/拒绝 ---------- */
async function iGM_HandleReview(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  if (!iGM_IsStaff(user)) {
    throw new iGM_ExaminerError("无权执行此操作", 403);
  }
  const body = (ctx.body ?? {}) as Record<string, unknown>;
  const appId = String(body.applicationId ?? body.id ?? "").trim();
  const action = String(body.action ?? "");
  const comment = body.reviewComment
    ? String(body.reviewComment).trim()
    : null;
  if (!appId) throw new iGM_ExaminerError("缺少申请 ID", 400);
  if (action !== "approve" && action !== "reject") {
    throw new iGM_ExaminerError("action 必须是 approve 或 reject", 400);
  }
  await iGM_ReviewExaminerApplicationService(appId, user.iGM_Id, action, comment);
  return iGM_Ok({ id: appId, action }, action === "approve" ? "审核通过" : "已拒绝");
}

/**
 * G_Examiner 命题创作者路由集合
 * 业务错误统一抛 iGM_ExaminerError，由 iGM_ServerMain 全局错误处理器格式化
 */
export const G_Examiner = new Elysia({ name: "G_Examiner" })
  .get("/G_Examiner/status", iGM_HandleGateStatus as never)
  .get("/api/exam/creator/profile", iGM_HandleCreatorProfile as never)
  .post("/api/exam/creator/apply", iGM_HandleApplySubmit as never)
  .get("/api/exam/creator/my-status", iGM_HandleMyApplyStatus as never)
  .get("/api/exam/creator/pending", iGM_HandlePendingList as never)
  .post("/api/exam/creator/review", iGM_HandleReview as never)
  .post("/G_Examiner/revoke", iGM_HandleRevoke as never);

// 导出 //
export default G_Examiner;
