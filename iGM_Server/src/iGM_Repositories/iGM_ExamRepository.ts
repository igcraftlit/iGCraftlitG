/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_ExamRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_Exam（/api/exam/*）
 * 模块：iGM_ExamRepository
 * 作用：iGM_Exams / iGM_ExamFiles / iGM_ExamSubmissions 三张表的唯一数据访问出口
 * 内容：试卷增删改查、按状态筛选、元数据与 HTML 目录写入、转换状态写入、
 *       文件行读写与临时路径清理、交卷记录写入与计数、编号序号计算所需的 id 与创建时间序列
 * 说明：磁盘路径仅存相对存储根目录的内部路径，绝不对外暴露
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import { iGM_RandomUuid } from "../iGM_Services/iGM_SecurityService";
import type {
  iGM_ExamFileRow,
  iGM_ExamRecognized,
  iGM_ExamRow,
  iGM_ExamSubmissionRow,
} from "../iGM_Types/iGM_Exam";

// 类型定义 //
/** 试卷可写字段集合（新建与校对更新共用） */
export interface iGM_ExamWriteFields {
  title: string;
  subject: string;
  issuer: string;
  reviewer: string;
  duration: number | null;
  totalScore: number | null;
  questionCount: number | null;
  notice: string;
}

/** 试卷文件可写字段集合 */
export interface iGM_ExamFileWriteFields {
  fileName: string;
  fileType: string;
  fileSize: number;
  tempPath: string;
  convertStatus: string;
}

// 核心逻辑 //
/** 按状态列出试卷（创建时间倒序） */
export async function iGM_ListExamsByStatus(
  status: string,
): Promise<iGM_ExamRow[]> {
  return (await iGM_Db
    .query(
      `SELECT * FROM iGM_Exams
        WHERE iGM_Status = ?
        ORDER BY iGM_CreatedAt DESC, iGM_Id DESC`,
    )
    .all(status)) as iGM_ExamRow[];
}

/** 列出全部试卷（管理端，创建时间倒序） */
export async function iGM_ListAllExams(): Promise<iGM_ExamRow[]> {
  return (await iGM_Db
    .query(
      `SELECT * FROM iGM_Exams
        ORDER BY iGM_CreatedAt DESC, iGM_Id DESC`,
    )
    .all()) as iGM_ExamRow[];
}

/** 按 ID 读取试卷行 */
export async function iGM_FindExamById(
  examId: string,
): Promise<iGM_ExamRow | null> {
  return (
    ((await iGM_Db
      .query(`SELECT * FROM iGM_Exams WHERE iGM_Id = ?`)
      .get(examId)) as iGM_ExamRow | undefined) ?? null
  );
}

/** 列出试卷编号序号计算所需的（id, 创建时间）序列，按创建时间升序 */
export async function iGM_ListExamIdCreatedPairs(): Promise<
  { iGM_Id: string; iGM_CreatedAt: string }[]
> {
  return (await iGM_Db
    .query(
      `SELECT iGM_Id, iGM_CreatedAt FROM iGM_Exams
        ORDER BY iGM_CreatedAt ASC, iGM_Id ASC`,
    )
    .all()) as { iGM_Id: string; iGM_CreatedAt: string }[];
}

/** 新建试卷（草稿），返回新试卷 ID；HTML 目录待后台转换完成后写入 */
export async function iGM_InsertExam(
  fields: iGM_ExamWriteFields,
  parseStatus: string,
  createdBy: string | null,
): Promise<string> {
  const id = iGM_RandomUuid();
  const now = new Date().toISOString();
  await iGM_Db.run(
    `INSERT INTO iGM_Exams
       (iGM_Id, iGM_Title, iGM_Subject, iGM_Issuer, iGM_Reviewer,
        iGM_Duration, iGM_TotalScore, iGM_QuestionCount, iGM_Notice,
        iGM_HtmlPath, iGM_ParseStatus, iGM_OriginalFileDeleted,
        iGM_Status, iGM_CreatedBy, iGM_CreatedAt, iGM_UpdatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'draft', ?, ?, ?)`,
    [
      id,
      fields.title,
      fields.subject,
      fields.issuer,
      fields.reviewer,
      fields.duration,
      fields.totalScore,
      fields.questionCount,
      fields.notice,
      parseStatus,
      false,
      createdBy,
      now,
      now,
    ],
  );
  return id;
}

/**
 * 校对 / 识别结果更新试卷元数据（不改状态）
 * @param parseStatus 为空时不改动转换状态
 */
export async function iGM_UpdateExamFields(
  examId: string,
  fields: iGM_ExamWriteFields,
  parseStatus: string | null,
): Promise<void> {
  await iGM_Db.run(
    `UPDATE iGM_Exams SET
       iGM_Title = ?, iGM_Subject = ?, iGM_Issuer = ?, iGM_Reviewer = ?,
       iGM_Duration = ?, iGM_TotalScore = ?, iGM_QuestionCount = ?,
       iGM_Notice = ?,
       iGM_ParseStatus = COALESCE(?, iGM_ParseStatus),
       iGM_UpdatedAt = ?
     WHERE iGM_Id = ?`,
    [
      fields.title,
      fields.subject,
      fields.issuer,
      fields.reviewer,
      fields.duration,
      fields.totalScore,
      fields.questionCount,
      fields.notice,
      parseStatus,
      new Date().toISOString(),
      examId,
    ],
  );
}

/** 写入转换生成的 HTML 目录路径（相对存储根目录） */
export async function iGM_SetExamHtmlPath(
  examId: string,
  htmlPath: string | null,
): Promise<void> {
  await iGM_Db.run(
    `UPDATE iGM_Exams SET iGM_HtmlPath = ?, iGM_UpdatedAt = ?
      WHERE iGM_Id = ?`,
    [htmlPath, new Date().toISOString(), examId],
  );
}

/** 更新试卷转换状态（pending / converting / completed / failed） */
export async function iGM_SetExamParseStatus(
  examId: string,
  parseStatus: string,
): Promise<void> {
  await iGM_Db.run(
    `UPDATE iGM_Exams SET iGM_ParseStatus = ?, iGM_UpdatedAt = ?
      WHERE iGM_Id = ?`,
    [parseStatus, new Date().toISOString(), examId],
  );
}

/** 标记试卷文件转换完成（记录完成时间并清除失败原因） */
export async function iGM_MarkExamFileCompleted(
  examId: string,
  now: string,
): Promise<void> {
  await iGM_Db.run(
    `UPDATE iGM_ExamFiles SET
       iGM_ConvertStatus = 'completed',
       iGM_ConvertError = NULL,
       iGM_ConvertedAt = ?
     WHERE iGM_ExamId = ?`,
    [now, examId],
  );
}

/** 重置试卷文件转换状态为转换中（重新转换前调用，同时清除旧失败原因） */
export async function iGM_SetExamFileConvertStatus(
  examId: string,
  convertStatus: string,
): Promise<void> {
  await iGM_Db.run(
    `UPDATE iGM_ExamFiles SET
       iGM_ConvertStatus = ?, iGM_ConvertError = NULL
     WHERE iGM_ExamId = ?`,
    [convertStatus, examId],
  );
}

/** 标记试卷文件转换失败并记录原因 */
export async function iGM_MarkExamFileFailed(
  examId: string,
  convertError: string,
): Promise<void> {
  await iGM_Db.run(
    `UPDATE iGM_ExamFiles SET
       iGM_ConvertStatus = 'failed', iGM_ConvertError = ?
     WHERE iGM_ExamId = ?`,
    [convertError, examId],
  );
}

/** 发布试卷（管理端确认并发布仅切换状态） */
export async function iGM_PublishExam(
  examId: string,
  status: string,
): Promise<void> {
  await iGM_Db.run(
    `UPDATE iGM_Exams SET iGM_Status = ?, iGM_UpdatedAt = ?
      WHERE iGM_Id = ?`,
    [status, new Date().toISOString(), examId],
  );
}

/** 标记试卷原始文件已在磁盘上删除（转换成功 / 定时清理使用，不改状态） */
export async function iGM_MarkExamOriginalDeleted(examId: string): Promise<void> {
  await iGM_Db.run(
    `UPDATE iGM_Exams SET iGM_OriginalFileDeleted = ?, iGM_UpdatedAt = ?
      WHERE iGM_Id = ?`,
    [true, new Date().toISOString(), examId],
  );
}

/** 删除试卷（文件与交卷记录由外键级联删除） */
export async function iGM_DeleteExam(examId: string): Promise<void> {
  await iGM_Db.run(`DELETE FROM iGM_Exams WHERE iGM_Id = ?`, [examId]);
}

/** 写入试卷文件行（临时路径与转换状态） */
export async function iGM_InsertExamFile(
  examId: string,
  file: iGM_ExamFileWriteFields,
): Promise<void> {
  await iGM_Db.run(
    `INSERT INTO iGM_ExamFiles
       (iGM_Id, iGM_ExamId, iGM_FileName, iGM_FileType, iGM_FileSize,
        iGM_TempPath, iGM_ConvertStatus, iGM_UploadedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      iGM_RandomUuid(),
      examId,
      file.fileName,
      file.fileType,
      file.fileSize,
      file.tempPath,
      file.convertStatus,
      new Date().toISOString(),
    ],
  );
}

/** 读取试卷最新文件行 */
export async function iGM_FindExamFileByExamId(
  examId: string,
): Promise<iGM_ExamFileRow | null> {
  return (
    ((await iGM_Db
      .query(
        `SELECT * FROM iGM_ExamFiles WHERE iGM_ExamId = ? ORDER BY iGM_UploadedAt DESC LIMIT 1`,
      )
      .get(examId)) as iGM_ExamFileRow | undefined) ?? null
  );
}

/** 清空临时路径并标记删除时间（转换成功 / 定时清理使用，保留转换状态） */
export async function iGM_ClearExamFileTempPath(
  examId: string,
  now: string,
): Promise<void> {
  await iGM_Db.run(
    `UPDATE iGM_ExamFiles SET
       iGM_TempPath = NULL,
       iGM_DeletedAt = ?
     WHERE iGM_ExamId = ?`,
    [now, examId],
  );
}

/** 列出仍保留原始文件（临时路径非空）的全部文件行，供清理任务扫描 */
export async function iGM_ListExamFilesWithTempPath(): Promise<
  iGM_ExamFileRow[]
> {
  return (await iGM_Db
    .query(
      `SELECT * FROM iGM_ExamFiles WHERE iGM_TempPath IS NOT NULL`,
    )
    .all()) as iGM_ExamFileRow[];
}

/** 写入交卷记录 */
export async function iGM_InsertSubmission(
  examId: string,
  userId: string | null,
): Promise<iGM_ExamSubmissionRow> {
  const row: iGM_ExamSubmissionRow = {
    iGM_Id: iGM_RandomUuid(),
    iGM_ExamId: examId,
    iGM_UserId: userId,
    iGM_SubmittedAt: new Date().toISOString(),
  };
  await iGM_Db.run(
    `INSERT INTO iGM_ExamSubmissions
       (iGM_Id, iGM_ExamId, iGM_UserId, iGM_SubmittedAt)
     VALUES (?, ?, ?, ?)`,
    [row.iGM_Id, row.iGM_ExamId, row.iGM_UserId, row.iGM_SubmittedAt],
  );
  return row;
}

/** 统计某试卷的交卷数量 */
export async function iGM_CountSubmissions(examId: string): Promise<number> {
  const row = (await iGM_Db
    .query(
      `SELECT COUNT(*) AS iGM_Count FROM iGM_ExamSubmissions WHERE iGM_ExamId = ?`,
    )
    .get(examId)) as { iGM_Count: number } | undefined;
  return row?.iGM_Count ?? 0;
}

// 导出 //
export type { iGM_ExamRecognized };
export default {
  iGM_ListExamsByStatus,
  iGM_ListAllExams,
  iGM_FindExamById,
  iGM_ListExamIdCreatedPairs,
  iGM_InsertExam,
  iGM_UpdateExamFields,
  iGM_SetExamHtmlPath,
  iGM_SetExamParseStatus,
  iGM_MarkExamFileCompleted,
  iGM_SetExamFileConvertStatus,
  iGM_MarkExamFileFailed,
  iGM_PublishExam,
  iGM_MarkExamOriginalDeleted,
  iGM_DeleteExam,
  iGM_InsertExamFile,
  iGM_FindExamFileByExamId,
  iGM_ClearExamFileTempPath,
  iGM_ListExamFilesWithTempPath,
  iGM_InsertSubmission,
  iGM_CountSubmissions,
};