/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_DeveloperRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_Developer
 * 模块：iGM_DeveloperRepository
 * 作用：iGM_DeveloperApplications 表的唯一数据访问出口
 * 内容：写入申请、按用户查询申请记录、按主键查询、撤回申请、
 *       管理端分页列表与状态审核更新
 * 说明：模块十六暂不写入 API Key（保持 NULL），发放逻辑留待后续模块
 */

// 导入依赖 //
import { randomUUID } from "node:crypto";
import { iGM_Db } from "../iGM_Database/iGM_Database";
import type {
  iGM_DeveloperApplicationAdminRow,
  iGM_DeveloperApplicationRow,
  iGM_DeveloperBatchRow,
  iGM_DeveloperPublicityRow,
} from "../iGM_Types/iGM_Developer";

// 类型定义 //
// （行类型见 iGM_Types/iGM_Developer.ts）

// 核心逻辑 //
/** 写入一条开发者申请（初始状态 pending，apiKey 为空） */
export async function iGM_InsertDeveloperApplication(params: {
  userId: string;
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
  now: string;
}): Promise<iGM_DeveloperApplicationRow> {
  const row: iGM_DeveloperApplicationRow = {
    iGM_Id: randomUUID(),
    iGM_UserId: params.userId,
    iGM_ProjectName: params.projectName,
    // 规范化后的申请不再区分项目类型，统一按 other 落库以兼容管理端展示
    iGM_ProjectType: "other",
    iGM_ProjectDesc: params.projectIntro,
    iGM_ProjectUrl: params.domain ? `https://${params.domain}` : null,
    iGM_Contact: params.contact,
    iGM_ExpectedQuota: null,
    iGM_Reason: params.reason,
    iGM_Status: "pending",
    iGM_ReviewerId: null,
    iGM_ReviewComment: null,
    iGM_ApiKey: null,
    iGM_DeveloperName: params.developerName,
    iGM_Age: params.age,
    iGM_BirthMonth: params.birthMonth,
    iGM_BirthDay: params.birthDay,
    iGM_ContactEmail: params.contactEmail,
    iGM_ContactPhone: params.contactPhone,
    iGM_Country: params.country,
    iGM_Province: params.province,
    iGM_City: params.city,
    iGM_Address: params.address,
    iGM_PostalCode: params.postalCode,
    iGM_Domain: params.domain,
    iGM_Additional: params.additional,
    iGM_BatchId: null,
    iGM_CreatedAt: params.now,
    iGM_UpdatedAt: params.now,
  };
  await iGM_Db.run(
    `INSERT INTO iGM_DeveloperApplications
       (iGM_Id, iGM_UserId, iGM_ProjectName, iGM_ProjectType, iGM_ProjectDesc,
        iGM_ProjectUrl, iGM_Contact, iGM_ExpectedQuota, iGM_Reason, iGM_Status,
        iGM_ReviewerId, iGM_ReviewComment, iGM_ApiKey,
        iGM_DeveloperName, iGM_Age, iGM_BirthMonth, iGM_BirthDay,
        iGM_ContactEmail, iGM_ContactPhone, iGM_Country, iGM_Province, iGM_City,
        iGM_Address, iGM_PostalCode, iGM_Domain, iGM_Additional, iGM_BatchId,
        iGM_CreatedAt, iGM_UpdatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
             ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.iGM_Id,
      row.iGM_UserId,
      row.iGM_ProjectName,
      row.iGM_ProjectType,
      row.iGM_ProjectDesc,
      row.iGM_ProjectUrl,
      row.iGM_Contact,
      row.iGM_ExpectedQuota,
      row.iGM_Reason,
      row.iGM_Status,
      row.iGM_ReviewerId,
      row.iGM_ReviewComment,
      row.iGM_ApiKey,
      row.iGM_DeveloperName,
      row.iGM_Age,
      row.iGM_BirthMonth,
      row.iGM_BirthDay,
      row.iGM_ContactEmail,
      row.iGM_ContactPhone,
      row.iGM_Country,
      row.iGM_Province,
      row.iGM_City,
      row.iGM_Address,
      row.iGM_PostalCode,
      row.iGM_Domain,
      row.iGM_Additional,
      row.iGM_BatchId,
      row.iGM_CreatedAt,
      row.iGM_UpdatedAt,
    ],
  );
  return row;
}

/** 用户最近一条开发者申请（不存在返回 null） */
export async function iGM_FindLatestDeveloperApplicationByUser(
  userId: string,
): Promise<iGM_DeveloperApplicationRow | null> {
  return (
    ((await iGM_Db.query(
      `SELECT * FROM iGM_DeveloperApplications
       WHERE iGM_UserId = ? ORDER BY iGM_CreatedAt DESC LIMIT 1`,
    ).get(userId)) as iGM_DeveloperApplicationRow | undefined) ?? null
  );
}

/** 用户全部开发者申请记录（按时间倒序） */
export async function iGM_ListDeveloperApplicationsByUser(
  userId: string,
): Promise<iGM_DeveloperApplicationRow[]> {
  return (await iGM_Db.query(
    `SELECT * FROM iGM_DeveloperApplications
     WHERE iGM_UserId = ? ORDER BY iGM_CreatedAt DESC`,
  ).all(userId)) as iGM_DeveloperApplicationRow[];
}

/** 按主键查询开发者申请 */
export async function iGM_FindDeveloperApplicationById(
  id: string,
): Promise<iGM_DeveloperApplicationRow | null> {
  return (
    ((await iGM_Db.query(`SELECT * FROM iGM_DeveloperApplications WHERE iGM_Id = ?`)
      .get(id)) as iGM_DeveloperApplicationRow | undefined) ?? null
  );
}

/** 管理端分页查询开发者申请（可按状态筛选，连申请人用户名与昵称） */
export async function iGM_ListDeveloperApplicationsForAdmin(params: {
  status: string | null;
  limit: number;
  offset: number;
}): Promise<{ items: iGM_DeveloperApplicationAdminRow[]; total: number }> {
  const where = params.status ? `WHERE d.iGM_Status = ?` : "";
  const args: Array<string | number> = params.status ? [params.status] : [];
  const total = (
    (await iGM_Db.query(
      `SELECT COUNT(*) AS total FROM iGM_DeveloperApplications d ${where}`,
    ).get(...args)) as { total: number }
  ).total;
  const items = (await iGM_Db.query(
    `SELECT d.*, u.iGM_Username, u.iGM_DisplayName
     FROM iGM_DeveloperApplications d
     JOIN iGM_Users u ON u.iGM_Id = d.iGM_UserId
     ${where}
     ORDER BY d.iGM_CreatedAt DESC
     LIMIT ? OFFSET ?`,
  ).all(...args, params.limit, params.offset)) as iGM_DeveloperApplicationAdminRow[];
  return { items, total };
}

/** 审核开发者申请：仅待审核（pending）可被审核，写入审核人、意见与时间 */
export async function iGM_ReviewDeveloperApplication(params: {
  id: string;
  status: string;
  reviewerId: string;
  reviewComment: string | null;
  now: string;
}): Promise<boolean> {
  const result = await iGM_Db.run(
    `UPDATE iGM_DeveloperApplications
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

/** 撤回本人待审核申请：仅 pending 且属于本人时可撤回 */
export async function iGM_WithdrawDeveloperApplication(params: {
  id: string;
  userId: string;
  now: string;
}): Promise<boolean> {
  const result = await iGM_Db.run(
    `UPDATE iGM_DeveloperApplications
     SET iGM_Status = 'withdrawn', iGM_UpdatedAt = ?
     WHERE iGM_Id = ? AND iGM_UserId = ? AND iGM_Status = 'pending'`,
    [params.now, params.id, params.userId],
  );
  return result.changes > 0;
}

// 模块二十六：开发者批次与公示
/** 按批次名查询批次（不存在返回 null） */
export async function iGM_FindDeveloperBatchByName(
  batchName: string,
): Promise<iGM_DeveloperBatchRow | null> {
  return (
    ((await iGM_Db.query(
      `SELECT * FROM iGM_DeveloperBatches WHERE iGM_BatchName = ? LIMIT 1`,
    ).get(batchName)) as iGM_DeveloperBatchRow | undefined) ?? null
  );
}

/** 写入一个批次 */
export async function iGM_InsertDeveloperBatch(params: {
  batchName: string;
  quota: number;
  publishedAt: string | null;
  status: string;
  now: string;
}): Promise<iGM_DeveloperBatchRow> {
  const row: iGM_DeveloperBatchRow = {
    iGM_Id: randomUUID(),
    iGM_BatchName: params.batchName,
    iGM_Quota: params.quota,
    iGM_PublishedAt: params.publishedAt,
    iGM_Status: params.status,
    iGM_CreatedAt: params.now,
  };
  await iGM_Db.run(
    `INSERT INTO iGM_DeveloperBatches
       (iGM_Id, iGM_BatchName, iGM_Quota, iGM_PublishedAt, iGM_Status, iGM_CreatedAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      row.iGM_Id,
      row.iGM_BatchName,
      row.iGM_Quota,
      row.iGM_PublishedAt,
      row.iGM_Status,
      row.iGM_CreatedAt,
    ],
  );
  return row;
}

/** 更新申请所属批次 */
export async function iGM_UpdateDeveloperApplicationBatch(params: {
  id: string;
  batchId: string;
  now: string;
}): Promise<void> {
  await iGM_Db.run(
    `UPDATE iGM_DeveloperApplications
     SET iGM_BatchId = ?, iGM_UpdatedAt = ?
     WHERE iGM_Id = ?`,
    [params.batchId, params.now, params.id],
  );
}

/** 按申请 id 查询公示条目（已公示返回行） */
export async function iGM_FindDeveloperPublicityByApplication(
  applicationId: string,
): Promise<iGM_DeveloperPublicityRow | null> {
  return (
    ((await iGM_Db.query(
      `SELECT p.*, u.iGM_Uid
       FROM iGM_DeveloperPublicity p
       LEFT JOIN iGM_Users u ON u.iGM_Id = p.iGM_UserId
       WHERE p.iGM_ApplicationId = ? LIMIT 1`,
    ).get(applicationId)) as iGM_DeveloperPublicityRow | undefined) ?? null
  );
}

/** 写入一条公示条目 */
export async function iGM_InsertDeveloperPublicity(params: {
  batchId: string;
  applicationId: string;
  userId: string;
  developerName: string;
  projectName: string;
  approvedAt: string;
}): Promise<void> {
  await iGM_Db.run(
    `INSERT INTO iGM_DeveloperPublicity
       (iGM_Id, iGM_BatchId, iGM_ApplicationId, iGM_UserId,
        iGM_DeveloperName, iGM_ProjectName, iGM_ApprovedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      params.batchId,
      params.applicationId,
      params.userId,
      params.developerName,
      params.projectName,
      params.approvedAt,
    ],
  );
}

/** 全部批次（按创建时间倒序，最新批次置顶） */
export async function iGM_ListDeveloperBatches(): Promise<iGM_DeveloperBatchRow[]> {
  return (await iGM_Db.query(
    `SELECT * FROM iGM_DeveloperBatches ORDER BY iGM_CreatedAt DESC`,
  ).all()) as iGM_DeveloperBatchRow[];
}

/** 全部公示条目（连表带出社区 iGMUid，按通过时间倒序） */
export async function iGM_ListDeveloperPublicity(): Promise<
  iGM_DeveloperPublicityRow[]
> {
  return (await iGM_Db.query(
    `SELECT p.*, u.iGM_Uid
     FROM iGM_DeveloperPublicity p
     LEFT JOIN iGM_Users u ON u.iGM_Id = p.iGM_UserId
     ORDER BY p.iGM_ApprovedAt DESC`,
  ).all()) as iGM_DeveloperPublicityRow[];
}

// 导出 //
export default {
  iGM_InsertDeveloperApplication,
  iGM_FindLatestDeveloperApplicationByUser,
  iGM_ListDeveloperApplicationsByUser,
  iGM_FindDeveloperApplicationById,
  iGM_ListDeveloperApplicationsForAdmin,
  iGM_ReviewDeveloperApplication,
  iGM_WithdrawDeveloperApplication,
  iGM_FindDeveloperBatchByName,
  iGM_InsertDeveloperBatch,
  iGM_UpdateDeveloperApplicationBatch,
  iGM_FindDeveloperPublicityByApplication,
  iGM_InsertDeveloperPublicity,
  iGM_ListDeveloperBatches,
  iGM_ListDeveloperPublicity,
};
