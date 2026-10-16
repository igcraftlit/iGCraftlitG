/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_QuestionRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_Question（/api/question/*）
 * 模块：iGM_QuestionRepository
 * 作用：iGM_QuestionBank 表的唯一数据访问出口
 * 内容：题目写入 / 更新 / 删除、按 ID 读取、状态写入、已发布题目列表、
 *       按创建者分页列表、公开题库分页筛选
 * 说明：难度系数、难度等级、教材名称、标签等均由服务层组装后写入；
 *       列表查询统一按创建时间倒序、ID 倒序，保证分页稳定
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import { iGM_RandomUuid } from "../iGM_Services/iGM_SecurityService";
import type { iGM_QuestionRow } from "../iGM_Types/iGM_Question";
import type { iGM_ReviewQuestionRow } from "../iGM_Types/iGM_AIQuestionSelection";

// 类型定义 //
/** 题目可写字段集合（创建时写入的全部业务字段） */
export interface iGM_QuestionWriteFields {
  creatorId: string;
  stem: string;
  type: string;
  options: string;
  answer: string;
  analysis: string;
  textbookCode: string;
  textbookName: string;
  difficultyCoefficient: number | null;
  difficultyLevel: string | null;
  tags: string;
  aiTextbookCode: string | null;
  aiSource: string | null;
  adjustedByUser: boolean;
  status: string;
}

/** 题目可更新字段集合（未提供者不参与更新） */
export interface iGM_QuestionUpdateFields {
  stem?: string;
  type?: string;
  options?: string;
  answer?: string;
  analysis?: string;
  textbookCode?: string;
  textbookName?: string;
  difficultyCoefficient?: number | null;
  difficultyLevel?: string | null;
  tags?: string;
  aiTextbookCode?: string | null;
  aiSource?: string | null;
  adjustedByUser?: boolean;
  status?: string;
}

/** 带审批列的题目可写字段集合（AI 亮点题目送往命题管理时写入） */
export interface iGM_ReviewQuestionWriteFields extends iGM_QuestionWriteFields {
  reviewStatus: string | null;
  qualityScore: number | null;
  aiSelected: boolean;
  aiReason: string | null;
  modelUsed: string | null;
  sourceExamId: string | null;
}

/** 分页查询结果 */
export interface iGM_QuestionPage {
  rows: iGM_QuestionRow[];
  total: number;
}

// 核心逻辑 //
/** 转义 ILIKE 通配符，配合 ESCAPE '\' 防止用户输入扩大匹配范围 */
function iGM_EscapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** 写入题目（返回完整数据行） */
export async function iGM_InsertQuestion(
  fields: iGM_QuestionWriteFields,
): Promise<iGM_QuestionRow> {
  const now = new Date().toISOString();
  const row: iGM_QuestionRow = {
    iGM_Id: iGM_RandomUuid(),
    iGM_CreatorId: fields.creatorId,
    iGM_Stem: fields.stem,
    iGM_Type: fields.type,
    iGM_Options: fields.options,
    iGM_Answer: fields.answer,
    iGM_Analysis: fields.analysis,
    iGM_TextbookCode: fields.textbookCode,
    iGM_TextbookName: fields.textbookName,
    iGM_DifficultyCoefficient: fields.difficultyCoefficient,
    iGM_DifficultyLevel: fields.difficultyLevel,
    iGM_Tags: fields.tags,
    iGM_AiTextbookCode: fields.aiTextbookCode,
    iGM_AiSource: fields.aiSource,
    iGM_AdjustedByUser: fields.adjustedByUser,
    iGM_Status: fields.status,
    iGM_CreatedAt: now,
    iGM_UpdatedAt: now,
  };
  await iGM_Db.run(
    `INSERT INTO iGM_QuestionBank
       (iGM_Id, iGM_CreatorId, iGM_Stem, iGM_Type, iGM_Options, iGM_Answer,
        iGM_Analysis, iGM_TextbookCode, iGM_TextbookName,
        iGM_DifficultyCoefficient, iGM_DifficultyLevel, iGM_Tags,
        iGM_AiTextbookCode, iGM_AiSource, iGM_AdjustedByUser, iGM_Status,
        iGM_CreatedAt, iGM_UpdatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.iGM_Id,
      row.iGM_CreatorId,
      row.iGM_Stem,
      row.iGM_Type,
      row.iGM_Options,
      row.iGM_Answer,
      row.iGM_Analysis,
      row.iGM_TextbookCode,
      row.iGM_TextbookName,
      row.iGM_DifficultyCoefficient,
      row.iGM_DifficultyLevel,
      row.iGM_Tags,
      row.iGM_AiTextbookCode,
      row.iGM_AiSource,
      row.iGM_AdjustedByUser,
      row.iGM_Status,
      row.iGM_CreatedAt,
      row.iGM_UpdatedAt,
    ],
  );
  return row;
}

/** 更新题目字段（仅更新显式提供的字段，同时刷新更新时间） */
export async function iGM_UpdateQuestion(
  id: string,
  fields: iGM_QuestionUpdateFields,
): Promise<void> {
  const mapping: [keyof iGM_QuestionUpdateFields, string][] = [
    ["stem", "iGM_Stem"],
    ["type", "iGM_Type"],
    ["options", "iGM_Options"],
    ["answer", "iGM_Answer"],
    ["analysis", "iGM_Analysis"],
    ["textbookCode", "iGM_TextbookCode"],
    ["textbookName", "iGM_TextbookName"],
    ["difficultyCoefficient", "iGM_DifficultyCoefficient"],
    ["difficultyLevel", "iGM_DifficultyLevel"],
    ["tags", "iGM_Tags"],
    ["aiTextbookCode", "iGM_AiTextbookCode"],
    ["aiSource", "iGM_AiSource"],
    ["adjustedByUser", "iGM_AdjustedByUser"],
    ["status", "iGM_Status"],
  ];
  const assignments: string[] = [];
  const values: unknown[] = [];
  for (const [key, column] of mapping) {
    const value = fields[key];
    if (value === undefined) continue;
    assignments.push(`${column} = ?`);
    values.push(value);
  }
  assignments.push("iGM_UpdatedAt = ?");
  values.push(new Date().toISOString());
  values.push(id);
  await iGM_Db.run(
    `UPDATE iGM_QuestionBank SET ${assignments.join(", ")} WHERE iGM_Id = ?`,
    values,
  );
}

/** 按 ID 读取题目 */
export async function iGM_FindQuestionById(
  id: string,
): Promise<iGM_QuestionRow | null> {
  return (
    ((await iGM_Db
      .query(`SELECT * FROM iGM_QuestionBank WHERE iGM_Id = ?`)
      .get(id)) as iGM_QuestionRow | undefined) ?? null
  );
}

/** 删除题目 */
export async function iGM_DeleteQuestion(id: string): Promise<void> {
  await iGM_Db.run(`DELETE FROM iGM_QuestionBank WHERE iGM_Id = ?`, [id]);
}

/** 写入题目状态 */
export async function iGM_SetQuestionStatus(
  id: string,
  status: string,
): Promise<void> {
  await iGM_Db.run(
    `UPDATE iGM_QuestionBank SET iGM_Status = ?, iGM_UpdatedAt = ?
      WHERE iGM_Id = ?`,
    [status, new Date().toISOString(), id],
  );
}

/** 列出全部已发布题目（静态导出与公开题库用） */
export async function iGM_ListPublishedQuestions(): Promise<iGM_QuestionRow[]> {
  return (await iGM_Db
    .query(
      `SELECT * FROM iGM_QuestionBank
        WHERE iGM_Status = 'published'
        ORDER BY iGM_CreatedAt DESC, iGM_Id DESC`,
    )
    .all()) as iGM_QuestionRow[];
}

/** 按创建者分页列出题目（creatorId 为空表示不按创建者过滤，管理端可见全部；可按状态过滤） */
export async function iGM_ListQuestionsByCreator(
  creatorId: string | null,
  options: { status?: string; page: number; pageSize: number },
): Promise<iGM_QuestionPage> {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (creatorId) {
    clauses.push("iGM_CreatorId = ?");
    params.push(creatorId);
  }
  if (options.status) {
    clauses.push("iGM_Status = ?");
    params.push(options.status);
  }
  const where = clauses.length > 0 ? clauses.join(" AND ") : "TRUE";
  const offset = (options.page - 1) * options.pageSize;

  const rows = (await iGM_Db
    .query(
      `SELECT * FROM iGM_QuestionBank
        WHERE ${where}
        ORDER BY iGM_CreatedAt DESC, iGM_Id DESC
        LIMIT ? OFFSET ?`,
    )
    .all(...params, options.pageSize, offset)) as iGM_QuestionRow[];

  const totalRow = (await iGM_Db
    .query(
      `SELECT COUNT(*) AS iGM_Count FROM iGM_QuestionBank WHERE ${where}`,
    )
    .get(...params)) as { iGM_Count: number } | undefined;

  return { rows, total: totalRow?.iGM_Count ?? 0 };
}

/** 公开题库分页筛选（仅已发布，可按教材与关键词过滤） */
export async function iGM_ListPublicQuestions(options: {
  textbookCode?: string;
  q?: string;
  page: number;
  pageSize: number;
}): Promise<iGM_QuestionPage> {
  const clauses: string[] = ["iGM_Status = 'published'"];
  const params: unknown[] = [];
  if (options.textbookCode) {
    clauses.push("iGM_TextbookCode = ?");
    params.push(options.textbookCode);
  }
  if (options.q) {
    clauses.push("iGM_Stem ILIKE ? ESCAPE '\\'");
    params.push(`%${iGM_EscapeLike(options.q)}%`);
  }
  const where = clauses.join(" AND ");
  const offset = (options.page - 1) * options.pageSize;

  const rows = (await iGM_Db
    .query(
      `SELECT * FROM iGM_QuestionBank
        WHERE ${where}
        ORDER BY iGM_CreatedAt DESC, iGM_Id DESC
        LIMIT ? OFFSET ?`,
    )
    .all(...params, options.pageSize, offset)) as iGM_QuestionRow[];

  const totalRow = (await iGM_Db
    .query(
      `SELECT COUNT(*) AS iGM_Count FROM iGM_QuestionBank WHERE ${where}`,
    )
    .get(...params)) as { iGM_Count: number } | undefined;

  return { rows, total: totalRow?.iGM_Count ?? 0 };
}

/** 写入带审批列的题目（AI 亮点题目送往命题管理，返回完整数据行） */
export async function iGM_InsertReviewQuestion(
  fields: iGM_ReviewQuestionWriteFields,
): Promise<iGM_ReviewQuestionRow> {
  const now = new Date().toISOString();
  const row: iGM_ReviewQuestionRow = {
    iGM_Id: iGM_RandomUuid(),
    iGM_CreatorId: fields.creatorId,
    iGM_Stem: fields.stem,
    iGM_Type: fields.type,
    iGM_Options: fields.options,
    iGM_Answer: fields.answer,
    iGM_Analysis: fields.analysis,
    iGM_TextbookCode: fields.textbookCode,
    iGM_TextbookName: fields.textbookName,
    iGM_DifficultyCoefficient: fields.difficultyCoefficient,
    iGM_DifficultyLevel: fields.difficultyLevel,
    iGM_Tags: fields.tags,
    iGM_AiTextbookCode: fields.aiTextbookCode,
    iGM_AiSource: fields.aiSource,
    iGM_AdjustedByUser: fields.adjustedByUser,
    iGM_Status: fields.status,
    iGM_QualityScore: fields.qualityScore,
    iGM_AiSelected: fields.aiSelected,
    iGM_ReviewStatus: fields.reviewStatus,
    iGM_AiReason: fields.aiReason,
    iGM_ModelUsed: fields.modelUsed,
    iGM_SourceExamId: fields.sourceExamId,
    iGM_CreatedAt: now,
    iGM_UpdatedAt: now,
  };
  await iGM_Db.run(
    `INSERT INTO iGM_QuestionBank
       (iGM_Id, iGM_CreatorId, iGM_Stem, iGM_Type, iGM_Options, iGM_Answer,
        iGM_Analysis, iGM_TextbookCode, iGM_TextbookName,
        iGM_DifficultyCoefficient, iGM_DifficultyLevel, iGM_Tags,
        iGM_AiTextbookCode, iGM_AiSource, iGM_AdjustedByUser, iGM_Status,
        iGM_QualityScore, iGM_AiSelected, iGM_ReviewStatus, iGM_AiReason,
        iGM_ModelUsed, iGM_SourceExamId, iGM_CreatedAt, iGM_UpdatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.iGM_Id,
      row.iGM_CreatorId,
      row.iGM_Stem,
      row.iGM_Type,
      row.iGM_Options,
      row.iGM_Answer,
      row.iGM_Analysis,
      row.iGM_TextbookCode,
      row.iGM_TextbookName,
      row.iGM_DifficultyCoefficient,
      row.iGM_DifficultyLevel,
      row.iGM_Tags,
      row.iGM_AiTextbookCode,
      row.iGM_AiSource,
      row.iGM_AdjustedByUser,
      row.iGM_Status,
      row.iGM_QualityScore,
      row.iGM_AiSelected,
      row.iGM_ReviewStatus,
      row.iGM_AiReason,
      row.iGM_ModelUsed,
      row.iGM_SourceExamId,
      row.iGM_CreatedAt,
      row.iGM_UpdatedAt,
    ],
  );
  return row;
}

/** 按审批状态列出题目（creatorId 为空表示不按创建者过滤，管理端见全部） */
export async function iGM_ListQuestionsByReviewStatus(
  reviewStatus: string,
  creatorId: string | null,
): Promise<iGM_ReviewQuestionRow[]> {
  const clauses: string[] = ["iGM_ReviewStatus = ?"];
  const params: unknown[] = [reviewStatus];
  if (creatorId) {
    clauses.push("iGM_CreatorId = ?");
    params.push(creatorId);
  }
  return (await iGM_Db
    .query(
      `SELECT * FROM iGM_QuestionBank
        WHERE ${clauses.join(" AND ")}
        ORDER BY iGM_CreatedAt DESC, iGM_Id DESC`,
    )
    .all(...params)) as iGM_ReviewQuestionRow[];
}

/** 更新题目审批状态与业务状态（仅更新显式提供的字段） */
export async function iGM_UpdateQuestionReview(
  id: string,
  fields: { reviewStatus?: string; status?: string },
): Promise<void> {
  const assignments: string[] = [];
  const values: unknown[] = [];
  if (fields.reviewStatus !== undefined) {
    assignments.push("iGM_ReviewStatus = ?");
    values.push(fields.reviewStatus);
  }
  if (fields.status !== undefined) {
    assignments.push("iGM_Status = ?");
    values.push(fields.status);
  }
  if (assignments.length === 0) return;
  assignments.push("iGM_UpdatedAt = ?");
  values.push(new Date().toISOString());
  values.push(id);
  await iGM_Db.run(
    `UPDATE iGM_QuestionBank SET ${assignments.join(", ")} WHERE iGM_Id = ?`,
    values,
  );
}

// 导出 //
export default {
  iGM_InsertQuestion,
  iGM_InsertReviewQuestion,
  iGM_ListQuestionsByReviewStatus,
  iGM_UpdateQuestionReview,
  iGM_UpdateQuestion,
  iGM_FindQuestionById,
  iGM_DeleteQuestion,
  iGM_SetQuestionStatus,
  iGM_ListPublishedQuestions,
  iGM_ListQuestionsByCreator,
  iGM_ListPublicQuestions,
};
