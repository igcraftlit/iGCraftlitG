/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_ThirdPartyRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_ThirdParty
 * 模块：iGM_ThirdPartyRepository
 * 作用：第三方资源元数据、资源版本与下载任务的唯一数据访问出口
 * 内容：资源按 (source, sourceId) 幂等写入与分页筛选、版本批量幂等写入与查询、
 *       下载任务创建/查询/进度更新/删除、已完成任务清空
 * 说明：本站数据库只存元数据与第三方下载 URL，不存储任何资源文件本身
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import { iGM_RandomUuid } from "../iGM_Services/iGM_SecurityService";
import type {
  iGM_DownloadTaskRow,
  iGM_DownloadTaskStatus,
  iGM_ThirdPartyResourceRow,
  iGM_ThirdPartyVersionRow,
} from "../iGM_Types/iGM_ThirdParty";

// 类型定义 //
/** 资源幂等写入入参（来源于 Modrinth 元数据，按来源平台去重） */
export interface iGM_UpsertResourceInput {
  source: string;
  sourceId: string;
  slug: string;
  name: string;
  type: string;
  description: string | null;
  author: string | null;
  coverUrl: string | null;
  downloads: number | null;
  now: string;
}

/** 版本幂等写入入参 */
export interface iGM_UpsertVersionInput {
  sourceId: string;
  version: string;
  gameVersions: string[];
  loaders: string[];
  downloadUrl: string;
  filename: string;
  size: number;
  sha1: string | null;
  publishedAt: string | null;
  /** 版本发布类型：release / beta / alpha */
  versionType: string;
}

/** 资源列表筛选参数 */
export interface iGM_ResourceListParams {
  /** 为空表示不按类型过滤 */
  type: string | null;
  search: string | null;
  page: number;
  pageSize: number;
}

/** 下载任务创建入参 */
export interface iGM_CreateDownloadTaskInput {
  userId: string;
  resourceId: string;
  versionId: string;
  source: string;
  downloadUrl: string;
  filename: string;
  size: number;
  sha1: string | null;
  targetDir: string;
  now: string;
}

/** 下载任务更新入参（字段缺省表示不更新） */
export interface iGM_DownloadTaskPatch {
  status?: iGM_DownloadTaskStatus;
  downloaded?: number;
  progress?: number;
  speed?: number;
  eta?: number | null;
  error?: string | null;
  filePath?: string | null;
  now: string;
}

// 核心逻辑 //
/** 转义 LIKE 通配符，与 ESCAPE '\' 配合防止用户输入扩大匹配范围 */
function iGM_EscapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** 生成对外可见的下载任务编号（与主键分离，避免暴露内部主键格式） */
function iGM_NewTaskId(): string {
  return `tr-${iGM_RandomUuid().replace(/-/g, "").slice(0, 16)}`;
}

/* ---------- 第三方资源元数据 ---------- */

/**
 * 按 (来源平台, 来源资源号) 幂等写入资源元数据
 * 说明：命中已有记录时保留原主键与创建时间，仅刷新元数据，保证缓存复用
 */
export function iGM_UpsertThirdPartyResource(
  input: iGM_UpsertResourceInput,
): iGM_ThirdPartyResourceRow {
  const existing = iGM_FindThirdPartyResourceBySourceId(
    input.source,
    input.sourceId,
  );
  const id = existing?.iGM_Id ?? iGM_RandomUuid();
  iGM_Db.run(
    `INSERT INTO iGM_ThirdPartyResources
       (iGM_Id, iGM_Source, iGM_SourceId, iGM_Slug, iGM_Name, iGM_Type,
        iGM_Description, iGM_Author, iGM_CoverUrl, iGM_Downloads,
        iGM_CreatedAt, iGM_UpdatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (iGM_Source, iGM_SourceId) DO UPDATE SET
       iGM_Slug = excluded.iGM_Slug,
       iGM_Name = excluded.iGM_Name,
       iGM_Type = excluded.iGM_Type,
       iGM_Description = excluded.iGM_Description,
       iGM_Author = excluded.iGM_Author,
       iGM_CoverUrl = excluded.iGM_CoverUrl,
       iGM_Downloads = excluded.iGM_Downloads,
       iGM_UpdatedAt = excluded.iGM_UpdatedAt`,
    [
      id,
      input.source,
      input.sourceId,
      input.slug,
      input.name,
      input.type,
      input.description,
      input.author,
      input.coverUrl,
      input.downloads,
      input.now,
      input.now,
    ],
  );
  return iGM_FindThirdPartyResourceById(id) as iGM_ThirdPartyResourceRow;
}

/** 按主键查询资源 */
export function iGM_FindThirdPartyResourceById(
  id: string,
): iGM_ThirdPartyResourceRow | null {
  return (
    (iGM_Db
      .query(`SELECT * FROM iGM_ThirdPartyResources WHERE iGM_Id = ?`)
      .get(id) as iGM_ThirdPartyResourceRow | undefined) ?? null
  );
}

/** 按来源平台与来源资源号查询资源 */
export function iGM_FindThirdPartyResourceBySourceId(
  source: string,
  sourceId: string,
): iGM_ThirdPartyResourceRow | null {
  return (
    (iGM_Db
      .query(
        `SELECT * FROM iGM_ThirdPartyResources
          WHERE iGM_Source = ? AND iGM_SourceId = ?`,
      )
      .get(source, sourceId) as iGM_ThirdPartyResourceRow | undefined) ?? null
  );
}

/** 组装资源列表筛选条件（列表与计数共用，保证口径一致） */
function iGM_BuildResourceFilters(params: iGM_ResourceListParams): {
  where: string;
  bindings: (string | number)[];
} {
  const clauses: string[] = [];
  const bindings: (string | number)[] = [];

  if (params.type) {
    clauses.push(`iGM_Type = ?`);
    bindings.push(params.type);
  }
  if (params.search && params.search.trim().length > 0) {
    const keyword = `%${iGM_EscapeLike(params.search.trim())}%`;
    clauses.push(`(iGM_Name LIKE ? ESCAPE '\\' OR iGM_Description LIKE ? ESCAPE '\\')`);
    bindings.push(keyword, keyword);
  }

  return {
    where: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    bindings,
  };
}

/** 按筛选条件分页查询已缓存资源（更新时间倒序） */
export function iGM_ListThirdPartyResources(params: iGM_ResourceListParams): {
  items: iGM_ThirdPartyResourceRow[];
  total: number;
} {
  const { where, bindings } = iGM_BuildResourceFilters(params);
  const offset = (params.page - 1) * params.pageSize;

  const totalRow = iGM_Db
    .query(`SELECT COUNT(*) AS iGM_Count FROM iGM_ThirdPartyResources ${where}`)
    .get(...bindings) as { iGM_Count: number };

  const items = iGM_Db
    .query(
      `SELECT * FROM iGM_ThirdPartyResources
       ${where}
       ORDER BY iGM_UpdatedAt DESC, iGM_CreatedAt DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...bindings, params.pageSize, offset) as iGM_ThirdPartyResourceRow[];

  return { items, total: totalRow.iGM_Count };
}

/* ---------- 第三方资源版本 ---------- */

/**
 * 批量幂等写入某资源的版本列表
 * 说明：按 (资源, 来源版本号) 去重，已存在则更新下载地址与校验信息；
 *       资源的版本列表以上游为准，故写入前先清理该资源下已不存在的版本
 */
export function iGM_UpsertThirdPartyVersions(
  resourceId: string,
  versions: iGM_UpsertVersionInput[],
  now: string,
): void {
  const statement = iGM_Db.prepare(
    `INSERT INTO iGM_ThirdPartyVersions
       (iGM_Id, iGM_ResourceId, iGM_SourceId, iGM_Version, iGM_GameVersions,
        iGM_Loaders, iGM_DownloadUrl, iGM_Filename, iGM_Size, iGM_Sha1,
        iGM_PublishedAt, iGM_VersionType, iGM_CreatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (iGM_ResourceId, iGM_SourceId) DO UPDATE SET
       iGM_Version = excluded.iGM_Version,
       iGM_GameVersions = excluded.iGM_GameVersions,
       iGM_Loaders = excluded.iGM_Loaders,
       iGM_DownloadUrl = excluded.iGM_DownloadUrl,
       iGM_Filename = excluded.iGM_Filename,
       iGM_Size = excluded.iGM_Size,
       iGM_Sha1 = excluded.iGM_Sha1,
       iGM_PublishedAt = excluded.iGM_PublishedAt,
       iGM_VersionType = excluded.iGM_VersionType`,
  );

  const run = iGM_Db.transaction(() => {
    for (const version of versions) {
      statement.run(
        iGM_RandomUuid(),
        resourceId,
        version.sourceId,
        version.version,
        JSON.stringify(version.gameVersions ?? []),
        JSON.stringify(version.loaders ?? []),
        version.downloadUrl,
        version.filename,
        version.size,
        version.sha1,
        version.publishedAt,
        version.versionType,
        now,
      );
    }
  });
  run();
}

/** 查询某资源的全部版本（发布时间倒序） */
export function iGM_ListThirdPartyVersions(
  resourceId: string,
): iGM_ThirdPartyVersionRow[] {
  return iGM_Db
    .query(
      `SELECT * FROM iGM_ThirdPartyVersions
        WHERE iGM_ResourceId = ?
        ORDER BY COALESCE(iGM_PublishedAt, iGM_CreatedAt) DESC,
                 iGM_CreatedAt DESC`,
    )
    .all(resourceId) as iGM_ThirdPartyVersionRow[];
}

/** 按主键查询资源版本 */
export function iGM_FindThirdPartyVersionById(
  id: string,
): iGM_ThirdPartyVersionRow | null {
  return (
    (iGM_Db
      .query(`SELECT * FROM iGM_ThirdPartyVersions WHERE iGM_Id = ?`)
      .get(id) as iGM_ThirdPartyVersionRow | undefined) ?? null
  );
}

/* ---------- 下载任务 ---------- */

/** 创建下载任务（初始 pending） */
export function iGM_CreateDownloadTask(
  input: iGM_CreateDownloadTaskInput,
): iGM_DownloadTaskRow {
  const id = iGM_RandomUuid();
  const taskId = iGM_NewTaskId();
  iGM_Db.run(
    `INSERT INTO iGM_DownloadTasks
       (iGM_Id, iGM_TaskId, iGM_UserId, iGM_ResourceId, iGM_VersionId, iGM_Source,
        iGM_DownloadUrl, iGM_Filename, iGM_Size, iGM_Sha1, iGM_Status,
        iGM_Downloaded, iGM_Progress, iGM_Speed, iGM_Eta, iGM_Error,
        iGM_TargetDir, iGM_FilePath, iGM_CreatedAt, iGM_UpdatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, 0, 0, NULL, NULL, ?, NULL, ?, ?)`,
    [
      id,
      taskId,
      input.userId,
      input.resourceId,
      input.versionId,
      input.source,
      input.downloadUrl,
      input.filename,
      input.size,
      input.sha1,
      input.targetDir,
      input.now,
      input.now,
    ],
  );
  return iGM_FindDownloadTaskById(taskId) as iGM_DownloadTaskRow;
}

/**
 * 查询下载任务（连表带回资源名称、类型与版本号，供下载中心与启动器直接展示）
 */
export function iGM_FindDownloadTaskById(
  taskId: string,
): iGM_DownloadTaskRow | null {
  return (
    (iGM_Db
      .query(
        `SELECT t.*,
                r.iGM_Name AS iGM_ResourceName,
                r.iGM_Type AS iGM_ResourceType,
                v.iGM_Version AS iGM_VersionLabel
           FROM iGM_DownloadTasks t
           LEFT JOIN iGM_ThirdPartyResources r ON r.iGM_Id = t.iGM_ResourceId
           LEFT JOIN iGM_ThirdPartyVersions v ON v.iGM_Id = t.iGM_VersionId
          WHERE t.iGM_TaskId = ?`,
      )
      .get(taskId) as iGM_DownloadTaskRow | undefined) ?? null
  );
}

/** 查询某用户对某资源版本进行中的下载任务（用于避免重复创建） */
export function iGM_FindActiveDownloadTask(
  userId: string,
  versionId: string,
): iGM_DownloadTaskRow | null {
  return (
    (iGM_Db
      .query(
        `SELECT * FROM iGM_DownloadTasks
          WHERE iGM_UserId = ? AND iGM_VersionId = ?
            AND iGM_Status IN ('pending', 'downloading', 'paused')
          ORDER BY iGM_CreatedAt DESC LIMIT 1`,
      )
      .get(userId, versionId) as iGM_DownloadTaskRow | undefined) ?? null
  );
}

/** 更新下载任务（未提供的字段保持原值） */
export function iGM_UpdateDownloadTask(
  taskId: string,
  patch: iGM_DownloadTaskPatch,
): void {
  const clauses: string[] = ["iGM_UpdatedAt = ?"];
  const bindings: (string | number | null)[] = [patch.now];

  if (patch.status !== undefined) {
    clauses.push("iGM_Status = ?");
    bindings.push(patch.status);
  }
  if (patch.downloaded !== undefined) {
    clauses.push("iGM_Downloaded = ?");
    bindings.push(patch.downloaded);
  }
  if (patch.progress !== undefined) {
    clauses.push("iGM_Progress = ?");
    bindings.push(patch.progress);
  }
  if (patch.speed !== undefined) {
    clauses.push("iGM_Speed = ?");
    bindings.push(patch.speed);
  }
  if (patch.eta !== undefined) {
    clauses.push("iGM_Eta = ?");
    bindings.push(patch.eta);
  }
  if (patch.error !== undefined) {
    clauses.push("iGM_Error = ?");
    bindings.push(patch.error);
  }
  if (patch.filePath !== undefined) {
    clauses.push("iGM_FilePath = ?");
    bindings.push(patch.filePath);
  }

  bindings.push(taskId);
  iGM_Db.run(
    `UPDATE iGM_DownloadTasks SET ${clauses.join(", ")} WHERE iGM_TaskId = ?`,
    bindings,
  );
}

/** 查询某用户的下载任务列表（创建时间倒序，可按状态过滤） */
export function iGM_ListDownloadTasksByUser(
  userId: string,
  statuses: iGM_DownloadTaskStatus[],
): iGM_DownloadTaskRow[] {
  const where =
    statuses.length > 0
      ? `AND t.iGM_Status IN (${statuses.map(() => "?").join(", ")})`
      : "";
  return iGM_Db
    .query(
      `SELECT t.*,
              r.iGM_Name AS iGM_ResourceName,
              r.iGM_Type AS iGM_ResourceType,
              v.iGM_Version AS iGM_VersionLabel
         FROM iGM_DownloadTasks t
         LEFT JOIN iGM_ThirdPartyResources r ON r.iGM_Id = t.iGM_ResourceId
         LEFT JOIN iGM_ThirdPartyVersions v ON v.iGM_Id = t.iGM_VersionId
        WHERE t.iGM_UserId = ? ${where}
        ORDER BY t.iGM_CreatedAt DESC`,
    )
    .all(userId, ...statuses) as iGM_DownloadTaskRow[];
}

/** 删除单个下载任务记录（仅删除记录，不触碰磁盘文件） */
export function iGM_DeleteDownloadTask(taskId: string): boolean {
  const result = iGM_Db.run(
    `DELETE FROM iGM_DownloadTasks WHERE iGM_TaskId = ?`,
    [taskId],
  );
  return result.changes > 0;
}

/** 清空某用户已完成的下载任务记录，返回清除数量 */
export function iGM_DeleteCompletedDownloadTasks(userId: string): number {
  const result = iGM_Db.run(
    `DELETE FROM iGM_DownloadTasks
      WHERE iGM_UserId = ? AND iGM_Status = 'completed'`,
    [userId],
  );
  return result.changes;
}

// 导出 //
export default {
  iGM_UpsertThirdPartyResource,
  iGM_FindThirdPartyResourceById,
  iGM_FindThirdPartyResourceBySourceId,
  iGM_ListThirdPartyResources,
  iGM_UpsertThirdPartyVersions,
  iGM_ListThirdPartyVersions,
  iGM_FindThirdPartyVersionById,
  iGM_CreateDownloadTask,
  iGM_FindDownloadTaskById,
  iGM_FindActiveDownloadTask,
  iGM_UpdateDownloadTask,
  iGM_ListDownloadTasksByUser,
  iGM_DeleteDownloadTask,
  iGM_DeleteCompletedDownloadTasks,
};