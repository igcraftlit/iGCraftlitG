/**
 * 文件路径：iGM_Server/src/iGM_Types/iGM_File.ts
 * 所属层：后端 / 类型定义层
 * 路由：G_File
 * 模块：iGM_File
 * 作用：定义上传文件的数据库行类型与对外 DTO
 * 内容：文件行、文件 DTO、文件分页数据、上传入参
 * 安全：DTO 绝不包含磁盘绝对路径（iGM_Path），前端仅能通过后端接口下载/预览
 */

// 导入依赖 //
// （本文件仅依赖基础类型）

// 类型定义 //
/* ---------- 数据库行类型 ---------- */

export interface iGM_FileRow {
  iGM_Id: string;
  iGM_UploaderId: string;
  iGM_FileName: string;
  iGM_OriginalName: string;
  iGM_MimeType: string;
  iGM_Size: number;
  iGM_Path: string;
  iGM_Hash: string;
  iGM_CreatedAt: string;
}

/* ---------- 对外 DTO ---------- */

/** 文件 DTO：不含磁盘路径 */
export interface iGM_FileDto {
  id: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  hash: string;
  /** 是否为图片（前端可直接用于封面/头像预览） */
  isImage: boolean;
  createdAt: string;
  /** 上传者 id（个人文件管理页用于归属展示） */
  uploaderId: string;
}

/** 文件分页数据 */
export interface iGM_FileListData {
  items: iGM_FileDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 文件上传入参（由路由层从 FormData 解析后传入） */
export interface iGM_StoreFileInput {
  uploaderId: string;
  originalName: string;
  mimeType: string;
  bytes: Uint8Array;
}

// 核心逻辑 //
/** 判断 MIME 是否为图片类型 */
export function iGM_IsImageMime(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

/** 文件行转 DTO（剔除磁盘路径） */
export function iGM_ToFileDto(row: iGM_FileRow): iGM_FileDto {
  return {
    id: row.iGM_Id,
    fileName: row.iGM_FileName,
    originalName: row.iGM_OriginalName,
    mimeType: row.iGM_MimeType,
    size: row.iGM_Size,
    hash: row.iGM_Hash,
    isImage: iGM_IsImageMime(row.iGM_MimeType),
    createdAt: row.iGM_CreatedAt,
    uploaderId: row.iGM_UploaderId,
  };
}

// 导出 //
export default { iGM_IsImageMime, iGM_ToFileDto };
