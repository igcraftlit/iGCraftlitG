/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_ExamIngestService.ts
 * 所属层：后端 / 业务服务层
 * 路由：G_Exam（/api/exam/upload）
 * 模块：iGM_ExamIngestService
 * 作用：试卷 PDF 落盘、前 3 页纯文本抽取与元数据正则识别
 * 内容：iGM_ExamError 业务错误类型、试卷存储目录解析与路径安全校验、
 *       PDF 校验与落盘、pdf-parse 文本抽取、Title/Subject/Issuer/Reviewer/
 *       Duration/Total Score/Question Count 中英文双语正则识别
 * 说明：试卷文件仅用于站内展示，磁盘绝对路径绝不出现在对外 DTO
 */

// 导入依赖 //
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { iGM_Config } from "../iGM_Config/iGM_Config";
import { iGM_RandomUuid } from "./iGM_SecurityService";
import { iGM_SanitizeOriginalName } from "./iGM_StorageService";
import type { iGM_ExamRecognized } from "../iGM_Types/iGM_Exam";

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
export interface iGM_ExamStoredPdf {
  /** 相对存储根目录的相对路径（入库 iGM_FileUrl，不对外暴露） */
  relativePath: string;
  /** 清理后的原始文件名（仅展示） */
  fileName: string;
}

/** 上传识别结果：识别字段 + 抽取文本 */
export interface iGM_ExamIngestResult {
  stored: iGM_ExamStoredPdf;
  rawText: string;
  recognized: iGM_ExamRecognized;
}

// 核心逻辑 //
/** 试卷 PDF 允许的最大体积（字节），默认 30MB */
const iGM_ExamMaxFileSize = Number(
  process.env.IGM_EXAM_MAX_FILE_SIZE ?? 30 * 1024 * 1024,
);
/** 抽取文本入库长度上限，避免异常 PDF 产生超大行 */
const iGM_ExamRawTextLimit = 20000;

/** 试卷存储根目录：D:/IGWEB/uploads/exams */
export function iGM_ExamStorageDir(): string {
  return (
    process.env.IGM_EXAM_UPLOAD_DIR ??
    join(iGM_Config.upload.rootDir, "exams")
  );
}

/** 确保试卷存储目录存在 */
export async function iGM_EnsureExamStorageRoot(): Promise<void> {
  await mkdir(iGM_ExamStorageDir(), { recursive: true });
}

/** 把相对路径解析为绝对路径，并强制校验仍位于试卷存储根目录内 */
function iGM_ResolveExamPath(relativePath: string): string {
  const root = resolve(iGM_ExamStorageDir());
  const target = resolve(root, relativePath);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new iGM_ExamError("试卷文件路径非法", 400);
  }
  return target;
}

/** 校验文件为 PDF（扩展名 + 内容签名 %PDF-），否则抛 422 */
function iGM_AssertPdf(fileName: string, bytes: Uint8Array): void {
  if (!/\.pdf$/i.test(fileName)) {
    throw new iGM_ExamError("仅支持上传 PDF 格式的试卷", 422);
  }
  if (bytes.byteLength <= 0) {
    throw new iGM_ExamError("上传的 PDF 文件为空", 422);
  }
  if (bytes.byteLength > iGM_ExamMaxFileSize) {
    throw new iGM_ExamError("PDF 文件超过 30MB 上限", 413);
  }
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 5));
  if (head !== "%PDF-") {
    throw new iGM_ExamError("文件内容不是有效的 PDF", 422);
  }
}

/**
 * 将 PDF 字节写入试卷存储目录（uuid 命名），返回相对路径与展示文件名
 */
async function iGM_StoreExamPdf(
  originalName: string,
  bytes: Uint8Array,
): Promise<iGM_ExamStoredPdf> {
  const fileName = iGM_SanitizeOriginalName(originalName);
  iGM_AssertPdf(fileName, bytes);
  await iGM_EnsureExamStorageRoot();

  const storedName = `${iGM_RandomUuid()}.pdf`;
  const absolutePath = iGM_ResolveExamPath(storedName);
  try {
    await writeFile(absolutePath, bytes);
  } catch {
    throw new iGM_ExamError("试卷文件保存失败", 500);
  }
  return { relativePath: storedName, fileName };
}

/** 抽取 PDF 前 3 页纯文本（pdf-parse v2，无对应页时回退为全文） */
async function iGM_ExtractExamText(bytes: Uint8Array): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: bytes });
  try {
    let text = "";
    try {
      const partial = await parser.getText({ partial: [1, 2, 3] });
      text = partial.text ?? "";
    } catch {
      // 少数 PDF 不支持部分抽取时回退为全文
      const full = await parser.getText();
      text = full.text ?? "";
    }
    return text.slice(0, iGM_ExamRawTextLimit);
  } catch {
    throw new iGM_ExamError("PDF 文本解析失败，请确认文件未加密", 422);
  } finally {
    await parser.destroy().catch(() => undefined);
  }
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
 * 从抽取文本中按正则识别试卷元数据
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

/**
 * 试卷入库主流程：校验并落盘 PDF → 抽取前 3 页文本 → 正则识别元数据
 */
export async function iGM_IngestExamPdf(
  file: File,
): Promise<iGM_ExamIngestResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const stored = await iGM_StoreExamPdf(file.name, bytes);
  const rawText = await iGM_ExtractExamText(bytes);
  return {
    stored,
    rawText,
    recognized: iGM_RecognizeExamMeta(rawText),
  };
}

/** 读取试卷 PDF 字节（站内预览使用） */
export async function iGM_ReadExamPdf(relativePath: string): Promise<Uint8Array> {
  const absolutePath = iGM_ResolveExamPath(relativePath);
  try {
    const buffer = await readFile(absolutePath);
    return new Uint8Array(buffer);
  } catch {
    throw new iGM_ExamError("试卷文件不存在", 404);
  }
}

/** 删除试卷 PDF（失败不抛出，由调用方决定是否忽略） */
export async function iGM_RemoveExamPdf(relativePath: string): Promise<void> {
  try {
    await rm(iGM_ResolveExamPath(relativePath), { force: true });
  } catch {
    console.warn(`[iGM_ExamIngestService] 删除试卷文件失败：${relativePath}`);
  }
}

// 导出 //
export default {
  iGM_ExamError,
  iGM_ExamStorageDir,
  iGM_EnsureExamStorageRoot,
  iGM_RecognizeExamMeta,
  iGM_IngestExamPdf,
  iGM_ReadExamPdf,
  iGM_RemoveExamPdf,
};
