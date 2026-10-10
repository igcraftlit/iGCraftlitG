/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_ExamIngestService.ts
 * 所属层：后端 / 业务服务层
 * 路由：G_Exam（/api/exam/upload、/api/exam/reparse 内部调用）
 * 模块：iGM_ExamIngestService
 * 作用：试卷文档落盘临时目录、按格式解析为结构化内容块、图片目录管理与元数据正则识别
 * 内容：iGM_ExamError 业务错误类型、临时/图片目录解析与路径安全校验、
 *       文档格式校验与落盘（随机后缀命名）、PDF 逐页解析（pdfjs-dist）与
 *       其余格式（DOC / DOCX / TXT / MD）文本块转换、图片字节读取、
 *       Title/Subject/Issuer/Reviewer/Duration/Total Score/Question Count 中英文双语正则识别
 * 说明：原始文件先保留在临时目录，管理员确认后才删除；磁盘绝对路径绝不出现在对外 DTO；
 *       图片按试卷独立成目录（exams/images/<examId>），Block 内仅保存文件名
 */

// 导入依赖 //
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { iGM_Config } from "../iGM_Config/iGM_Config";
import { iGM_RandomUuid } from "./iGM_SecurityService";
import { iGM_SanitizeOriginalName } from "./iGM_StorageService";
import {
  iGM_BlocksToPlainText,
  iGM_ConvertTextToBlocks,
  iGM_ParsePdfBlocks,
  type iGM_ExamParseHandlers,
} from "./iGM_ExamBlockParser";
import {
  iGM_ResolveExamFileType,
  type iGM_ExamBlock,
  type iGM_ExamFileType,
  type iGM_ExamRecognized,
} from "../iGM_Types/iGM_Exam";

// 类型定义 //
/** 试卷业务错误：message 为前端提示键或可直接展示的中文提示 */
export class iGM_ExamError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "iGM_ExamError";
  }
}

/** 落盘结果 */
export interface iGM_ExamStoredFile {
  /** 相对存储根目录的相对路径（入库 iGM_TempPath，不对外暴露） */
  relativePath: string;
  /** 清理后的原始文件名（仅展示） */
  fileName: string;
  /** 文档格式 */
  fileType: iGM_ExamFileType;
  /** 文件字节数 */
  fileSize: number;
}

/** 单次解析产出：结构化内容块 + 用于元数据识别的纯文本 */
export interface iGM_ExamParseOutcome {
  blocks: iGM_ExamBlock[];
  plainText: string;
}

// 核心逻辑 //
/** 试卷文档允许的最大体积（字节），默认 50MB */
const iGM_ExamMaxFileSize = Number(
  process.env.IGM_EXAM_MAX_FILE_SIZE ?? 50 * 1024 * 1024,
);

/** 图片文件名白名单：uuid 主名 + 受控扩展名，杜绝路径穿越 */
const iGM_ExamImageName = /^[A-Za-z0-9-]{1,64}\.(?:png|jpg|jpeg)$/;

/** 试卷存储根目录：D:/IGWEB/uploads */
function iGM_ExamStorageRoot(): string {
  return process.env.IGM_EXAM_UPLOAD_DIR ?? iGM_Config.upload.rootDir;
}

/** 试卷临时文件目录：D:/IGWEB/uploads/exams/temp */
export function iGM_ExamTempDir(): string {
  return join(iGM_ExamStorageRoot(), "exams", "temp");
}

/** 试卷图片根目录：D:/IGWEB/uploads/exams/images */
export function iGM_ExamImagesRoot(): string {
  return join(iGM_ExamStorageRoot(), "exams", "images");
}

/** 指定试卷的图片目录绝对路径 */
export function iGM_ExamImagesDir(examId: string): string {
  return join(iGM_ExamImagesRoot(), examId);
}

/** 指定试卷图片目录相对存储根目录的路径（入库 iGM_ImagesPath） */
export function iGM_ExamImagesRelativePath(examId: string): string {
  return `exams/images/${examId}`;
}

/** 确保试卷临时目录存在 */
export async function iGM_EnsureExamStorageRoot(): Promise<void> {
  await mkdir(iGM_ExamTempDir(), { recursive: true });
}

/** 确保指定试卷的图片目录存在 */
export async function iGM_EnsureExamImagesDir(examId: string): Promise<void> {
  await mkdir(iGM_ExamImagesDir(examId), { recursive: true });
}

/** 删除指定试卷的图片目录（试卷删除 / 重新解析前调用） */
export async function iGM_RemoveExamImagesDir(examId: string): Promise<void> {
  try {
    await rm(iGM_ExamImagesDir(examId), { recursive: true, force: true });
  } catch {
    console.warn(`[iGM_ExamIngestService] 删除试卷图片目录失败：${examId}`);
  }
}

/** 把相对路径解析为绝对路径，并强制校验仍位于试卷临时目录内 */
function iGM_ResolveExamPath(relativePath: string): string {
  const root = resolve(iGM_ExamTempDir());
  const target = resolve(root, relativePath);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new iGM_ExamError("试卷文件路径非法", 400);
  }
  return target;
}

/** 试卷临时文件的绝对路径（解析 DOC 等需要文件路径的格式时使用） */
export function iGM_ExamTempAbsolutePath(relativePath: string): string {
  return iGM_ResolveExamPath(relativePath);
}

/** 校验图片文件名并解析为绝对路径，强制仍位于该试卷的图片目录内 */
function iGM_ResolveExamImagePath(examId: string, fileName: string): string {
  if (!iGM_ExamImageName.test(fileName)) {
    throw new iGM_ExamError("试卷图片路径非法", 400);
  }
  const root = resolve(iGM_ExamImagesDir(examId));
  const target = resolve(root, fileName);
  if (!target.startsWith(root + sep)) {
    throw new iGM_ExamError("试卷图片路径非法", 400);
  }
  return target;
}

/** 判断字节流是否以指定魔数开头 */
function iGM_HasMagic(bytes: Uint8Array, magic: readonly number[]): boolean {
  if (bytes.byteLength < magic.length) return false;
  return magic.every((value, index) => bytes[index] === value);
}

/** 文件内容魔数：PDF / DOCX（ZIP） / DOC（OLE 复合文档） */
const iGM_ExamPdfMagic = [0x25, 0x50, 0x44, 0x46, 0x2d];
const iGM_ExamZipMagic = [0x50, 0x4b, 0x03, 0x04];
const iGM_ExamOleMagic = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** 校验文件格式与体积，格式与扩展名不符时抛 422 */
function iGM_AssertExamFile(
  fileType: iGM_ExamFileType,
  bytes: Uint8Array,
): void {
  if (bytes.byteLength <= 0) {
    throw new iGM_ExamError("上传的试卷文件为空", 422);
  }
  if (bytes.byteLength > iGM_ExamMaxFileSize) {
    throw new iGM_ExamError("试卷文件超过 50MB 上限", 413);
  }
  if (fileType === "pdf" && !iGM_HasMagic(bytes, iGM_ExamPdfMagic)) {
    throw new iGM_ExamError("文件内容不是有效的 PDF", 422);
  }
  if (fileType === "docx" && !iGM_HasMagic(bytes, iGM_ExamZipMagic)) {
    throw new iGM_ExamError("文件内容不是有效的 DOCX", 422);
  }
  if (fileType === "doc" && !iGM_HasMagic(bytes, iGM_ExamOleMagic)) {
    throw new iGM_ExamError("文件内容不是有效的 DOC", 422);
  }
}

/** 把纯文本按空行切分为段落（保留单行换行） */
function iGM_TextToMarkdown(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.split("\n").map((line) => line.trimEnd()).join("\n"))
    .map((block) => block.replace(/^\n+|\n+$/g, ""))
    .filter((block) => block.trim().length > 0)
    .join("\n\n");
}

/** 解析 DOCX：mammoth 转 HTML，再经 turndown 转 Markdown */
async function iGM_ExtractDocx(
  bytes: Uint8Array,
): Promise<{ markdown: string; plainText: string }> {
  try {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.convertToHtml({
      buffer: Buffer.from(bytes),
    });
    const { default: TurndownService } = await import("turndown");
    const turndown = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
    });
    return {
      markdown: turndown.turndown(value ?? ""),
      plainText: (value ?? "").replace(/<[^>]+>/g, " "),
    };
  } catch {
    throw new iGM_ExamError("DOCX 解析失败，请确认文件未损坏", 422);
  }
}

/** 解析 DOC（旧版二进制格式）：word-extractor 纯 JS 抽取正文 */
async function iGM_ExtractDoc(
  absolutePath: string,
): Promise<{ markdown: string; plainText: string }> {
  try {
    const { default: WordExtractor } = await import("word-extractor");
    const extractor = new WordExtractor();
    const document = await extractor.extract(absolutePath);
    const text = document.getBody() ?? "";
    return { markdown: iGM_TextToMarkdown(text), plainText: text };
  } catch {
    throw new iGM_ExamError(
      "DOC 解析失败，请转换为 DOCX 或 PDF 后重新上传",
      422,
    );
  }
}

/** 按格式解析非 PDF 文档为 Markdown 全文 */
async function iGM_ParseTextDocument(
  absolutePath: string,
  fileType: iGM_ExamFileType,
  bytes: Uint8Array,
): Promise<{ markdown: string; plainText: string }> {
  if (fileType === "docx") {
    return await iGM_ExtractDocx(bytes);
  }
  if (fileType === "doc") {
    return await iGM_ExtractDoc(absolutePath);
  }
  // TXT / MD：直接读取；MD 保留原有 Markdown 结构
  const text = new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
  return {
    markdown: fileType === "md" ? text : iGM_TextToMarkdown(text),
    plainText: text,
  };
}

/**
 * 将上传文档写入临时目录（uuid 命名，防冲突），返回落盘信息
 */
export async function iGM_StoreExamTempFile(
  originalName: string,
  bytes: Uint8Array,
): Promise<iGM_ExamStoredFile> {
  const fileName = iGM_SanitizeOriginalName(originalName);
  const fileType = iGM_ResolveExamFileType(fileName);
  if (!fileType) {
    throw new iGM_ExamError(
      "仅支持 PDF / DOC / DOCX / TXT / MD 格式的试卷文件",
      422,
    );
  }
  iGM_AssertExamFile(fileType, bytes);
  await iGM_EnsureExamStorageRoot();

  const storedName = `${iGM_RandomUuid()}.${fileType}`;
  const absolutePath = iGM_ResolveExamPath(storedName);
  try {
    await writeFile(absolutePath, bytes);
  } catch {
    throw new iGM_ExamError("试卷文件保存失败", 500);
  }
  return {
    relativePath: storedName,
    fileName,
    fileType,
    fileSize: bytes.byteLength,
  };
}

/**
 * 按格式把文档解析为结构化内容块
 * - PDF：pdfjs-dist 逐页解析文字与图片，图片落盘到该试卷的图片目录，逐页上报进度
 * - 其余格式：抽取文本后按 Markdown 标记转换为标题 / 列表 / 段落块（单页，立即上报完成）
 */
export async function iGM_ParseExamDocumentToBlocks(
  absolutePath: string,
  fileType: iGM_ExamFileType,
  bytes: Uint8Array,
  examId: string,
  handlers: iGM_ExamParseHandlers = {},
): Promise<iGM_ExamParseOutcome> {
  if (fileType === "pdf") {
    await iGM_EnsureExamImagesDir(examId);
    const blocks = await iGM_ParsePdfBlocks(
      bytes,
      iGM_ExamImagesDir(examId),
      handlers,
    );
    return { blocks, plainText: iGM_BlocksToPlainText(blocks) };
  }

  const parsed = await iGM_ParseTextDocument(absolutePath, fileType, bytes);
  const blocks = iGM_ConvertTextToBlocks(parsed.markdown);
  await handlers.onTotal?.(1);
  await handlers.onPage?.(1, 1, blocks.length);
  return { blocks, plainText: parsed.plainText };
}

/** 第一个匹配分组的文本（中英文模式依次尝试），未命中返回空串 */
function iGM_MatchText(
  source: string,
  patterns: readonly RegExp[],
): string {
  for (const pattern of patterns) {
    const matched = source.match(pattern);
    if (matched) {
      const value = (matched[1] ?? matched[0] ?? "").trim();
      // 归一化空白：抽取文本常以换行切分短句
      if (value.length > 0) return value.replace(/\s+/g, " ").trim();
    }
  }
  return "";
}

/** 第一个匹配分组的整数（中英文模式依次尝试），未命中返回 null */
function iGM_MatchNumber(
  source: string,
  patterns: readonly RegExp[],
): number | null {
  for (const pattern of patterns) {
    const matched = source.match(pattern);
    if (matched) {
      const value = Number(matched[1]);
      if (Number.isFinite(value) && value > 0) return value;
    }
  }
  return null;
}

/**
 * 从解析文本中按正则识别试卷元数据
 * 规则来自模块规格：中英文双语模式，命中即取
 */
export function iGM_RecognizeExamMeta(rawText: string): iGM_ExamRecognized {
  const title = iGM_MatchText(rawText, [
    /\d{4}年[\u4e00-\u9fa5]+(?:学业水平考试|考试|统考|联考)/,
    /\d{4}\s+(?:Provincial|National)\s+Examination/i,
  ]);
  const subject = iGM_MatchText(rawText, [
    /([\u4e00-\u9fa5]+科目[·・]?[IⅠ]+卷)/,
    /Subject\s*[:：]\s*([^\n]+)/i,
  ]);
  const issuer = iGM_MatchText(rawText, [
    /命题[：:]\s*([^\n]+)/,
    /Issuer\s*[:：]\s*([^\n]+)/i,
  ]);
  const reviewer = iGM_MatchText(rawText, [
    /审题[：:]\s*([^\n]+)/,
    /Reviewer\s*[:：]\s*([^\n]+)/i,
  ]);
  const duration = iGM_MatchNumber(rawText, [
    /考试时间\s*[:：]?\s*(\d+)\s*分钟/,
    /Duration\s*[:：]\s*(\d+)\s*min/i,
  ]);
  const totalScore = iGM_MatchNumber(rawText, [
    /试卷满分\s*[:：]?\s*(\d+)\s*分/,
    /Total Score\s*[:：]\s*(\d+)/i,
  ]);
  const questionCount = iGM_MatchNumber(rawText, [
    /共\s*(\d+)\s*小题/,
    /(\d+)\s+Questions?/i,
  ]);

  return { title, subject, issuer, reviewer, duration, totalScore, questionCount };
}

/** 读取临时文件字节（站内预览 / 下载 / 解析使用） */
export async function iGM_ReadExamTempFile(
  relativePath: string,
): Promise<Uint8Array> {
  const absolutePath = iGM_ResolveExamPath(relativePath);
  try {
    const buffer = await readFile(absolutePath);
    return new Uint8Array(buffer);
  } catch {
    throw new iGM_ExamError("原始文件不存在", 404);
  }
}

/** 删除临时文件（失败不抛出，由调用方决定是否忽略） */
export async function iGM_RemoveExamTempFile(
  relativePath: string,
): Promise<void> {
  try {
    await rm(iGM_ResolveExamPath(relativePath), { force: true });
  } catch {
    console.warn(`[iGM_ExamIngestService] 删除试卷文件失败：${relativePath}`);
  }
}

/** 读取该试卷图片目录内的图片字节（前端渲染 Block 图片使用） */
export async function iGM_ReadExamImage(
  examId: string,
  fileName: string,
): Promise<Uint8Array> {
  const absolutePath = iGM_ResolveExamImagePath(examId, fileName);
  try {
    const buffer = await readFile(absolutePath);
    return new Uint8Array(buffer);
  } catch {
    throw new iGM_ExamError("试卷图片不存在", 404);
  }
}

// 导出 //
export default {
  iGM_ExamError,
  iGM_ExamTempDir,
  iGM_ExamImagesRoot,
  iGM_ExamImagesDir,
  iGM_ExamImagesRelativePath,
  iGM_EnsureExamStorageRoot,
  iGM_EnsureExamImagesDir,
  iGM_RemoveExamImagesDir,
  iGM_ExamTempAbsolutePath,
  iGM_StoreExamTempFile,
  iGM_ParseExamDocumentToBlocks,
  iGM_RecognizeExamMeta,
  iGM_ReadExamTempFile,
  iGM_RemoveExamTempFile,
  iGM_ReadExamImage,
};