/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_ExamService.ts
 * 所属层：后端 / 业务服务层
 * 路由：G_Exam（/api/exam/*）
 * 模块：iGM_ExamService
 * 作用：iG&M 教育考试系统的试卷业务逻辑与 DTO 组装
 * 内容：编号生成（E-YYYY-NNN）、列表（公开/管理端）、详情、
 *       上传后后台 pdf2htmlEX 转换建档（含转换产物占用空间统计）、转换进度查询、HTML 资源读取、
 *       校对更新、确认并发布、重新转换、删除、交卷记录、原始文件读取
 * 说明：转换在后台异步执行，前端轮询进度接口；转换成功后立即删除原始 PDF，
 *       仅保留 HTML 目录；转换失败保留 PDF 24 小时供重新转换；
 *       磁盘路径绝不出现在对外 DTO
 */

// 导入依赖 //
import {
  iGM_CountSubmissions,
  iGM_ClearExamFileTempPath,
  iGM_DeleteExam,
  iGM_FindExamById,
  iGM_FindExamFileByExamId,
  iGM_InsertExam,
  iGM_InsertExamFile,
  iGM_InsertSubmission,
  iGM_ListAllExams,
  iGM_ListExamIdCreatedPairs,
  iGM_ListExamsByStatus,
  iGM_MarkExamFileCompleted,
  iGM_MarkExamFileFailed,
  iGM_MarkExamOriginalDeleted,
  iGM_PublishExam,
  iGM_SetExamFileConvertStatus,
  iGM_SetExamFileSize,
  iGM_SetExamHtmlPath,
  iGM_SetExamParseStatus,
  iGM_UpdateExamFields,
  type iGM_ExamWriteFields,
} from "../iGM_Repositories/iGM_ExamRepository";
import {
  iGM_ExamError,
  iGM_EnsureExamHtmlDir,
  iGM_ExamHtmlApiPath,
  iGM_ExamHtmlDir,
  iGM_ExamHtmlRelativePath,
  iGM_ExamTempAbsolutePath,
  iGM_MeasureExamUsage,
  iGM_ReadExamHtmlAsset,
  iGM_ReadExamHtmlText,
  iGM_ReadExamTempFile,
  iGM_RecognizeExamMeta,
  iGM_RemoveExamHtmlDir,
  iGM_RemoveExamTempFile,
  iGM_StoreExamTempFile,
} from "./iGM_ExamIngestService";
import { iGM_RunPdf2HtmlEx } from "./iGM_ExamConvertService";
import {
  type iGM_ExamConvertProgressDto,
  type iGM_ExamConvertStatus,
  type iGM_ExamDetailDto,
  type iGM_ExamFileRow,
  type iGM_ExamListItemDto,
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

/** 原始文件读取结果 */
export interface iGM_ExamFileContent {
  bytes: Uint8Array;
  fileName: string;
  fileType: string;
}

/** HTML 资源读取结果 */
export interface iGM_ExamHtmlAssetContent {
  bytes: Uint8Array;
  contentType: string;
}

// 核心逻辑 //
/** 转换后 HTML 资源的 MIME 类型表（按扩展名） */
const iGM_ExamHtmlMimeTypes: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  outline: "text/plain; charset=utf-8",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

/** 按文件名扩展名推断 HTML 资源 MIME 类型 */
function iGM_ExamAssetMimeType(name: string): string {
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  return iGM_ExamHtmlMimeTypes[ext] ?? "application/octet-stream";
}

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
    convertStatus: (row.iGM_ParseStatus ?? "pending") as iGM_ExamConvertStatus,
    fileSize: row.iGM_FileSize,
    createdAt: row.iGM_CreatedAt,
  };
}

/** 归一化可选整数：非法或非正数一律归为 null */
function iGM_NormalizeOptionalInt(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const rounded = Math.floor(value);
  return rounded > 0 ? rounded : null;
}

/** 表单值 → 可写字段集合 */
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

/** 组装转换进度快照 */
function iGM_BuildProgress(
  row: iGM_ExamRow,
  fileRow: iGM_ExamFileRow | null,
): iGM_ExamConvertProgressDto {
  const status = (row.iGM_ParseStatus ?? "pending") as iGM_ExamConvertStatus;
  const percent =
    status === "completed" ? 100 : status === "converting" ? 40 : 0;
  return {
    examId: row.iGM_Id,
    status,
    percent,
    fileSize: row.iGM_FileSize,
    error: fileRow?.iGM_ConvertError ?? "",
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
    convertProgress: iGM_BuildProgress(row, fileRow),
    htmlApiPath:
      row.iGM_ParseStatus === "completed" && row.iGM_HtmlPath
        ? iGM_ExamHtmlApiPath(row.iGM_Id)
        : "",
    hasOriginalFile,
    fileApiPath: hasOriginalFile
      ? `/api/exam/file?examId=${encodeURIComponent(row.iGM_Id)}`
      : "",
    fileName: fileRow?.iGM_FileName ?? "",
    fileType: fileRow?.iGM_FileType ?? "",
  };
}

/**
 * 后台转换试卷：调用 pdf2htmlEX 生成 HTML → 剥标签识别元数据 → 删除原始 PDF
 * 失败时标记转换失败并保留 PDF；本函数自行吞掉异常，不向调用方抛出
 */
export async function iGM_RunExamConvertService(
  examId: string,
  relativePath: string,
): Promise<void> {
  try {
    const row = await iGM_FindExamById(examId);
    if (!row) throw new iGM_ExamError("试卷不存在", 404);
    const inputAbsolutePath = iGM_ExamTempAbsolutePath(relativePath);
    const htmlDir = iGM_ExamHtmlDir(examId);

    // 清理旧产物后重建输出目录，随后调用 pdf2htmlEX
    await iGM_RemoveExamHtmlDir(examId);
    await iGM_EnsureExamHtmlDir(examId);
    await iGM_RunPdf2HtmlEx(inputAbsolutePath, htmlDir, examId);

    // 统计转换产物（HTML 目录及其中的图片等资源）的实际占用字节数并入库
    const usageBytes = await iGM_MeasureExamUsage(examId);
    await iGM_SetExamFileSize(examId, usageBytes);

    // 从生成的 HTML 中剥离文本，识别 Title/Subject/Issuer/Reviewer/Duration/TotalScore/QuestionCount
    const plainText = await iGM_ReadExamHtmlText(examId);
    const recognized = iGM_RecognizeExamMeta(plainText);
    await iGM_UpdateExamFields(
      examId,
      iGM_ToWriteFields({ ...recognized, notice: row.iGM_Notice ?? "" }),
      "completed",
    );
    await iGM_SetExamHtmlPath(examId, iGM_ExamHtmlRelativePath(examId));
    const now = new Date().toISOString();
    await iGM_MarkExamFileCompleted(examId, now);

    // 转换成功：删除原始 PDF，仅保留 HTML
    await iGM_RemoveExamTempFile(relativePath);
    await iGM_ClearExamFileTempPath(examId, now);
    await iGM_MarkExamOriginalDeleted(examId);
  } catch (error) {
    const message =
      error instanceof iGM_ExamError ? error.message : "试卷转换失败";
    console.warn(`[iGM_ExamService] 试卷转换失败：${examId}：${String(error)}`);
    await iGM_SetExamParseStatus(examId, "failed").catch(() => undefined);
    await iGM_MarkExamFileFailed(examId, message).catch(() => undefined);
  }
}

/**
 * 上传 PDF 并建档为草稿：原始文件落盘临时目录，转换在后台异步执行
 * 返回详情 DTO，前端据此展示转换进度并轮询进度接口
 */
export async function iGM_UploadExamService(
  file: File | null,
  createdBy: string | null,
): Promise<iGM_ExamDetailDto> {
  if (!file) throw new iGM_ExamError("请选择要上传的试卷文件", 422);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const stored = await iGM_StoreExamTempFile(file.name, bytes);
  const examId = await iGM_InsertExam(
    {
      title: "",
      subject: "",
      issuer: "",
      reviewer: "",
      duration: null,
      totalScore: null,
      questionCount: null,
      notice: "",
    },
    "converting",
    createdBy,
  );
  await iGM_InsertExamFile(examId, {
    fileName: stored.fileName,
    fileType: stored.fileType,
    fileSize: stored.fileSize,
    tempPath: stored.relativePath,
    convertStatus: "converting",
  });
  // 后台转换：不阻塞上传响应
  void iGM_RunExamConvertService(examId, stored.relativePath);
  return await iGM_GetExamDetailService(examId, { publicOnly: false });
}

/** 查询试卷转换进度（前端上传后轮询） */
export async function iGM_GetExamConvertProgressService(
  examId: string,
): Promise<iGM_ExamConvertProgressDto> {
  const row = await iGM_FindExamById(examId);
  if (!row) throw new iGM_ExamError("试卷不存在", 404);
  const fileRow = await iGM_FindExamFileByExamId(examId);
  return iGM_BuildProgress(row, fileRow);
}

/** 校对更新试卷元数据（不改状态，不改 HTML 产物） */
export async function iGM_UpdateExamService(
  examId: string,
  input: iGM_ExamUpdateInput,
): Promise<void> {
  const row = await iGM_FindExamById(examId);
  if (!row) throw new iGM_ExamError("试卷不存在", 404);
  await iGM_UpdateExamFields(examId, iGM_ToWriteFields(input), null);
}

/** 管理员确认并发布：切换状态为已发布（原始 PDF 已在转换成功时删除） */
export async function iGM_PublishExamService(examId: string): Promise<void> {
  const row = await iGM_FindExamById(examId);
  if (!row) throw new iGM_ExamError("试卷不存在", 404);
  if (row.iGM_ParseStatus !== "completed") {
    throw new iGM_ExamError("试卷尚未完成转换，无法发布", 422);
  }
  await iGM_PublishExam(examId, "published");
}

/** 使用临时目录中的原始 PDF 重新转换（清除旧 HTML 产物后后台重新转换） */
export async function iGM_ReparseExamService(examId: string): Promise<void> {
  const row = await iGM_FindExamById(examId);
  if (!row) throw new iGM_ExamError("试卷不存在", 404);
  const fileRow = await iGM_FindExamFileByExamId(examId);
  if (!fileRow?.iGM_TempPath) {
    throw new iGM_ExamError("原始文件已删除，无法重新转换", 422);
  }
  await iGM_SetExamParseStatus(examId, "converting");
  await iGM_SetExamFileConvertStatus(examId, "converting");
  void iGM_RunExamConvertService(examId, fileRow.iGM_TempPath);
}

/** 删除试卷：同时删除临时目录中的原始文件与 HTML 转换目录 */
export async function iGM_DeleteExamService(examId: string): Promise<void> {
  const row = await iGM_FindExamById(examId);
  if (!row) throw new iGM_ExamError("试卷不存在", 404);
  const fileRow = await iGM_FindExamFileByExamId(examId);
  if (fileRow?.iGM_TempPath) {
    await iGM_RemoveExamTempFile(fileRow.iGM_TempPath);
  }
  await iGM_RemoveExamHtmlDir(examId);
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
 * 仅在转换失败保留期内可用；转换成功后原始 PDF 已删除
 */
export async function iGM_ReadExamFileService(
  examId: string,
): Promise<iGM_ExamFileContent> {
  const row = await iGM_FindExamById(examId);
  if (!row) throw new iGM_ExamError("试卷不存在", 404);
  const fileRow = await iGM_FindExamFileByExamId(examId);
  if (!fileRow?.iGM_TempPath) {
    throw new iGM_ExamError("原始文件已删除，仅保留转换后的内容", 404);
  }
  const bytes = await iGM_ReadExamTempFile(fileRow.iGM_TempPath);
  return {
    bytes,
    fileName: fileRow.iGM_FileName,
    fileType: fileRow.iGM_FileType ?? "",
  };
}

/** 读取转换后 HTML 目录内的资源字节（iframe 及其字体 / 图片 / CSS / JS） */
export async function iGM_ReadExamHtmlAssetService(
  examId: string,
  name: string,
): Promise<iGM_ExamHtmlAssetContent> {
  const row = await iGM_FindExamById(examId);
  if (!row) throw new iGM_ExamError("试卷不存在", 404);
  const bytes = await iGM_ReadExamHtmlAsset(examId, name);
  return { bytes, contentType: iGM_ExamAssetMimeType(name) };
}

// 导出 //
export { iGM_ExamError };
export default {
  iGM_ExamError,
  iGM_ListPublicExamsService,
  iGM_ListAdminExamsService,
  iGM_GetExamDetailService,
  iGM_UploadExamService,
  iGM_RunExamConvertService,
  iGM_GetExamConvertProgressService,
  iGM_UpdateExamService,
  iGM_PublishExamService,
  iGM_ReparseExamService,
  iGM_DeleteExamService,
  iGM_SubmitExamService,
  iGM_ReadExamFileService,
  iGM_ReadExamHtmlAssetService,
};