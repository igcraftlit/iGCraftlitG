/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_ExamIngestService.ts
 * 所属层：后端 / 业务服务层
 * 路由：G_Exam（/api/exam/upload、/api/exam/reparse 内部调用）
 * 模块：iGM_ExamIngestService
 * 作用：试卷 PDF 落盘临时目录、转换 HTML 目录管理、HTML 资源读取与答案附件存取
 * 内容：iGM_ExamError 业务错误类型、存储根 / 临时目录 / HTML 目录 / 答案目录 / 日志目录解析与路径安全校验、
 *       PDF 格式校验与落盘（随机名）、临时文件读写删除、HTML 资源读取、答案附件存取删除、
 *       转换产物目录占用统计、页面基准尺寸解析、禁止横向溢出样式注入
 * 说明：本模块仅支持 PDF；转换成功后由业务层删除原始 PDF；
 *       答案附件独立存放于 <根>/<examId>/answer/，同样仅支持 PDF（≤20MB）；
 *       试卷元数据由管理员手工填写，不在此层做任何正则识别；
 *       磁盘绝对路径绝不出现在对外 DTO
 */

// 导入依赖 //
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import { iGM_Config } from "../iGM_Config/iGM_Config";
import { iGM_RandomUuid } from "./iGM_SecurityService";
import { iGM_SanitizeOriginalName } from "./iGM_StorageService";
import {
  iGM_ResolveExamFileType,
  type iGM_ExamFileType,
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

/** 答案附件允许的最大体积（字节），默认 20MB */
const iGM_ExamMaxAnswerSize = Number(
  process.env.IGM_EXAM_MAX_ANSWER_SIZE ?? 20 * 1024 * 1024,
);

/** 试卷标识白名单：uuid 主名，杜绝路径穿越 */
const iGM_ExamIdPattern = /^[A-Za-z0-9-]{1,64}$/;

/** HTML 资源文件名白名单：首字符字母数字，其余允许点划线下划线，杜绝 `..` */
const iGM_ExamHtmlName = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** PDF 文件头魔数：%PDF- */
const iGM_ExamPdfMagic = [0x25, 0x50, 0x44, 0x46, 0x2d];

/** 注入到转换产物 index.html 的样式元素 id（幂等标记，避免重复注入） */
const iGM_ExamHtmlOverrideMarker = "igm-exam-overrides";

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

/** 答案附件目录绝对路径：<根>/<examId>/answer */
export function iGM_ExamAnswerDir(examId: string): string {
  return join(iGM_ExamStorageRoot(), examId, "answer");
}

/** 答案附件下载 / 预览接口地址（后端可用时） */
export function iGM_ExamAnswerApiPath(examId: string): string {
  return `/api/exam/answer?examId=${encodeURIComponent(examId)}`;
}

/** 答案附件静态地址（随前端部署，如 /exams/<examId>/answer/<name>） */
export function iGM_ExamAnswerStaticPath(
  examId: string,
  fileName: string,
): string {
  return `/exams/${examId}/answer/${fileName}`;
}

/** 把相对路径解析为绝对路径，并强制校验仍位于试卷存储根目录内 */
function iGM_ResolveExamStoragePath(relativePath: string): string {
  const root = resolve(iGM_ExamStorageRoot());
  const target = resolve(root, relativePath);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new iGM_ExamError("试卷文件路径非法", 400);
  }
  return target;
}

/** 答案附件的绝对路径（相对存储根目录，形如 <examId>/answer/<name>） */
export function iGM_ExamAnswerAbsolutePath(relativePath: string): string {
  return iGM_ResolveExamStoragePath(relativePath);
}

/** 答案附件展示用文件名（取相对路径最后一段） */
export function iGM_ExamAnswerFileName(relativePath: string): string {
  return basename(relativePath);
}

/**
 * 保存答案附件 PDF：清空旧附件后写入 <根>/<examId>/answer/<原名>
 * 非 PDF 或超过 20MB 一律拒绝
 */
export async function iGM_StoreExamAnswerFile(
  examId: string,
  originalName: string,
  bytes: Uint8Array,
): Promise<{ relativePath: string; fileName: string; fileSize: number }> {
  if (!iGM_ExamIdPattern.test(examId)) {
    throw new iGM_ExamError("试卷标识非法", 400);
  }
  const fileName = iGM_SanitizeOriginalName(originalName);
  if (!iGM_ResolveExamFileType(fileName)) {
    throw new iGM_ExamError("答案附件仅支持 PDF 格式", 422);
  }
  if (bytes.byteLength <= 0) {
    throw new iGM_ExamError("上传的答案附件为空", 422);
  }
  if (bytes.byteLength > iGM_ExamMaxAnswerSize) {
    throw new iGM_ExamError("答案附件超过 20MB 上限", 413);
  }
  if (!iGM_HasMagic(bytes, iGM_ExamPdfMagic)) {
    throw new iGM_ExamError("答案附件内容不是有效的 PDF", 422);
  }

  await iGM_RemoveExamAnswerDir(examId);
  const dir = iGM_ExamAnswerDir(examId);
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, fileName), bytes);
  } catch {
    throw new iGM_ExamError("答案附件保存失败", 500);
  }
  return {
    relativePath: `${examId}/answer/${fileName}`,
    fileName,
    fileSize: bytes.byteLength,
  };
}

/** 读取答案附件字节（后端可用时下载 / 预览） */
export async function iGM_ReadExamAnswerFile(
  relativePath: string,
): Promise<Uint8Array> {
  try {
    const buffer = await readFile(iGM_ResolveExamStoragePath(relativePath));
    return new Uint8Array(buffer);
  } catch {
    throw new iGM_ExamError("答案附件不存在", 404);
  }
}

/** 删除答案附件目录（重新上传前 / 试卷删除时调用，失败不抛出） */
export async function iGM_RemoveExamAnswerDir(examId: string): Promise<void> {
  if (!iGM_ExamIdPattern.test(examId)) return;
  try {
    await rm(iGM_ExamAnswerDir(examId), { recursive: true, force: true });
  } catch {
    console.warn(`[iGM_ExamIngestService] 删除答案附件目录失败：${examId}`);
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

/**
 * 在转换产物 index.html 中注入「禁止横向溢出」的样式（幂等）
 * pdf2htmlEX 以绝对定位还原 PDF 版面，页面宽度固定为 PDF 页宽；
 * 前端会按后端上报的页宽设定 iframe 视口，此处仅作为子像素取整的兜底，
 * 只隐藏横向溢出，不改动页面宽度与纵向滚动
 */
export async function iGM_ApplyExamHtmlOverrides(examId: string): Promise<void> {
  if (!iGM_ExamIdPattern.test(examId)) return;
  const absolutePath = iGM_ResolveExamHtmlAssetPath(examId, "index.html");
  let html: string;
  try {
    html = await readFile(absolutePath, "utf8");
  } catch {
    return;
  }
  if (html.includes(iGM_ExamHtmlOverrideMarker)) return;
  // 只做「防溢出」处理：不改动 pdf2htmlEX 的绝对定位坐标与页面宽度。
  // #page-container 的横向溢出仅在其视口不小于真实页宽时才隐藏（此时内容本就不会溢出，
  // 仅消除子像素取整产生的滚动条）；视口更窄时保留滚动，避免裁切内容
  const pageSize = await iGM_ReadExamPageSize(examId);
  const fitRule = pageSize
    ? `@media (min-width:${pageSize.width}px){#page-container{overflow-x:hidden;}}`
    : "";
  const style =
    `<style id="${iGM_ExamHtmlOverrideMarker}">` +
    `html,body{max-width:100%;overflow-x:hidden;}` +
    fitRule +
    `img{max-width:100%;height:auto;}` +
    `table{width:100%;table-layout:fixed;word-break:break-word;}` +
    `p,div,pre,code{max-width:100%;word-wrap:break-word;}` +
    `</style>`;
  const injected = html.includes("</head>")
    ? html.replace("</head>", `${style}</head>`)
    : `${style}${html}`;
  try {
    await writeFile(absolutePath, injected, "utf8");
  } catch (error) {
    console.warn(
      `[iGM_ExamIngestService] 注入试卷样式失败：${examId}：${String(error)}`,
    );
  }
}

/** 试卷页面基准尺寸（CSS 像素） */
export interface iGM_ExamPageSize {
  width: number;
  height: number;
}

/** 从 CSS 文本中读取指定类名规则里的 px 尺寸（未命中返回 null） */
function iGM_MatchCssSize(
  css: string,
  className: string,
  property: "width" | "height",
): number | null {
  const pattern = new RegExp(
    `\\.${className}\\s*\\{[^}]*?${property}\\s*:\\s*([0-9.]+)px`,
    "i",
  );
  const matched = pattern.exec(css);
  if (!matched) return null;
  const value = Number(matched[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * 解析转换后试卷的页面基准尺寸（CSS 像素）
 * 步骤：从 index.html 定位首个页面框架的类名（如 `<div class="pf w0 h0">`），
 *       再在内嵌样式或同目录外链样式表中读取 `.wN{width}` 与 `.hN{height}`；
 * 解析失败返回 null（前端回退 A4 基准）
 */
export async function iGM_ReadExamPageSize(
  examId: string,
): Promise<iGM_ExamPageSize | null> {
  if (!iGM_ExamIdPattern.test(examId)) return null;
  let html: string;
  try {
    html = await readFile(
      iGM_ResolveExamHtmlAssetPath(examId, "index.html"),
      "utf8",
    );
  } catch {
    return null;
  }
  const frame = /\bclass="[^"]*?\bw(\d+)\b[^"]*?\bh(\d+)\b[^"]*?"/i.exec(html);
  if (!frame) return null;
  const widthClass = `w${frame[1]}`;
  const heightClass = `h${frame[2]}`;

  // 样式来源：内嵌样式优先，其次同目录下的外链样式表
  const sources: string[] = [html];
  try {
    const dir = iGM_ExamHtmlDir(examId);
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".css")) continue;
      try {
        sources.push(await readFile(join(dir, entry.name), "utf8"));
      } catch {
        // 单个样式表读取失败忽略
      }
    }
  } catch {
    // 目录读取失败忽略，仅使用内嵌样式
  }

  for (const source of sources) {
    const width = iGM_MatchCssSize(source, widthClass, "width");
    const height = iGM_MatchCssSize(source, heightClass, "height");
    if (width !== null && height !== null) {
      return {
        width: Math.round(width * 100) / 100,
        height: Math.round(height * 100) / 100,
      };
    }
  }
  return null;
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
  iGM_ExamAnswerDir,
  iGM_ExamAnswerApiPath,
  iGM_ExamAnswerStaticPath,
  iGM_ExamAnswerAbsolutePath,
  iGM_ExamAnswerFileName,
  iGM_StoreExamAnswerFile,
  iGM_ReadExamAnswerFile,
  iGM_RemoveExamAnswerDir,
  iGM_ReadExamHtmlAsset,
  iGM_ApplyExamHtmlOverrides,
  iGM_ReadExamPageSize,
};