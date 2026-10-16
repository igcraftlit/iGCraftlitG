/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_ExaminerRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_Examiner（/G_Examiner/*）
 * 模块：iGM_ExaminerRepository
 * 作用：iGM_Examiners 命题创作者表的唯一数据访问出口
 * 内容：命题创作者资格读取、写入（分配编号）、撤销
 * 说明：iGM_Examiners 表供命题者编号档案查询（/api/exam/creator/profile）、
 *       撤销资格（/G_Examiner/revoke）与管理端审核通过授予资格使用；
 *       iGM_ExaminerApplications 表由 048 迁移创建，供申请提交（G_Examiner）
 *       与管理端审核列表 / 详情（G_AdminExaminer）使用
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import { iGM_RandomUuid } from "../iGM_Services/iGM_SecurityService";
import type {
  iGM_ExaminerRow,
  iGM_ExaminerApplicationRow,
  iGM_ApplicationStatus,
} from "../iGM_Types/iGM_Examiner";

// 核心逻辑 //
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

// ===== 命题创作者申请 =====

/** 插入一条申请（审核字段在 INSERT 时固定写 NULL，由 Reviewer 路由更新） */
export async function iGM_InsertApplication(params: {
  iGM_UserId: string;
  iGM_RealName: string;
  iGM_Contact: string;
  iGM_Bio: string;
  iGM_Directions: string;
  iGM_PortfolioUrl: string | null;
  iGM_Reason: string;
  iGM_AgreedToRules: boolean;
}): Promise<string> {
  const now = new Date().toISOString();
  const id = iGM_RandomUuid();
  await iGM_Db.run(
    `INSERT INTO iGM_ExaminerApplications
       (iGM_Id, iGM_UserId, iGM_RealName, iGM_Contact, iGM_Bio, iGM_Directions,
        iGM_PortfolioUrl, iGM_Reason, iGM_Status, iGM_ReviewerId, iGM_ReviewComment,
        iGM_CreatedAt, iGM_UpdatedAt, iGM_AgreedToRules)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
    [
      id,
      params.iGM_UserId,
      params.iGM_RealName,
      params.iGM_Contact,
      params.iGM_Bio,
      params.iGM_Directions,
      params.iGM_PortfolioUrl,
      params.iGM_Reason,
      "pending",
      now,
      now,
      params.iGM_AgreedToRules,
    ],
  );
  return id;
}

/** 按用户查最新一条申请（提交状态轮询 + 我的申请状态用） */
export async function iGM_FindLatestApplicationByUser(
  userId: string,
): Promise<iGM_ExaminerApplicationRow | null> {
  return (
    ((await iGM_Db
      .query(
        `SELECT * FROM iGM_ExaminerApplications WHERE iGM_UserId = ? ORDER BY iGM_CreatedAt DESC LIMIT 1`,
      )
      .get(userId)) as iGM_ExaminerApplicationRow | undefined) ?? null
  );
}

/** 按 ID 查申请 */
export async function iGM_FindApplicationById(
  id: string,
): Promise<iGM_ExaminerApplicationRow | null> {
  return (
    ((await iGM_Db
      .query(`SELECT * FROM iGM_ExaminerApplications WHERE iGM_Id = ?`)
      .get(id)) as iGM_ExaminerApplicationRow | undefined) ?? null
  );
}

/** 管理端列出待审核申请 */
export async function iGM_ListPendingApplications(): Promise<
  iGM_ExaminerApplicationRow[]
> {
  return (await iGM_Db
    .query(
      `SELECT * FROM iGM_ExaminerApplications WHERE iGM_Status = 'pending' ORDER BY iGM_CreatedAt ASC`,
    )
    .all()) as iGM_ExaminerApplicationRow[];
}

/** 更新申请状态（审核通过/拒绝） */
export async function iGM_UpdateApplicationStatus(
  id: string,
  status: iGM_ApplicationStatus,
  reviewerId: string,
  reviewComment: string | null,
): Promise<void> {
  const now = new Date().toISOString();
  await iGM_Db.run(
    `UPDATE iGM_ExaminerApplications
       SET iGM_Status = ?, iGM_ReviewerId = ?, iGM_ReviewComment = ?, iGM_UpdatedAt = ?
     WHERE iGM_Id = ?`,
    [status, reviewerId, reviewComment, now, id],
  );
}

/** 申请列表行（关联申请人用户名 / GUID 与审核人用户名） */
export interface iGM_ExaminerApplicationListRow
  extends iGM_ExaminerApplicationRow {
  iGM_ApplicantName: string;
  iGM_ApplicantUid: string;
  iGM_ReviewerName: string | null;
}

/** 申请详情行（附申请人邮箱） */
export interface iGM_ExaminerApplicationDetailRow
  extends iGM_ExaminerApplicationListRow {
  iGM_ApplicantEmail: string;
}

/** 分页列出申请（可按状态筛选，关键词匹配用户名 / 真实姓名 / 联系方式） */
export async function iGM_ListApplications(options: {
  status?: string;
  q?: string;
  page: number;
  pageSize: number;
}): Promise<{ rows: iGM_ExaminerApplicationListRow[]; total: number }> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (options.status) {
    clauses.push("a.iGM_Status = ?");
    params.push(options.status);
  }
  if (options.q) {
    clauses.push(
      "(u.iGM_Username LIKE ? OR a.iGM_RealName LIKE ? OR a.iGM_Contact LIKE ?)",
    );
    const like = `%${options.q}%`;
    params.push(like, like, like);
  }
  const where = clauses.length > 0 ? clauses.join(" AND ") : "TRUE";
  const offset = (options.page - 1) * options.pageSize;

  const rows = (await iGM_Db
    .query(
      `SELECT a.*, u.iGM_Username AS iGM_ApplicantName,
              u.iGM_Uid AS iGM_ApplicantUid,
              r.iGM_Username AS iGM_ReviewerName
         FROM iGM_ExaminerApplications a
         JOIN iGM_Users u ON u.iGM_Id = a.iGM_UserId
         LEFT JOIN iGM_Users r ON r.iGM_Id = a.iGM_ReviewerId
        WHERE ${where}
        ORDER BY a.iGM_CreatedAt DESC, a.iGM_Id DESC
        LIMIT ? OFFSET ?`,
    )
    .all(...params, options.pageSize, offset)) as iGM_ExaminerApplicationListRow[];

  const totalRow = (await iGM_Db
    .query(
      `SELECT COUNT(*) AS iGM_Count
         FROM iGM_ExaminerApplications a
         JOIN iGM_Users u ON u.iGM_Id = a.iGM_UserId
        WHERE ${where}`,
    )
    .get(...params)) as { iGM_Count: number } | undefined;

  return { rows, total: totalRow?.iGM_Count ?? 0 };
}

/** 按 ID 读取申请详情（含申请人邮箱与审核人用户名） */
export async function iGM_FindApplicationDetailById(
  id: string,
): Promise<iGM_ExaminerApplicationDetailRow | null> {
  return (
    ((await iGM_Db
      .query(
        `SELECT a.*, u.iGM_Username AS iGM_ApplicantName,
                u.iGM_Uid AS iGM_ApplicantUid,
                u.iGM_Email AS iGM_ApplicantEmail,
                r.iGM_Username AS iGM_ReviewerName
           FROM iGM_ExaminerApplications a
           JOIN iGM_Users u ON u.iGM_Id = a.iGM_UserId
           LEFT JOIN iGM_Users r ON r.iGM_Id = a.iGM_ReviewerId
          WHERE a.iGM_Id = ?`,
      )
      .get(id)) as iGM_ExaminerApplicationDetailRow | undefined) ?? null
  );
}

// 导出 //
export default {
  iGM_FindExaminerByUser,
  iGM_UpsertExaminer,
  iGM_RemoveExaminer,
  iGM_ListExaminers,
};
