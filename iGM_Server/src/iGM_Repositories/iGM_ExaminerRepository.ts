/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_ExaminerRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_Examiner（/G_Examiner/*）
 * 模块：iGM_ExaminerRepository
 * 作用：iGM_ExaminerApplications 与 iGM_Examiners 两张表的唯一数据访问出口
 * 内容：申请写入与查询（按用户 / 按状态）、审核结果写回、创作者资格写入（分配编号）与撤销
 * 说明：命题创作者资格仅在审核通过后写入 iGM_Examiners；
 *       资格行携带专属命题者编号 iGM_CreatorNumber（10 位零填充），
 *       申请状态流转：pending → approved / rejected
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import { iGM_RandomUuid } from "../iGM_Services/iGM_SecurityService";
import type {
  iGM_ExaminerApplicationRow,
  iGM_ExaminerRow,
} from "../iGM_Types/iGM_Examiner";

// 类型定义 //
/** 审核列表行：申请 + 申请人展示信息 */
export interface iGM_ExaminerApplicationViewRow
  extends iGM_ExaminerApplicationRow {
  iGM_ApplicantName: string | null;
  iGM_ApplicantUid: string | null;
  iGM_ApplicantEmail: string | null;
}

// 核心逻辑 //
/** 写入命题创作者申请（状态固定 pending） */
export async function iGM_InsertExaminerApplication(input: {
  userId: string;
  realName: string;
  contact: string;
  bio: string;
  directions: string;
  portfolioUrl: string | null;
  reason: string;
}): Promise<iGM_ExaminerApplicationRow> {
  const now = new Date().toISOString();
  const row: iGM_ExaminerApplicationRow = {
    iGM_Id: iGM_RandomUuid(),
    iGM_UserId: input.userId,
    iGM_RealName: input.realName,
    iGM_Contact: input.contact,
    iGM_Bio: input.bio,
    iGM_Directions: input.directions,
    iGM_PortfolioUrl: input.portfolioUrl,
    iGM_Reason: input.reason,
    iGM_Status: "pending",
    iGM_ReviewerId: null,
    iGM_ReviewComment: null,
    iGM_CreatedAt: now,
    iGM_UpdatedAt: now,
  };
  await iGM_Db.run(
    `INSERT INTO iGM_ExaminerApplications
       (iGM_Id, iGM_UserId, iGM_RealName, iGM_Contact, iGM_Bio,
        iGM_Directions, iGM_PortfolioUrl, iGM_Reason, iGM_Status,
        iGM_ReviewerId, iGM_ReviewComment, iGM_CreatedAt, iGM_UpdatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
    [
      row.iGM_Id,
      row.iGM_UserId,
      row.iGM_RealName,
      row.iGM_Contact,
      row.iGM_Bio,
      row.iGM_Directions,
      row.iGM_PortfolioUrl,
      row.iGM_Reason,
      row.iGM_Status,
      row.iGM_CreatedAt,
      row.iGM_UpdatedAt,
    ],
  );
  return row;
}

/** 读取用户最近一次申请 */
export async function iGM_FindLatestApplicationByUser(
  userId: string,
): Promise<iGM_ExaminerApplicationRow | null> {
  return (
    ((await iGM_Db
      .query(
        `SELECT * FROM iGM_ExaminerApplications
          WHERE iGM_UserId = ?
          ORDER BY iGM_CreatedAt DESC LIMIT 1`,
      )
      .get(userId)) as iGM_ExaminerApplicationRow | undefined) ?? null
  );
}

/** 读取用户全部申请（时间倒序） */
export async function iGM_ListApplicationsByUser(
  userId: string,
): Promise<iGM_ExaminerApplicationRow[]> {
  return (await iGM_Db
    .query(
      `SELECT * FROM iGM_ExaminerApplications
        WHERE iGM_UserId = ?
        ORDER BY iGM_CreatedAt DESC`,
    )
    .all(userId)) as iGM_ExaminerApplicationRow[];
}

/** 按 ID 读取申请 */
export async function iGM_FindApplicationById(
  applicationId: string,
): Promise<iGM_ExaminerApplicationRow | null> {
  return (
    ((await iGM_Db
      .query(`SELECT * FROM iGM_ExaminerApplications WHERE iGM_Id = ?`)
      .get(applicationId)) as iGM_ExaminerApplicationRow | undefined) ?? null
  );
}

/** 按状态列出申请（管理端审核列表，附带申请人展示信息） */
export async function iGM_ListApplicationsByStatus(
  status: string,
  limit: number,
  offset: number,
): Promise<iGM_ExaminerApplicationViewRow[]> {
  return (await iGM_Db
    .query(
      `SELECT a.*,
              COALESCE(u.iGM_DisplayName, u.iGM_Username) AS iGM_ApplicantName,
              u.iGM_Uid   AS iGM_ApplicantUid,
              u.iGM_Email AS iGM_ApplicantEmail
         FROM iGM_ExaminerApplications a
         LEFT JOIN iGM_Users u ON u.iGM_Id = a.iGM_UserId
        WHERE a.iGM_Status = ?
        ORDER BY a.iGM_CreatedAt DESC, a.iGM_Id DESC
        LIMIT ? OFFSET ?`,
    )
    .all(status, limit, offset)) as iGM_ExaminerApplicationViewRow[];
}

/** 统计某状态的申请数量 */
export async function iGM_CountApplicationsByStatus(
  status: string,
): Promise<number> {
  const row = (await iGM_Db
    .query(
      `SELECT COUNT(*) AS iGM_Count FROM iGM_ExaminerApplications WHERE iGM_Status = ?`,
    )
    .get(status)) as { iGM_Count: number } | undefined;
  return row?.iGM_Count ?? 0;
}

/** 写回审核结果（通过 / 拒绝 + 意见） */
export async function iGM_UpdateApplicationReview(
  applicationId: string,
  status: string,
  reviewerId: string,
  comment: string | null,
): Promise<void> {
  await iGM_Db.run(
    `UPDATE iGM_ExaminerApplications SET
       iGM_Status = ?, iGM_ReviewerId = ?, iGM_ReviewComment = ?, iGM_UpdatedAt = ?
     WHERE iGM_Id = ?`,
    [status, reviewerId, comment, new Date().toISOString(), applicationId],
  );
}

/** 读取命题创作者行 */
export async function iGM_FindExaminerByUser(
  userId: string,
): Promise<iGM_ExaminerRow | null> {
  return (
    ((await iGM_Db
      .query(`SELECT * FROM iGM_Examiners WHERE iGM_UserId = ?`)
      .get(userId)) as iGM_ExaminerRow | undefined) ?? null
  );
}

/** 授予命题创作者资格（已存在则更新为 active 并保留原编号；新建时分配下一个编号） */
export async function iGM_UpsertExaminer(
  userId: string,
  status = "active",
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await iGM_FindExaminerByUser(userId);
  if (existing) {
    await iGM_Db.run(
      `UPDATE iGM_Examiners SET iGM_Status = ?, iGM_UpdatedAt = ? WHERE iGM_UserId = ?`,
      [status, now, userId],
    );
    return;
  }
  await iGM_Db.run(
    `INSERT INTO iGM_Examiners
       (iGM_Id, iGM_UserId, iGM_Status, iGM_ApprovedAt, iGM_CreatedAt, iGM_UpdatedAt,
        iGM_CreatorNumber)
     VALUES (
       ?, ?, ?, ?, ?, ?,
       -- 顺序编号：接续现有最大编号 +1，零填充至 10 位
       (SELECT LPAD((COALESCE(MAX(iGM_CreatorNumber::int), 0) + 1)::text, 10, '0')
          FROM iGM_Examiners)
     )`,
    [iGM_RandomUuid(), userId, status, now, now, now],
  );
}

/** 撤销命题创作者资格 */
export async function iGM_RemoveExaminer(userId: string): Promise<void> {
  await iGM_Db.run(`DELETE FROM iGM_Examiners WHERE iGM_UserId = ?`, [userId]);
}

/** 列出全部命题创作者（管理端概览） */
export async function iGM_ListExaminers(): Promise<iGM_ExaminerRow[]> {
  return (await iGM_Db
    .query(`SELECT * FROM iGM_Examiners ORDER BY iGM_ApprovedAt DESC`)
    .all()) as iGM_ExaminerRow[];
}

// 导出 //
export default {
  iGM_InsertExaminerApplication,
  iGM_FindLatestApplicationByUser,
  iGM_ListApplicationsByUser,
  iGM_FindApplicationById,
  iGM_ListApplicationsByStatus,
  iGM_CountApplicationsByStatus,
  iGM_UpdateApplicationReview,
  iGM_FindExaminerByUser,
  iGM_UpsertExaminer,
  iGM_RemoveExaminer,
  iGM_ListExaminers,
};
