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
import type { iGM_ExaminerRow } from "../iGM_Types/iGM_Examiner";

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

// 导出 //
export default {
  iGM_FindExaminerByUser,
  iGM_UpsertExaminer,
  iGM_RemoveExaminer,
  iGM_ListExaminers,
};
