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
} from "../iGM_Types/iGM_Developer";

// 类型定义 //
// （行类型见 iGM_Types/iGM_Developer.ts）

// 核心逻辑 //
/** 写入一条开发者申请（初始状态 pending，apiKey 为空） */
export async function iGM_InsertDeveloperApplication(params: {
  userId: string;
  projectName: string;
  projectType: string;
  projectDesc: string;
  projectUrl: string | null;
  contact: string;
  expectedQuota: string | null;
  reason: string;
  now: string;
}): Promise<iGM_DeveloperApplicationRow> {
  const row: iGM_DeveloperApplicationRow = {
    iGM_Id: randomUUID(),
    iGM_UserId: params.userId,
    iGM_ProjectName: params.projectName,
    iGM_ProjectType: params.projectType,
    iGM_ProjectDesc: params.projectDesc,
    iGM_ProjectUrl: params.projectUrl,
    iGM_Contact: params.contact,
    iGM_ExpectedQuota: params.expectedQuota,
    iGM_Reason: params.reason,
    iGM_Status: "pending",
    iGM_ReviewerId: null,
    iGM_ReviewComment: null,
    iGM_ApiKey: null,
    iGM_CreatedAt: params.now,
    iGM_UpdatedAt: params.now,
  };
  await iGM_Db.run(
    `INSERT INTO iGM_DeveloperApplications
       (iGM_Id, iGM_UserId, iGM_ProjectName, iGM_ProjectType, iGM_ProjectDesc,
        iGM_ProjectUrl, iGM_Contact, iGM_ExpectedQuota, iGM_Reason, iGM_Status,
        iGM_ReviewerId, iGM_ReviewComment, iGM_ApiKey,
        iGM_CreatedAt, iGM_UpdatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

// 导出 //
export default {
  iGM_InsertDeveloperApplication,
  iGM_FindLatestDeveloperApplicationByUser,
  iGM_ListDeveloperApplicationsByUser,
  iGM_FindDeveloperApplicationById,
  iGM_ListDeveloperApplicationsForAdmin,
  iGM_ReviewDeveloperApplication,
  iGM_WithdrawDeveloperApplication,
};