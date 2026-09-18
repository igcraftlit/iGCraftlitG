/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_TaxonomyRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_Community、G_Post
 * 模块：iGM_TaxonomyRepository
 * 作用：分类（iGM_Categories）、标签（iGM_Tags）与帖子标签关联（iGM_PostTags）
 *       的唯一数据访问出口
 * 内容：分类列表/查询、标签批量查询、按名称查找或新建标签、帖子标签替换与读取
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import { iGM_RandomUuid } from "../iGM_Services/iGM_SecurityService";
import type { iGM_CategoryRow, iGM_TagRow } from "../iGM_Types/iGM_Community";

// 类型定义 //
/** 帖子-标签关联行 */
interface iGM_PostTagRow {
  iGM_PostId: string;
  iGM_TagId: string;
}

// 核心逻辑 //
/** 获取全部分类（按 sortOrder、名称排序） */
export function iGM_ListCategories(): iGM_CategoryRow[] {
  return iGM_Db
    .query(
      `SELECT * FROM iGM_Categories
       ORDER BY iGM_SortOrder ASC, iGM_Name ASC`,
    )
    .all() as iGM_CategoryRow[];
}

/** 按主键查询分类 */
export function iGM_FindCategoryById(id: string): iGM_CategoryRow | null {
  return (
    (iGM_Db
      .query(`SELECT * FROM iGM_Categories WHERE iGM_Id = ?`)
      .get(id) as iGM_CategoryRow | undefined) ?? null
  );
}

/** 按 slug 查询分类 */
export function iGM_FindCategoryBySlug(slug: string): iGM_CategoryRow | null {
  return (
    (iGM_Db
      .query(`SELECT * FROM iGM_Categories WHERE iGM_Slug = ?`)
      .get(slug) as iGM_CategoryRow | undefined) ?? null
  );
}

/** 按主键批量查询标签 */
export function iGM_FindTagsByIds(ids: string[]): iGM_TagRow[] {
  const unique = Array.from(new Set(ids)).filter(Boolean);
  if (unique.length === 0) return [];
  const placeholders = unique.map(() => "?").join(", ");
  return iGM_Db
    .query(`SELECT * FROM iGM_Tags WHERE iGM_Id IN (${placeholders})`)
    .all(...unique) as iGM_TagRow[];
}

/**
 * 按名称集合查找或新建标签（名称大小写不敏感）
 * @param names 已规范化的标签名数组
 * @returns 与入参顺序对应的标签行数组
 */
export function iGM_FindOrCreateTags(names: string[]): iGM_TagRow[] {
  const result: iGM_TagRow[] = [];
  for (const name of names) {
    const existing = iGM_Db
      .query(`SELECT * FROM iGM_Tags WHERE iGM_Name = ? COLLATE NOCASE`)
      .get(name) as iGM_TagRow | undefined;
    if (existing) {
      result.push(existing);
      continue;
    }
    const row: iGM_TagRow = {
      iGM_Id: iGM_RandomUuid(),
      iGM_Name: name,
      iGM_Slug: iGM_BuildTagSlug(name),
    };
    iGM_Db.run(
      `INSERT INTO iGM_Tags (iGM_Id, iGM_Name, iGM_Slug) VALUES (?, ?, ?)`,
      [row.iGM_Id, row.iGM_Name, row.iGM_Slug],
    );
    result.push(row);
  }
  return result;
}

/**
 * 由标签名生成 slug：小写 ASCII 字母数字与连字符；
 * 非 ASCII（如中文）保留原字符用于 URL，空白转连字符，冲突时追加短随机串
 */
export function iGM_BuildTagSlug(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const slug = base || "tag";
  const exists = iGM_Db
    .query(`SELECT iGM_Id FROM iGM_Tags WHERE iGM_Slug = ?`)
    .get(slug);
  if (!exists) return slug;
  return `${slug}-${iGM_RandomUuid().slice(0, 8)}`;
}

/** 替换某篇帖子的标签关联（在事务内先删后插） */
export function iGM_ReplacePostTags(postId: string, tagIds: string[]): void {
  iGM_Db.run(`DELETE FROM iGM_PostTags WHERE iGM_PostId = ?`, [postId]);
  const uniqueIds = Array.from(new Set(tagIds));
  if (uniqueIds.length === 0) return;
  const insert = iGM_Db.prepare(
    `INSERT OR IGNORE INTO iGM_PostTags (iGM_PostId, iGM_TagId) VALUES (?, ?)`,
  );
  for (const tagId of uniqueIds) {
    insert.run(postId, tagId);
  }
}

/** 读取一批帖子的标签关联，返回 postId -> 标签行数组 的映射 */
export function iGM_GetTagsForPosts(
  postIds: string[],
): Map<string, iGM_TagRow[]> {
  const map = new Map<string, iGM_TagRow[]>();
  const unique = Array.from(new Set(postIds)).filter(Boolean);
  if (unique.length === 0) return map;

  const placeholders = unique.map(() => "?").join(", ");
  const rows = iGM_Db
    .query(
      `SELECT pt.iGM_PostId AS iGM_PostId, t.*
         FROM iGM_PostTags pt
         JOIN iGM_Tags t ON t.iGM_Id = pt.iGM_TagId
        WHERE pt.iGM_PostId IN (${placeholders})`,
    )
    .all(...unique) as (iGM_PostTagRow & iGM_TagRow)[];

  for (const row of rows) {
    const list = map.get(row.iGM_PostId) ?? [];
    list.push({
      iGM_Id: row.iGM_Id,
      iGM_Name: row.iGM_Name,
      iGM_Slug: row.iGM_Slug,
    });
    map.set(row.iGM_PostId, list);
  }
  return map;
}

/** 按 slug 查询标签 */
export function iGM_FindTagBySlug(slug: string): iGM_TagRow | null {
  return (
    (iGM_Db
      .query(`SELECT * FROM iGM_Tags WHERE iGM_Slug = ?`)
      .get(slug) as iGM_TagRow | undefined) ?? null
  );
}

// 导出 //
export default {
  iGM_ListCategories,
  iGM_FindCategoryById,
  iGM_FindCategoryBySlug,
  iGM_FindTagsByIds,
  iGM_FindOrCreateTags,
  iGM_BuildTagSlug,
  iGM_ReplacePostTags,
  iGM_GetTagsForPosts,
  iGM_FindTagBySlug,
};
