/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_DeveloperService.ts
 * 所属层：后端 / 业务逻辑层
 * 路由：G_Developer
 * 模块：iGM_DeveloperService
 * 作用：开发者资格（SDK / 适配器协议）申请的业务编排
 * 内容：提交 / 重新申请、查询我的申请与状态、撤回申请、
 *       待审核列表（组织所有者与管理员）与审核
 * 说明：审核只变更状态与意见，通过即授予开发者接入资格，不生成 API Key；
 *       审核人资格＝管理员，或 iGM_Organizations.iGM_OwnerEmail 匹配的组织所有者
 */

// 导入依赖 //
import {
  iGM_FindDeveloperApplicationById,
  iGM_FindLatestDeveloperApplicationByUser,
  iGM_InsertDeveloperApplication,
  iGM_ListDeveloperApplicationsByUser,
  iGM_ListDeveloperApplicationsForAdmin,
  iGM_ReviewDeveloperApplication,
  iGM_WithdrawDeveloperApplication,
} from "../iGM_Repositories/iGM_DeveloperRepository";
import {
  iGM_FindUserById,
  iGM_FindUsersByIds,
} from "../iGM_Repositories/iGM_UserRepository";
import { iGM_FindOrganizationByOwnerEmail } from "../iGM_Repositories/iGM_OrgVerifyRepository";
import type { iGM_UserRow } from "../iGM_Types/iGM_Auth";
import type {
  iGM_DeveloperApplicationRow,
  iGM_DeveloperApplyInput,
} from "../iGM_Types/iGM_Developer";

// 类型定义 //
/** 业务错误：message 为前端 i18n 文案键，status 为 HTTP 状态码 */
export class iGM_DeveloperError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "iGM_DeveloperError";
  }
}

/** 申请字段长度限制 */
const iGM_ProjectNameMax = 60;
const iGM_ProjectDescMax = 1000;
const iGM_ProjectUrlMax = 200;
const iGM_ContactMax = 120;
const iGM_ReasonMax = 500;

/** 允许的枚举取值（缺省按 other / 空处理） */
const iGM_ProjectTypes = ["launcher", "tool", "website", "plugin", "other"];
const iGM_Quotas = ["low", "medium", "high"];

// 核心逻辑 //
/** 行 → DTO（reviewerName 由调用方批量解析后传入） */
function iGM_ToApplicationDto(
  row: iGM_DeveloperApplicationRow,
  reviewerName: string | null,
): Record<string, unknown> {
  return {
    id: row.iGM_Id,
    userId: row.iGM_UserId,
    projectName: row.iGM_ProjectName,
    projectType: row.iGM_ProjectType,
    projectDesc: row.iGM_ProjectDesc,
    projectUrl: row.iGM_ProjectUrl,
    contact: row.iGM_Contact,
    expectedQuota: row.iGM_ExpectedQuota,
    reason: row.iGM_Reason,
    status: row.iGM_Status,
    reviewerId: row.iGM_ReviewerId,
    reviewerName,
    reviewComment: row.iGM_ReviewComment,
    createdAt: row.iGM_CreatedAt,
    updatedAt: row.iGM_UpdatedAt,
  };
}

/** 批量解析审核人显示名（用户名优先，其次昵称） */
function iGM_ResolveReviewerNames(
  rows: iGM_DeveloperApplicationRow[],
): Map<string, string> {
  const ids = rows
    .map((row) => row.iGM_ReviewerId)
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) return new Map();
  const map = new Map<string, string>();
  for (const user of iGM_FindUsersByIds(ids)) {
    map.set(user.iGM_Id, user.iGM_DisplayName ?? user.iGM_Username);
  }
  return map;
}

/**
 * 是否具备开发者申请审核资格：管理员，或受信任组织负责人。
 * 组织负责人判定复用 iGM_Organizations.iGM_OwnerEmail 与用户邮箱比对。
 */
export function iGM_IsDeveloperReviewer(user: iGM_UserRow): boolean {
  if (user.iGM_Role === "admin") return true;
  return iGM_FindOrganizationByOwnerEmail(user.iGM_Email) !== null;
}

/** 校验申请入参，返回规范化后的字段 */
function iGM_ValidateApplyInput(input: iGM_DeveloperApplyInput): {
  projectName: string;
  projectType: string;
  projectDesc: string;
  projectUrl: string | null;
  contact: string;
  expectedQuota: string | null;
  reason: string;
} {
  const projectName = input.projectName.trim();
  const projectDesc = input.projectDesc.trim();
  const contact = input.contact.trim();
  const reason = input.reason.trim();
  const projectUrl = input.projectUrl?.trim() || null;
  const expectedQuota = input.expectedQuota?.trim() || null;
  const projectType = iGM_ProjectTypes.includes(input.projectType)
    ? input.projectType
    : "other";

  if (!projectName || projectName.length > iGM_ProjectNameMax) {
    throw new iGM_DeveloperError("developer.errors.projectNameInvalid", 422);
  }
  if (!projectDesc || projectDesc.length > iGM_ProjectDescMax) {
    throw new iGM_DeveloperError("developer.errors.projectDescInvalid", 422);
  }
  if (
    projectUrl &&
    (projectUrl.length > iGM_ProjectUrlMax ||
      !/^https?:\/\//i.test(projectUrl))
  ) {
    throw new iGM_DeveloperError("developer.errors.projectUrlInvalid", 422);
  }
  if (!contact || contact.length > iGM_ContactMax) {
    throw new iGM_DeveloperError("developer.errors.contactInvalid", 422);
  }
  if (expectedQuota && !iGM_Quotas.includes(expectedQuota)) {
    throw new iGM_DeveloperError("developer.errors.quotaInvalid", 422);
  }
  if (!reason || reason.length > iGM_ReasonMax) {
    throw new iGM_DeveloperError("developer.errors.reasonInvalid", 422);
  }
  if (!input.agreeRules) {
    throw new iGM_DeveloperError("developer.errors.rulesRequired", 422);
  }

  return {
    projectName,
    projectType,
    projectDesc,
    projectUrl,
    contact,
    expectedQuota,
    reason,
  };
}

/**
 * 提交开发者申请（须登录）。
 * 已有待审核或已通过申请时不可再次提交；
 * mode 为 "reapply" 时要求最近一条申请为已拒绝或已撤回。
 */
export function iGM_SubmitDeveloperApplyService(
  userId: string,
  input: iGM_DeveloperApplyInput,
  mode: "new" | "reapply" = "new",
): Record<string, unknown> {
  const user = iGM_FindUserById(userId);
  if (!user || user.iGM_Status !== "active") {
    throw new iGM_DeveloperError("auth.errors.unauthorized", 401);
  }

  const fields = iGM_ValidateApplyInput(input);

  const latest = iGM_FindLatestDeveloperApplicationByUser(userId);
  if (latest && latest.iGM_Status === "pending") {
    throw new iGM_DeveloperError("developer.errors.applyPending", 409);
  }
  if (latest && latest.iGM_Status === "approved") {
    throw new iGM_DeveloperError("developer.errors.alreadyDeveloper", 409);
  }
  if (
    mode === "reapply" &&
    latest &&
    latest.iGM_Status !== "rejected" &&
    latest.iGM_Status !== "withdrawn"
  ) {
    throw new iGM_DeveloperError("developer.errors.notReapplyable", 409);
  }

  const row = iGM_InsertDeveloperApplication({
    userId,
    ...fields,
    now: new Date().toISOString(),
  });
  return iGM_ToApplicationDto(row, null);
}

/** 我的最新一条开发者申请（未申请返回 null） */
export function iGM_GetMyDeveloperService(
  userId: string,
): Record<string, unknown> | null {
  const row = iGM_FindLatestDeveloperApplicationByUser(userId);
  if (!row) return null;
  return iGM_ToApplicationDto(
    row,
    row.iGM_ReviewerId
      ? (iGM_ResolveReviewerNames([row]).get(row.iGM_ReviewerId) ?? null)
      : null,
  );
}

/** 我的开发者申请历史（按时间倒序） */
export function iGM_ListMyDevelopersService(
  userId: string,
): Array<Record<string, unknown>> {
  const rows = iGM_ListDeveloperApplicationsByUser(userId);
  const names = iGM_ResolveReviewerNames(rows);
  return rows.map((row) =>
    iGM_ToApplicationDto(
      row,
      row.iGM_ReviewerId ? (names.get(row.iGM_ReviewerId) ?? null) : null,
    ),
  );
}

/** 撤回本人待审核申请 */
export function iGM_WithdrawDeveloperApplyService(
  userId: string,
  applicationId: string,
): void {
  const row = iGM_FindDeveloperApplicationById(applicationId);
  if (!row || row.iGM_UserId !== userId) {
    throw new iGM_DeveloperError("developer.errors.applyNotFound", 404);
  }
  if (row.iGM_Status !== "pending") {
    throw new iGM_DeveloperError("developer.errors.withdrawNotAllowed", 409);
  }
  const ok = iGM_WithdrawDeveloperApplication({
    id: applicationId,
    userId,
    now: new Date().toISOString(),
  });
  if (!ok) {
    throw new iGM_DeveloperError("developer.errors.withdrawNotAllowed", 409);
  }
}

/** 待审核列表（仅组织所有者与管理员）：分页查询开发者申请 */
export function iGM_AdminListDevelopersService(
  status: string | null,
  pageRaw?: number,
  pageSizeRaw?: number,
): {
  items: Array<Record<string, unknown>>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
} {
  const page =
    Number.isFinite(pageRaw) && (pageRaw as number) >= 1
      ? Math.floor(pageRaw as number)
      : 1;
  const pageSize =
    Number.isFinite(pageSizeRaw) &&
    (pageSizeRaw as number) >= 1 &&
    (pageSizeRaw as number) <= 50
      ? Math.floor(pageSizeRaw as number)
      : 10;
  const { items, total } = iGM_ListDeveloperApplicationsForAdmin({
    status: status && status.length > 0 ? status : null,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  const names = iGM_ResolveReviewerNames(items);
  return {
    items: items.map((row) => ({
      ...iGM_ToApplicationDto(
        row,
        row.iGM_ReviewerId ? (names.get(row.iGM_ReviewerId) ?? null) : null,
      ),
      username: row.iGM_Username,
      displayName: row.iGM_DisplayName,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * 审核开发者申请（通过 / 拒绝）：仅待审核可被审核。
 * 只记录状态与审核意见，通过即授予开发者接入资格（不发放 API Key）。
 */
export function iGM_ReviewDeveloperService(
  reviewerId: string,
  applicationId: string,
  action: "approve" | "reject",
  comment?: string,
): void {
  const row = iGM_FindDeveloperApplicationById(applicationId);
  if (!row) {
    throw new iGM_DeveloperError("developer.errors.applyNotFound", 404);
  }
  if (row.iGM_Status !== "pending") {
    throw new iGM_DeveloperError("developer.errors.applyReviewed", 409);
  }
  const trimmed = comment?.trim() || null;
  const ok = iGM_ReviewDeveloperApplication({
    id: applicationId,
    status: action === "approve" ? "approved" : "rejected",
    reviewerId,
    reviewComment: trimmed,
    now: new Date().toISOString(),
  });
  if (!ok) {
    throw new iGM_DeveloperError("developer.errors.applyReviewed", 409);
  }
}

// 导出 //
export default {
  iGM_IsDeveloperReviewer,
  iGM_SubmitDeveloperApplyService,
  iGM_GetMyDeveloperService,
  iGM_ListMyDevelopersService,
  iGM_WithdrawDeveloperApplyService,
  iGM_AdminListDevelopersService,
  iGM_ReviewDeveloperService,
};