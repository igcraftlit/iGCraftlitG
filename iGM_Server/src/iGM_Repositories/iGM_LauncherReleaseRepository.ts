/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_LauncherReleaseRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_LauncherRelease
 * 模块：iGM_LauncherReleaseRepository
 * 作用：启动器历史版本表（iGM_LauncherReleases）的唯一数据访问出口
 * 内容：按发布时间倒序列出全部版本、读取最新版本、按版本号查询、按版本号 upsert
 * 说明：更新说明为 JSONB 列，写入时序列化为字符串后经 ::jsonb 转换，
 *       读取时由 pg 驱动直接解析为对象
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import { iGM_RandomUuid } from "../iGM_Services/iGM_SecurityService";
import {
  type iGM_LauncherReleaseInput,
  type iGM_LauncherReleaseRow,
} from "../iGM_Types/iGM_LauncherRelease";

// 类型定义 //
// （本文件无额外类型，行与入参类型见 iGM_Types/iGM_LauncherRelease.ts）

// 核心逻辑 //
/** 列出全部启动器版本：发布日期倒序，同日期按版本号倒序 */
export async function iGM_ListLauncherReleases(): Promise<iGM_LauncherReleaseRow[]> {
  return (await iGM_Db
    .query(
      `SELECT * FROM iGM_LauncherReleases
        ORDER BY iGM_ReleasedAt DESC, iGM_Version DESC`,
    )
    .all()) as iGM_LauncherReleaseRow[];
}

/** 读取最新版本行（iGM_IsLatest = 1） */
export async function iGM_FindLatestLauncherRelease(): Promise<iGM_LauncherReleaseRow | null> {
  return (
    ((await iGM_Db
      .query(
        `SELECT * FROM iGM_LauncherReleases
          WHERE iGM_IsLatest = 1
          ORDER BY iGM_ReleasedAt DESC
          LIMIT 1`,
      )
      .get()) as iGM_LauncherReleaseRow | undefined) ?? null
  );
}

/** 按版本号查询发布行 */
export async function iGM_FindLauncherReleaseByVersion(
  version: string,
): Promise<iGM_LauncherReleaseRow | null> {
  return (
    ((await iGM_Db
      .query(`SELECT * FROM iGM_LauncherReleases WHERE iGM_Version = ?`)
      .get(version)) as iGM_LauncherReleaseRow | undefined) ?? null
  );
}

/**
 * 按版本号 upsert 发布行：
 * 存在则覆盖全部发布字段并刷新更新时间，不存在则新建。
 * 返回落库后的版本号。
 */
export async function iGM_UpsertLauncherRelease(
  input: iGM_LauncherReleaseInput,
): Promise<string> {
  const now = new Date().toISOString();
  const existing = await iGM_FindLauncherReleaseByVersion(input.version);
  const id = existing?.iGM_Id ?? iGM_RandomUuid();
  const notesJson = JSON.stringify(input.notes);

  await iGM_Db.run(
    `INSERT INTO iGM_LauncherReleases
       (iGM_Id, iGM_Version, iGM_ReleasedAt, iGM_UpdateType, iGM_IsLatest,
        iGM_Channel, iGM_Platform, iGM_FileName, iGM_FileSize, iGM_FileSizeLabel,
        iGM_Sha256, iGM_DownloadUrl, iGM_ReleasePageUrl, iGM_Notes,
        iGM_CreatedAt, iGM_UpdatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?)
     ON CONFLICT (iGM_Version) DO UPDATE SET
       iGM_ReleasedAt = EXCLUDED.iGM_ReleasedAt,
       iGM_UpdateType = EXCLUDED.iGM_UpdateType,
       iGM_IsLatest = EXCLUDED.iGM_IsLatest,
       iGM_Channel = EXCLUDED.iGM_Channel,
       iGM_Platform = EXCLUDED.iGM_Platform,
       iGM_FileName = EXCLUDED.iGM_FileName,
       iGM_FileSize = EXCLUDED.iGM_FileSize,
       iGM_FileSizeLabel = EXCLUDED.iGM_FileSizeLabel,
       iGM_Sha256 = EXCLUDED.iGM_Sha256,
       iGM_DownloadUrl = EXCLUDED.iGM_DownloadUrl,
       iGM_ReleasePageUrl = EXCLUDED.iGM_ReleasePageUrl,
       iGM_Notes = EXCLUDED.iGM_Notes,
       iGM_UpdatedAt = EXCLUDED.iGM_UpdatedAt`,
    [
      id,
      input.version,
      input.releasedAt,
      input.updateType,
      input.isLatest ? 1 : 0,
      input.channel ?? "stable",
      input.platform ?? "Windows x64",
      input.fileName,
      input.fileSize,
      input.fileSizeLabel,
      input.sha256,
      input.downloadUrl,
      input.releasePageUrl,
      notesJson,
      now,
      now,
    ],
  );
  return input.version;
}

/** 把除指定版本外的所有版本标记为非最新（保证最新版唯一） */
export async function iGM_ClearLatestFlag(exceptVersion: string): Promise<void> {
  await iGM_Db.run(
    `UPDATE iGM_LauncherReleases SET iGM_IsLatest = 0 WHERE iGM_Version <> ?`,
    [exceptVersion],
  );
}

// 导出 //
export default {
  iGM_ListLauncherReleases,
  iGM_FindLatestLauncherRelease,
  iGM_FindLauncherReleaseByVersion,
  iGM_UpsertLauncherRelease,
  iGM_ClearLatestFlag,
};