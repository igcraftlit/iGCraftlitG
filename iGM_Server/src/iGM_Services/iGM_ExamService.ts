/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_ExamService.ts
 * 所属层：后端 / 业务服务层
 * 路由：G_Exam（/api/exam/*）
 * 模块：iGM_ExamService
 * 作用：iG&M 教育考试系统的试卷业务逻辑与 DTO 组装
 * 内容：编号生成（E-YYYY-NNN）、列表（公开/管理端）、详情、上传解析建档、
 *       校对更新、确认删除原文件并发布、重新解析、删除、交卷记录、原始文件读取
 * 说明：原始文件先保留在临时目录，管理员确认后才删除；磁盘路径绝不出现在对外 DTO
 */

// 导入依赖 //
import {
  iGM_CountSubmissions,
  iGM_ConfirmExam,
  iGM_ConfirmExamFile,
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
  type iGM_ExamWriteFields,
} from "../iGM_Repositories/iGM_ExamRepository";
import {
  iGM_ExamError,
  iGM_IngestExamDocument,
  iGM_ReadExamTempFile,
  iGM_RemoveExamTempFile,
  iGM_ReparseExamDocument,
} from "./iGM_ExamIngestService";
import {
  iGM_ExamFileTypes,
  type iGM_ExamDetailDto,
  type iGM_ExamFileType,
  type iGM_ExamListItemDto,
  type iGM_ExamParseStatus,
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
  /** 解析全文（Markdown），由管理员在校对界面校对后可修改 */
  contentMarkdown: string;
}

/** 原始文件读取结果 */
export interface iGM_ExamFileContent {
  bytes: Uint8Array;
  fileName: string;
  fileType: string;
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
    parseStatus: (row.iGM_ParseStatus ?? "pending") as iGM_ExamParseStatus,
    createdAt: row.iGM_CreatedAt,
  };
}

/** 归一化可选整数：非法或非正数一律归为 null */
function iGM_NormalizeOptionalInt(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const rounded = Math.floor(value);
  return rounded > 0 ? rounded : null;
}

/** 识别结果 + 表单值 → 可写字段集合 */
function iGM_ToWriteFields(input: {
  title: string;
  subject: string;
  issuer: string;
  reviewer: string;
  duration: number | null;
  totalScore: number | null;
  questionCount: number | null;
  notice: string;
}): iGM_ExamWriteFields {
  return {
    title: input.title.trim().slice(0, 200),
    subject: input.subject.trim().slice(0, 100),
    issuer: input.issuer.trim().slice(0, 120),
    reviewer: input.reviewer.trim().slice(0, 120),
    duration: iGM_NormalizeOptionalInt(input.duration),
    totalScore: iGM_NormalizeOptionalInt(input.totalScore),
    questionCount: iGM_NormalizeOptionalInt(input.questionCount),
    notice: input.notice.trim().slice(0, 1000),
  };
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
  const hasOriginalFile = Boolean(fileRow?.iGM_TempPath);
  return {
    ...iGM_ToListItem(row, codeMap.get(row.iGM_Id) ?? ""),
    reviewer: row.iGM_Reviewer ?? "",
    notice: row.iGM_Notice ?? "",
    contentMarkdown: row.iGM_ContentMarkdown ?? "",
    hasOriginalFile,
    fileApiPath: hasOriginalFile
      ? `/api/exam/file?examId=${encodeURIComponent(row.iGM_Id)}`
      : "",
    fileName: fileRow?.iGM_FileName ?? "",
    fileType: fileRow?.iGM_FileType ?? "",
  };
}

/**
 * 上传文档并建档为草稿：解析全文入库，原始文件保留在临时目录
 * 返回完整详情 DTO，前端直接进入校对界面
 */
export async function iGM_UploadExamService(
  file: File | null,
  createdBy: string | null,
): Promise<iGM_ExamDetailDto> {
  if (!file) throw new iGM_ExamError("请选择要上传的试卷文件", 422);
  const { stored, markdown, recognized } = await iGM_IngestExamDocument(file);
  const examId = await iGM_InsertExam(
    { ...recognized, notice: "" },
    markdown,
    "parsed",
    createdBy,
  );
  await iGM_InsertExamFile(examId, {
    fileName: stored.fileName,
    fileType: stored.fileType,
    fileSize: stored.fileSize,
    tempPath: stored.relativePath,
    parseStatus: "parsed",
  });
  return await iGM_GetExamDetailService(examId, { publicOnly: false });
}

/** 校对更新试卷元数据与解析全文（不改状态） */
export async function iGM_UpdateExamService(
  examId: string,
  input: iGM_ExamUpdateInput,
): Promise<void> {
  const row = await iGM_FindExamById(examId);
  if (!row) throw new iGM_ExamError("试卷不存在", 404);
  await iGM_UpdateExamFields(
    examId,
    iGM_ToWriteFields(input),
    input.contentMarkdown,
    null,
  );
}

/**
 * 管理员确认：删除临时目录中的原始文件，标记解析已确认并发布试卷
 */
export async function iGM_ConfirmExamService(examId: string): Promise<void> {
  const row = await iGM_FindExamById(examId);
  if (!row) throw new iGM_ExamError("试卷不存在", 404);
  if (!row.iGM_ContentMarkdown || row.iGM_ContentMarkdown.trim().length === 0) {
    throw new iGM_ExamError("解析全文为空，请先补全试卷内容再确认", 422);
  }
  const fileRow = await iGM_FindExamFileByExamId(examId);
  if (fileRow?.iGM_TempPath) {
    await iGM_RemoveExamTempFile(fileRow.iGM_TempPath);
  }
  const now = new Date().toISOString();
  if (fileRow) await iGM_ConfirmExamFile(examId, now);
  await iGM_ConfirmExam(examId, "published");
}

/** 使用临时目录中的原始文件重新解析（覆盖解析全文与识别字段） */
export async function iGM_ReparseExamService(examId: string): Promise<void> {
  const row = await iGM_FindExamById(examId);
  if (!row) throw new iGM_ExamError("试卷不存在", 404);
  const fileRow = await iGM_FindExamFileByExamId(examId);
  if (!fileRow?.iGM_TempPath) {
    throw new iGM_ExamError("原始文件已删除，无法重新解析", 422);
  }
  const fileType = (fileRow.iGM_FileType ?? "") as iGM_ExamFileType;
  if (!iGM_ExamFileTypes.includes(fileType)) {
    throw new iGM_ExamError("原始文件格式无法解析", 422);
  }
  const { markdown, recognized } = await iGM_ReparseExamDocument(
    fileRow.iGM_TempPath,
    fileType,
  );
  await iGM_UpdateExamFields(
    examId,
    iGM_ToWriteFields({ ...recognized, notice: row.iGM_Notice ?? "" }),
    markdown,
    "parsed",
  );
}

/** 删除试卷：同时删除临时目录中的原始文件 */
export async function iGM_DeleteExamService(examId: string): Promise<void> {
  const row = await iGM_FindExamById(examId);
  if (!row) throw new iGM_ExamError("试卷不存在", 404);
  const fileRow = await iGM_FindExamFileByExamId(examId);
  if (fileRow?.iGM_TempPath) {
    await iGM_RemoveExamTempFile(fileRow.iGM_TempPath);
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

/**
 * 读取原始文件字节与展示信息
 * PDF 由前端内联预览；其余格式仅作为附件下载
 */
export async function iGM_ReadExamFileService(
  examId: string,
): Promise<iGM_ExamFileContent> {
  const row = await iGM_FindExamById(examId);
  if (!row) throw new iGM_ExamError("试卷不存在", 404);
  const fileRow = await iGM_FindExamFileByExamId(examId);
  if (!fileRow?.iGM_TempPath) {
    throw new iGM_ExamError("原始文件已删除，仅保留解析后的文本内容", 404);
  }
  const bytes = await iGM_ReadExamTempFile(fileRow.iGM_TempPath);
  return {
    bytes,
    fileName: fileRow.iGM_FileName,
    fileType: fileRow.iGM_FileType ?? "",
  };
}

// 导出 //
export { iGM_ExamError };
export default {
  iGM_ExamError,
  iGM_ListPublicExamsService,
  iGM_ListAdminExamsService,
  iGM_GetExamDetailService,
  iGM_UploadExamService,
  iGM_UpdateExamService,
  iGM_ConfirmExamService,
  iGM_ReparseExamService,
  iGM_DeleteExamService,
  iGM_SubmitExamService,
  iGM_ReadExamFileService,
};
