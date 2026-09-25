/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_OrgVerifyRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_OrgVerify、G_Admin
 * 模块：iGM_OrgVerifyRepository
 * 作用：iGM_Organizations 与 iGM_OrgVerifications 表的唯一数据访问出口
 * 内容：受信任组织查询（含内存缓存）、申请创建/查询/状态更新、
 *       管理端申请分页联表查询、用户认证组织字段读写
 */

// 导入依赖 //
import { randomUUID } from "node:crypto";
import { iGM_Db } from "../iGM_Database/iGM_Database";
import type {
  iGM_OrgBadgeDto,
  iGM_OrganizationRow,
  iGM_OrgVerificationRow,
  iGM_OrgVerifyStatus,
} from "../iGM_Types/iGM_OrgVerify";
import { iGM_ToOrgBadge } from "../iGM_Types/iGM_OrgVerify";

// 类型定义 //
/** 创建申请所需字段 */
export interface iGM_CreateVerificationParams {
  userId: string;
  orgId: string;
  reason: string;
  proof: string | null;
  now: string;
}

/** 管理端申请列表行（申请行 + 申请人/审核人信息） */
export interface iGM_AdminVerificationListRow extends iGM_OrgVerificationRow {
  iGM_Username: string;
  iGM_UserDisplayName: string | null;
  iGM_UserAvatar: string | null;
  iGM_UserEmail: string;
  iGM_ReviewerName: string | null;
}

// 核心逻辑 //
/* ---------- 组织查询 ---------- */

/** 组织徽标内存缓存条目：徽标 DTO + 负责人邮箱（owner 金标判定） */
interface iGM_OrgBadgeCacheEntry {
  badge: iGM_OrgBadgeDto;
  ownerEmail: string | null;
}

/** 组织徽标内存缓存：组织数据仅迁移种子写入，进程内不变 */
let iGM_OrgBadgeCache: Map<string, iGM_OrgBadgeCacheEntry> | null = null;

/** 加载组织徽标缓存（组织 id → 徽标 + 负责人邮箱） */
function iGM_LoadOrgBadgeCache(): Map<string, iGM_OrgBadgeCacheEntry> {
  const rows = iGM_Db
    .query(`SELECT * FROM iGM_Organizations`)
    .all() as iGM_OrganizationRow[];
  return new Map(
    rows.map((row) => [
      row.iGM_Id,
      { badge: iGM_ToOrgBadge(row), ownerEmail: row.iGM_OwnerEmail },
    ]),
  );
}

/** 读取缓存条目（懒加载） */
function iGM_GetOrgBadgeEntry(
  orgId: string,
): iGM_OrgBadgeCacheEntry | null {
  if (!iGM_OrgBadgeCache) {
    iGM_OrgBadgeCache = iGM_LoadOrgBadgeCache();
  }
  return iGM_OrgBadgeCache.get(orgId) ?? null;
}

/** 按组织 id 解析徽标 DTO（不存在返回 null）；供组织自身等非用户场景调用 */
export function iGM_ResolveOrgBadge(orgId: string | null): iGM_OrgBadgeDto | null {
  if (!orgId) return null;
  return iGM_GetOrgBadgeEntry(orgId)?.badge ?? null;
}

/**
 * 按用户解析认证组织徽标 DTO（模块七第三轮统一出口）。
 * 用户邮箱与组织负责人邮箱匹配（大小写不敏感）时附带 isOwner=true，
 * 前端据此渲染所有者金标，且负责人不可退出组织。
 */
export function iGM_ResolveUserOrgBadge(
  orgId: string | null,
  email: string | null | undefined,
): iGM_OrgBadgeDto | null {
  if (!orgId) return null;
  const entry = iGM_GetOrgBadgeEntry(orgId);
  if (!entry) return null;
  const isOwner =
    !!email &&
    !!entry.ownerEmail &&
    entry.ownerEmail.trim().toLowerCase() === email.trim().toLowerCase();
  return { ...entry.badge, isOwner };
}

/** 受信任组织列表（申请页可选卡片） */
export function iGM_ListTrustedOrganizations(): iGM_OrganizationRow[] {
  return iGM_Db
    .query(
      `SELECT * FROM iGM_Organizations
       WHERE iGM_IsTrusted = 1
       ORDER BY iGM_Name COLLATE NOCASE`,
    )
    .all() as iGM_OrganizationRow[];
}

/** 按主键查询组织 */
export function iGM_FindOrganizationById(
  id: string,
): iGM_OrganizationRow | null {
  return (
    (iGM_Db
      .query(`SELECT * FROM iGM_Organizations WHERE iGM_Id = ?`)
      .get(id) as iGM_OrganizationRow | undefined) ?? null
  );
}

/** 按 slug 查询组织（组织详情页公开入口） */
export function iGM_FindOrganizationBySlug(
  slug: string,
): iGM_OrganizationRow | null {
  return (
    (iGM_Db
      .query(`SELECT * FROM iGM_Organizations WHERE iGM_Slug = ? COLLATE NOCASE`)
      .get(slug) as iGM_OrganizationRow | undefined) ?? null
  );
}

/**
 * 按负责人邮箱查询其负责的受信任组织（模块七增强）
 * 组织负责人：iGM_OwnerEmail 与用户邮箱匹配（大小写不敏感）
 */
export function iGM_FindOrganizationByOwnerEmail(
  email: string,
): iGM_OrganizationRow | null {
  const trimmed = email.trim();
  if (!trimmed) return null;
  return (
    (iGM_Db
      .query(
        `SELECT * FROM iGM_Organizations
         WHERE iGM_IsTrusted = 1
           AND iGM_OwnerEmail IS NOT NULL
           AND iGM_OwnerEmail = ? COLLATE NOCASE
         LIMIT 1`,
      )
      .get(trimmed) as iGM_OrganizationRow | undefined) ?? null
  );
}

/** 更新“关于组织”内容（仅负责人），返回是否生效 */
export function iGM_UpdateOrganizationAbout(
  orgId: string,
  aboutContent: string,
): boolean {
  const result = iGM_Db.run(
    `UPDATE iGM_Organizations
       SET iGM_AboutContent = ?
     WHERE iGM_Id = ?`,
    [aboutContent, orgId],
  );
  return result.changes > 0;
}

/* ---------- 申请读写 ---------- */

/** 创建组织认证申请 */
export function iGM_InsertVerification(
  params: iGM_CreateVerificationParams,
): iGM_OrgVerificationRow {
  const id = randomUUID();
  iGM_Db.run(
    `INSERT INTO iGM_OrgVerifications
       (iGM_Id, iGM_UserId, iGM_OrgId, iGM_Reason, iGM_Proof,
        iGM_Status, iGM_ReviewerId, iGM_ReviewComment, iGM_CreatedAt, iGM_UpdatedAt)
     VALUES (?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, ?)`,
    [
      id,
      params.userId,
      params.orgId,
      params.reason,
      params.proof,
      params.now,
      params.now,
    ],
  );
  const row = iGM_FindVerificationById(id);
  if (!row) throw new Error("iGM_InsertVerification：创建后查询申请失败");
  return row;
}

/** 按主键查询申请 */
export function iGM_FindVerificationById(
  id: string,
): iGM_OrgVerificationRow | null {
  return (
    (iGM_Db
      .query(`SELECT * FROM iGM_OrgVerifications WHERE iGM_Id = ?`)
      .get(id) as iGM_OrgVerificationRow | undefined) ?? null
  );
}

/** 查询用户当前待审核申请（同一用户同一时间最多一条 pending） */
export function iGM_FindPendingVerificationByUser(
  userId: string,
): iGM_OrgVerificationRow | null {
  return (
    (iGM_Db
      .query(
        `SELECT * FROM iGM_OrgVerifications
         WHERE iGM_UserId = ? AND iGM_Status = 'pending'
         ORDER BY iGM_CreatedAt DESC
         LIMIT 1`,
      )
      .get(userId) as iGM_OrgVerificationRow | undefined) ?? null
  );
}

/** 用户自己的申请历史（按创建时间倒序） */
export function iGM_ListVerificationsByUser(
  userId: string,
): iGM_OrgVerificationRow[] {
  return iGM_Db
    .query(
      `SELECT * FROM iGM_OrgVerifications
       WHERE iGM_UserId = ?
       ORDER BY iGM_CreatedAt DESC`,
    )
    .all(userId) as iGM_OrgVerificationRow[];
}

/**
 * 更新申请状态（审核/取消共用入口）
 * 仅当当前状态为 pending 时才更新，返回是否生效，防止并发重复审核
 */
export function iGM_UpdateVerificationStatus(params: {
  id: string;
  status: iGM_OrgVerifyStatus;
  reviewerId: string | null;
  reviewComment: string | null;
  now: string;
}): boolean {
  const result = iGM_Db.run(
    `UPDATE iGM_OrgVerifications
       SET iGM_Status = ?, iGM_ReviewerId = ?, iGM_ReviewComment = ?, iGM_UpdatedAt = ?
     WHERE iGM_Id = ? AND iGM_Status = 'pending'`,
    [
      params.status,
      params.reviewerId,
      params.reviewComment,
      params.now,
      params.id,
    ],
  );
  return result.changes > 0;
}

/**
 * 管理端申请分页：状态筛选 + 组织筛选 + 申请人/审核人联表
 * @param orgId 非空时仅返回该组织的申请（负责人视图强制传入）
 */
export function iGM_ListVerificationsForAdmin(
  status: iGM_OrgVerifyStatus | null,
  orgId: string | null,
  page: number,
  pageSize: number,
): { items: iGM_AdminVerificationListRow[]; total: number } {
  const clauses: string[] = [];
  const args: string[] = [];
  if (status) {
    clauses.push("v.iGM_Status = ?");
    args.push(status);
  }
  if (orgId) {
    clauses.push("v.iGM_OrgId = ?");
    args.push(orgId);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ``;
  const total = (
    iGM_Db
      .query(
        `SELECT COUNT(*) AS total FROM iGM_OrgVerifications v ${where}`,
      )
      .get(...args) as { total: number }
  ).total;
  const items = iGM_Db
    .query(
      `SELECT v.*, u.iGM_Username, u.iGM_DisplayName AS iGM_UserDisplayName,
              u.iGM_Avatar AS iGM_UserAvatar, u.iGM_Email AS iGM_UserEmail,
              r.iGM_Username AS iGM_ReviewerName
       FROM iGM_OrgVerifications v
       JOIN iGM_Users u ON u.iGM_Id = v.iGM_UserId
       LEFT JOIN iGM_Users r ON r.iGM_Id = v.iGM_ReviewerId
       ${where}
       ORDER BY v.iGM_CreatedAt DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...args, pageSize, (page - 1) * pageSize) as iGM_AdminVerificationListRow[];
  return { items, total };
}

/** 插入一条“已退出组织”历史记录（退出组织时留痕，展示在申请记录页） */
export function iGM_InsertLeaveRecord(params: {
  userId: string;
  orgId: string;
  reason: string | null;
  now: string;
}): iGM_OrgVerificationRow {
  const id = randomUUID();
  iGM_Db.run(
    `INSERT INTO iGM_OrgVerifications
       (iGM_Id, iGM_UserId, iGM_OrgId, iGM_Reason, iGM_Proof,
        iGM_Status, iGM_ReviewerId, iGM_ReviewComment, iGM_CreatedAt, iGM_UpdatedAt)
     VALUES (?, ?, ?, ?, NULL, 'left', NULL, NULL, ?, ?)`,
    [
      id,
      params.userId,
      params.orgId,
      params.reason ?? "",
      params.now,
      params.now,
    ],
  );
  const row = iGM_FindVerificationById(id);
  if (!row) throw new Error("iGM_InsertLeaveRecord：创建后查询退出记录失败");
  return row;
}

/* ---------- 用户认证字段 ---------- */

/** 写入/清除用户认证组织（审核通过时写入），并刷新 updatedAt */
export function iGM_SetUserVerifiedOrg(
  userId: string,
  orgId: string | null,
  now: string,
): boolean {
  const result = iGM_Db.run(
    `UPDATE iGM_Users
       SET iGM_VerifiedOrgId = ?, iGM_UpdatedAt = ?
     WHERE iGM_Id = ?`,
    [orgId, now, userId],
  );
  return result.changes > 0;
}

// 导出 //
export default {
  iGM_ResolveOrgBadge,
  iGM_ResolveUserOrgBadge,
  iGM_ListTrustedOrganizations,
  iGM_FindOrganizationById,
  iGM_FindOrganizationBySlug,
  iGM_FindOrganizationByOwnerEmail,
  iGM_UpdateOrganizationAbout,
  iGM_InsertVerification,
  iGM_InsertLeaveRecord,
  iGM_FindVerificationById,
  iGM_FindPendingVerificationByUser,
  iGM_ListVerificationsByUser,
  iGM_UpdateVerificationStatus,
  iGM_ListVerificationsForAdmin,
  iGM_SetUserVerifiedOrg,
};
