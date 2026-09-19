/**
 * 文件路径：apps/web/src/iGM_Services/iGM_FileClient.ts
 * 所属层：前端 / 基础服务层
 * 路由：调用后端 /G_File/*
 * 模块：iGM_FileClient
 * 作用：文件上传与个人文件管理相关后端接口的唯一前端调用出口
 * 内容：上传文件（FormData）、我的文件列表、文件详情、删除文件、
 *       下载与预览地址构造
 * 约束：只经 iGM_Request / iGM_Upload 发请求；前端不接触磁盘路径
 */

// 导入依赖 //
import {
  iGM_BuildFileUrl,
  iGM_Delete,
  iGM_Get,
  iGM_Upload,
  type iGM_ApiResponse,
} from "./iGM_Request";
import { iGM_Config } from "./iGM_Config";

// 类型定义 //
/** 上传类型：image 为封面类图片上传（后端强制真实图片），file 为通用文件 */
export type iGM_UploadKind = "image" | "file";

/** 文件元数据（不含磁盘路径） */
export interface iGM_FileItem {
  id: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  hash: string;
  isImage: boolean;
  uploaderId: string;
  createdAt: string;
}

/** 文件分页数据 */
export interface iGM_FileListData {
  items: iGM_FileItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 上传可选项 */
export interface iGM_UploadOptions {
  /** 上传类型，默认通用文件 */
  kind?: iGM_UploadKind;
  /** 上传进度回调（已发送字节 / 总字节） */
  onProgress?: (loaded: number, total: number) => void;
}

// 核心逻辑 //
/** 与后端一致的单文件体积上限：20MB */
export const iGM_MaxUploadSize = 20 * 1024 * 1024;

/** 图片选择器 accept 值 */
export const iGM_ImageAccept = "image/png,image/jpeg,image/gif,image/webp,image/bmp,image/svg+xml";

/** 通用文件选择器 accept 值（与后端扩展名白名单保持一致） */
export const iGM_FileAccept =
  "image/*,.pdf,.txt,.md,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.7z,.gz,.tar,.json,.xml,.yml,.yaml,.jar,.mcpack,.mcaddon,.mcworld";

/** 允许的图片扩展名（小写，不含点） */
const iGM_ImageExtensions = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];

/**
 * 上传前的客户端预校验：提前拦截空文件、超体积与类型不符，
 * 减少无效网络请求；服务端仍会做权威校验，此处不作为安全边界
 * @returns 校验失败时返回 i18n 文案键，通过时返回 null
 */
export function iGM_ValidateLocalFile(
  file: File,
  options?: { imageOnly?: boolean },
): string | null {
  if (file.size <= 0) return "file.errors.emptyFile";
  if (file.size > iGM_MaxUploadSize) return "file.errors.tooLarge";
  if (!options?.imageOnly) return null;

  const lowerName = file.name.toLowerCase();
  const ext = lowerName.includes(".")
    ? lowerName.slice(lowerName.lastIndexOf(".") + 1)
    : "";
  const looksLikeImage =
    file.type.startsWith("image/") || iGM_ImageExtensions.includes(ext);
  return looksLikeImage ? null : "file.errors.imageOnly";
}

/**
 * 上传单个文件（字段名固定为 file，与后端约定一致）
 * @param file 本地文件
 * @param options.kind image 时附带 kind=image，后端强制真实图片
 * @param options.onProgress 上传进度回调
 */
export function iGM_ApiUploadFile(
  file: File,
  options?: iGM_UploadOptions,
): Promise<iGM_ApiResponse<{ file: iGM_FileItem }>> {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", options?.kind === "image" ? "image" : "file");
  return iGM_Upload(
    "/G_File/upload",
    form,
    60000,
    options?.onProgress,
  );
}

/** 我的文件列表 */
export function iGM_ApiMyFiles(
  page = 1,
  pageSize = 12,
): Promise<iGM_ApiResponse<iGM_FileListData>> {
  return iGM_Get(`/G_File/list?page=${page}&pageSize=${pageSize}`);
}

/** 文件详情 */
export function iGM_ApiGetFile(
  fileId: string,
): Promise<iGM_ApiResponse<{ file: iGM_FileItem }>> {
  return iGM_Get(`/G_File/detail?fileId=${encodeURIComponent(fileId)}`);
}

/** 删除文件 */
export function iGM_ApiDeleteFile(
  fileId: string,
): Promise<iGM_ApiResponse<{ deleted: boolean }>> {
  return iGM_Delete(`/G_File/delete?fileId=${encodeURIComponent(fileId)}`);
}

/** 文件下载地址（附件） */
export function iGM_FileDownloadUrl(fileId: string): string {
  return iGM_BuildFileUrl("/G_File/download", fileId);
}

/** 文件预览地址（内联，可直接用作 img src） */
export function iGM_FilePreviewUrl(fileId: string): string {
  return iGM_BuildFileUrl("/G_File/preview", fileId);
}

/**
 * 解析媒体展示地址，统一转为绝对地址（可直接用作 img src）：
 *  - 完整 http/https URL 原样返回（兼容历史外部头像）
 *  - 站内相对路径（/G_File/preview?fileId=...，如头像引用）按运行时 API 域名补全，
 *    本地补 http://localhost:3001、线上补 api 子域，避免请求打到前端静态端口 404
 *  - 其余视为文件 ID，拼文件预览接口
 */
export function iGM_ResolveMediaUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `${iGM_Config.apiBase}${value}`;
  return iGM_FilePreviewUrl(value);
}

/** 将字节数格式化为可读体积 */
export function iGM_FormatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

// 导出 //
export default {
  iGM_ApiUploadFile,
  iGM_ApiMyFiles,
  iGM_ApiGetFile,
  iGM_ApiDeleteFile,
  iGM_FileDownloadUrl,
  iGM_FilePreviewUrl,
  iGM_ResolveMediaUrl,
  iGM_FormatFileSize,
  iGM_ValidateLocalFile,
  iGM_MaxUploadSize,
  iGM_ImageAccept,
  iGM_FileAccept,
};
