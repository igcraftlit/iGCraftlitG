/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_FileRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_File
 * 模块：iGM_FileRepository
 * 作用：上传文件元数据（iGM_Files）的唯一数据访问出口
 * 内容：文件记录创建、按主键查询、按上传者分页查询、批量查询、删除
 * 说明：磁盘读写由 iGM_StorageService 负责，本层只维护数据库元数据
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import type { iGM_FileRow } from "../iGM_Types/iGM_File";

// 类型定义 //
/** 文件分页查询结果 */
export interface iGM_FileListResult {
  items: iGM_FileRow[];
  total: number;
}

/** 新建文件记录入参 */
export interface iGM_CreateFileInput {
  id: string;
  uploaderId: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  hash: string;
  now: string;
}

// 核心逻辑 //
/** 新建文件元数据记录 */
export function iGM_CreateFile(input: iGM_CreateFileInput): iGM_FileRow {
  const row: iGM_FileRow = {
    iGM_Id: input.id,
    iGM_UploaderId: input.uploaderId,
    iGM_FileName: input.fileName,
    iGM_OriginalName: input.originalName,
    iGM_MimeType: input.mimeType,
    iGM_Size: input.size,
    iGM_Path: input.path,
    iGM_Hash: input.hash,
    iGM_CreatedAt: input.now,
  };
  iGM_Db.run(
    `INSERT INTO iGM_Files
       (iGM_Id, iGM_UploaderId, iGM_FileName, iGM_OriginalName,
        iGM_MimeType, iGM_Size, iGM_Path, iGM_Hash, iGM_CreatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.iGM_Id,
      row.iGM_UploaderId,
      row.iGM_FileName,
      row.iGM_OriginalName,
      row.iGM_MimeType,
      row.iGM_Size,
      row.iGM_Path,
      row.iGM_Hash,
      row.iGM_CreatedAt,
    ],
  );
  return row;
}

/** 按主键查询文件 */
export function iGM_FindFileById(id: string): iGM_FileRow | null {
  return (
    (iGM_Db
      .query(`SELECT * FROM iGM_Files WHERE iGM_Id = ?`)
      .get(id) as iGM_FileRow | undefined) ?? null
  );
}

/** 按主键批量查询文件（用于列表页一次组装封面/附件） */
export function iGM_FindFilesByIds(ids: string[]): iGM_FileRow[] {
  const unique = Array.from(new Set(ids)).filter(Boolean);
  if (unique.length === 0) return [];
  const placeholders = unique.map(() => "?").join(", ");
  return iGM_Db
    .query(`SELECT * FROM iGM_Files WHERE iGM_Id IN (${placeholders})`)
    .all(...unique) as iGM_FileRow[];
}

/** 分页查询某上传者的文件（时间倒序） */
export function iGM_ListFilesByUploader(
  uploaderId: string,
  page: number,
  pageSize: number,
): iGM_FileListResult {
  const offset = (page - 1) * pageSize;
  const totalRow = iGM_Db
    .query(
      `SELECT COUNT(*) AS iGM_Count FROM iGM_Files WHERE iGM_UploaderId = ?`,
    )
    .get(uploaderId) as { iGM_Count: number };

  const items = iGM_Db
    .query(
      `SELECT * FROM iGM_Files WHERE iGM_UploaderId = ?
        ORDER BY iGM_CreatedAt DESC, iGM_Id DESC
        LIMIT ? OFFSET ?`,
    )
    .all(uploaderId, pageSize, offset) as iGM_FileRow[];

  return { items, total: totalRow.iGM_Count };
}

/** 删除文件元数据记录 */
export function iGM_DeleteFile(id: string): boolean {
  const result = iGM_Db.run(`DELETE FROM iGM_Files WHERE iGM_Id = ?`, [id]);
  return result.changes > 0;
}

/** 统计某文件被资源/活动引用的次数（用于删除前保护） */
export function iGM_CountFileReferences(fileId: string): number {
  const row = iGM_Db
    .query(
      `SELECT
         (SELECT COUNT(*) FROM iGM_Resources
           WHERE iGM_FileId = ? OR iGM_CoverFileId = ?) +
         (SELECT COUNT(*) FROM iGM_Activities WHERE iGM_CoverFileId = ?)
         AS iGM_Count`,
    )
    .get(fileId, fileId, fileId) as { iGM_Count: number };
  return row.iGM_Count;
}

// 导出 //
export default {
  iGM_CreateFile,
  iGM_FindFileById,
  iGM_FindFilesByIds,
  iGM_ListFilesByUploader,
  iGM_DeleteFile,
  iGM_CountFileReferences,
};
