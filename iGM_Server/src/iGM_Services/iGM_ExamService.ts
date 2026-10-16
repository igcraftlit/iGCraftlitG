/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_ExamService.ts
 * 所属层：后端 / 业务服务层
 * 路由：G_Exam（/api/exam/*）
 * 模块：iGM_ExamService
 * 作用：iGC&M 教育考试系统的试卷业务逻辑与 DTO 组装
 * 内容：编号生成（E-YYYY-NNN）、列表（公开/管理端）、详情、
 *       上传（管理员填写元数据 + PDF，校验通过直接发布）并后台 pdf2htmlEX 转换为 HTML、
 *       答案附件上传与读取、元数据修改、转换进度查询、HTML 资源读取、重新转换、删除、
 *       交卷记录、原始文件读取
 * 说明：上传即发布，不再有自动解析与审查校对流程；
 *       答案附件与元数据修改会重新导出静态数据并推送，触发 Pages 重建；
 *       转换在后台异步执行，转换成功且试卷已发布时导出静态数据并推送；
 *       转换成功后立即删除原始 PDF，仅保留 HTML 目录；转换失败保留 PDF 供重新转换；
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
  iGM_ListExamsByCreator,
  iGM_ListExamsByStatus,
  iGM_MarkExamFileCompleted,
  iGM_MarkExamFileFailed,
  iGM_MarkExamOriginalDeleted,
  iGM_SetExamFileConvertStatus,
  iGM_SetExamFileSize,
  iGM_SetExamHtmlPath,
  iGM_SetExamAnswerPath,
  iGM_SetExamParseStatus,
  iGM_UpdateExamFields,
  type iGM_ExamWriteFields,
} from "../iGM_Repositories/iGM_ExamRepository";
import {
  iGM_ExamError,
  iGM_ApplyExamHtmlOverrides,
  iGM_EnsureExamHtmlDir,
  iGM_ExamAnswerApiPath,
  iGM_ExamAnswerFileName,
  iGM_ExamHtmlApiPath,
  iGM_ExamHtmlDir,
  iGM_ExamHtmlRelativePath,
  iGM_ExamTempAbsolutePath,
  iGM_MeasureExamUsage,
  iGM_ReadExamAnswerFile,
  iGM_ReadExamHtmlAsset,
  iGM_ReadExamPageSize,
  iGM_ReadExamTempFile,
  iGM_RemoveExamHtmlDir,
  iGM_RemoveExamTempFile,
  iGM_StoreExamAnswerFile,
  iGM_StoreExamTempFile,
} from "./iGM_ExamIngestService";
import { iGM_RunPdf2HtmlEx } from "./iGM_ExamConvertService";
import {
  iGM_CommitExamStaticFiles,
  iGM_GenerateExamStaticFile,
  iGM_RebuildExamStaticIndex,
} from "./iGM_ExamStaticService";
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
/** 上传发布入参：管理员手工填写的元数据 + 待转换的 PDF 文件 */
export interface iGM_ExamPublishInput {
  file: File | null;
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

/** 试卷元数据修改入参（管理端在预览页编辑规格） */
export interface iGM_ExamMetaInput {
  title: string;
  subject: string;
  issuer: string;
  reviewer: string;
  duration: number | null;
  totalScore: number | null;
  questionCount: number | null;
  notice: string;
}

/** 答案附件读取结果 */
export interface iGM_ExamAnswerContent {
  bytes: Uint8Array;
  fileName: string;
}

/** HTML 资源读取结果 */
export interface iGM_ExamHtmlAssetContent {
  bytes: Uint8Array;
  contentType: string;
}

/** 试卷操作者：命题创作者本人或管理员（管理员可管理全部试卷） */
export interface iGM_ExamActor {
  userId: string;
  isAdmin: boolean;
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
export async function iGM_BuildExamCodeMap(): Promise<Map<string, string>> {
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

/** 列表（管理端）：命题创作者仅见本人试卷，管理员见全部，附交卷数 */
export async function iGM_ListAdminExamsService(
  actor: iGM_ExamActor,
): Promise<(iGM_ExamListItemDto & { submissionCount: number })[]> {
  const [rows, codeMap] = await Promise.all([
    actor.isAdmin ? iGM_ListAllExams() : iGM_ListExamsByCreator(actor.userId),
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

/**
 * 按操作者加载试卷并校验归属：管理员可访问全部，命题创作者仅限本人试卷
 * 不存在抛 404，越权抛 403
 */
export async function iGM_AssertExamAccessService(
  examId: string,
  actor: iGM_ExamActor,
): Promise<iGM_ExamRow> {
  const row = await iGM_FindExamById(examId);
  if (!row) throw new iGM_ExamError("试卷不存在", 404);
  if (!actor.isAdmin && row.iGM_CreatedBy !== actor.userId) {
    throw new iGM_ExamError("无权操作该试卷", 403);
  }
  return row;
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
  const htmlReady =
    row.iGM_ParseStatus === "completed" && Boolean(row.iGM_HtmlPath);
  // 页面基准尺寸用于前端按真实页宽设定 iframe 视口，避免正文横向滚动
  const pageSize = htmlReady ? await iGM_ReadExamPageSize(row.iGM_Id) : null;
  return {
    ...iGM_ToListItem(row, codeMap.get(row.iGM_Id) ?? ""),
    reviewer: row.iGM_Reviewer ?? "",
    notice: row.iGM_Notice ?? "",
    convertProgress: iGM_BuildProgress(row, fileRow),
    htmlApiPath: htmlReady ? iGM_ExamHtmlApiPath(row.iGM_Id) : "",
    pageWidth: pageSize?.width ?? null,
    pageHeight: pageSize?.height ?? null,
    hasOriginalFile,
    fileApiPath: hasOriginalFile
      ? `/api/exam/file?examId=${encodeURIComponent(row.iGM_Id)}`
      : "",
    fileName: fileRow?.iGM_FileName ?? "",
    fileType: fileRow?.iGM_FileType ?? "",
    answerApiPath: row.iGM_AnswerPdfPath
      ? iGM_ExamAnswerApiPath(row.iGM_Id)
      : "",
    answerFileName: row.iGM_AnswerPdfPath
      ? iGM_ExamAnswerFileName(row.iGM_AnswerPdfPath)
      : "",
  };
}

/**
 * 导出试卷静态数据并推送，触发 Cloudflare Pages 重新构建
 * 单份导出在试卷未完成转换时为无操作；索引始终重建，以同步元数据修改
 * 失败仅告警，不阻断业务流程
 */
async function iGM_ExportExamStatic(examId: string): Promise<void> {
  try {
    await iGM_GenerateExamStaticFile(examId);
    await iGM_RebuildExamStaticIndex();
    await iGM_CommitExamStaticFiles();
  } catch (error) {
    console.warn(
      `[iGM_ExamService] 导出试卷静态数据失败：${examId}：${String(error)}`,
    );
  }
}

/**
 * 后台转换试卷：调用 pdf2htmlEX 生成 HTML → 删除原始 PDF → 已发布则导出静态数据
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

    // 注入禁止横向溢出的样式（幂等），避免正文出现横向滚动条
    await iGM_ApplyExamHtmlOverrides(examId);

    // 统计转换产物（HTML 目录及其中的图片等资源）的实际占用字节数并入库
    const usageBytes = await iGM_MeasureExamUsage(examId);
    await iGM_SetExamFileSize(examId, usageBytes);

    // 元数据由管理员在上传时填写，转换阶段只登记产物与状态
    await iGM_SetExamHtmlPath(examId, iGM_ExamHtmlRelativePath(examId));
    await iGM_SetExamParseStatus(examId, "completed");
    const now = new Date().toISOString();
    await iGM_MarkExamFileCompleted(examId, now);

    // 转换成功：删除原始 PDF，仅保留 HTML
    await iGM_RemoveExamTempFile(relativePath);
    await iGM_ClearExamFileTempPath(examId, now);
    await iGM_MarkExamOriginalDeleted(examId);

    // 上传即发布：转换完成后导出静态数据并推送，使试卷出现在线上目录
    if (row.iGM_Status === "published") {
      await iGM_ExportExamStatic(examId);
    }
  } catch (error) {
    const message =
      error instanceof iGM_ExamError ? error.message : "试卷转换失败";
    console.warn(`[iGM_ExamService] 试卷转换失败：${examId}：${String(error)}`);
    await iGM_SetExamParseStatus(examId, "failed").catch(() => undefined);
    await iGM_MarkExamFileFailed(examId, message).catch(() => undefined);
  }
}

/**
 * 校验元数据完整性：文本字段非空，数值字段均为正整数
 * 任一不满足一律提示「请填写完整信息」并返回 400
 */
function iGM_AssertMetaFields(input: {
  title: string;
  subject: string;
  issuer: string;
  reviewer: string;
  duration: number | null;
  totalScore: number | null;
  questionCount: number | null;
}): void {
  const texts = [input.title, input.subject, input.issuer, input.reviewer];
  const numbers = [input.duration, input.totalScore, input.questionCount];
  const textIncomplete = texts.some((value) => value.trim().length === 0);
  const numberIncomplete = numbers.some(
    (value) => value === null || !Number.isInteger(value) || value <= 0,
  );
  if (textIncomplete || numberIncomplete) {
    throw new iGM_ExamError("请填写完整信息", 400);
  }
}

/**
 * 校验管理员在上传时填写的必填元数据与文件
 * 未选择文件或元数据不完整，一律提示「请填写完整信息」并返回 400
 */
function iGM_AssertPublishInput(input: iGM_ExamPublishInput): void {
  if (!input.file) throw new iGM_ExamError("请填写完整信息", 400);
  iGM_AssertMetaFields(input);
}

/**
 * 上传 PDF 并以管理员手工填写的元数据直接发布：
 * 原始文件落盘临时目录 → 按元数据建档（状态 published）→ 后台 pdf2htmlEX 转换；
 * 转换完成后由 iGM_RunExamConvertService 导出静态数据并推送
 */
export async function iGM_UploadExamService(
  input: iGM_ExamPublishInput,
  createdBy: string | null,
): Promise<iGM_ExamDetailDto> {
  iGM_AssertPublishInput(input);
  const file = input.file as File;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const stored = await iGM_StoreExamTempFile(file.name, bytes);
  const fields = iGM_ToWriteFields(input);
  const examId = await iGM_InsertExam(
    fields,
    "published",
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
  // 后台转换：不阻塞发布响应
  void iGM_RunExamConvertService(examId, stored.relativePath);
  return await iGM_GetExamDetailService(examId, { publicOnly: false });
}

/**
 * 上传答案附件（PDF，≤20MB）并落盘、登记路径
 * 上传成功后重新导出该试卷静态数据与索引并推送，使线上详情页展示答案入口
 */
export async function iGM_UploadAnswerService(
  examId: string,
  file: File | null,
  actor: iGM_ExamActor,
): Promise<iGM_ExamDetailDto> {
  await iGM_AssertExamAccessService(examId, actor);
  if (!file) throw new iGM_ExamError("请选择答案 PDF 文件", 400);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const stored = await iGM_StoreExamAnswerFile(examId, file.name, bytes);
  await iGM_SetExamAnswerPath(examId, stored.relativePath);
  await iGM_ExportExamStatic(examId);
  return await iGM_GetExamDetailService(examId, { publicOnly: false });
}

/**
 * 修改试卷元数据（命题创作者在预览页编辑规格）
 * 校验通过后更新数据库；若命题方变化则重新解析预设归档；
 * 随后重新导出静态数据与索引、推送触发重建
 */
export async function iGM_UpdateExamMetaService(
  examId: string,
  input: iGM_ExamMetaInput,
  actor: iGM_ExamActor,
): Promise<iGM_ExamDetailDto> {
  await iGM_AssertExamAccessService(examId, actor);
  iGM_AssertMetaFields(input);
  const fields = iGM_ToWriteFields(input);
  await iGM_UpdateExamFields(examId, fields);
  await iGM_ExportExamStatic(examId);
  return await iGM_GetExamDetailService(examId, { publicOnly: false });
}

/** 读取答案附件字节与文件名（命题创作者预览；管理员亦可） */
export async function iGM_ReadExamAnswerService(
  examId: string,
  actor: iGM_ExamActor,
): Promise<iGM_ExamAnswerContent> {
  const row = await iGM_AssertExamAccessService(examId, actor);
  if (!row.iGM_AnswerPdfPath) {
    throw new iGM_ExamError("答案附件不存在", 404);
  }
  const bytes = await iGM_ReadExamAnswerFile(row.iGM_AnswerPdfPath);
  return { bytes, fileName: iGM_ExamAnswerFileName(row.iGM_AnswerPdfPath) };
}

/** 查询试卷转换进度（前端转换中轮询） */
export async function iGM_GetExamConvertProgressService(
  examId: string,
): Promise<iGM_ExamConvertProgressDto> {
  const row = await iGM_FindExamById(examId);
  if (!row) throw new iGM_ExamError("试卷不存在", 404);
  const fileRow = await iGM_FindExamFileByExamId(examId);
  return iGM_BuildProgress(row, fileRow);
}

/** 使用临时目录中的原始 PDF 重新转换（清除旧 HTML 产物后后台重新转换） */
export async function iGM_ReparseExamService(
  examId: string,
  actor: iGM_ExamActor,
): Promise<void> {
  await iGM_AssertExamAccessService(examId, actor);
  const fileRow = await iGM_FindExamFileByExamId(examId);
  if (!fileRow?.iGM_TempPath) {
    throw new iGM_ExamError("原始文件已删除，无法重新转换", 422);
  }
  await iGM_SetExamParseStatus(examId, "converting");
  await iGM_SetExamFileConvertStatus(examId, "converting");
  void iGM_RunExamConvertService(examId, fileRow.iGM_TempPath);
}

/** 删除试卷：同时删除临时目录中的原始文件与 HTML 转换目录 */
export async function iGM_DeleteExamService(
  examId: string,
  actor: iGM_ExamActor,
): Promise<void> {
  await iGM_AssertExamAccessService(examId, actor);
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
  actor: iGM_ExamActor,
): Promise<iGM_ExamFileContent> {
  const row = await iGM_AssertExamAccessService(examId, actor);
  const fileRow = await iGM_FindExamFileByExamId(row.iGM_Id);
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
  iGM_AssertExamAccessService,
  iGM_GetExamDetailService,
  iGM_UploadExamService,
  iGM_UploadAnswerService,
  iGM_UpdateExamMetaService,
  iGM_ReadExamAnswerService,
  iGM_RunExamConvertService,
  iGM_GetExamConvertProgressService,
  iGM_ReparseExamService,
  iGM_DeleteExamService,
  iGM_SubmitExamService,
  iGM_ReadExamFileService,
  iGM_ReadExamHtmlAssetService,
};