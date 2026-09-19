/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_StorageService.ts
 * 所属层：后端 / 基础服务层
 * 路由：G_File
 * 模块：iGM_StorageService
 * 作用：本地磁盘文件存储与读取的唯一出口
 * 内容：上传校验（扩展名白名单、MIME 白名单、体积上限、magic bytes 内容探测、
 *       图片像素上限）、按 上传者/年月 分目录落盘、唯一文件名生成、SHA-256 计算、
 *       安全读取与删除（含路径穿越防护）
 * 安全：磁盘绝对路径绝不出现在对外 DTO；原始文件名不参与磁盘路径构造；
 *       所有解析后的路径必须仍位于配置的存储根目录内；
 *       扩展名与客户端 MIME 仅作初筛，最终以文件内容探测结果为准
 */

// 导入依赖 //
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { iGM_Config } from "../iGM_Config/iGM_Config";
import { iGM_RandomUuid } from "./iGM_SecurityService";
import {
  iGM_DetectFileByBytes,
  type iGM_DetectedFile,
  type iGM_FileFamily,
} from "./iGM_FileSignatureService";

// 类型定义 //
/** 落盘结果 */
export interface iGM_StoredFile {
  /** 存储用唯一文件名（uuid + 扩展名） */
  fileName: string;
  /** 相对存储根目录的相对路径（用于入库，不对外暴露） */
  relativePath: string;
  /** 绝对路径（仅后端内部使用） */
  absolutePath: string;
  /** 字节数 */
  size: number;
  /** 内容 SHA-256 */
  hash: string;
  /** 经内容探测确认后的规范 MIME（入库使用） */
  mimeType: string;
}

/** 存储校验失败错误：message 为前端 i18n 文案键 */
export class iGM_StorageError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "iGM_StorageError";
  }
}

// 核心逻辑 //
/**
 * 扩展名 → 期望文件族与规范 MIME 映射
 * 说明：ZIP 容器族包含 Office OOXML、jar 与 Minecraft 附加包；
 *       OLE 族为旧版 Office；文本族为纯文本类格式
 */
const iGM_ExtensionSpec: Record<
  string,
  { family: iGM_FileFamily; mime: string }
> = {
  png: { family: "image", mime: "image/png" },
  jpg: { family: "image", mime: "image/jpeg" },
  jpeg: { family: "image", mime: "image/jpeg" },
  gif: { family: "image", mime: "image/gif" },
  webp: { family: "image", mime: "image/webp" },
  bmp: { family: "image", mime: "image/bmp" },
  svg: { family: "image", mime: "image/svg+xml" },
  pdf: { family: "pdf", mime: "application/pdf" },
  zip: { family: "zip", mime: "application/zip" },
  jar: {
    family: "zip",
    mime: "application/java-archive",
  },
  mcpack: { family: "zip", mime: "application/zip" },
  mcaddon: { family: "zip", mime: "application/zip" },
  mcworld: { family: "zip", mime: "application/zip" },
  docx: {
    family: "zip",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  xlsx: {
    family: "zip",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  pptx: {
    family: "zip",
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  },
  rar: { family: "rar", mime: "application/x-rar-compressed" },
  gz: { family: "gzip", mime: "application/gzip" },
  "7z": { family: "sevenZip", mime: "application/x-7z-compressed" },
  tar: { family: "tar", mime: "application/x-tar" },
  doc: { family: "ole", mime: "application/msword" },
  xls: { family: "ole", mime: "application/vnd.ms-excel" },
  ppt: {
    family: "ole",
    mime: "application/vnd.ms-powerpoint",
  },
  txt: { family: "text", mime: "text/plain" },
  md: { family: "text", mime: "text/markdown" },
  csv: { family: "text", mime: "text/csv" },
  json: { family: "text", mime: "application/json" },
  xml: { family: "text", mime: "application/xml" },
  yml: { family: "text", mime: "text/yaml" },
  yaml: { family: "text", mime: "text/yaml" },
};

/**
 * 客户端声明 MIME → 文件族映射（用于与内容探测结果交叉比对）
 * 通用二进制 octet-stream 视为中性，不参与比对
 */
const iGM_DeclaredMimeFamily: Record<string, iGM_FileFamily> = {
  "image/png": "image",
  "image/jpeg": "image",
  "image/gif": "image",
  "image/webp": "image",
  "image/bmp": "image",
  "image/svg+xml": "image",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
  "application/java-archive": "zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "zip",
  "application/vnd.ms-excel": "ole",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "zip",
  "application/vnd.ms-powerpoint": "ole",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "zip",
  "application/x-rar-compressed": "rar",
  "application/gzip": "gzip",
  "application/x-7z-compressed": "sevenZip",
  "application/x-tar": "tar",
  "text/plain": "text",
  "text/markdown": "text",
  "text/csv": "text",
  "application/json": "text",
  "application/xml": "text",
  "text/xml": "text",
  "text/yaml": "text",
};

/** 取小写扩展名（不含点）；无扩展名返回空串 */
export function iGM_ResolveExtension(originalName: string): string {
  const raw = extname(originalName).replace(/^\./, "").toLowerCase();
  // 仅保留字母数字，防止 "png/../../etc" 之类的畸形扩展名
  return /^[a-z0-9]{1,10}$/.test(raw) ? raw : "";
}

/** 清理原始文件名：剥离目录部分与控制字符，仅用于展示 */
export function iGM_SanitizeOriginalName(originalName: string): string {
  const base = originalName.split(/[\\/]/).pop() ?? "file";
  const cleaned = base
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/[<>:"|?*]/g, "_")
    .trim();
  const safe = cleaned.length > 0 ? cleaned : "file";
  return safe.length > 180 ? safe.slice(-180) : safe;
}

/**
 * 规范化 MIME：去掉参数段（如 charset=utf-8）并转小写
 * 说明：部分客户端会把 "text/plain" 传成 "text/plain;charset=utf-8"，
 *       白名单为精确匹配，必须先剥离参数再比较
 */
export function iGM_NormalizeMimeType(mimeType: string): string {
  return mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
}

/**
 * 校验上传文件：扩展名、声明 MIME、体积、文件内容签名须全部通过
 * @param bytes 文件完整字节，用于 magic bytes 内容探测
 * @param options.imageOnly true 时仅允许图片（封面上传场景）
 * @returns 扩展名、规范 MIME 与探测结果
 * @throws iGM_StorageError 422 校验失败 / 413 体积超限
 */
export function iGM_ValidateUpload(
  originalName: string,
  mimeType: string,
  size: number,
  bytes: Uint8Array,
  options?: { imageOnly?: boolean },
): {
  extension: string;
  canonicalMime: string;
  detected: iGM_DetectedFile;
} {
  const extension = iGM_ResolveExtension(originalName);
  const spec = extension
    ? iGM_ExtensionSpec[extension]
    : undefined;
  if (
    !extension ||
    !iGM_Config.upload.allowedExtensions.includes(extension) ||
    !spec
  ) {
    throw new iGM_StorageError("file.errors.typeNotAllowed", 422);
  }
  // MIME 允许为空（部分客户端不提供），非空时必须在白名单内
  const normalizedMime = iGM_NormalizeMimeType(mimeType);
  if (
    normalizedMime.length > 0 &&
    !iGM_Config.upload.allowedMimeTypes.includes(normalizedMime)
  ) {
    throw new iGM_StorageError("file.errors.typeNotAllowed", 422);
  }
  if (size <= 0) {
    throw new iGM_StorageError("file.errors.emptyFile", 422);
  }
  if (size > iGM_Config.upload.maxFileSize) {
    throw new iGM_StorageError("file.errors.tooLarge", 413);
  }

  // 内容探测：扩展名与声明 MIME 均可伪造，以真实文件头/结构为准
  const detected = iGM_DetectFileByBytes(bytes);
  if (!detected || detected.family !== spec.family) {
    throw new iGM_StorageError("file.errors.signatureMismatch", 422);
  }

  // 声明 MIME 与内容族交叉比对：例如 PDF 内容却声明 image/png 一律拒绝
  if (normalizedMime.length > 0) {
    const declaredFamily = iGM_DeclaredMimeFamily[normalizedMime];
    if (declaredFamily && declaredFamily !== spec.family) {
      throw new iGM_StorageError("file.errors.signatureMismatch", 422);
    }
  }

  // 封面场景：仅接受真实图片
  if (options?.imageOnly && detected.family !== "image") {
    throw new iGM_StorageError("file.errors.imageOnly", 422);
  }

  // 光栅图片像素上限：防止超大尺寸图片在客户端/服务端解码时耗尽内存
  if (
    detected.family === "image" &&
    detected.width !== null &&
    detected.height !== null &&
    (detected.width > iGM_Config.upload.imageMaxDimension ||
      detected.height > iGM_Config.upload.imageMaxDimension)
  ) {
    throw new iGM_StorageError("file.errors.imageDimension", 422);
  }

  return { extension, canonicalMime: spec.mime, detected };
}

/** 确保存储根目录存在 */
export async function iGM_EnsureUploadRoot(): Promise<void> {
  await mkdir(iGM_Config.upload.rootDir, { recursive: true });
}

/**
 * 将字节写入磁盘：按 上传者/年月 分目录，使用 uuid 重命名
 * @param options.imageOnly true 时仅允许图片（封面上传场景）
 * @throws iGM_StorageError 500 落盘失败
 */
export async function iGM_StoreFileBytes(
  uploaderId: string,
  originalName: string,
  mimeType: string,
  bytes: Uint8Array,
  options?: { imageOnly?: boolean },
): Promise<iGM_StoredFile> {
  const { extension, canonicalMime } = iGM_ValidateUpload(
    originalName,
    mimeType,
    bytes.byteLength,
    bytes,
    options,
  );

  // 上传者目录使用 UUID，天然不含路径分隔符
  const safeUploader = uploaderId.replace(/[^a-zA-Z0-9-]/g, "");
  const now = new Date();
  const folder = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const fileName = `${iGM_RandomUuid()}.${extension}`;
  const relativePath = join(safeUploader, folder, fileName);
  const absolutePath = iGM_ResolveInsideRoot(relativePath);

  try {
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, bytes);
  } catch {
    throw new iGM_StorageError("file.errors.storeFailed", 500);
  }

  const hash = new Bun.CryptoHasher("sha256")
    .update(bytes)
    .digest("hex");

  return {
    fileName,
    relativePath,
    absolutePath,
    size: bytes.byteLength,
    hash,
    mimeType: canonicalMime,
  };
}

/**
 * 将相对路径解析为绝对路径，并强制校验仍位于存储根目录内
 * @throws iGM_StorageError 400 路径非法
 */
export function iGM_ResolveInsideRoot(relativePath: string): string {
  const root = resolve(iGM_Config.upload.rootDir);
  const target = resolve(root, relativePath);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new iGM_StorageError("file.errors.pathInvalid", 400);
  }
  return target;
}

/** 读取文件字节（下载与预览共用） */
export async function iGM_ReadFileBytes(
  relativePath: string,
): Promise<Uint8Array> {
  const absolutePath = iGM_ResolveInsideRoot(relativePath);
  try {
    const buffer = await readFile(absolutePath);
    return new Uint8Array(buffer);
  } catch {
    throw new iGM_StorageError("file.errors.notFound", 404);
  }
}

/** 判断磁盘文件是否存在 */
export async function iGM_FileExists(relativePath: string): Promise<boolean> {
  try {
    const info = await stat(iGM_ResolveInsideRoot(relativePath));
    return info.isFile();
  } catch {
    return false;
  }
}

/** 删除磁盘文件（失败不抛出，由调用方决定是否忽略） */
export async function iGM_RemoveFile(relativePath: string): Promise<void> {
  try {
    await rm(iGM_ResolveInsideRoot(relativePath), { force: true });
  } catch {
    // 文件已不存在或权限不足：记录日志即可，不影响数据库清理
    console.warn(`[iGM_StorageService] 删除文件失败：${relativePath}`);
  }
}

// 导出 //
export default {
  iGM_StorageError,
  iGM_ResolveExtension,
  iGM_SanitizeOriginalName,
  iGM_ValidateUpload,
  iGM_EnsureUploadRoot,
  iGM_StoreFileBytes,
  iGM_ResolveInsideRoot,
  iGM_ReadFileBytes,
  iGM_FileExists,
  iGM_RemoveFile,
};
