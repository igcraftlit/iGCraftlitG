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
  iGM_FindDeveloperBatchByName,
  iGM_FindDeveloperPublicityByApplication,
  iGM_FindLatestDeveloperApplicationByUser,
  iGM_InsertDeveloperApplication,
  iGM_InsertDeveloperBatch,
  iGM_InsertDeveloperPublicity,
  iGM_ListDeveloperApplicationsByUser,
  iGM_ListDeveloperApplicationsForAdmin,
  iGM_ListDeveloperBatches,
  iGM_ListDeveloperPublicity,
  iGM_ReviewDeveloperApplication,
  iGM_UpdateDeveloperApplicationBatch,
  iGM_WithdrawDeveloperApplication,
} from "../iGM_Repositories/iGM_DeveloperRepository";
import {
  iGM_CountCallStatsByChannel,
  iGM_CountCallStatsByClient,
  iGM_CountCallStatsDaily,
  iGM_CountCallStatsSince,
  iGM_ListApprovedDeveloperAccounts,
} from "../iGM_Repositories/iGM_DeveloperStatsRepository";
import {
  iGM_FindUserById,
  iGM_FindUsersByIds,
} from "../iGM_Repositories/iGM_UserRepository";
import { iGM_FindOrganizationByOwnerEmail } from "../iGM_Repositories/iGM_OrgVerifyRepository";
import type { iGM_UserRow } from "../iGM_Types/iGM_Auth";
import type {
  iGM_DeveloperApplicationRow,
  iGM_DeveloperApplyInput,
  iGM_DeveloperBatchRow,
  iGM_DeveloperPublicityRow,
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

/** 申请字段长度限制与门槛（模块二十六规范化） */
const iGM_DeveloperNameMax = 60;
const iGM_ProjectNameMax = 60;
const iGM_ProjectIntroMin = 100;
const iGM_ProjectDescMax = 1000;
const iGM_ReasonMin = 200;
const iGM_ReasonMax = 500;
const iGM_AddressMax = 200;
const iGM_AdditionalMax = 500;
const iGM_ContactEmailMax = 120;
const iGM_ContactPhoneMax = 40;
const iGM_PostalCodeMax = 20;
/** 域名格式：形如 example.com（可含子域，不含协议与路径） */
const iGM_DomainPattern = /^(?=.{1,253}$)([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;
/** 邮箱格式（宽松校验，由前端与后端双重把关） */
const iGM_EmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** 手机号格式：7-20 位，允许 + 与分隔符 */
const iGM_PhonePattern = /^[+]?[0-9\-\s()]{7,20}$/;

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
    developerName: row.iGM_DeveloperName,
    age: row.iGM_Age,
    birthMonth: row.iGM_BirthMonth,
    birthDay: row.iGM_BirthDay,
    contactEmail: row.iGM_ContactEmail,
    contactPhone: row.iGM_ContactPhone,
    country: row.iGM_Country,
    province: row.iGM_Province,
    city: row.iGM_City,
    address: row.iGM_Address,
    postalCode: row.iGM_PostalCode,
    domain: row.iGM_Domain,
    additional: row.iGM_Additional,
    batchId: row.iGM_BatchId,
    createdAt: row.iGM_CreatedAt,
    updatedAt: row.iGM_UpdatedAt,
  };
}

/** 批量解析审核人显示名（用户名优先，其次昵称） */
async function iGM_ResolveReviewerNames(
  rows: iGM_DeveloperApplicationRow[],
): Promise<Map<string, string>> {
  const ids = rows
    .map((row) => row.iGM_ReviewerId)
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) return new Map();
  const map = new Map<string, string>();
  for (const user of await iGM_FindUsersByIds(ids)) {
    map.set(user.iGM_Id, user.iGM_DisplayName ?? user.iGM_Username);
  }
  return map;
}

/**
 * 模块二十二：是否已通过开发者申请（以最近一条申请状态为准）。
 * 账户设置与开发者平台均以此判定开发者身份。
 */
export async function iGM_IsApprovedDeveloper(
  userId: string,
): Promise<boolean> {
  const latest = await iGM_FindLatestDeveloperApplicationByUser(userId);
  return latest?.iGM_Status === "approved";
}

/**
 * 是否具备开发者申请审核资格：管理员，或受信任组织负责人。
 * 组织负责人判定复用 iGM_Organizations.iGM_OwnerEmail 与用户邮箱比对。
 */
export async function iGM_IsDeveloperReviewer(
  user: iGM_UserRow,
): Promise<boolean> {
  if (user.iGM_Role === "admin") return true;
  return (await iGM_FindOrganizationByOwnerEmail(user.iGM_Email)) !== null;
}

/** 校验申请入参，返回规范化后的字段（模块二十六规范） */
function iGM_ValidateApplyInput(input: iGM_DeveloperApplyInput): {
  developerName: string;
  age: number;
  birthMonth: number;
  birthDay: number;
  contactEmail: string | null;
  contactPhone: string | null;
  contact: string;
  country: string;
  province: string;
  city: string;
  address: string;
  postalCode: string;
  projectName: string;
  projectIntro: string;
  domain: string | null;
  reason: string;
  additional: string | null;
} {
  const developerName = input.developerName.trim();
  const projectName = input.projectName.trim();
  const projectIntro = input.projectIntro.trim();
  const reason = input.reason.trim();
  const country = input.country.trim();
  const province = input.province.trim();
  const city = input.city.trim();
  const address = input.address.trim();
  const postalCode = input.postalCode.trim();
  const contactEmail = input.contactEmail?.trim() || null;
  const contactPhone = input.contactPhone?.trim() || null;
  const domain = input.domain?.trim().toLowerCase() || null;
  const additional = input.additional?.trim() || null;

  const age = Number(input.age);
  const birthMonth = Number(input.birthMonth);
  const birthDay = Number(input.birthDay);

  if (!developerName || developerName.length > iGM_DeveloperNameMax) {
    throw new iGM_DeveloperError("developer.errors.developerNameInvalid", 422);
  }
  if (!Number.isInteger(age) || age < 1 || age > 120) {
    throw new iGM_DeveloperError("developer.errors.ageInvalid", 422);
  }
  if (!Number.isInteger(birthMonth) || birthMonth < 1 || birthMonth > 12) {
    throw new iGM_DeveloperError("developer.errors.birthInvalid", 422);
  }
  if (!Number.isInteger(birthDay) || birthDay < 1 || birthDay > 31) {
    throw new iGM_DeveloperError("developer.errors.birthInvalid", 422);
  }
  // 邮箱与手机至少填写一项，填写项须符合格式
  if (!contactEmail && !contactPhone) {
    throw new iGM_DeveloperError("developer.errors.contactRequired", 422);
  }
  if (
    contactEmail &&
    (contactEmail.length > iGM_ContactEmailMax ||
      !iGM_EmailPattern.test(contactEmail))
  ) {
    throw new iGM_DeveloperError("developer.errors.emailInvalid", 422);
  }
  if (
    contactPhone &&
    (contactPhone.length > iGM_ContactPhoneMax ||
      !iGM_PhonePattern.test(contactPhone))
  ) {
    throw new iGM_DeveloperError("developer.errors.phoneInvalid", 422);
  }
  if (
    !country ||
    !province ||
    !city ||
    !address ||
    address.length > iGM_AddressMax
  ) {
    throw new iGM_DeveloperError("developer.errors.addressInvalid", 422);
  }
  if (!postalCode || postalCode.length > iGM_PostalCodeMax) {
    throw new iGM_DeveloperError("developer.errors.postalInvalid", 422);
  }
  if (!projectName || projectName.length > iGM_ProjectNameMax) {
    throw new iGM_DeveloperError("developer.errors.projectNameInvalid", 422);
  }
  if (projectIntro.length <= iGM_ProjectIntroMin || projectIntro.length > iGM_ProjectDescMax) {
    throw new iGM_DeveloperError("developer.errors.projectIntroInvalid", 422);
  }
  if (domain && !iGM_DomainPattern.test(domain)) {
    throw new iGM_DeveloperError("developer.errors.domainInvalid", 422);
  }
  if (reason.length <= iGM_ReasonMin || reason.length > iGM_ReasonMax) {
    throw new iGM_DeveloperError("developer.errors.reasonInvalid", 422);
  }
  if (additional && additional.length > iGM_AdditionalMax) {
    throw new iGM_DeveloperError("developer.errors.additionalInvalid", 422);
  }
  if (!input.agreeRules) {
    throw new iGM_DeveloperError("developer.errors.rulesRequired", 422);
  }

  // 联系方式展示文本：邮箱与手机合并（管理端列表沿用 iGM_Contact 显示）
  const contact = [contactEmail, contactPhone].filter(Boolean).join(" / ");

  return {
    developerName,
    age,
    birthMonth,
    birthDay,
    contactEmail,
    contactPhone,
    contact,
    country,
    province,
    city,
    address,
    postalCode,
    projectName,
    projectIntro,
    domain,
    reason,
    additional,
  };
}

/**
 * 提交开发者申请（须登录）。
 * 已有待审核或已通过申请时不可再次提交；
 * mode 为 "reapply" 时要求最近一条申请为已拒绝或已撤回。
 */
export async function iGM_SubmitDeveloperApplyService(
  userId: string,
  input: iGM_DeveloperApplyInput,
  mode: "new" | "reapply" = "new",
): Promise<Record<string, unknown>> {
  const user = await iGM_FindUserById(userId);
  if (!user || user.iGM_Status !== "active") {
    throw new iGM_DeveloperError("auth.errors.unauthorized", 401);
  }

  const fields = iGM_ValidateApplyInput(input);

  const latest = await iGM_FindLatestDeveloperApplicationByUser(userId);
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

  const row = await iGM_InsertDeveloperApplication({
    userId,
    ...fields,
    now: new Date().toISOString(),
  });
  return iGM_ToApplicationDto(row, null);
}

/** 我的最新一条开发者申请（未申请返回 null） */
export async function iGM_GetMyDeveloperService(
  userId: string,
): Promise<Record<string, unknown> | null> {
  const row = await iGM_FindLatestDeveloperApplicationByUser(userId);
  if (!row) return null;
  return iGM_ToApplicationDto(
    row,
    row.iGM_ReviewerId
      ? ((await iGM_ResolveReviewerNames([row])).get(row.iGM_ReviewerId) ?? null)
      : null,
  );
}

/** 我的开发者申请历史（按时间倒序） */
export async function iGM_ListMyDevelopersService(
  userId: string,
): Promise<Array<Record<string, unknown>>> {
  const rows = await iGM_ListDeveloperApplicationsByUser(userId);
  const names = await iGM_ResolveReviewerNames(rows);
  return rows.map((row) =>
    iGM_ToApplicationDto(
      row,
      row.iGM_ReviewerId ? (names.get(row.iGM_ReviewerId) ?? null) : null,
    ),
  );
}

/** 撤回本人待审核申请 */
export async function iGM_WithdrawDeveloperApplyService(
  userId: string,
  applicationId: string,
): Promise<void> {
  const row = await iGM_FindDeveloperApplicationById(applicationId);
  if (!row || row.iGM_UserId !== userId) {
    throw new iGM_DeveloperError("developer.errors.applyNotFound", 404);
  }
  if (row.iGM_Status !== "pending") {
    throw new iGM_DeveloperError("developer.errors.withdrawNotAllowed", 409);
  }
  const ok = await iGM_WithdrawDeveloperApplication({
    id: applicationId,
    userId,
    now: new Date().toISOString(),
  });
  if (!ok) {
    throw new iGM_DeveloperError("developer.errors.withdrawNotAllowed", 409);
  }
}

/** 待审核列表（仅组织所有者与管理员）：分页查询开发者申请 */
export async function iGM_AdminListDevelopersService(
  status: string | null,
  pageRaw?: number,
  pageSizeRaw?: number,
): Promise<{
  items: Array<Record<string, unknown>>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
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
  const { items, total } = await iGM_ListDeveloperApplicationsForAdmin({
    status: status && status.length > 0 ? status : null,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  const names = await iGM_ResolveReviewerNames(items);
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
export async function iGM_ReviewDeveloperService(
  reviewerId: string,
  applicationId: string,
  action: "approve" | "reject",
  comment?: string,
): Promise<void> {
  const row = await iGM_FindDeveloperApplicationById(applicationId);
  if (!row) {
    throw new iGM_DeveloperError("developer.errors.applyNotFound", 404);
  }
  if (row.iGM_Status !== "pending") {
    throw new iGM_DeveloperError("developer.errors.applyReviewed", 409);
  }
  const trimmed = comment?.trim() || null;
  const ok = await iGM_ReviewDeveloperApplication({
    id: applicationId,
    status: action === "approve" ? "approved" : "rejected",
    reviewerId,
    reviewComment: trimmed,
    now: new Date().toISOString(),
  });
  if (!ok) {
    throw new iGM_DeveloperError("developer.errors.applyReviewed", 409);
  }
  // 通过审核即自动归入当前公示批次并写入公示（拒绝不公示）
  if (action === "approve") {
    await iGM_PublishDeveloperService(applicationId);
  }
}

/* ---------- 模块二十六：开发者批次与公示 ---------- */

/** 当前公示批次名额（除联合开发者外，每月上限 30 名） */
const iGM_MonthlyQuota = 30;

/**
 * 取当前年月对应的公示批次，不存在则创建。
 * 批次名形如 “2026-10 批次”，默认名额 30，状态 active。
 */
async function iGM_EnsureCurrentBatchService(now: string): Promise<iGM_DeveloperBatchRow> {
  const month = now.slice(0, 7);
  const batchName = `${month} 批次`;
  const existing = await iGM_FindDeveloperBatchByName(batchName);
  if (existing) return existing;
  return await iGM_InsertDeveloperBatch({
    batchName,
    quota: iGM_MonthlyQuota,
    publishedAt: now,
    status: "active",
    now,
  });
}

/**
 * 将一条已通过的申请纳入公示：分配当前批次并写入公示条目。
 * 幂等：同一申请已公示时直接返回，不重复写入。
 */
export async function iGM_PublishDeveloperService(
  applicationId: string,
): Promise<void> {
  const row = await iGM_FindDeveloperApplicationById(applicationId);
  if (!row || row.iGM_Status !== "approved") {
    throw new iGM_DeveloperError("developer.errors.applyNotFound", 404);
  }
  const published = await iGM_FindDeveloperPublicityByApplication(applicationId);
  if (published) return;

  const now = new Date().toISOString();
  const batch = await iGM_EnsureCurrentBatchService(now);
  await iGM_UpdateDeveloperApplicationBatch({
    id: applicationId,
    batchId: batch.iGM_Id,
    now,
  });
  await iGM_InsertDeveloperPublicity({
    batchId: batch.iGM_Id,
    applicationId,
    userId: row.iGM_UserId,
    developerName: row.iGM_DeveloperName ?? row.iGM_ProjectName,
    projectName: row.iGM_ProjectName,
    approvedAt: now,
  });
}

/**
 * 开发者公示列表（公开）：按批次分组，最新批次置顶。
 * 返回批次的名称 / 名额 / 公示时间 / 状态与该批次下的公示条目。
 */
export async function iGM_ListDeveloperPublicityService(): Promise<{
  batches: Array<{
    id: string;
    batchName: string;
    quota: number;
    publishedAt: string | null;
    status: string;
    items: Array<{
      id: string;
      developerName: string;
      uid: string | null;
      projectName: string;
      approvedAt: string;
    }>;
  }>;
}> {
  const [batches, publicity] = await Promise.all([
    iGM_ListDeveloperBatches(),
    iGM_ListDeveloperPublicity(),
  ]);
  const grouped = new Map<string, iGM_DeveloperPublicityRow[]>();
  for (const item of publicity) {
    const list = grouped.get(item.iGM_BatchId) ?? [];
    list.push(item);
    grouped.set(item.iGM_BatchId, list);
  }
  // 只为存在公示条目的批次返回（无条目的空批次不展示）
  return {
    batches: batches
      .filter((batch) => (grouped.get(batch.iGM_Id)?.length ?? 0) > 0)
      .map((batch) => ({
        id: batch.iGM_Id,
        batchName: batch.iGM_BatchName,
        quota: batch.iGM_Quota,
        publishedAt: batch.iGM_PublishedAt,
        status: batch.iGM_Status,
        items: (grouped.get(batch.iGM_Id) ?? []).map((item) => ({
          id: item.iGM_Id,
          developerName: item.iGM_DeveloperName,
          uid: item.iGM_Uid,
          projectName: item.iGM_ProjectName,
          approvedAt: item.iGM_ApprovedAt,
        })),
      })),
  };
}

// 模块二十五：管理后台「开发者」分区 —— 开发者账号列表与调用量监测 //

/** 调用量监测支持的时间范围（天） */
export const iGM_CallStatsRanges = [7, 30, 90] as const;

/** 已知通道：后续新增通道只需写事件，未知通道自动并入返回结果 */
const iGM_DefaultChannels = ["api", "sdk", "app"];

/**
 * 已通过开发者账号列表：用户名 / iGMUid / 联系方式 / 申请时间。
 * 数据源为 iGM_DeveloperApplications 中每个用户最近一条 approved 申请。
 */
export async function iGM_ListDeveloperAccountsService(): Promise<{
  items: Array<{
    applicationId: string;
    userId: string;
    username: string;
    displayName: string | null;
    uid: string;
    contact: string;
    projectName: string;
    appliedAt: string;
  }>;
  total: number;
}> {
  const rows = await iGM_ListApprovedDeveloperAccounts();
  return {
    items: rows.map((row) => ({
      applicationId: row.iGM_ApplicationId,
      userId: row.iGM_UserId,
      username: row.iGM_Username,
      displayName: row.iGM_DisplayName,
      uid: row.iGM_Uid,
      contact: row.iGM_Contact,
      projectName: row.iGM_ProjectName,
      appliedAt: row.iGM_AppliedAt,
    })),
    total: rows.length,
  };
}

/** UTC 日期 YYYY-MM-DD */
function iGM_UtcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * 调用量监测：按时间范围返回总量、分通道（api/sdk/app 及扩展通道）、
 * 按日连续序列（无数据补 0）与按应用 Top 20。
 */
export async function iGM_GetDeveloperCallStatsService(daysRaw: number): Promise<{
  days: number;
  total: number;
  channels: Record<string, number>;
  daily: Array<{ date: string } & Record<string, number | string>>;
  topClients: Array<{ clientId: string; count: number }>;
}> {
  const days = (iGM_CallStatsRanges as readonly number[]).includes(daysRaw)
    ? daysRaw
    : 7;
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));
  const sinceIso = since.toISOString();

  const [total, channelRows, dailyRows, clientRows] = await Promise.all([
    iGM_CountCallStatsSince(sinceIso),
    iGM_CountCallStatsByChannel(sinceIso),
    iGM_CountCallStatsDaily(sinceIso),
    iGM_CountCallStatsByClient(sinceIso),
  ]);

  // 通道汇总：默认通道固定返回（无数据为 0），未知扩展通道追加
  const channels: Record<string, number> = {};
  for (const channel of iGM_DefaultChannels) channels[channel] = 0;
  for (const row of channelRows) {
    channels[row.iGM_Channel] = row.iGM_Count;
  }

  // 按日矩阵：以通道行中的全部通道为列，缺失日补 0
  const channelKeys = Object.keys(channels);
  const dailyMap = new Map<string, Record<string, number>>();
  for (const row of dailyRows) {
    const entry = dailyMap.get(row.iGM_Day) ?? {};
    entry[row.iGM_Channel] = row.iGM_Count;
    dailyMap.set(row.iGM_Day, entry);
  }
  const daily: Array<{ date: string } & Record<string, number | string>> = [];
  const cursor = new Date(since);
  for (let index = 0; index < days; index += 1) {
    const date = iGM_UtcDay(cursor);
    const entry = dailyMap.get(date) ?? {};
    const point: { date: string } & Record<string, number | string> = { date };
    for (const channel of channelKeys) {
      point[channel] = entry[channel] ?? 0;
    }
    daily.push(point);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return {
    days,
    total,
    channels,
    daily,
    topClients: clientRows.map((row) => ({
      clientId: row.iGM_ClientId,
      count: row.iGM_Count,
    })),
  };
}

// 导出 //
export default {
  iGM_IsApprovedDeveloper,
  iGM_IsDeveloperReviewer,
  iGM_SubmitDeveloperApplyService,
  iGM_GetMyDeveloperService,
  iGM_ListMyDevelopersService,
  iGM_WithdrawDeveloperApplyService,
  iGM_AdminListDevelopersService,
  iGM_ReviewDeveloperService,
  iGM_PublishDeveloperService,
  iGM_ListDeveloperPublicityService,
  iGM_ListDeveloperAccountsService,
  iGM_GetDeveloperCallStatsService,
};