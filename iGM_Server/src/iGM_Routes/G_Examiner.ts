/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_Examiner.ts
 * 所属层：后端 / 路由层
 * 路由：/G_Examiner/* 与 /api/exam/creator/profile（命题者编号档案）
 * 模块：G_Examiner
 * 作用：命题创作者申请、准入状态、命题者编号档案、命题方预设与审核接口集合
 * 内容：准入状态查询、申请提交、我的申请历史、命题者编号档案（/api/exam/creator/profile）、
 *       可见预设列表、预设创建 / 编辑 / 删除（仅命题创作者）、管理端待审列表与审核、撤销资格
 * 约束：统一响应 { success, code, message, data }；除公开预设外均须登录；
 *       预设增删改与审核仅命题创作者 / 管理人员可执行
 */

// 导入依赖 //
import { Elysia } from "elysia";
import { iGM_Ok } from "../iGM_Types/iGM_Response";
import { iGM_IsStaff, iGM_RequireUser } from "../iGM_Middleware/iGM_AuthGuard";
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
  iGM_ExaminerError,
  iGM_GetCreatorProfileService,
  iGM_GetExaminerGateService,
  iGM_ListExaminerApplicationsService,
  iGM_ListMyExaminerApplicationsService,
  iGM_RequireExaminer,
  iGM_ReviewExaminerApplicationService,
  iGM_RevokeExaminerService,
  iGM_SubmitExaminerApplyService,
} from "../iGM_Services/iGM_ExaminerService";
import {
  iGM_CreateIssuerPresetService,
  iGM_DeleteIssuerPresetService,
  iGM_ListIssuerPresetsService,
  iGM_UpdateIssuerPresetService,
} from "../iGM_Services/iGM_IssuerPresetService";
import type {
  iGM_ExaminerApplyInput,
  iGM_IssuerPresetInput,
} from "../iGM_Types/iGM_Examiner";

// 类型定义 //
// （路由层无额外类型，统一响应类型见 iGM_Types/iGM_Response.ts）

// 核心逻辑 //
/** 读取请求体中的字符串数组（兼容数组与逗号分隔字符串），非数组一律返回空数组 */
function iGM_StringArrayField(body: unknown, key: string): string[] {
  const source = (body ?? {}) as Record<string, unknown>;
  const value = source[key];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value.split(/[,，]/).map((part) => part.trim()).filter(Boolean);
  }
  return [];
}

/** 从请求体读取命题创作者申请表单 */
function iGM_ReadApplyInput(ctx: iGM_RouteContext): iGM_ExaminerApplyInput {
  const body = ctx.body;
  return {
    realName: iGM_Field(body, "realName"),
    contact: iGM_Field(body, "contact"),
    bio: iGM_Field(body, "bio"),
    directions: iGM_StringArrayField(body, "directions"),
    portfolioUrl: iGM_Field(body, "portfolioUrl") || null,
    reason: iGM_Field(body, "reason"),
  };
}

/** 从请求体读取命题方预设表单 */
function iGM_ReadPresetInput(ctx: iGM_RouteContext): iGM_IssuerPresetInput {
  const body = ctx.body;
  return {
    name: iGM_Field(body, "name"),
    keywords: iGM_StringArrayField(body, "keywords"),
    isPublic: iGM_BoolField(body, "isPublic"),
  };
}

/** 要求当前用户为管理人员（审核权），否则抛 403 */
async function iGM_RequireReviewer(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  if (!iGM_IsStaff(user)) {
    throw new iGM_ExaminerError("无权审核命题创作者申请", 403);
  }
  return user;
}

/* ---------- 命题创作者准入状态（登录用户） ---------- */
async function iGM_HandleStatus(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  const [gate, history] = await Promise.all([
    iGM_GetExaminerGateService(user.iGM_Id, iGM_IsStaff(user)),
    iGM_ListMyExaminerApplicationsService(user.iGM_Id),
  ]);
  return iGM_Ok({ ...gate, history });
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

/* ---------- 提交命题创作者申请 ---------- */
async function iGM_HandleApply(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "developerApply", `user:${user.iGM_Id}`);
  const application = await iGM_SubmitExaminerApplyService(
    user.iGM_Id,
    iGM_ReadApplyInput(ctx),
  );
  ctx.set.status = 201;
  return iGM_Ok({ application }, "申请已提交，请等待审核");
}

/* ---------- 可见命题方预设（下拉选择用；命题创作者或管理人员） ---------- */
async function iGM_HandlePresets(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  return iGM_Ok({ presets: await iGM_ListIssuerPresetsService(user.iGM_Id) });
}

/* ---------- 新建命题方预设（仅命题创作者） ---------- */
async function iGM_HandlePresetCreate(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  await iGM_RequireExaminer(user.iGM_Id);
  const preset = await iGM_CreateIssuerPresetService(
    user.iGM_Id,
    iGM_ReadPresetInput(ctx),
  );
  ctx.set.status = 201;
  return iGM_Ok({ preset }, "预设已创建");
}

/* ---------- 编辑命题方预设（仅创建者本人） ---------- */
async function iGM_HandlePresetUpdate(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  await iGM_RequireExaminer(user.iGM_Id);
  const presetId = iGM_Field(ctx.body, "presetId").trim();
  if (!presetId) throw new iGM_ExaminerError("缺少预设 ID", 400);
  const preset = await iGM_UpdateIssuerPresetService(
    user.iGM_Id,
    presetId,
    iGM_ReadPresetInput(ctx),
  );
  return iGM_Ok({ preset }, "预设已保存");
}

/* ---------- 删除命题方预设（仅创建者本人） ---------- */
async function iGM_HandlePresetDelete(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  await iGM_RequireExaminer(user.iGM_Id);
  const presetId = iGM_Field(ctx.body, "presetId").trim();
  if (!presetId) throw new iGM_ExaminerError("缺少预设 ID", 400);
  await iGM_DeleteIssuerPresetService(user.iGM_Id, presetId);
  return iGM_Ok({ presetId }, "预设已删除");
}

/* ---------- 管理端：待审申请列表（管理人员） ---------- */
async function iGM_HandleReviewList(ctx: iGM_RouteContext) {
  await iGM_RequireReviewer(ctx);
  const { page, pageSize } = iGM_PageQuery(ctx);
  return iGM_Ok(
    await iGM_ListExaminerApplicationsService(
      iGM_Query(ctx.query, "status") || null,
      page,
      pageSize,
    ),
  );
}

/* ---------- 管理端：审核申请（通过 / 拒绝） ---------- */
async function iGM_HandleReview(ctx: iGM_RouteContext) {
  const reviewer = await iGM_RequireReviewer(ctx);
  iGM_EnforceRateLimit(
    ctx,
    "adminWrite",
    `user:${reviewer.iGM_Id}:${iGM_ClientIp(ctx)}`,
  );
  const applicationId = iGM_Field(ctx.body, "applicationId").trim();
  const action = iGM_Field(ctx.body, "action").trim();
  const comment = iGM_Field(ctx.body, "comment") || undefined;
  if (!applicationId || (action !== "approve" && action !== "reject")) {
    throw new iGM_ExaminerError("参数不合法", 422);
  }
  await iGM_ReviewExaminerApplicationService(
    reviewer.iGM_Id,
    applicationId,
    action,
    comment,
  );
  return iGM_Ok(
    { applicationId, action },
    action === "approve" ? "申请已通过" : "申请已拒绝",
  );
}

/* ---------- 管理端：撤销命题创作者资格 ---------- */
async function iGM_HandleRevoke(ctx: iGM_RouteContext) {
  await iGM_RequireReviewer(ctx);
  const userId = iGM_Field(ctx.body, "userId").trim();
  if (!userId) throw new iGM_ExaminerError("缺少用户 ID", 400);
  await iGM_RevokeExaminerService(userId);
  return iGM_Ok({ userId }, "命题创作者资格已撤销");
}

/**
 * G_Examiner 命题创作者路由集合
 * 业务错误统一抛 iGM_ExaminerError，由 iGM_ServerMain 全局错误处理器格式化
 */
export const G_Examiner = new Elysia({ name: "G_Examiner" })
  .get("/G_Examiner/status", iGM_HandleStatus as never)
  .get("/api/exam/creator/profile", iGM_HandleCreatorProfile as never)
  .post("/G_Examiner/apply", iGM_HandleApply as never)
  .get("/G_Examiner/presets", iGM_HandlePresets as never)
  .post("/G_Examiner/presets", iGM_HandlePresetCreate as never)
  .post("/G_Examiner/presets/update", iGM_HandlePresetUpdate as never)
  .post("/G_Examiner/presets/delete", iGM_HandlePresetDelete as never)
  .get("/G_Examiner/review", iGM_HandleReviewList as never)
  .post("/G_Examiner/review", iGM_HandleReview as never)
  .post("/G_Examiner/revoke", iGM_HandleRevoke as never);

// 导出 //
export default G_Examiner;
