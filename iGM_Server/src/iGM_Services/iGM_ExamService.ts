/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_ExamService.ts
 * 所属层：后端 / 业务服务层
 * 路由：G_Exam（/api/exam/*）
 * 模块：iGM_ExamService
 * 作用：iG&M 教育考试系统的试卷业务逻辑与 DTO 组装
 * 内容：编号生成（E-YYYY-NNN）、列表（公开/管理端）、详情、上传建档、
 *       校对更新、发布 / 关闭 / 删除、交卷记录、PDF 预览读取
 * 说明：本模块暂不做登录与权限校验；磁盘路径绝不出现在对外 DTO
 */

// 导入依赖 //
import {
  iGM_CountSubmissions,
  iGM_DeleteExam,
  iGM_FindExamById,
  iGM_FindExamFileByExamId,
  iGM_InsertExam,
  iGM_InsertExamFile,
  iGM_InsertSubmission,
  iGM_ListAllExams,
  iGM_ListExamIdCreatedPairs,
  iGM_ListExamsByStatus,
  iGM_UpdateExamFields,
  iGM_UpdateExamStatus,
  iGM_UpdateExamFileUrl,
  type iGM_ExamWriteFields,
} from "../iGM_Repositories/iGM_ExamRepository";
import {
  iGM_ExamError,
  iGM_IngestExamPdf,
  iGM_ReadExamPdf,
  iGM_RemoveExamPdf,
} from "./iGM_ExamIngestService";
import {
  type iGM_ExamDetailDto,
  type iGM_ExamListItemDto,
  type iGM_ExamRecognized,
  type iGM_ExamRow,
  type iGM_ExamStatus,
  type iGM_ExamSubmitResult,
} from "../iGM_Types/iGM_Exam";

// 类型定义 //
/** 校对更新入参（全部为前端表单原始值） */
export interface iGM_ExamUpdateInput {
  title: string;
  subject: string;
  issuer: string;
  reviewer: string;
  duration: number | null;
  totalScore: number | null;
  questionCount: number | null;
  notice: string;
}

/** 上传建档结果 */
export interface iGM_ExamUploadResult {
  examId: string;
  recognized: iGM_ExamRecognized;
}

// 核心逻辑 //
/** 生成试卷编号映射：按创建年份分组，组内按创建时间顺序编号 E-YYYY-NNN */
async function iGM_BuildExamCodeMap(): Promise<Map<string, string>> {
  const pairs = await iGM_ListExamIdCreatedPairs();
  const counters = new Map<string, number>();
  const codeMap = new Map<string, string>();
  for (const pair of pairs) {
    const year = pair.iGM_CreatedAt.slice(0, 4);
    const next = (counters.get(year) ?? 0) + 1;
    counters.set(year, next);
    codeMap.set(pair.iGM_Id, `E-${year}-${String(next).padStart(3, "0")}`);
  }
  return codeMap;
}

/** 数据行 → 列表项 DTO */
function iGM_ToListItem(
  row: iGM_ExamRow,
  code: string,
): iGM_ExamListItemDto {
  return {
    id: row.iGM_Id,
    code,
    title: row.iGM_Title ?? "",
    subject: row.iGM_Subject ?? "",
    issuer: row.iGM_Issuer ?? "",
    duration: row.iGM_Duration,
    totalScore: row.iGM_TotalScore,
    questionCount: row.iGM_QuestionCount,
    status: row.iGM_Status as iGM_ExamStatus,
    createdAt: row.iGM_CreatedAt,
  };
}

/** 归一化可选整数：非法或非正数一律归为 null */
function iGM_NormalizeOptionalInt(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const rounded = Math.floor(value);
  return rounded > 0 ? rounded : null;
}

/** 列表（公开）：仅已发布试卷 */
export async function iGM_ListPublicExamsService(): Promise<
  iGM_ExamListItemDto[]
> {
  const [rows, codeMap] = await Promise.all([
    iGM_ListExamsByStatus("published"),
    iGM_BuildExamCodeMap(),
  ]);
  return rows.map((row) => iGM_ToListItem(row, codeMap.get(row.iGM_Id) ?? ""));
}

/** 列表（管理端）：全部状态与交卷数 */
export async function iGM_ListAdminExamsService(): Promise<
  (iGM_ExamListItemDto & { submissionCount: number })[]
> {
  const [rows, codeMap] = await Promise.all([
    iGM_ListAllExams(),
    iGM_BuildExamCodeMap(),
  ]);
  const counts = await Promise.all(
    rows.map((row) => iGM_CountSubmissions(row.iGM_Id)),
  );
  return rows.map((row, index) => ({
    ...iGM_ToListItem(row, codeMap.get(row.iGM_Id) ?? ""),
    submissionCount: counts[index],
  }));
}

/** 详情：公开访问不允许草稿 */
export async function iGM_GetExamDetailService(
  examId: string,
  options: { publicOnly: boolean },
): Promise<iGM_ExamDetailDto> {
  const row = await iGM_FindExamById(examId);
  if (!row) throw new iGM_ExamError("试卷不存在", 404);
  if (options.publicOnly && row.iGM_Status === "draft") {
    throw new iGM_ExamError("试卷尚未发布", 404);
  }
  const [codeMap, fileRow] = await Promise.all([
    iGM_BuildExamCodeMap(),
    iGM_FindExamFileByExamId(examId),
  ]);
  return {
    ...iGM_ToListItem(row, codeMap.get(row.iGM_Id) ?? ""),
    reviewer: row.iGM_Reviewer ?? "",
    notice: row.iGM_Notice ?? "",
    fileApiPath: `/api/exam/file?examId=${encodeURIComponent(row.iGM_Id)}`,
    fileName: fileRow?.iGM_FileName ?? "",
  };
}

/** 上传 PDF 并建档为草稿：返回试卷 ID 与识别结果 */
export async function iGM_UploadExamService(
  file: File | null,
  createdBy: string | null,
): Promise<iGM_ExamUploadResult> {
  if (!file) throw new iGM_ExamError("请选择要上传的 PDF 试卷文件", 422);
  const { stored, rawText, recognized } = await iGM_IngestExamPdf(file);
  const examId = await iGM_InsertExam(
    {
      title: recognized.title,
      subject: recognized.subject,
      issuer: recognized.issuer,
      reviewer: recognized.reviewer,
      duration: recognized.duration,
      totalScore: recognized.totalScore,
      questionCount: recognized.questionCount,
      notice: "",
    },
    stored.relativePath,
    createdBy,
  );
  await iGM_InsertExamFile(examId, stored.fileName, rawText);
  return { examId, recognized };
}

/** 校对更新试卷元数据（不改状态） */
export async function iGM_UpdateExamService(
  examId: string,
  input: iGM_ExamUpdateInput,
): Promise<void> {
  const row = await iGM_FindExamById(examId);
  if (!row) throw new iGM_ExamError("试卷不存在", 404);
  const fields: iGM_ExamWriteFields = {
    title: input.title.trim().slice(0, 200),
    subject: input.subject.trim().slice(0, 100),
    issuer: input.issuer.trim().slice(0, 120),
    reviewer: input.reviewer.trim().slice(0, 120),
    duration: iGM_NormalizeOptionalInt(input.duration),
    totalScore: iGM_NormalizeOptionalInt(input.totalScore),
    questionCount: iGM_NormalizeOptionalInt(input.questionCount),
    notice: input.notice.trim().slice(0, 1000),
  };
  await iGM_UpdateExamFields(examId, fields);
}

/** 发布试卷：必须已有标题与试卷文件 */
export async function iGM_PublishExamService(examId: string): Promise<void> {
  const row = await iGM_FindExamById(examId);
  if (!row) throw new iGM_ExamError("试卷不存在", 404);
  if (!row.iGM_Title || row.iGM_Title.trim().length === 0) {
    throw new iGM_ExamError("请先补全试卷标题再发布", 422);
  }
  if (!row.iGM_FileUrl) {
    throw new iGM_ExamError("试卷文件缺失，无法发布", 422);
  }
  await iGM_UpdateExamStatus(examId, "published");
}

/** 关闭试卷 */
export async function iGM_CloseExamService(examId: string): Promise<void> {
  const row = await iGM_FindExamById(examId);
  if (!row) throw new iGM_ExamError("试卷不存在", 404);
  await iGM_UpdateExamStatus(examId, "closed");
}

/** 删除试卷：同时删除磁盘 PDF */
export async function iGM_DeleteExamService(examId: string): Promise<void> {
  const row = await iGM_FindExamById(examId);
  if (!row) throw new iGM_ExamError("试卷不存在", 404);
  if (row.iGM_FileUrl) {
    await iGM_RemoveExamPdf(row.iGM_FileUrl);
  }
  await iGM_DeleteExam(examId);
}

/** 记录交卷 */
export async function iGM_SubmitExamService(
  examId: string,
  userId: string | null,
): Promise<iGM_ExamSubmitResult> {
  const row = await iGM_FindExamById(examId);
  if (!row) throw new iGM_ExamError("试卷不存在", 404);
  if (row.iGM_Status === "draft") {
    throw new iGM_ExamError("试卷尚未发布，无法交卷", 422);
  }
  const submission = await iGM_InsertSubmission(examId, userId);
  return {
    id: submission.iGM_Id,
    examId: submission.iGM_ExamId,
    submittedAt: submission.iGM_SubmittedAt,
  };
}

/** 读取试卷 PDF 字节与展示文件名（站内预览） */
export async function iGM_ReadExamFileService(
  examId: string,
): Promise<{ bytes: Uint8Array; fileName: string }> {
  const row = await iGM_FindExamById(examId);
  if (!row) throw new iGM_ExamError("试卷不存在", 404);
  if (!row.iGM_FileUrl) throw new iGM_ExamError("试卷文件不存在", 404);
  const fileRow = await iGM_FindExamFileByExamId(examId);
  const bytes = await iGM_ReadExamPdf(row.iGM_FileUrl);
  return { bytes, fileName: fileRow?.iGM_FileName ?? "exam.pdf" };
}

/** 读取试卷识别原文（校对界面展示，供再次识别校对） */
export async function iGM_GetExamRawTextService(
  examId: string,
): Promise<string> {
  const fileRow = await iGM_FindExamFileByExamId(examId);
  return fileRow?.iGM_RawText ?? "";
}

/** 重新上传替换试卷 PDF（保留元数据，仅换文件） */
export async function iGM_ReplaceExamFileService(
  examId: string,
  file: File | null,
): Promise<void> {
  const row = await iGM_FindExamById(examId);
  if (!row) throw new iGM_ExamError("试卷不存在", 404);
  if (!file) throw new iGM_ExamError("请选择要上传的 PDF 试卷文件", 422);
  const { stored, rawText } = await iGM_IngestExamPdf(file);
  if (row.iGM_FileUrl) await iGM_RemoveExamPdf(row.iGM_FileUrl);
  await iGM_UpdateExamFileUrl(examId, stored.relativePath);
  await iGM_InsertExamFile(examId, stored.fileName, rawText);
}

// 导出 //
export { iGM_ExamError, iGM_UpdateExamFileUrl };
export default {
  iGM_ExamError,
  iGM_ListPublicExamsService,
  iGM_ListAdminExamsService,
  iGM_GetExamDetailService,
  iGM_UploadExamService,
  iGM_UpdateExamService,
  iGM_PublishExamService,
  iGM_CloseExamService,
  iGM_DeleteExamService,
  iGM_SubmitExamService,
  iGM_ReadExamFileService,
  iGM_GetExamRawTextService,
  iGM_ReplaceExamFileService,
};
