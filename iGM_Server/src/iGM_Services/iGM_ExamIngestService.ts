/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_ExamIngestService.ts
 * 所属层：后端 / 业务服务层
 * 路由：G_Exam（/api/exam/upload、/api/exam/reparse 内部调用）
 * 模块：iGM_ExamIngestService
 * 作用：试卷 PDF 落盘临时目录、转换 HTML 目录管理、HTML 资源读取与元数据正则识别
 * 内容：iGM_ExamError 业务错误类型、存储根 / 临时目录 / HTML 目录 / 日志目录解析与路径安全校验、
 *       PDF 格式校验与落盘（随机名）、临时文件读写删除、HTML 首页与资源读取（剥标签取文本）、
 *       转换产物目录占用统计、
 *       Title/Subject/Issuer/Reviewer/Duration/Total Score/Question Count 中英文双语正则识别
 * 说明：本模块仅支持 PDF；转换成功后由业务层删除原始 PDF；
 *       磁盘绝对路径绝不出现在对外 DTO
 */

// 导入依赖 //
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { iGM_Config } from "../iGM_Config/iGM_Config";
import { iGM_RandomUuid } from "./iGM_SecurityService";
import { iGM_SanitizeOriginalName } from "./iGM_StorageService";
import {
  iGM_ResolveExamFileType,
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
  /** 相对临时目录的相对路径（入库 iGM_TempPath，不对外暴露） */
  relativePath: string;
  /** 清理后的原始文件名（仅展示） */
  fileName: string;
  /** 文档格式（固定 pdf） */
  fileType: iGM_ExamFileType;
  /** 文件字节数 */
  fileSize: number;
}

// 核心逻辑 //
/** 试卷文档允许的最大体积（字节），默认 50MB */
const iGM_ExamMaxFileSize = Number(
  process.env.IGM_EXAM_MAX_FILE_SIZE ?? 50 * 1024 * 1024,
);

/** 试卷标识白名单：uuid 主名，杜绝路径穿越 */
const iGM_ExamIdPattern = /^[A-Za-z0-9-]{1,64}$/;

/** HTML 资源文件名白名单：首字符字母数字，其余允许点划线下划线，杜绝 `..` */
const iGM_ExamHtmlName = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** PDF 文件头魔数：%PDF- */
const iGM_ExamPdfMagic = [0x25, 0x50, 0x44, 0x46, 0x2d];

/**
 * 试卷存储根目录
 * 优先级：IGM_EXAM_UPLOAD_DIR > UPLOAD_DIR > <本地存储根>/exams（D:/IGWEB/uploads/exams）
 */
export function iGM_ExamStorageRoot(): string {
  const explicit = process.env.IGM_EXAM_UPLOAD_DIR ?? process.env.UPLOAD_DIR;
  if (explicit && explicit.trim().length > 0) return resolve(explicit.trim());
  return resolve(iGM_Config.upload.rootDir, "exams");
}

/** 试卷临时文件目录：<根>/temp */
export function iGM_ExamTempDir(): string {
  return join(iGM_ExamStorageRoot(), "temp");
}

/** 试卷转换日志目录：<根>/logs */
export function iGM_ExamLogsDir(): string {
  return join(iGM_ExamStorageRoot(), "logs");
}

/** 指定试卷的 HTML 目录绝对路径：<根>/<examId>/html */
export function iGM_ExamHtmlDir(examId: string): string {
  return join(iGM_ExamStorageRoot(), examId, "html");
}

/** 指定试卷 HTML 目录相对存储根目录的路径（入库 iGM_HtmlPath） */
export function iGM_ExamHtmlRelativePath(examId: string): string {
  return `${examId}/html`;
}

/** 指定试卷转换后 HTML 首页的可访问地址（iframe src / 静态路由） */
export function iGM_ExamHtmlApiPath(examId: string): string {
  return `/uploads/exams/${examId}/html/index.html`;
}

/** 确保试卷存储根下的临时目录与日志目录存在 */
export async function iGM_EnsureExamStorageRoot(): Promise<void> {
  await mkdir(iGM_ExamTempDir(), { recursive: true });
  await mkdir(iGM_ExamLogsDir(), { recursive: true });
}

/** 确保指定试卷的 HTML 目录存在（转换前调用，不清理旧产物） */
export async function iGM_EnsureExamHtmlDir(examId: string): Promise<void> {
  await mkdir(iGM_ExamHtmlDir(examId), { recursive: true });
}

/** 递归统计目录内全部文件的字节数（目录不存在或读取失败按 0 处理） */
async function iGM_MeasureDirSize(dir: string): Promise<number> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  let total = 0;
  for (const entry of entries) {
    const child = join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await iGM_MeasureDirSize(child);
    } else if (entry.isFile()) {
      try {
        total += (await stat(child)).size;
      } catch {
        // 单个文件读取失败忽略，不影响整体统计
      }
    }
  }
  return total;
}

/**
 * 统计某试卷转换产物的实际占用字节数
 * 统计范围：<存储根>/<examId>（含 html 目录及其中的图片等资源）
 */
export async function iGM_MeasureExamUsage(examId: string): Promise<number> {
  if (!iGM_ExamIdPattern.test(examId)) return 0;
  return iGM_MeasureDirSize(join(iGM_ExamStorageRoot(), examId));
}

/** 删除指定试卷的整个转换目录（试卷删除 / 重新转换前调用） */
export async function iGM_RemoveExamHtmlDir(examId: string): Promise<void> {
  try {
    await rm(join(iGM_ExamStorageRoot(), examId), {
      recursive: true,
      force: true,
    });
  } catch {
    console.warn(`[iGM_ExamIngestService] 删除试卷转换目录失败：${examId}`);
  }
}

/** 把相对路径解析为绝对路径，并强制校验仍位于试卷临时目录内 */
function iGM_ResolveExamTempPath(relativePath: string): string {
  const root = resolve(iGM_ExamTempDir());
  const target = resolve(root, relativePath);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new iGM_ExamError("试卷文件路径非法", 400);
  }
  return target;
}

/** 试卷临时文件的绝对路径（供 pdf2htmlEX 读取） */
export function iGM_ExamTempAbsolutePath(relativePath: string): string {
  return iGM_ResolveExamTempPath(relativePath);
}

/** 校验 HTML 资源文件名并解析为绝对路径，强制仍位于该试卷的 HTML 目录内 */
export function iGM_ResolveExamHtmlAssetPath(
  examId: string,
  name: string,
): string {
  if (!iGM_ExamIdPattern.test(examId)) {
    throw new iGM_ExamError("试卷标识非法", 400);
  }
  if (!iGM_ExamHtmlName.test(name)) {
    throw new iGM_ExamError("试卷资源路径非法", 400);
  }
  const root = resolve(iGM_ExamHtmlDir(examId));
  const target = resolve(root, name);
  if (!target.startsWith(root + sep)) {
    throw new iGM_ExamError("试卷资源路径非法", 400);
  }
  return target;
}

/** 判断字节流是否以指定魔数开头 */
function iGM_HasMagic(bytes: Uint8Array, magic: readonly number[]): boolean {
  if (bytes.byteLength < magic.length) return false;
  return magic.every((value, index) => bytes[index] === value);
}

/** 校验 PDF 格式与体积，内容与扩展名不符时抛 422 */
function iGM_AssertExamFile(bytes: Uint8Array): void {
  if (bytes.byteLength <= 0) {
    throw new iGM_ExamError("上传的试卷文件为空", 422);
  }
  if (bytes.byteLength > iGM_ExamMaxFileSize) {
    throw new iGM_ExamError("试卷文件超过 50MB 上限", 413);
  }
  if (!iGM_HasMagic(bytes, iGM_ExamPdfMagic)) {
    throw new iGM_ExamError("文件内容不是有效的 PDF", 422);
  }
}

/**
 * 将上传的 PDF 写入临时目录（随机名防冲突），返回落盘信息
 * 非 PDF 或内容非法一律拒绝
 */
export async function iGM_StoreExamTempFile(
  originalName: string,
  bytes: Uint8Array,
): Promise<iGM_ExamStoredFile> {
  const fileName = iGM_SanitizeOriginalName(originalName);
  const fileType = iGM_ResolveExamFileType(fileName);
  if (!fileType) {
    throw new iGM_ExamError("仅支持 PDF 格式的试卷文件", 422);
  }
  iGM_AssertExamFile(bytes);
  await iGM_EnsureExamStorageRoot();

  const storedName = `${iGM_RandomUuid()}.${fileType}`;
  const absolutePath = iGM_ResolveExamTempPath(storedName);
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

/** 读取临时文件字节（原始文件下载使用） */
export async function iGM_ReadExamTempFile(
  relativePath: string,
): Promise<Uint8Array> {
  const absolutePath = iGM_ResolveExamTempPath(relativePath);
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
    await rm(iGM_ResolveExamTempPath(relativePath), { force: true });
  } catch {
    console.warn(`[iGM_ExamIngestService] 删除试卷文件失败：${relativePath}`);
  }
}

/**
 * 读取转换后试卷的 HTML 首页文本（剥标签）用于元数据识别
 * 首页缺失时抛 404（转换未完成或产物被清理）
 */
export async function iGM_ReadExamHtmlText(examId: string): Promise<string> {
  const absolutePath = iGM_ResolveExamHtmlAssetPath(examId, "index.html");
  try {
    const html = await readFile(absolutePath, "utf8");
    return iGM_StripHtml(html);
  } catch {
    throw new iGM_ExamError("试卷 HTML 不存在", 404);
  }
}

/** 读取转换后试卷目录内的任意资源字节（字体 / 图片 / CSS / JS） */
export async function iGM_ReadExamHtmlAsset(
  examId: string,
  name: string,
): Promise<Uint8Array> {
  const absolutePath = iGM_ResolveExamHtmlAssetPath(examId, name);
  try {
    const buffer = await readFile(absolutePath);
    return new Uint8Array(buffer);
  } catch {
    throw new iGM_ExamError("试卷资源不存在", 404);
  }
}

/** 剥离 HTML 标签与脚本样式，归一化空白，得到可正则匹配的纯文本 */
function iGM_StripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code: string) =>
      String.fromCharCode(Number(code)),
    )
    .replace(/\s+/g, " ")
    .trim();
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
 * 从转换后 HTML 的纯文本中按正则识别试卷元数据
 * 规则来自模块规格：中英文双语模式，命中即取（识别失败由管理员补全）
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

// 导出 //
export default {
  iGM_ExamError,
  iGM_ExamStorageRoot,
  iGM_ExamTempDir,
  iGM_ExamLogsDir,
  iGM_ExamHtmlDir,
  iGM_ExamHtmlRelativePath,
  iGM_ExamHtmlApiPath,
  iGM_EnsureExamStorageRoot,
  iGM_EnsureExamHtmlDir,
  iGM_MeasureExamUsage,
  iGM_RemoveExamHtmlDir,
  iGM_ExamTempAbsolutePath,
  iGM_ResolveExamHtmlAssetPath,
  iGM_StoreExamTempFile,
  iGM_ReadExamTempFile,
  iGM_RemoveExamTempFile,
  iGM_ReadExamHtmlText,
  iGM_ReadExamHtmlAsset,
  iGM_RecognizeExamMeta,
};