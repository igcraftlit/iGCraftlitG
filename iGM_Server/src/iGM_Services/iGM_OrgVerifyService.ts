/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_OrgVerifyService.ts
 * 所属层：后端 / 业务逻辑层
 * 路由：G_OrgVerify、G_Admin
 * 模块：iGM_OrgVerifyService
 * 作用：模块七组织认证核心业务编排
 * 内容：受信任组织列表与详情、提交申请、我的申请记录、取消待审核申请、
 *       我的组织详情、退出组织、负责人编辑“关于组织”、
 *       管理端/负责人申请列表、详情、审核（通过/拒绝）并写入用户认证字段
 * 规则：仅登录用户可申请；同一用户同一时间最多一条待审核申请；
 *       已认证用户不能重复申请，需先退出；
 *       审核人限 admin 或对应组织负责人，负责人仅能审核本组织申请；
 *       任何人都不能审核自己的申请；审核/退出操作写入 iGM_AdminLogs；
 *       提交/通过/拒绝/退出时发送邮件（admin 审核时同步通知组织负责人）
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import {
  iGM_FindOrganizationById,
  iGM_FindOrganizationByOwnerEmail,
  iGM_FindOrganizationBySlug,
  iGM_FindPendingVerificationByUser,
  iGM_FindVerificationById,
  iGM_InsertLeaveRecord,
  iGM_InsertVerification,
  iGM_ListTrustedOrganizations,
  iGM_ListVerificationsByUser,
  iGM_ListVerificationsForAdmin,
  iGM_ResolveOrgBadge,
  iGM_SetUserVerifiedOrg,
  iGM_UpdateOrganizationAbout,
  iGM_UpdateVerificationStatus,
  type iGM_AdminVerificationListRow,
} from "../iGM_Repositories/iGM_OrgVerifyRepository";
import { iGM_FindUserByEmail, iGM_FindUserById } from "../iGM_Repositories/iGM_UserRepository";
import { iGM_InsertAdminLog } from "../iGM_Repositories/iGM_AdminRepository";
import { iGM_SendOrgVerifyMail } from "./iGM_MailService";
import type { iGM_UserRow } from "../iGM_Types/iGM_Auth";
import type {
  iGM_AdminOrgVerificationDto,
  iGM_AdminOrgVerificationListData,
  iGM_MyOrgDetailDto,
  iGM_OrganizationDto,
  iGM_OrgVerificationDto,
  iGM_OrgVerificationRow,
  iGM_OrgVerifyStatus,
} from "../iGM_Types/iGM_OrgVerify";
import { iGM_IsOrgVerifyStatus, iGM_ToOrganizationDto } from "../iGM_Types/iGM_OrgVerify";

// 类型定义 //
/** 业务错误：message 为前端 i18n 文案键，status 为 HTTP 状态码 */
export class iGM_OrgVerifyError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "iGM_OrgVerifyError";
  }
}

/** 审核动作 */
export type iGM_OrgReviewAction = "approve" | "reject";

/** 申请理由长度约束 */
const iGM_ReasonMaxLength = 1000;
/** 证明材料字段长度约束（文本说明或文件 ID） */
const iGM_ProofMaxLength = 500;
/** 审核意见长度约束 */
const iGM_ReviewCommentMaxLength = 500;
/** “关于组织”内容长度约束 */
const iGM_AboutMaxLength = 5000;
/** 退出组织理由长度约束 */
const iGM_LeaveReasonMaxLength = 500;

// 核心逻辑 //
/* ---------- 内部工具 ---------- */

/** 规范化分页参数（与管理后台一致：pageSize 上限 50） */
function iGM_Page(pageRaw: number, pageSizeRaw: number): {
  page: number;
  pageSize: number;
} {
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const pageSize =
    Number.isFinite(pageSizeRaw) && pageSizeRaw >= 1 && pageSizeRaw <= 50
      ? Math.floor(pageSizeRaw)
      : 10;
  return { page, pageSize };
}

/** 邮箱相等判定（统一小写、去空格） */
function iGM_SameEmail(a: string | null | undefined, b: string): boolean {
  return !!a && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** 申请行转用户视角 DTO */
async function iGM_ToVerificationDto(
  row: iGM_OrgVerificationRow,
  reviewerName?: string | null,
): Promise<iGM_OrgVerificationDto> {
  const org = await iGM_ResolveOrgBadge(row.iGM_OrgId);
  return {
    id: row.iGM_Id,
    org: org ?? { id: row.iGM_OrgId, name: row.iGM_OrgId, slug: "" },
    reason: row.iGM_Reason,
    proof: row.iGM_Proof,
    status: row.iGM_Status,
    reviewComment: row.iGM_ReviewComment,
    reviewerName: reviewerName ?? null,
    createdAt: row.iGM_CreatedAt,
    updatedAt: row.iGM_UpdatedAt,
  };
}

/** 管理端列表行转 DTO */
async function iGM_ToAdminVerificationDto(
  row: iGM_AdminVerificationListRow,
): Promise<iGM_AdminOrgVerificationDto> {
  return {
    ...(await iGM_ToVerificationDto(row, row.iGM_ReviewerName)),
    userId: row.iGM_UserId,
    username: row.iGM_Username,
    userDisplayName: row.iGM_UserDisplayName,
    userAvatar: row.iGM_UserAvatar,
    userEmail: row.iGM_UserEmail,
  };
}

/**
 * 发送组织认证邮件（异步、失败仅记录日志，不阻断主流程）
 * 邮件语言取接收用户控制台语言（无偏好记录时回退中文）
 */
async function iGM_NotifyByMail(params: {
  userId: string;
  orgName: string;
  kind: "submitted" | "approved" | "rejected" | "left";
  comment?: string | null;
  locale: string;
}): Promise<void> {
  const user = await iGM_FindUserById(params.userId);
  if (!user) return;
  void iGM_SendOrgVerifyMail({
    to: user.iGM_Email,
    username: user.iGM_Username,
    orgName: params.orgName,
    kind: params.kind,
    comment: params.comment ?? null,
    locale: params.locale,
  }).catch((error) => {
    console.error(
      `[iGM_OrgVerifyService] ${params.kind} 邮件发送失败：`,
      error instanceof Error ? error.message : error,
    );
  });
}

/** admin 审核时同步通知对应组织负责人（审核人即负责人本人时不重复发送） */
async function iGM_NotifyOwnerByMail(params: {
  ownerEmail: string | null | undefined;
  applicant: iGM_UserRow;
  orgName: string;
  kind: "approved" | "rejected";
  comment?: string | null;
}): Promise<void> {
  const ownerEmail = params.ownerEmail?.trim();
  // 无负责人邮箱，或申请人/负责人同一邮箱时，不重复通知
  if (!ownerEmail || iGM_SameEmail(ownerEmail, params.applicant.iGM_Email)) return;
  const owner = await iGM_FindUserByEmail(ownerEmail);
  void iGM_SendOrgVerifyMail({
    to: ownerEmail,
    username: owner?.iGM_Username ?? ownerEmail,
    orgName: params.orgName,
    kind: params.kind,
    comment: params.comment ?? null,
    locale: "zh-CN",
  }).catch((error) => {
    console.error(
      `[iGM_OrgVerifyService] 负责人 ${params.kind} 邮件发送失败：`,
      error instanceof Error ? error.message : error,
    );
  });
}

/* ---------- 用户侧：组织 ---------- */

/** 受信任组织列表（申请页卡片数据源） */
export async function iGM_ListTrustedOrgsService(): Promise<iGM_OrganizationDto[]> {
  return (await iGM_ListTrustedOrganizations()).map(iGM_ToOrganizationDto);
}

/** 公开组织详情（G_OrgDetails，按 id 或 slug 查询） */
export async function iGM_GetOrganizationDetailService(input: {
  id?: string | null;
  slug?: string | null;
}): Promise<iGM_OrganizationDto> {
  const id = input.id?.trim();
  const slug = input.slug?.trim();
  const row = id
    ? await iGM_FindOrganizationById(id)
    : slug
      ? await iGM_FindOrganizationBySlug(slug)
      : null;
  if (!row || row.iGM_IsTrusted !== 1) {
    throw new iGM_OrgVerifyError("orgVerify.errors.orgNotFound", 404);
  }
  return iGM_ToOrganizationDto(row);
}

/** 当前用户的组织详情（已认证用户，附负责人标记） */
export async function iGM_GetMyOrgService(user: iGM_UserRow): Promise<iGM_MyOrgDetailDto> {
  if (!user.iGM_VerifiedOrgId) {
    throw new iGM_OrgVerifyError("orgVerify.errors.notOrgMember", 409);
  }
  const org = await iGM_FindOrganizationById(user.iGM_VerifiedOrgId);
  if (!org) {
    throw new iGM_OrgVerifyError("orgVerify.errors.orgNotFound", 404);
  }
  return {
    organization: iGM_ToOrganizationDto(org),
    isOwner: iGM_SameEmail(org.iGM_OwnerEmail, user.iGM_Email),
  };
}

/**
 * 负责人编辑“关于组织”内容
 * 规则：仅该组织负责人邮箱可编辑（admin 若即负责人同样放行）
 */
export async function iGM_UpdateOrgAboutService(
  user: iGM_UserRow,
  orgId: string,
  aboutRaw: string,
): Promise<iGM_OrganizationDto> {
  const id = orgId.trim();
  const aboutContent = (aboutRaw ?? "").trim();
  if (!id) {
    throw new iGM_OrgVerifyError("orgVerify.errors.badRequest", 422);
  }
  if (aboutContent.length > iGM_AboutMaxLength) {
    throw new iGM_OrgVerifyError("orgVerify.errors.aboutTooLong", 422);
  }
  const org = await iGM_FindOrganizationById(id);
  if (!org || org.iGM_IsTrusted !== 1) {
    throw new iGM_OrgVerifyError("orgVerify.errors.orgNotFound", 404);
  }
  if (!iGM_SameEmail(org.iGM_OwnerEmail, user.iGM_Email)) {
    throw new iGM_OrgVerifyError("orgVerify.errors.forbidden", 403);
  }
  await iGM_UpdateOrganizationAbout(id, aboutContent);
  return iGM_ToOrganizationDto((await iGM_FindOrganizationById(id)) ?? org);
}

/* ---------- 用户侧：申请 ---------- */

/**
 * 提交组织认证申请
 * 校验：已认证用户不可申请（需先退出）、组织存在且受信任、
 *       理由非空且不超长、同一用户无待审核申请
 */
export async function iGM_SubmitVerificationService(
  user: iGM_UserRow,
  input: { orgId: string; reason: string; proof: string | null },
  locale: string,
): Promise<iGM_OrgVerificationDto> {
  const orgId = input.orgId.trim();
  const reason = input.reason.trim();
  const proof = input.proof?.trim() ? input.proof.trim() : null;

  if (!orgId || !reason) {
    throw new iGM_OrgVerifyError("orgVerify.errors.badRequest", 422);
  }
  if (reason.length > iGM_ReasonMaxLength) {
    throw new iGM_OrgVerifyError("orgVerify.errors.reasonTooLong", 422);
  }
  if (proof && proof.length > iGM_ProofMaxLength) {
    throw new iGM_OrgVerifyError("orgVerify.errors.proofTooLong", 422);
  }

  const org = await iGM_FindOrganizationById(orgId);
  if (!org || org.iGM_IsTrusted !== 1) {
    throw new iGM_OrgVerifyError("orgVerify.errors.orgNotFound", 404);
  }

  // 已持有认证标识的用户需先退出组织才能重新申请
  if (user.iGM_VerifiedOrgId) {
    throw new iGM_OrgVerifyError("orgVerify.errors.alreadyVerified", 409);
  }
  // 同一用户同一时间只能有一个待审核申请（可取消后重新申请）
  if (await iGM_FindPendingVerificationByUser(user.iGM_Id)) {
    throw new iGM_OrgVerifyError("orgVerify.errors.pendingExists", 409);
  }

  const row = await iGM_InsertVerification({
    userId: user.iGM_Id,
    orgId,
    reason,
    proof,
    now: new Date().toISOString(),
  });

  await iGM_NotifyByMail({
    userId: user.iGM_Id,
    orgName: org.iGM_Name,
    kind: "submitted",
    locale,
  });

  return await iGM_ToVerificationDto(row);
}

/** 我的申请记录（按创建时间倒序，附审核人名称） */
export async function iGM_ListMyVerificationsService(
  user: iGM_UserRow,
): Promise<iGM_OrgVerificationDto[]> {
  const rows = await iGM_ListVerificationsByUser(user.iGM_Id);
  const reviewerIds = Array.from(
    new Set(rows.map((row) => row.iGM_ReviewerId).filter(Boolean)),
  ) as string[];
  const reviewerNames = new Map<string, string>();
  for (const id of reviewerIds) {
    const reviewer = await iGM_FindUserById(id);
    if (reviewer) reviewerNames.set(id, reviewer.iGM_Username);
  }
  const items: iGM_OrgVerificationDto[] = [];
  for (const row of rows) {
    items.push(
      await iGM_ToVerificationDto(
        row,
        row.iGM_ReviewerId ? (reviewerNames.get(row.iGM_ReviewerId) ?? null) : null,
      ),
    );
  }
  return items;
}

/** 取消待审核申请：仅本人、仅 pending 状态可取消 */
export async function iGM_CancelVerificationService(
  user: iGM_UserRow,
  verificationId: string,
): Promise<void> {
  const row = await iGM_FindVerificationById(verificationId.trim());
  if (!row || row.iGM_UserId !== user.iGM_Id) {
    throw new iGM_OrgVerifyError("orgVerify.errors.notFound", 404);
  }
  const updated = await iGM_UpdateVerificationStatus({
    id: row.iGM_Id,
    status: "cancelled",
    reviewerId: null,
    reviewComment: null,
    now: new Date().toISOString(),
  });
  if (!updated) {
    throw new iGM_OrgVerifyError("orgVerify.errors.notPending", 409);
  }
}

/**
 * 退出已认证组织：清除认证标识并写入 left 历史记录、操作日志与邮件通知。
 * 退出后用户可重新提交申请。
 */
export async function iGM_LeaveOrgService(
  user: iGM_UserRow,
  reasonRaw: string | null,
  locale: string,
): Promise<void> {
  if (!user.iGM_VerifiedOrgId) {
    throw new iGM_OrgVerifyError("orgVerify.errors.notOrgMember", 409);
  }
  const org = await iGM_FindOrganizationById(user.iGM_VerifiedOrgId);
  if (!org) {
    throw new iGM_OrgVerifyError("orgVerify.errors.orgNotFound", 404);
  }
  // 模块七第三轮：组织负责人（所有者）不可退出自己的组织
  if (iGM_SameEmail(org.iGM_OwnerEmail, user.iGM_Email)) {
    throw new iGM_OrgVerifyError("orgVerify.errors.ownerCannotLeave", 403);
  }
  const reason = reasonRaw?.trim() ? reasonRaw.trim() : null;
  if (reason && reason.length > iGM_LeaveReasonMaxLength) {
    throw new iGM_OrgVerifyError("orgVerify.errors.reasonTooLong", 422);
  }
  // 有待审核申请时先拦截，避免退出后挂着无法处理的申请
  if (await iGM_FindPendingVerificationByUser(user.iGM_Id)) {
    throw new iGM_OrgVerifyError("orgVerify.errors.pendingExists", 409);
  }

  const now = new Date().toISOString();
  await iGM_Db.transaction(async () => {
    await iGM_SetUserVerifiedOrg(user.iGM_Id, null, now);
    await iGM_InsertLeaveRecord({
      userId: user.iGM_Id,
      orgId: org.iGM_Id,
      reason,
      now,
    });
  })();

  await iGM_InsertAdminLog({
    adminId: user.iGM_Id,
    action: "org_verify_leave",
    targetType: "organization",
    targetId: org.iGM_Id,
    detail: `user:${user.iGM_Id} org:${org.iGM_Id}`,
    now,
  });

  await iGM_NotifyByMail({
    userId: user.iGM_Id,
    orgName: org.iGM_Name,
    kind: "left",
    comment: reason,
    locale,
  });
}

/* ---------- 管理端 / 负责人 ---------- */

/**
 * 审核权限判定：admin 可审核全部组织；负责人仅可审核自己组织；
 * 任何人都不能审核自己的申请。
 * @returns 校验通过的申请对应组织行
 */
async function iGM_AssertCanReview(
  reviewer: iGM_UserRow,
  application: iGM_OrgVerificationRow,
) {
  if (application.iGM_UserId === reviewer.iGM_Id) {
    throw new iGM_OrgVerifyError("orgVerify.errors.cannotReviewOwn", 422);
  }
  const org = await iGM_FindOrganizationById(application.iGM_OrgId);
  if (!org) {
    throw new iGM_OrgVerifyError("orgVerify.errors.orgNotFound", 404);
  }
  if (reviewer.iGM_Role === "admin") return org;
  if (iGM_SameEmail(org.iGM_OwnerEmail, reviewer.iGM_Email)) return org;
  throw new iGM_OrgVerifyError("orgVerify.errors.forbidden", 403);
}

/**
 * 申请列表（按审核人权限过滤）
 * admin：可按组织筛选，可看全部；负责人：强制仅自己组织；其余：403
 */
export async function iGM_AdminListVerificationsService(
  reviewer: iGM_UserRow,
  statusRaw: string | null,
  orgIdRaw: string | null,
  pageRaw: number,
  pageSizeRaw: number,
): Promise<iGM_AdminOrgVerificationListData> {
  const { page, pageSize } = iGM_Page(pageRaw, pageSizeRaw);
  const status: iGM_OrgVerifyStatus | null = iGM_IsOrgVerifyStatus(statusRaw)
    ? statusRaw
    : null;

  let orgFilter: string | null = null;
  if (reviewer.iGM_Role === "admin") {
    // admin 可选择组织筛选；传入非法 id 时按无筛选处理（不泄露存在性）
    if (orgIdRaw?.trim() && (await iGM_FindOrganizationById(orgIdRaw.trim()))) {
      orgFilter = orgIdRaw.trim();
    }
  } else {
    const ownerOrg = await iGM_FindOrganizationByOwnerEmail(reviewer.iGM_Email);
    if (!ownerOrg) {
      throw new iGM_OrgVerifyError("orgVerify.errors.forbidden", 403);
    }
    orgFilter = ownerOrg.iGM_Id;
  }

  const { items, total } = await iGM_ListVerificationsForAdmin(
    status,
    orgFilter,
    page,
    pageSize,
  );
  return {
    items: await Promise.all(items.map((item) => iGM_ToAdminVerificationDto(item))),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** 申请详情（admin 或对应组织负责人） */
export async function iGM_AdminGetVerificationService(
  reviewer: iGM_UserRow,
  verificationId: string,
): Promise<iGM_AdminOrgVerificationDto> {
  const row = await iGM_FindVerificationById(verificationId.trim());
  if (!row) throw new iGM_OrgVerifyError("orgVerify.errors.notFound", 404);
  await iGM_AssertCanReview(reviewer, row);
  const applicant = await iGM_FindUserById(row.iGM_UserId);
  const reviewUser = row.iGM_ReviewerId
    ? await iGM_FindUserById(row.iGM_ReviewerId)
    : null;
  return {
    ...(await iGM_ToVerificationDto(row, reviewUser?.iGM_Username ?? null)),
    userId: row.iGM_UserId,
    username: applicant?.iGM_Username ?? "unknown",
    userDisplayName: applicant?.iGM_DisplayName ?? null,
    userAvatar: applicant?.iGM_Avatar ?? null,
    userEmail: applicant?.iGM_Email ?? "",
  };
}

/**
 * 审核申请：approve 通过 / reject 拒绝
 * 规则：仅 pending 可审；审核人限 admin 或对应组织负责人；不能审核自己的申请；
 *       通过时写入用户认证组织；审核操作写入 iGM_AdminLogs；
 *       邮件通知申请人；审核人为 admin 时同步抄送组织负责人
 */
export async function iGM_ReviewVerificationService(
  reviewer: iGM_UserRow,
  verificationId: string,
  action: iGM_OrgReviewAction,
  comment: string | null,
  locale: string,
): Promise<void> {
  const row = await iGM_FindVerificationById(verificationId.trim());
  if (!row) throw new iGM_OrgVerifyError("orgVerify.errors.notFound", 404);

  // 权限判定内含“不能审核自己的申请”
  const org = await iGM_AssertCanReview(reviewer, row);

  const reviewComment = comment?.trim() ? comment.trim() : null;
  if (reviewComment && reviewComment.length > iGM_ReviewCommentMaxLength) {
    throw new iGM_OrgVerifyError("orgVerify.errors.commentTooLong", 422);
  }

  const now = new Date().toISOString();

  const updated = await iGM_Db.transaction(async () => {
    const ok = await iGM_UpdateVerificationStatus({
      id: row.iGM_Id,
      status: action === "approve" ? "approved" : "rejected",
      reviewerId: reviewer.iGM_Id,
      reviewComment,
      now,
    });
    if (!ok) return false;
    // 通过：将认证组织写入用户资料（同一事务，保证状态与标识一致）
    if (action === "approve") {
      await iGM_SetUserVerifiedOrg(row.iGM_UserId, row.iGM_OrgId, now);
    }
    return true;
  })();

  if (!updated) {
    throw new iGM_OrgVerifyError("orgVerify.errors.notPending", 409);
  }

  await iGM_InsertAdminLog({
    adminId: reviewer.iGM_Id,
    action: action === "approve" ? "org_verify_approve" : "org_verify_reject",
    targetType: "org_verification",
    targetId: row.iGM_Id,
    detail: `user:${row.iGM_UserId} org:${row.iGM_OrgId}`,
    now,
  });

  const applicant = await iGM_FindUserById(row.iGM_UserId);
  await iGM_NotifyByMail({
    userId: row.iGM_UserId,
    orgName: org.iGM_Name,
    kind: action === "approve" ? "approved" : "rejected",
    comment: reviewComment,
    locale,
  });
  // admin 代为审核时同步通知组织负责人；负责人本人审核不重复通知
  if (reviewer.iGM_Role === "admin" && applicant) {
    await iGM_NotifyOwnerByMail({
      ownerEmail: org.iGM_OwnerEmail,
      applicant,
      orgName: org.iGM_Name,
      kind: action === "approve" ? "approved" : "rejected",
      comment: reviewComment,
    });
  }
}

// 导出 //
export default {
  iGM_ListTrustedOrgsService,
  iGM_GetOrganizationDetailService,
  iGM_GetMyOrgService,
  iGM_UpdateOrgAboutService,
  iGM_SubmitVerificationService,
  iGM_ListMyVerificationsService,
  iGM_CancelVerificationService,
  iGM_LeaveOrgService,
  iGM_AdminListVerificationsService,
  iGM_AdminGetVerificationService,
  iGM_ReviewVerificationService,
};
