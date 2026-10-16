/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_ExaminerService.ts
 * 所属层：后端 / 业务服务层
 * 路由：G_Examiner（/G_Examiner/revoke）、/api/exam/creator/profile
 * 模块：iGM_ExaminerService
 * 作用：命题创作者资格判定、强制校验、编号档案查询、撤销资格
 * 说明：命题创作者资格审核通过后写入 iGM_Examiners 并分配命题者编号；
 *       已被撤销或未通过的用户不能上传 / 管理试卷；
 *       申请提交与审核于 048 迁移恢复，管理端审核接口见 G_AdminExaminer
 */

// 导入依赖 //
import {
  iGM_FindExaminerByUser,
  iGM_RemoveExaminer,
  iGM_InsertApplication,
  iGM_FindLatestApplicationByUser,
  iGM_FindApplicationById,
  iGM_FindApplicationDetailById,
  iGM_ListApplications,
  iGM_ListPendingApplications,
  iGM_UpdateApplicationStatus,
  iGM_UpsertExaminer,
  type iGM_ExaminerApplicationListRow,
} from "../iGM_Repositories/iGM_ExaminerRepository";
import type {
  iGM_CreatorProfileDto,
  iGM_ExaminerApplyInput,
  iGM_MyApplicationDto,
  iGM_ExaminerApplicationRow,
  iGM_ExaminerApplicationItemDto,
  iGM_ExaminerApplicationDetailDto,
  iGM_ExaminerApplicationPageDto,
} from "../iGM_Types/iGM_Examiner";
import {
  iGM_JoinCommaList,
  iGM_SplitCommaList,
} from "../iGM_Types/iGM_Examiner";

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

// ===== 管理端：申请列表与详情（/api/admin/examiner-applications） =====

/** 分页上限 */
const iGM_ExaminerAppMaxPageSize = 50;

/** 申请列表行 → 列表项 DTO */
function iGM_ToApplicationItemDto(
  row: iGM_ExaminerApplicationListRow,
): iGM_ExaminerApplicationItemDto {
  return {
    id: row.iGM_Id,
    userId: row.iGM_UserId,
    applicantName: row.iGM_ApplicantName,
    applicantUid: row.iGM_ApplicantUid,
    realName: row.iGM_RealName,
    contact: row.iGM_Contact,
    status: row.iGM_Status,
    submittedAt: row.iGM_CreatedAt,
    reviewedAt: row.iGM_ReviewerId ? row.iGM_UpdatedAt : null,
    reviewerName: row.iGM_ReviewerId ? row.iGM_ReviewerName ?? null : null,
    reviewComment: row.iGM_ReviewComment,
  };
}

/** 状态筛选取值校验（非法值一律视为不筛选） */
function iGM_NormalizeStatusFilter(value?: string): string | undefined {
  return value === "pending" || value === "approved" || value === "rejected"
    ? value
    : undefined;
}

/** 管理端：分页列出命题创作者申请（支持状态筛选与关键词搜索） */
export async function iGM_ListExaminerApplicationsService(options: {
  status?: string;
  q?: string;
  page: number;
  pageSize: number;
}): Promise<iGM_ExaminerApplicationPageDto> {
  const page = Number.isFinite(options.page) && options.page > 0
    ? Math.floor(options.page)
    : 1;
  const pageSize =
    Number.isFinite(options.pageSize) && options.pageSize > 0
      ? Math.min(Math.floor(options.pageSize), iGM_ExaminerAppMaxPageSize)
      : 20;
  const { rows, total } = await iGM_ListApplications({
    status: iGM_NormalizeStatusFilter(options.status),
    q: options.q?.trim() || undefined,
    page,
    pageSize,
  });
  return {
    items: rows.map(iGM_ToApplicationItemDto),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** 管理端：读取单条申请详情（含完整表单与审核日志） */
export async function iGM_GetExaminerApplicationDetailService(
  id: string,
): Promise<iGM_ExaminerApplicationDetailDto> {
  const row = await iGM_FindApplicationDetailById(id);
  if (!row) throw new iGM_ExaminerError("申请不存在", 404);
  return {
    ...iGM_ToApplicationItemDto(row),
    applicantEmail: row.iGM_ApplicantEmail,
    bio: row.iGM_Bio,
    directions: iGM_SplitCommaList(row.iGM_Directions),
    portfolioUrl: row.iGM_PortfolioUrl,
    reason: row.iGM_Reason,
    agreedToRules: row.iGM_AgreedToRules,
  };
}

// 导出 //
export default {
  iGM_IsActiveExaminer,
  iGM_RequireExaminer,
  iGM_GetCreatorProfileService,
  iGM_RevokeExaminerService,
};
