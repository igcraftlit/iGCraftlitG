/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_GameRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_Game、G_Minecraft
 * 模块：iGM_GameRepository
 * 作用：Minecraft 版本元数据、游戏安装任务与安装文件明细的唯一数据访问出口
 * 内容：版本写入/查询/分页筛选、安装任务创建/进度更新/查询/删除、
 *       安装文件批量登记与状态更新、按状态统计
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import { iGM_RandomUuid } from "../iGM_Services/iGM_SecurityService";
import type {
  iGM_GameFileRow,
  iGM_GameFileStatus,
  iGM_GameInstallRow,
  iGM_GameInstallStatus,
  iGM_MinecraftVersionRow,
  iGM_ModLoaderRow,
} from "../iGM_Types/iGM_Game";

// 类型定义 //
/** 版本写入入参（同步脚本与后台维护共用，按版本号幂等） */
export interface iGM_UpsertVersionInput {
  version: string;
  type: string;
  releaseTime: string | null;
  clientUrl: string | null;
  serverUrl: string | null;
  clientSize: number | null;
  serverSize: number | null;
  clientSha1: string | null;
  serverSha1: string | null;
  /** 完整大小（字节）；尚未计算时为 null */
  totalSize: number | null;
  notes: string | null;
  now: string;
}

/** 版本列表筛选参数 */
export interface iGM_VersionListParams {
  types: string[];
  search: string | null;
  /** newest 发布时间倒序（默认）/ oldest 发布时间正序 */
  sort: "newest" | "oldest";
  page: number;
  pageSize: number;
}

/** 安装任务创建入参 */
export interface iGM_CreateInstallInput {
  userId: string;
  version: string;
  /** 该版本独立的游戏目录（<用户所选目录>/.minecraft/<版本目录名>） */
  installDir: string;
  /** 模组加载器：none 原版 / fabric Fabric */
  loader: string;
  loaderVersion: string | null;
  now: string;
}

/** 安装任务进度更新入参（字段缺省表示不更新） */
export interface iGM_InstallProgressInput {
  status?: iGM_GameInstallStatus;
  progress?: number;
  totalFiles?: number;
  downloadedFiles?: number;
  error?: string | null;
  now: string;
}

/** 安装文件登记入参 */
export interface iGM_GameFileInput {
  path: string;
  url: string | null;
  sha1: string | null;
  size: number;
}

// 核心逻辑 //
/** 转义 LIKE 通配符，与 ESCAPE '\' 配合防止用户输入扩大匹配范围 */
function iGM_EscapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/* ---------- 版本元数据 ---------- */

/** 按版本号幂等写入版本元数据（已存在则更新元数据） */
export async function iGM_UpsertMinecraftVersion(
  input: iGM_UpsertVersionInput,
): Promise<iGM_MinecraftVersionRow> {
  const existing = await iGM_FindMinecraftVersionByVersion(input.version);
  const id = existing?.iGM_Id ?? iGM_RandomUuid();
  await iGM_Db.run(
    `INSERT INTO iGM_MinecraftVersions
       (iGM_Id, iGM_Version, iGM_Type, iGM_ReleaseTime,
        iGM_ClientUrl, iGM_ServerUrl, iGM_ClientSize, iGM_ServerSize,
        iGM_ClientSha1, iGM_ServerSha1, iGM_TotalSize, iGM_Notes,
        iGM_CreatedAt, iGM_UpdatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (iGM_Version) DO UPDATE SET
       iGM_Type = excluded.iGM_Type,
       iGM_ReleaseTime = excluded.iGM_ReleaseTime,
       iGM_ClientUrl = excluded.iGM_ClientUrl,
       iGM_ServerUrl = excluded.iGM_ServerUrl,
       iGM_ClientSize = excluded.iGM_ClientSize,
       iGM_ServerSize = excluded.iGM_ServerSize,
       iGM_ClientSha1 = excluded.iGM_ClientSha1,
       iGM_ServerSha1 = excluded.iGM_ServerSha1,
       iGM_TotalSize = excluded.iGM_TotalSize,
       iGM_Notes = excluded.iGM_Notes,
       iGM_UpdatedAt = excluded.iGM_UpdatedAt`,
    [
      id,
      input.version,
      input.type,
      input.releaseTime,
      input.clientUrl,
      input.serverUrl,
      input.clientSize,
      input.serverSize,
      input.clientSha1,
      input.serverSha1,
      input.totalSize,
      input.notes,
      input.now,
      input.now,
    ],
  );
  return (await iGM_FindMinecraftVersionByVersion(
    input.version,
  )) as iGM_MinecraftVersionRow;
}

/** 按主键查询版本 */
export async function iGM_FindMinecraftVersionById(
  id: string,
): Promise<iGM_MinecraftVersionRow | null> {
  return (
    ((await iGM_Db
      .query(`SELECT * FROM iGM_MinecraftVersions WHERE iGM_Id = ?`)
      .get(id)) as iGM_MinecraftVersionRow | undefined) ?? null
  );
}

/** 按版本号查询版本 */
export async function iGM_FindMinecraftVersionByVersion(
  version: string,
): Promise<iGM_MinecraftVersionRow | null> {
  return (
    ((await iGM_Db
      .query(`SELECT * FROM iGM_MinecraftVersions WHERE iGM_Version = ?`)
      .get(version)) as iGM_MinecraftVersionRow | undefined) ?? null
  );
}

/** 组装版本列表筛选条件（列表与计数共用，保证口径一致） */
function iGM_BuildVersionFilters(params: iGM_VersionListParams): {
  where: string;
  bindings: (string | number)[];
} {
  const clauses: string[] = [];
  const bindings: (string | number)[] = [];

  if (params.types.length > 0) {
    clauses.push(`iGM_Type IN (${params.types.map(() => "?").join(", ")})`);
    bindings.push(...params.types);
  }
  if (params.search && params.search.trim().length > 0) {
    const keyword = `%${iGM_EscapeLike(params.search.trim())}%`;
    clauses.push(`iGM_Version LIKE ? ESCAPE '\\'`);
    bindings.push(keyword);
  }

  return {
    where: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    bindings,
  };
}

/** 按筛选条件分页查询版本（默认发布时间倒序） */
export async function iGM_ListMinecraftVersions(
  params: iGM_VersionListParams,
): Promise<{
  items: iGM_MinecraftVersionRow[];
  total: number;
}> {
  const { where, bindings } = iGM_BuildVersionFilters(params);
  const offset = (params.page - 1) * params.pageSize;
  const direction = params.sort === "oldest" ? "ASC" : "DESC";

  const totalRow = (await iGM_Db
    .query(`SELECT COUNT(*) AS iGM_Count FROM iGM_MinecraftVersions ${where}`)
    .get(...bindings)) as { iGM_Count: number };

  const items = (await iGM_Db
    .query(
      `SELECT * FROM iGM_MinecraftVersions
       ${where}
       ORDER BY COALESCE(iGM_ReleaseTime, iGM_CreatedAt) ${direction},
                iGM_CreatedAt ${direction}
       LIMIT ? OFFSET ?`,
    )
    .all(...bindings, params.pageSize, offset)) as iGM_MinecraftVersionRow[];

  return { items, total: totalRow.iGM_Count };
}

/** 查询某用户已安装完成的版本号集合 */
export async function iGM_ListInstalledVersions(
  userId: string,
): Promise<Set<string>> {
  const rows = (await iGM_Db
    .query(
      `SELECT DISTINCT iGM_Version FROM iGM_GameInstalls
        WHERE iGM_UserId = ? AND iGM_Status = 'completed'`,
    )
    .all(userId)) as { iGM_Version: string }[];
  return new Set(rows.map((row) => row.iGM_Version));
}

/**
 * 查询某用户已安装完成的「版本 + 加载器」组合键集合
 * 键格式：<版本号>|<加载器>，用于版本卡片区分原版与 Fabric 的安装状态
 */
export async function iGM_ListInstalledVersionKeys(
  userId: string,
): Promise<Set<string>> {
  const rows = (await iGM_Db
    .query(
      `SELECT DISTINCT iGM_Version, iGM_Loader FROM iGM_GameInstalls
        WHERE iGM_UserId = ? AND iGM_Status = 'completed'`,
    )
    .all(userId)) as { iGM_Version: string; iGM_Loader: string }[];
  return new Set(rows.map((row) => `${row.iGM_Version}|${row.iGM_Loader}`));
}

/* ---------- 模组加载器字典 ---------- */

/** 列出全部模组加载器（按排序号升序） */
export async function iGM_ListModLoaders(): Promise<iGM_ModLoaderRow[]> {
  return (await iGM_Db
    .query(`SELECT * FROM iGM_ModLoaders ORDER BY iGM_SortOrder ASC`)
    .all()) as iGM_ModLoaderRow[];
}

/* ---------- 安装任务 ---------- */

/** 创建安装任务（初始 pending） */
export async function iGM_CreateGameInstall(
  input: iGM_CreateInstallInput,
): Promise<iGM_GameInstallRow> {
  const id = iGM_RandomUuid();
  await iGM_Db.run(
    `INSERT INTO iGM_GameInstalls
       (iGM_Id, iGM_UserId, iGM_Version, iGM_InstallDir, iGM_Loader, iGM_LoaderVersion,
        iGM_Status, iGM_Progress, iGM_TotalFiles, iGM_DownloadedFiles, iGM_Error,
        iGM_CreatedAt, iGM_UpdatedAt)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, 0, 0, NULL, ?, ?)`,
    [
      id,
      input.userId,
      input.version,
      input.installDir,
      input.loader,
      input.loaderVersion,
      input.now,
      input.now,
    ],
  );
  return (await iGM_FindGameInstallById(id)) as iGM_GameInstallRow;
}

/** 按主键查询安装任务 */
export async function iGM_FindGameInstallById(
  id: string,
): Promise<iGM_GameInstallRow | null> {
  return (
    ((await iGM_Db
      .query(`SELECT * FROM iGM_GameInstalls WHERE iGM_Id = ?`)
      .get(id)) as iGM_GameInstallRow | undefined) ?? null
  );
}

/** 查询某用户对「版本 + 加载器」进行中的安装任务（用于避免重复启动） */
export async function iGM_FindActiveGameInstall(
  userId: string,
  version: string,
  loader: string,
): Promise<iGM_GameInstallRow | null> {
  return (
    ((await iGM_Db
      .query(
        `SELECT * FROM iGM_GameInstalls
          WHERE iGM_UserId = ? AND iGM_Version = ? AND iGM_Loader = ?
            AND iGM_Status IN ('pending', 'running')
          ORDER BY iGM_CreatedAt DESC LIMIT 1`,
      )
      .get(userId, version, loader)) as iGM_GameInstallRow | undefined) ?? null
  );
}

/** 更新安装任务进度（未提供的字段保持原值） */
export async function iGM_UpdateGameInstallProgress(
  id: string,
  input: iGM_InstallProgressInput,
): Promise<void> {
  const clauses: string[] = ["iGM_UpdatedAt = ?"];
  const bindings: (string | number | null)[] = [input.now];

  if (input.status !== undefined) {
    clauses.push("iGM_Status = ?");
    bindings.push(input.status);
  }
  if (input.progress !== undefined) {
    clauses.push("iGM_Progress = ?");
    bindings.push(input.progress);
  }
  if (input.totalFiles !== undefined) {
    clauses.push("iGM_TotalFiles = ?");
    bindings.push(input.totalFiles);
  }
  if (input.downloadedFiles !== undefined) {
    clauses.push("iGM_DownloadedFiles = ?");
    bindings.push(input.downloadedFiles);
  }
  if (input.error !== undefined) {
    clauses.push("iGM_Error = ?");
    bindings.push(input.error);
  }

  bindings.push(id);
  await iGM_Db.run(
    `UPDATE iGM_GameInstalls SET ${clauses.join(", ")} WHERE iGM_Id = ?`,
    bindings,
  );
}

/** 查询某用户的安装任务列表（创建时间倒序） */
export async function iGM_ListGameInstallsByUser(
  userId: string,
  statuses: iGM_GameInstallStatus[],
): Promise<iGM_GameInstallRow[]> {
  const where =
    statuses.length > 0
      ? `AND iGM_Status IN (${statuses.map(() => "?").join(", ")})`
      : "";
  return (await iGM_Db
    .query(
      `SELECT * FROM iGM_GameInstalls
        WHERE iGM_UserId = ? ${where}
        ORDER BY iGM_CreatedAt DESC`,
    )
    .all(userId, ...statuses)) as iGM_GameInstallRow[];
}

/** 删除安装任务（安装文件由外键级联清理） */
export async function iGM_DeleteGameInstall(id: string): Promise<boolean> {
  const result = await iGM_Db.run(
    `DELETE FROM iGM_GameInstalls WHERE iGM_Id = ?`,
    [id],
  );
  return result.changes > 0;
}

/** 删除某任务的全部安装文件明细（重新规划时使用） */
export async function iGM_DeleteGameFiles(installId: string): Promise<void> {
  await iGM_Db.run(`DELETE FROM iGM_GameFiles WHERE iGM_InstallId = ?`, [installId]);
}

/* ---------- 安装文件明细 ---------- */

/** 批量登记安装文件（事务内写入，path 幂等：同任务同路径唯一） */
export async function iGM_InsertGameFiles(
  installId: string,
  files: iGM_GameFileInput[],
): Promise<void> {
  const insert = iGM_Db.prepare(
    `INSERT INTO iGM_GameFiles
       (iGM_Id, iGM_InstallId, iGM_Path, iGM_Url, iGM_Sha1, iGM_Size,
        iGM_Status, iGM_DownloadedAt)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL)`,
  );
  const run = iGM_Db.transaction(async () => {
    for (const file of files) {
      await insert.run(
        iGM_RandomUuid(),
        installId,
        file.path,
        file.url,
        file.sha1,
        file.size,
      );
    }
  });
  await run();
}

/** 查询某任务的全部安装文件明细 */
export async function iGM_ListGameFiles(
  installId: string,
): Promise<iGM_GameFileRow[]> {
  return (await iGM_Db
    .query(`SELECT * FROM iGM_GameFiles WHERE iGM_InstallId = ?`)
    .all(installId)) as iGM_GameFileRow[];
}

/** 按状态统计某任务的文件数 */
export async function iGM_CountGameFilesByStatus(
  installId: string,
): Promise<Record<string, number>> {
  const rows = (await iGM_Db
    .query(
      `SELECT iGM_Status AS iGM_State, COUNT(*) AS iGM_Count
         FROM iGM_GameFiles WHERE iGM_InstallId = ?
        GROUP BY iGM_Status`,
    )
    .all(installId)) as { iGM_State: string; iGM_Count: number }[];
  const result: Record<string, number> = {};
  for (const row of rows) result[row.iGM_State] = row.iGM_Count;
  return result;
}

/** 更新单个安装文件状态 */
export async function iGM_UpdateGameFileStatus(
  installId: string,
  path: string,
  status: iGM_GameFileStatus,
  now: string,
): Promise<void> {
  await iGM_Db.run(
    `UPDATE iGM_GameFiles
        SET iGM_Status = ?, iGM_DownloadedAt = ?
      WHERE iGM_InstallId = ? AND iGM_Path = ?`,
    [status, status === "done" || status === "skipped" ? now : null, installId, path],
  );
}

/** 将某任务全部失败文件复位为待下载（单独重试失败文件） */
export async function iGM_ResetFailedGameFiles(
  installId: string,
): Promise<number> {
  const result = await iGM_Db.run(
    `UPDATE iGM_GameFiles SET iGM_Status = 'pending', iGM_DownloadedAt = NULL
      WHERE iGM_InstallId = ? AND iGM_Status = 'failed'`,
    [installId],
  );
  return result.changes;
}

// 导出 //
export default {
  iGM_UpsertMinecraftVersion,
  iGM_FindMinecraftVersionById,
  iGM_FindMinecraftVersionByVersion,
  iGM_ListMinecraftVersions,
  iGM_ListInstalledVersions,
  iGM_ListInstalledVersionKeys,
  iGM_ListModLoaders,
  iGM_CreateGameInstall,
  iGM_FindGameInstallById,
  iGM_FindActiveGameInstall,
  iGM_UpdateGameInstallProgress,
  iGM_ListGameInstallsByUser,
  iGM_DeleteGameInstall,
  iGM_DeleteGameFiles,
  iGM_InsertGameFiles,
  iGM_ListGameFiles,
  iGM_CountGameFilesByStatus,
  iGM_UpdateGameFileStatus,
  iGM_ResetFailedGameFiles,
};