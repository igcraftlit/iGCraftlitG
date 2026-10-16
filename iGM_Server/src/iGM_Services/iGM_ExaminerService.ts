/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_ExaminerService.ts
 * 所属层：后端 / 业务服务层
 * 路由：G_Examiner（/G_Examiner/revoke）、/api/exam/creator/profile
 * 模块：iGM_ExaminerService
 * 作用：命题创作者资格判定、强制校验、编号档案查询、撤销资格
 * 说明：命题创作者资格审核通过后写入 iGM_Examiners；
 *       已被撤销或未通过的用户不能上传 / 管理试卷；
 *       申请审核与命题方预设模块已于 047 迁移移除
 */

// 导入依赖 //
import {
  iGM_FindExaminerByUser,
  iGM_RemoveExaminer,
  iGM_InsertApplication,
  iGM_FindLatestApplicationByUser,
  iGM_FindApplicationById,
  iGM_ListPendingApplications,
  iGM_UpdateApplicationStatus,
  iGM_UpsertExaminer,
} from "../iGM_Repositories/iGM_ExaminerRepository";
import type {
  iGM_CreatorProfileDto,
  iGM_ExaminerApplyInput,
  iGM_MyApplicationDto,
  iGM_ExaminerApplicationRow,
} from "../iGM_Types/iGM_Examiner";
import { iGM_JoinCommaList } from "../iGM_Types/iGM_Examiner";

// 核心逻辑 //
/** 命题创作者业务错误：message 为可直接展示的中文提示 */
export class iGM_ExaminerError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "iGM_ExaminerError";
  }
}

/** 当前用户是否为在册（active）命题创作者 */
export async function iGM_IsActiveExaminer(userId: string): Promise<boolean> {
  const row = await iGM_FindExaminerByUser(userId);
  return Boolean(row && row.iGM_Status === "active");
}

/** 强制要求当前用户具备命题创作者资格，否则抛 403 */
export async function iGM_RequireExaminer(userId: string): Promise<void> {
  if (!(await iGM_IsActiveExaminer(userId))) {
    throw new iGM_ExaminerError("尚无命题创作者资格", 403);
  }
}

/**
 * 命题者编号档案：仅当用户存在「在册（active）且已分配编号」的创作者行时返回，
 * 否则返回 null（访客、非命题创作者、已撤销或尚未编号的用户）
 */
export async function iGM_GetCreatorProfileService(
  userId: string,
): Promise<iGM_CreatorProfileDto | null> {
  const examiner = await iGM_FindExaminerByUser(userId);
  if (
    !examiner ||
    examiner.iGM_Status !== "active" ||
    !examiner.iGM_CreatorNumber
  ) {
    return null;
  }
  return {
    isExaminer: true,
    creatorNumber: examiner.iGM_CreatorNumber,
    status: "approved",
  };
}

/** 管理端：撤销命题创作者资格 */
export async function iGM_RevokeExaminerService(
  userId: string,
): Promise<void> {
  await iGM_RemoveExaminer(userId);
}

// ===== 命题创作者申请 =====

/** 校验申请输入（前端独立 /apply-creator 页面提交时调用） */
function iGM_AssertApplyInput(input: iGM_ExaminerApplyInput): void {
  if (!input.realName?.trim()) throw new iGM_ExaminerError("请填写真实姓名", 400);
  if (!input.contact?.trim()) throw new iGM_ExaminerError("请填写联系方式", 400);
  if (!input.bio?.trim() || input.bio.trim().length < 50) {
    throw new iGM_ExaminerError("个人简介不少于 50 字", 400);
  }
  if (!input.directions || input.directions.length === 0) {
    throw new iGM_ExaminerError("请至少选择一个命题方向", 400);
  }
  if (!input.reason?.trim() || input.reason.trim().length < 100) {
    throw new iGM_ExaminerError("申请理由不少于 100 字", 400);
  }
  if (!input.agreedToRules) {
    throw new iGM_ExaminerError("请先同意命题创作者规范", 400);
  }
}

/** 提交命题创作者申请 */
export async function iGM_SubmitExaminerApplyService(
  userId: string,
  input: iGM_ExaminerApplyInput,
): Promise<string> {
  iGM_AssertApplyInput(input);

  // 防重复：已有 pending 的申请不能再提；approved 的说明已是创作者；
  // 只有 rejected 的可以重新提
  const latest = await iGM_FindLatestApplicationByUser(userId);
  if (latest) {
    if (latest.iGM_Status === "pending") {
      throw new iGM_ExaminerError("已有待审核申请，请勿重复提交", 409);
    }
    if (latest.iGM_Status === "approved") {
      throw new iGM_ExaminerError("您已是命题创作者，无需再申请", 409);
    }
  }
  // 已是在册创作者（iGM_Examiners 有 active 行）也不能再提
  if (await iGM_IsActiveExaminer(userId)) {
    throw new iGM_ExaminerError("您已是命题创作者，无需再申请", 409);
  }

  return await iGM_InsertApplication({
    iGM_UserId: userId,
    iGM_RealName: input.realName.trim(),
    iGM_Contact: input.contact.trim(),
    iGM_Bio: input.bio.trim(),
    iGM_Directions: iGM_JoinCommaList(input.directions),
    iGM_PortfolioUrl: input.portfolioUrl?.trim() || null,
    iGM_Reason: input.reason.trim(),
    iGM_AgreedToRules: true,
  });
}

/** 查询当前用户的申请状态（独立申请页轮询用） */
export async function iGM_GetMyApplicationStatusService(
  userId: string,
): Promise<iGM_MyApplicationDto> {
  const latest = await iGM_FindLatestApplicationByUser(userId);
  if (!latest) {
    return {
      hasApplication: false,
      status: null,
      submittedAt: null,
      reviewedAt: null,
      reviewerName: null,
      reviewComment: null,
    };
  }
  // reviewerName 暂用 reviewerId 占位，后续可 JOIN iGM_Users
  return {
    hasApplication: true,
    status: latest.iGM_Status,
    submittedAt: latest.iGM_CreatedAt,
    reviewedAt: latest.iGM_ReviewerId ? latest.iGM_UpdatedAt : null,
    reviewerName: latest.iGM_ReviewerId ? "管理员" : null,
    reviewComment: latest.iGM_ReviewComment,
  };
}

/** 管理员：审核通过/拒绝 */
export async function iGM_ReviewExaminerApplicationService(
  appId: string,
  reviewerId: string,
  action: "approve" | "reject",
  comment: string | null,
): Promise<void> {
  const app = await iGM_FindApplicationById(appId);
  if (!app) throw new iGM_ExaminerError("申请不存在", 404);
  if (app.iGM_Status !== "pending") {
    throw new iGM_ExaminerError("该申请已审核", 409);
  }

  const newStatus = action === "approve" ? "approved" : "rejected";
  await iGM_UpdateApplicationStatus(appId, newStatus, reviewerId, comment);

  // 审核通过 → 授予创作者资格（UpsertExaminer 会自动分配编号）
  if (action === "approve") {
    await iGM_UpsertExaminer(app.iGM_UserId, "active");
  }
}

/** 管理员：列出待审核申请 */
export async function iGM_ListPendingApplicationsService(): Promise<
  iGM_ExaminerApplicationRow[]
> {
  return await iGM_ListPendingApplications();
}

// 导出 //
export default {
  iGM_IsActiveExaminer,
  iGM_RequireExaminer,
  iGM_GetCreatorProfileService,
  iGM_RevokeExaminerService,
};
