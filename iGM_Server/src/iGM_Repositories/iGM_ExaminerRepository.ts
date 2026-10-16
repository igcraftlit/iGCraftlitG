/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_ExaminerRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_Examiner（/G_Examiner/*）
 * 模块：iGM_ExaminerRepository
 * 作用：iGM_Examiners 命题创作者表的唯一数据访问出口
 * 内容：命题创作者资格读取、写入（分配编号）、撤销
 * 说明：iGM_Examiners 表保留，供命题者编号档案查询（/api/exam/creator/profile）
 *       与撤销资格（/G_Examiner/revoke）使用；
 *       命题创作者申请与命题方预设模块已于 047 迁移移除
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

// 导出 //
export default {
  iGM_FindExaminerByUser,
  iGM_UpsertExaminer,
  iGM_RemoveExaminer,
  iGM_ListExaminers,
};
