/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_ResourceRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_Resource
 * 模块：iGM_ResourceRepository
 * 作用：资源库（iGM_Resources）、资源分类（iGM_ResourceCategories）、
 *       资源标签（iGM_ResourceTags）与标签关联（iGM_ResourceTagsMap）
 *       的唯一数据访问出口
 * 内容：资源创建/更新/删除/查询/分页筛选、下载计数、分类列表、
 *       标签查找或新建、标签替换与批量读取
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import { iGM_RandomUuid } from "../iGM_Services/iGM_SecurityService";
import type {
  iGM_ResourceCategoryRow,
  iGM_ResourceRow,
  iGM_ResourceStatus,
  iGM_ResourceTagRow,
} from "../iGM_Types/iGM_Resource";

// 类型定义 //
/** 资源列表筛选参数 */
export interface iGM_ResourceListParams {
  statuses: iGM_ResourceStatus[];
  categoryId: string | null;
  tagId: string | null;
  uploaderId: string | null;
  activityId: string | null;
  search: string | null;
  /** 模块十：仅返回 Minecraft 分区资源（resourceType 非空） */
  minecraftOnly?: boolean;
  /** 模块十：Minecraft 维度筛选 */
  mcResourceType?: string | null;
  mcVersion?: string | null;
  mcLoader?: string | null;
  mcPlatform?: string | null;
  page: number;
  pageSize: number;
}

/** 资源分页查询结果 */
export interface iGM_ResourceListResult {
  items: iGM_ResourceRow[];
  total: number;
}

/** 资源创建入参（MC 字段可空，普通资源不提供） */
export interface iGM_CreateResourceInput {
  uploaderId: string;
  title: string;
  description: string;
  categoryId: string | null;
  fileId: string;
  coverFileId: string | null;
  activityId: string | null;
  status: iGM_ResourceStatus;
  /** 模块十：Minecraft 扩展字段（JSON 文本已由服务层序列化） */
  resourceType?: string | null;
  mcVersionsJson?: string | null;
  loadersJson?: string | null;
  platformsJson?: string | null;
  license?: string | null;
  originalAuthor?: string | null;
  originalUrl?: string | null;
  changelog?: string | null;
  /** 模块十三：是否允许 CLI 下载 */
  downloadable?: boolean;
  /** 模块十三：CLI 下载标识符，由服务层生成（u{uid}-{slug}） */
  slug?: string | null;
  /** 模块十三：版本号（选填） */
  version?: string | null;
  now: string;
}

/** 资源更新入参 */
export interface iGM_UpdateResourceInput {
  title: string;
  description: string;
  categoryId: string | null;
  fileId: string;
  coverFileId: string | null;
  activityId: string | null;
  status: iGM_ResourceStatus;
  /** 模块十：Minecraft 扩展字段 */
  resourceType?: string | null;
  mcVersionsJson?: string | null;
  loadersJson?: string | null;
  platformsJson?: string | null;
  license?: string | null;
  originalAuthor?: string | null;
  originalUrl?: string | null;
  changelog?: string | null;
  /** 模块十三：是否允许 CLI 下载 */
  downloadable?: boolean;
  /** 模块十三：CLI 下载标识符，由服务层生成（u{uid}-{slug}） */
  slug?: string | null;
  /** 模块十三：版本号（选填） */
  version?: string | null;
  now: string;
}

// 核心逻辑 //
/** 转义 LIKE 通配符，与 ESCAPE '\' 配合防止用户输入扩大匹配范围 */
function iGM_EscapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** 组装筛选条件与绑定参数（列表与计数共用，保证口径一致） */
function iGM_BuildFilters(params: iGM_ResourceListParams): {
  where: string;
  bindings: (string | number)[];
} {
  const clauses: string[] = [];
  const bindings: (string | number)[] = [];

  if (params.statuses.length > 0) {
    clauses.push(
      `r.iGM_Status IN (${params.statuses.map(() => "?").join(", ")})`,
    );
    bindings.push(...params.statuses);
  }
  if (params.categoryId) {
    clauses.push(`r.iGM_CategoryId = ?`);
    bindings.push(params.categoryId);
  }
  if (params.uploaderId) {
    clauses.push(`r.iGM_UploaderId = ?`);
    bindings.push(params.uploaderId);
  }
  if (params.activityId) {
    clauses.push(`r.iGM_ActivityId = ?`);
    bindings.push(params.activityId);
  }
  if (params.tagId) {
    clauses.push(
      `EXISTS (SELECT 1 FROM iGM_ResourceTagsMap m
                WHERE m.iGM_ResourceId = r.iGM_Id AND m.iGM_TagId = ?)`,
    );
    bindings.push(params.tagId);
  }
  if (params.search && params.search.trim().length > 0) {
    const keyword = `%${iGM_EscapeLike(params.search.trim())}%`;
    clauses.push(
      `(r.iGM_Title LIKE ? ESCAPE '\\' OR r.iGM_Description LIKE ? ESCAPE '\\')`,
    );
    bindings.push(keyword, keyword);
  }

  /* ---------- 模块十：Minecraft 维度 ---------- */
  if (params.minecraftOnly) {
    clauses.push(`r.iGM_ResourceType IS NOT NULL`);
  }
  if (params.mcResourceType) {
    clauses.push(`r.iGM_ResourceType = ?`);
    bindings.push(params.mcResourceType);
  }
  // 多值字段以 JSON 数组存储，按 "值" 子串匹配；版本/加载器/平台均为受控值
  if (params.mcVersion) {
    clauses.push(`r.iGM_McVersions LIKE ? ESCAPE '\\'`);
    bindings.push(`%"${iGM_EscapeLike(params.mcVersion)}"%`);
  }
  if (params.mcLoader) {
    clauses.push(`r.iGM_Loaders LIKE ? ESCAPE '\\'`);
    bindings.push(`%"${iGM_EscapeLike(params.mcLoader)}"%`);
  }
  if (params.mcPlatform) {
    clauses.push(`r.iGM_Platforms LIKE ? ESCAPE '\\'`);
    bindings.push(`%"${iGM_EscapeLike(params.mcPlatform)}"%`);
  }

  return {
    where: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    bindings,
  };
}

/* ---------- 资源分类 ---------- */

/** 获取全部资源分类（按 sortOrder 排序） */
export async function iGM_ListResourceCategories(): Promise<iGM_ResourceCategoryRow[]> {
  return (await iGM_Db
    .query(
      `SELECT * FROM iGM_ResourceCategories
        ORDER BY iGM_SortOrder ASC, iGM_Name ASC`,
    )
    .all()) as iGM_ResourceCategoryRow[];
}

/** 按主键查询资源分类 */
export async function iGM_FindResourceCategoryById(
  id: string,
): Promise<iGM_ResourceCategoryRow | null> {
  return (
    ((await iGM_Db
      .query(`SELECT * FROM iGM_ResourceCategories WHERE iGM_Id = ?`)
      .get(id)) as iGM_ResourceCategoryRow | undefined) ?? null
  );
}

/* ---------- 资源标签 ---------- */

/** 按主键批量查询资源标签 */
export async function iGM_FindResourceTagsByIds(ids: string[]): Promise<iGM_ResourceTagRow[]> {
  const unique = Array.from(new Set(ids)).filter(Boolean);
  if (unique.length === 0) return [];
  const placeholders = unique.map(() => "?").join(", ");
  return (await iGM_Db
    .query(
      `SELECT * FROM iGM_ResourceTags WHERE iGM_Id IN (${placeholders})`,
    )
    .all(...unique)) as iGM_ResourceTagRow[];
}

/** 按 slug 查询资源标签 */
export async function iGM_FindResourceTagBySlug(
  slug: string,
): Promise<iGM_ResourceTagRow | null> {
  return (
    ((await iGM_Db
      .query(`SELECT * FROM iGM_ResourceTags WHERE iGM_Slug = ?`)
      .get(slug)) as iGM_ResourceTagRow | undefined) ?? null
  );
}

/** 按名称集合查找或新建资源标签（名称大小写不敏感） */
export async function iGM_FindOrCreateResourceTags(
  names: string[],
): Promise<iGM_ResourceTagRow[]> {
  const result: iGM_ResourceTagRow[] = [];
  for (const name of names) {
    const existing = (await iGM_Db
      .query(
        `SELECT * FROM iGM_ResourceTags WHERE LOWER(iGM_Name) = LOWER(?)`,
      )
      .get(name)) as iGM_ResourceTagRow | undefined;
    if (existing) {
      result.push(existing);
      continue;
    }
    const row: iGM_ResourceTagRow = {
      iGM_Id: iGM_RandomUuid(),
      iGM_Name: name,
      iGM_Slug: await iGM_BuildResourceTagSlug(name),
    };
    await iGM_Db.run(
      `INSERT INTO iGM_ResourceTags (iGM_Id, iGM_Name, iGM_Slug)
       VALUES (?, ?, ?)`,
      [row.iGM_Id, row.iGM_Name, row.iGM_Slug],
    );
    result.push(row);
  }
  return result;
}

/** 由标签名生成 slug，冲突时追加短随机串 */
async function iGM_BuildResourceTagSlug(name: string): Promise<string> {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const slug = base || "tag";
  const exists = await iGM_Db
    .query(`SELECT iGM_Id FROM iGM_ResourceTags WHERE iGM_Slug = ?`)
    .get(slug);
  if (!exists) return slug;
  return `${slug}-${iGM_RandomUuid().slice(0, 8)}`;
}

/** 替换某资源的标签关联（先删后插） */
export async function iGM_ReplaceResourceTags(
  resourceId: string,
  tagIds: string[],
): Promise<void> {
  await iGM_Db.run(`DELETE FROM iGM_ResourceTagsMap WHERE iGM_ResourceId = ?`, [
    resourceId,
  ]);
  const uniqueIds = Array.from(new Set(tagIds));
  if (uniqueIds.length === 0) return;
  const insert = iGM_Db.prepare(
    `INSERT INTO iGM_ResourceTagsMap (iGM_ResourceId, iGM_TagId)
     VALUES (?, ?)
     ON CONFLICT DO NOTHING`,
  );
  for (const tagId of uniqueIds) await insert.run(resourceId, tagId);
}

/** 读取一批资源的标签关联：resourceId -> 标签行数组 */
export async function iGM_GetTagsForResources(
  resourceIds: string[],
): Promise<Map<string, iGM_ResourceTagRow[]>> {
  const map = new Map<string, iGM_ResourceTagRow[]>();
  const unique = Array.from(new Set(resourceIds)).filter(Boolean);
  if (unique.length === 0) return map;

  const placeholders = unique.map(() => "?").join(", ");
  const rows = (await iGM_Db
    .query(
      `SELECT m.iGM_ResourceId AS iGM_ResourceId, t.*
         FROM iGM_ResourceTagsMap m
         JOIN iGM_ResourceTags t ON t.iGM_Id = m.iGM_TagId
        WHERE m.iGM_ResourceId IN (${placeholders})`,
    )
    .all(...unique)) as (iGM_ResourceTagRow & { iGM_ResourceId: string })[];

  for (const row of rows) {
    const list = map.get(row.iGM_ResourceId) ?? [];
    list.push({
      iGM_Id: row.iGM_Id,
      iGM_Name: row.iGM_Name,
      iGM_Slug: row.iGM_Slug,
    });
    map.set(row.iGM_ResourceId, list);
  }
  return map;
}

/* ---------- 资源 ---------- */

/** 新建资源 */
export async function iGM_CreateResource(
  input: iGM_CreateResourceInput,
): Promise<iGM_ResourceRow> {
  const row: iGM_ResourceRow = {
    iGM_Id: iGM_RandomUuid(),
    iGM_UploaderId: input.uploaderId,
    iGM_Title: input.title,
    iGM_Description: input.description,
    iGM_CategoryId: input.categoryId,
    iGM_FileId: input.fileId,
    iGM_CoverFileId: input.coverFileId,
    iGM_ActivityId: input.activityId,
    iGM_DownloadCount: 0,
    iGM_Status: input.status,
    iGM_ResourceType: input.resourceType ?? null,
    iGM_McVersions: input.mcVersionsJson ?? null,
    iGM_Loaders: input.loadersJson ?? null,
    iGM_Platforms: input.platformsJson ?? null,
    iGM_License: input.license ?? null,
    iGM_OriginalAuthor: input.originalAuthor ?? null,
    iGM_OriginalUrl: input.originalUrl ?? null,
    iGM_Changelog: input.changelog ?? null,
    iGM_Downloadable: input.downloadable ? 1 : 0,
    iGM_Slug: input.downloadable ? (input.slug ?? null) : null,
    iGM_Version: input.downloadable ? (input.version ?? null) : null,
    iGM_CreatedAt: input.now,
    iGM_UpdatedAt: input.now,
  };
  await iGM_Db.run(
    `INSERT INTO iGM_Resources
       (iGM_Id, iGM_UploaderId, iGM_Title, iGM_Description, iGM_CategoryId,
        iGM_FileId, iGM_CoverFileId, iGM_ActivityId, iGM_DownloadCount,
        iGM_Status, iGM_ResourceType, iGM_McVersions, iGM_Loaders, iGM_Platforms,
        iGM_License, iGM_OriginalAuthor, iGM_OriginalUrl, iGM_Changelog,
        iGM_Downloadable, iGM_Slug, iGM_Version,
        iGM_CreatedAt, iGM_UpdatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.iGM_Id,
      row.iGM_UploaderId,
      row.iGM_Title,
      row.iGM_Description,
      row.iGM_CategoryId,
      row.iGM_FileId,
      row.iGM_CoverFileId,
      row.iGM_ActivityId,
      row.iGM_DownloadCount,
      row.iGM_Status,
      row.iGM_ResourceType,
      row.iGM_McVersions,
      row.iGM_Loaders,
      row.iGM_Platforms,
      row.iGM_License,
      row.iGM_OriginalAuthor,
      row.iGM_OriginalUrl,
      row.iGM_Changelog,
      row.iGM_Downloadable,
      row.iGM_Slug,
      row.iGM_Version,
      row.iGM_CreatedAt,
      row.iGM_UpdatedAt,
    ],
  );
  return row;
}

/** 按主键查询资源 */
export async function iGM_FindResourceById(id: string): Promise<iGM_ResourceRow | null> {
  return (
    ((await iGM_Db
      .query(`SELECT * FROM iGM_Resources WHERE iGM_Id = ?`)
      .get(id)) as iGM_ResourceRow | undefined) ?? null
  );
}

/**
 * 按标识符查询资源：
 * - UUID 走主键
 * - 否则优先按 iGM_Slug 匹配（CLI 下载标识符，含 uid），
 *   再回退按标题精确匹配（兼容旧资源）
 * 供 iGM CLI 的 `/G_Resource/:identifier/download` 路由使用
 */
const iGM_UuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function iGM_FindResourceByIdentifier(
  identifier: string,
): Promise<iGM_ResourceRow | null> {
  const trimmed = identifier.trim();
  if (!trimmed) return null;
  if (iGM_UuidPattern.test(trimmed)) {
    return await iGM_FindResourceById(trimmed);
  }
  // 优先按 slug 匹配
  const bySlug = (await iGM_Db
    .query(`SELECT * FROM iGM_Resources WHERE iGM_Slug = ? LIMIT 1`)
    .get(trimmed)) as iGM_ResourceRow | undefined;
  if (bySlug) return bySlug;
  // 回退按标题精确匹配
  return (
    ((await iGM_Db
      .query(`SELECT * FROM iGM_Resources WHERE iGM_Title = ? LIMIT 1`)
      .get(trimmed)) as iGM_ResourceRow | undefined) ?? null
  );
}

/** 更新资源 */
export async function iGM_UpdateResource(
  id: string,
  input: iGM_UpdateResourceInput,
): Promise<boolean> {
  const result = await iGM_Db.run(
    `UPDATE iGM_Resources SET
       iGM_Title = ?, iGM_Description = ?, iGM_CategoryId = ?,
       iGM_FileId = ?, iGM_CoverFileId = ?, iGM_ActivityId = ?,
       iGM_Status = ?, iGM_ResourceType = ?,
       iGM_McVersions = ?, iGM_Loaders = ?, iGM_Platforms = ?,
       iGM_License = ?, iGM_OriginalAuthor = ?, iGM_OriginalUrl = ?,
       iGM_Changelog = ?,
       iGM_Downloadable = ?, iGM_Slug = ?, iGM_Version = ?,
       iGM_UpdatedAt = ?
     WHERE iGM_Id = ?`,
    [
      input.title,
      input.description,
      input.categoryId,
      input.fileId,
      input.coverFileId,
      input.activityId,
      input.status,
      input.resourceType ?? null,
      input.mcVersionsJson ?? null,
      input.loadersJson ?? null,
      input.platformsJson ?? null,
      input.license ?? null,
      input.originalAuthor ?? null,
      input.originalUrl ?? null,
      input.changelog ?? null,
      input.downloadable ? 1 : 0,
      input.downloadable ? (input.slug ?? null) : null,
      input.downloadable ? (input.version ?? null) : null,
      input.now,
      id,
    ],
  );
  return result.changes > 0;
}

/** 删除资源（标签关联由外键级联清理） */
export async function iGM_DeleteResource(id: string): Promise<boolean> {
  const result = await iGM_Db.run(`DELETE FROM iGM_Resources WHERE iGM_Id = ?`, [id]);
  return result.changes > 0;
}

/** 下载计数 +1 */
export async function iGM_IncrementDownloadCount(id: string): Promise<void> {
  await iGM_Db.run(
    `UPDATE iGM_Resources SET iGM_DownloadCount = iGM_DownloadCount + 1
      WHERE iGM_Id = ?`,
    [id],
  );
}

/** 按筛选条件分页查询资源（按创建时间倒序） */
export async function iGM_ListResources(
  params: iGM_ResourceListParams,
): Promise<iGM_ResourceListResult> {
  const { where, bindings } = iGM_BuildFilters(params);
  const offset = (params.page - 1) * params.pageSize;

  const totalRow = (await iGM_Db
    .query(`SELECT COUNT(*) AS iGM_Count FROM iGM_Resources r ${where}`)
    .get(...bindings)) as { iGM_Count: number };

  const items = (await iGM_Db
    .query(
      `SELECT r.* FROM iGM_Resources r
       ${where}
       ORDER BY r.iGM_CreatedAt DESC, r.iGM_Id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...bindings, params.pageSize, offset)) as iGM_ResourceRow[];

  return { items, total: totalRow.iGM_Count };
}

// 导出 //
export default {
  iGM_ListResourceCategories,
  iGM_FindResourceCategoryById,
  iGM_FindResourceTagsByIds,
  iGM_FindResourceTagBySlug,
  iGM_FindOrCreateResourceTags,
  iGM_ReplaceResourceTags,
  iGM_GetTagsForResources,
  iGM_CreateResource,
  iGM_FindResourceById,
  iGM_UpdateResource,
  iGM_DeleteResource,
  iGM_IncrementDownloadCount,
  iGM_ListResources,
};
