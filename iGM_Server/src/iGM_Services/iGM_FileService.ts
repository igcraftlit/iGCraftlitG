/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_FileService.ts
 * 所属层：后端 / 业务逻辑层
 * 路由：G_File
 * 模块：iGM_FileService
 * 作用：文件上传、列表、详情、下载、预览与删除的业务编排
 * 内容：FormData 文件提取、存储校验与落盘、元数据入库、
 *       个人文件分页查询、下载/预览响应构造、删除前的引用保护
 * 安全：仅上传者可删除自己的文件，moderator 与 admin 可删除任意文件；
 *       磁盘路径不下发前端；下载与预览统一经后端接口返回
 */

// 导入依赖 //
import {
  iGM_CountFileReferences,
  iGM_CreateFile,
  iGM_DeleteFile,
  iGM_FindFileById,
  iGM_ListFilesByUploader,
} from "../iGM_Repositories/iGM_FileRepository";
import {
  iGM_NormalizeMimeType,
  iGM_ReadFileBytes,
  iGM_RemoveFile,
  iGM_SanitizeOriginalName,
  iGM_StoreFileBytes,
} from "./iGM_StorageService";
import { iGM_ContentError } from "./iGM_ContentService";
import { iGM_ToFileDto, type iGM_FileDto, type iGM_FileListData } from "../iGM_Types/iGM_File";
import type { iGM_UserRow } from "../iGM_Types/iGM_Auth";

// 类型定义 //
/** 文件下载/预览响应载荷 */
export interface iGM_FileContent {
  fileName: string;
  originalName: string;
  mimeType: string;
  bytes: Uint8Array;
}

// 核心逻辑 //
const iGM_DefaultPageSize = 20;
const iGM_MaxPageSize = 100;

/** 协管员及以上可管理任意文件 */
function iGM_CanModerate(user: iGM_UserRow): boolean {
  return user.iGM_Role === "moderator" || user.iGM_Role === "admin";
}

/** 从请求体中提取上传文件（兼容 FormData 与 Elysia 解析后的对象） */
export function iGM_ExtractUploadFile(body: unknown): File | null {
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    const candidate = body.get("file");
    return candidate instanceof File ? candidate : null;
  }
  const source = (body ?? {}) as Record<string, unknown>;
  const candidate = source.file;
  return candidate instanceof File ? candidate : null;
}

/**
 * 从请求体提取上传类型：
 * kind=image 表示封面类图片上传，服务端强制要求真实图片内容；
 * 缺省或其他值按通用文件处理
 */
export function iGM_ExtractUploadKind(body: unknown): "image" | "file" {
  let raw: unknown;
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    raw = body.get("kind");
  } else {
    raw = ((body ?? {}) as Record<string, unknown>).kind;
  }
  return raw === "image" ? "image" : "file";
}

/** 规范化分页参数 */
function iGM_ResolvePagination(
  pageRaw?: number,
  pageSizeRaw?: number,
): { page: number; pageSize: number } {
  const page =
    Number.isFinite(pageRaw) && (pageRaw as number) >= 1
      ? Math.floor(pageRaw as number)
      : 1;
  const pageSize =
    Number.isFinite(pageSizeRaw) &&
    (pageSizeRaw as number) >= 1 &&
    (pageSizeRaw as number) <= iGM_MaxPageSize
      ? Math.floor(pageSizeRaw as number)
      : iGM_DefaultPageSize;
  return { page, pageSize };
}

/* ---------- 上传 ---------- */

/**
 * 上传文件：校验类型/体积/内容签名 → 落盘 → 写入元数据 → 返回 DTO
 * @param kind image 时强制要求真实图片（封面上传场景）
 */
export async function iGM_UploadFileService(
  user: iGM_UserRow,
  file: File | null,
  kind: "image" | "file" = "file",
): Promise<iGM_FileDto> {
  if (!file) {
    throw new iGM_ContentError("file.errors.noFile", 422);
  }
  const originalName = iGM_SanitizeOriginalName(file.name || "file");
  // 规范化 MIME：剥离 charset 等参数段，与白名单口径保持一致
  const declaredMime = iGM_NormalizeMimeType(file.type || "");
  const bytes = new Uint8Array(await file.arrayBuffer());

  const stored = await iGM_StoreFileBytes(
    user.iGM_Id,
    originalName,
    declaredMime,
    bytes,
    { imageOnly: kind === "image" },
  );

  const row = iGM_CreateFile({
    id: iGM_RandomFileId(),
    uploaderId: user.iGM_Id,
    fileName: stored.fileName,
    originalName,
    // 入库 MIME 以服务端内容探测结果为准，客户端声明仅用于校验
    mimeType: stored.mimeType,
    size: stored.size,
    path: stored.relativePath,
    hash: stored.hash,
    now: new Date().toISOString(),
  });

  return iGM_ToFileDto(row);
}

/** 生成文件主键（复用随机 UUID，保持与其他表一致） */
function iGM_RandomFileId(): string {
  return crypto.randomUUID();
}

/* ---------- 查询 ---------- */

/** 分页查询本人上传的文件 */
export function iGM_ListMyFilesService(
  user: iGM_UserRow,
  pageRaw?: number,
  pageSizeRaw?: number,
): iGM_FileListData {
  const { page, pageSize } = iGM_ResolvePagination(pageRaw, pageSizeRaw);
  const { items, total } = iGM_ListFilesByUploader(
    user.iGM_Id,
    page,
    pageSize,
  );
  return {
    items: items.map(iGM_ToFileDto),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** 获取文件元数据 DTO（不存在抛 404） */
export function iGM_GetFileDto(fileId: string): iGM_FileDto {
  const row = iGM_FindFileById(fileId);
  if (!row) throw new iGM_ContentError("file.errors.notFound", 404);
  return iGM_ToFileDto(row);
}

/** 批量获取文件 DTO：fileId -> DTO（供资源/活动列表组装封面） */
export function iGM_GetFileDtoMap(
  fileIds: (string | null | undefined)[],
): Map<string, iGM_FileDto> {
  const map = new Map<string, iGM_FileDto>();
  for (const id of fileIds) {
    if (!id || map.has(id)) continue;
    const row = iGM_FindFileById(id);
    if (row) map.set(id, iGM_ToFileDto(row));
  }
  return map;
}

/* ---------- 下载与预览 ---------- */

/** 读取文件内容用于下载或预览（任何访客均可读取公开资源附件） */
export async function iGM_ReadFileContentService(
  fileId: string,
): Promise<iGM_FileContent> {
  const row = iGM_FindFileById(fileId);
  if (!row) throw new iGM_ContentError("file.errors.notFound", 404);
  const bytes = await iGM_ReadFileBytes(row.iGM_Path);
  return {
    fileName: row.iGM_FileName,
    originalName: row.iGM_OriginalName,
    mimeType: row.iGM_MimeType,
    bytes,
  };
}

/**
 * 构造下载/预览响应
 * @param inline true 为预览（内联展示图片等），false 为下载（附件）
 * 安全：SVG 一律强制下载，避免内联 SVG 携带脚本造成 XSS；
 *       统一附加 nosniff，禁止浏览器嗅探类型
 */
export function iGM_BuildFileResponse(
  content: iGM_FileContent,
  inline: boolean,
): Response {
  const isSvg = content.mimeType === "image/svg+xml";
  const asInline = inline && !isSvg;
  const encodedName = encodeURIComponent(content.originalName);
  const disposition = asInline
    ? `inline; filename*=UTF-8''${encodedName}`
    : `attachment; filename*=UTF-8''${encodedName}`;

  // Uint8Array 在 TS 的 BodyInit 定义下不被直接接受，转为底层 ArrayBuffer 传入
  const body = content.bytes.buffer.slice(
    content.bytes.byteOffset,
    content.bytes.byteOffset + content.bytes.byteLength,
  ) as ArrayBuffer;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": content.mimeType || "application/octet-stream",
      "Content-Length": String(content.bytes.byteLength),
      "Content-Disposition": disposition,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=300",
    },
  });
}

/* ---------- 删除 ---------- */

/** 删除文件：仅上传者本人或协管员及以上；被资源/活动引用时拒绝 */
export async function iGM_DeleteFileService(
  user: iGM_UserRow,
  fileId: string,
): Promise<void> {
  const row = iGM_FindFileById(fileId);
  if (!row) throw new iGM_ContentError("file.errors.notFound", 404);
  if (row.iGM_UploaderId !== user.iGM_Id && !iGM_CanModerate(user)) {
    throw new iGM_ContentError("auth.errors.forbidden", 403);
  }
  if (iGM_CountFileReferences(fileId) > 0) {
    throw new iGM_ContentError("file.errors.inUse", 409);
  }
  // 先删数据库记录，再清理磁盘文件（磁盘失败不影响接口结果）
  iGM_DeleteFile(fileId);
  await iGM_RemoveFile(row.iGM_Path);
}

// 导出 //
export default {
  iGM_ExtractUploadFile,
  iGM_ExtractUploadKind,
  iGM_UploadFileService,
  iGM_ListMyFilesService,
  iGM_GetFileDto,
  iGM_GetFileDtoMap,
  iGM_ReadFileContentService,
  iGM_BuildFileResponse,
  iGM_DeleteFileService,
};
