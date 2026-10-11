/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_ExaminerService.ts
 * 所属层：后端 / 业务服务层
 * 路由：G_Examiner（/G_Examiner/*）
 * 模块：iGM_ExaminerService
 * 作用：命题创作者申请、准入状态与审核的业务逻辑
 * 内容：命题创作者业务错误类型、资格判定与强制校验、申请提交（含字数校验）、
 *       我的准入状态组装、命题者编号档案、管理端待审列表、审核（通过即授予资格 / 拒绝）
 * 说明：命题创作者资格审核通过后写入 iGM_Examiners；
 *       已被撤销（suspended）或未通过的用户不能上传 / 管理试卷
 */

// 导入依赖 //
import {
  iGM_CountApplicationsByStatus,
  iGM_FindApplicationById,
  iGM_FindExaminerByUser,
  iGM_FindLatestApplicationByUser,
  iGM_InsertExaminerApplication,
  iGM_ListApplicationsByStatus,
  iGM_ListApplicationsByUser,
  iGM_RemoveExaminer,
  iGM_UpdateApplicationReview,
  iGM_UpsertExaminer,
  type iGM_ExaminerApplicationViewRow,
} from "../iGM_Repositories/iGM_ExaminerRepository";
import {
  iGM_ExaminerMaxPresetName,
  iGM_ExaminerMinBioLength,
  iGM_ExaminerMinReasonLength,
  iGM_JoinCommaList,
  iGM_NormalizeDirections,
  iGM_SplitCommaList,
  type iGM_ExaminerApplicationDto,
  type iGM_ExaminerApplicationRow,
  type iGM_ExaminerAppStatus,
  type iGM_ExaminerApplyInput,
  type iGM_CreatorProfileDto,
  type iGM_ExaminerGateDto,
} from "../iGM_Types/iGM_Examiner";

// 类型定义 //
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

/** 管理端待审列表结果 */
export interface iGM_ExaminerApplicationListResult {
  applications: iGM_ExaminerApplicationDto[];
  total: number;
  page: number;
  pageSize: number;
}

// 核心逻辑 //
/** 数据行 → 申请 DTO */
function iGM_ToApplicationDto(
  row: iGM_ExaminerApplicationRow,
): iGM_ExaminerApplicationDto {
  return {
    id: row.iGM_Id,
    userId: row.iGM_UserId,
    realName: row.iGM_RealName,
    contact: row.iGM_Contact,
    bio: row.iGM_Bio,
    directions: iGM_SplitCommaList(row.iGM_Directions),
    portfolioUrl: row.iGM_PortfolioUrl ?? "",
    reason: row.iGM_Reason,
    status: row.iGM_Status as iGM_ExaminerAppStatus,
    reviewComment: row.iGM_ReviewComment ?? "",
    createdAt: row.iGM_CreatedAt,
    updatedAt: row.iGM_UpdatedAt,
  };
}

/** 审核视图行 → 申请 DTO（附申请人展示信息） */
function iGM_ToApplicationViewDto(
  row: iGM_ExaminerApplicationViewRow,
): iGM_ExaminerApplicationDto {
  return {
    ...iGM_ToApplicationDto(row),
    applicantName: row.iGM_ApplicantName ?? "",
    applicantUid: row.iGM_ApplicantUid ?? "",
    applicantEmail: row.iGM_ApplicantEmail ?? "",
  };
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
  return { isExaminer: true, creatorNumber: examiner.iGM_CreatorNumber };
}

/** 组装当前用户的准入状态（canReview 由路由层按角色判定后传入） */
export async function iGM_GetExaminerGateService(
  userId: string,
  canReview: boolean,
): Promise<iGM_ExaminerGateDto> {
  const [examiner, latest] = await Promise.all([
    iGM_FindExaminerByUser(userId),
    iGM_FindLatestApplicationByUser(userId),
  ]);

  let gate: iGM_ExaminerGateDto["gate"] = "none";
  if (examiner && examiner.iGM_Status === "active") {
    gate = "approved";
  } else if (examiner && examiner.iGM_Status === "suspended") {
    gate = "suspended";
  } else if (latest) {
    gate = latest.iGM_Status as iGM_ExaminerGateDto["gate"];
  }

  return {
    isExaminer: gate === "approved",
    gate,
    application: latest ? iGM_ToApplicationDto(latest) : null,
    canReview,
  };
}

/** 我的申请历史（含最近一条） */
export async function iGM_ListMyExaminerApplicationsService(
  userId: string,
): Promise<iGM_ExaminerApplicationDto[]> {
  const rows = await iGM_ListApplicationsByUser(userId);
  return rows.map(iGM_ToApplicationDto);
}

/** 校验申请表单，非法时抛 422 */
function iGM_AssertApplyInput(input: iGM_ExaminerApplyInput): void {
  if (!input.realName.trim()) {
    throw new iGM_ExaminerError("请填写真实姓名", 422);
  }
  if (!input.contact.trim()) {
    throw new iGM_ExaminerError("请填写联系方式", 422);
  }
  if (input.bio.trim().length < iGM_ExaminerMinBioLength) {
    throw new iGM_ExaminerError(
      `个人简介不少于 ${iGM_ExaminerMinBioLength} 字`,
      422,
    );
  }
  if (input.reason.trim().length < iGM_ExaminerMinReasonLength) {
    throw new iGM_ExaminerError(
      `申请理由不少于 ${iGM_ExaminerMinReasonLength} 字`,
      422,
    );
  }
}

/** 提交命题创作者申请（已有在册资格或待审申请时拒绝） */
export async function iGM_SubmitExaminerApplyService(
  userId: string,
  input: iGM_ExaminerApplyInput,
): Promise<iGM_ExaminerApplicationDto> {
  iGM_AssertApplyInput(input);
  const [examiner, latest] = await Promise.all([
    iGM_FindExaminerByUser(userId),
    iGM_FindLatestApplicationByUser(userId),
  ]);
  if (examiner && examiner.iGM_Status === "active") {
    throw new iGM_ExaminerError("您已是命题创作者", 409);
  }
  if (latest && latest.iGM_Status === "pending") {
    throw new iGM_ExaminerError("已有待审核的申请，请耐心等待", 409);
  }
  const directions = iGM_NormalizeDirections(input.directions);
  const row = await iGM_InsertExaminerApplication({
    userId,
    realName: input.realName.trim().slice(0, 60),
    contact: input.contact.trim().slice(0, 120),
    bio: input.bio.trim().slice(0, 2000),
    directions: iGM_JoinCommaList(directions),
    portfolioUrl: input.portfolioUrl?.trim().slice(0, 400) || null,
    reason: input.reason.trim().slice(0, 3000),
  });
  return iGM_ToApplicationDto(row);
}

/** 管理端：按状态列出申请（分页） */
export async function iGM_ListExaminerApplicationsService(
  status: string | null,
  page: number,
  pageSize: number,
): Promise<iGM_ExaminerApplicationListResult> {
  const normalized = status === "approved" || status === "rejected"
    ? status
    : "pending";
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safeSize =
    Number.isFinite(pageSize) && pageSize > 0
      ? Math.min(Math.floor(pageSize), 50)
      : 20;
  const [rows, total] = await Promise.all([
    iGM_ListApplicationsByStatus(
      normalized,
      safeSize,
      (safePage - 1) * safeSize,
    ),
    iGM_CountApplicationsByStatus(normalized),
  ]);
  return {
    applications: rows.map(iGM_ToApplicationViewDto),
    total,
    page: safePage,
    pageSize: safeSize,
  };
}

/** 管理端：审核申请（通过即授予命题创作者资格） */
export async function iGM_ReviewExaminerApplicationService(
  reviewerId: string,
  applicationId: string,
  action: "approve" | "reject",
  comment?: string,
): Promise<void> {
  const application = await iGM_FindApplicationById(applicationId);
  if (!application) {
    throw new iGM_ExaminerError("申请不存在", 404);
  }
  if (application.iGM_Status !== "pending") {
    throw new iGM_ExaminerError("该申请已处理", 409);
  }
  const status = action === "approve" ? "approved" : "rejected";
  await iGM_UpdateApplicationReview(
    applicationId,
    status,
    reviewerId,
    comment?.trim() || null,
  );
  if (action === "approve") {
    await iGM_UpsertExaminer(application.iGM_UserId, "active");
  }
}

/** 管理端：撤销命题创作者资格 */
export async function iGM_RevokeExaminerService(
  userId: string,
): Promise<void> {
  await iGM_RemoveExaminer(userId);
}

/** 命题方预设名称最大长度（供路由层复用） */
export const iGM_ExaminerPresetNameLimit = iGM_ExaminerMaxPresetName;

// 导出 //
export default {
  iGM_IsActiveExaminer,
  iGM_RequireExaminer,
  iGM_GetCreatorProfileService,
  iGM_GetExaminerGateService,
  iGM_ListMyExaminerApplicationsService,
  iGM_SubmitExaminerApplyService,
  iGM_ListExaminerApplicationsService,
  iGM_ReviewExaminerApplicationService,
  iGM_RevokeExaminerService,
};
