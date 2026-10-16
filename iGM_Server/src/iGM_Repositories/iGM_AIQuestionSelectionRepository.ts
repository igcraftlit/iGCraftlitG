/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_AIQuestionSelectionRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_ExamHighlight（/api/exam/select-ai-questions 等 4 个接口）
 * 模块：iGM_AIQuestionSelectionRepository
 * 作用：iGM_AIQuestionSelections 表的唯一数据访问出口
 * 内容：候选题写入、按 ID 读取、按试卷列出、状态写入
 * 说明：候选题目在服务层完成评分与归一后写入；状态 candidate → sent 由服务层驱动
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import { iGM_RandomUuid } from "../iGM_Services/iGM_SecurityService";
import type { iGM_AIQuestionSelectionRow } from "../iGM_Types/iGM_AIQuestionSelection";

// 类型定义 //
/** 候选题可写字段集合 */
export interface iGM_SelectionWriteFields {
  examId: string;
  creatorId: string;
  questionIndex: number;
  stem: string;
  type: string;
  options: string;
  answer: string;
  analysis: string;
  qualityScore: number;
  difficultyCoefficient: number;
  difficultyLevel: string;
  reason: string;
  tags: string;
  textbookCode: string;
  textbookName: string;
}

// 核心逻辑 //
/** 写入候选题（固定初始状态 candidate，返回完整数据行） */
export async function iGM_InsertSelection(
  fields: iGM_SelectionWriteFields,
): Promise<iGM_AIQuestionSelectionRow> {
  const row: iGM_AIQuestionSelectionRow = {
    iGM_Id: iGM_RandomUuid(),
    iGM_ExamId: fields.examId,
    iGM_CreatorId: fields.creatorId,
    iGM_QuestionIndex: fields.questionIndex,
    iGM_Stem: fields.stem,
    iGM_Type: fields.type,
    iGM_Options: fields.options,
    iGM_Answer: fields.answer,
    iGM_Analysis: fields.analysis,
    iGM_QualityScore: fields.qualityScore,
    iGM_DifficultyCoefficient: fields.difficultyCoefficient,
    iGM_DifficultyLevel: fields.difficultyLevel,
    iGM_Reason: fields.reason,
    iGM_Tags: fields.tags,
    iGM_TextbookCode: fields.textbookCode,
    iGM_TextbookName: fields.textbookName,
    iGM_Status: "candidate",
    iGM_CreatedAt: new Date().toISOString(),
  };
  await iGM_Db.run(
    `INSERT INTO iGM_AIQuestionSelections
       (iGM_Id, iGM_ExamId, iGM_CreatorId, iGM_QuestionIndex, iGM_Stem,
        iGM_Type, iGM_Options, iGM_Answer, iGM_Analysis, iGM_QualityScore,
        iGM_DifficultyCoefficient, iGM_DifficultyLevel, iGM_Reason, iGM_Tags,
        iGM_TextbookCode, iGM_TextbookName, iGM_Status, iGM_CreatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.iGM_Id,
      row.iGM_ExamId,
      row.iGM_CreatorId,
      row.iGM_QuestionIndex,
      row.iGM_Stem,
      row.iGM_Type,
      row.iGM_Options,
      row.iGM_Answer,
      row.iGM_Analysis,
      row.iGM_QualityScore,
      row.iGM_DifficultyCoefficient,
      row.iGM_DifficultyLevel,
      row.iGM_Reason,
      row.iGM_Tags,
      row.iGM_TextbookCode,
      row.iGM_TextbookName,
      row.iGM_Status,
      row.iGM_CreatedAt,
    ],
  );
  return row;
}

/** 按 ID 读取候选题 */
export async function iGM_FindSelectionById(
  id: string,
): Promise<iGM_AIQuestionSelectionRow | null> {
  return (
    ((await iGM_Db
      .query(`SELECT * FROM iGM_AIQuestionSelections WHERE iGM_Id = ?`)
      .get(id)) as iGM_AIQuestionSelectionRow | undefined) ?? null
  );
}

/** 按试卷列出候选题（质量分倒序） */
export async function iGM_ListSelectionsByExam(
  examId: string,
): Promise<iGM_AIQuestionSelectionRow[]> {
  return (await iGM_Db
    .query(
      `SELECT * FROM iGM_AIQuestionSelections
        WHERE iGM_ExamId = ?
        ORDER BY iGM_QualityScore DESC, iGM_QuestionIndex ASC`,
    )
    .all(examId)) as iGM_AIQuestionSelectionRow[];
}

/** 写入候选题状态 */
export async function iGM_SetSelectionStatus(
  id: string,
  status: string,
): Promise<void> {
  await iGM_Db.run(
    `UPDATE iGM_AIQuestionSelections SET iGM_Status = ? WHERE iGM_Id = ?`,
    [status, id],
  );
}

// 导出 //
export default {
  iGM_InsertSelection,
  iGM_FindSelectionById,
  iGM_ListSelectionsByExam,
  iGM_SetSelectionStatus,
};
