/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_PostRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_Community、G_Post
 * 模块：iGM_PostRepository
 * 作用：iGM_Posts 表的唯一数据访问出口
 * 内容：创建、按主键查询、更新内容/分类/状态、删除、
 *       分类/标签/关键词/作者筛选与分页列表、作者帖子计数、评论数批量统计
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import { iGM_RandomUuid } from "../iGM_Services/iGM_SecurityService";
import type { iGM_PostRow, iGM_PostStatus } from "../iGM_Types/iGM_Community";

// 类型定义 //
/** 创建帖子所需字段 */
export interface iGM_CreatePostParams {
  authorId: string;
  title: string;
  content: string;
  categoryId: string | null;
  now: string;
}

/** 帖子列表筛选参数 */
export interface iGM_PostListParams {
  /** 分类 ID 筛选 */
  categoryId?: string | null;
  /** 标签 ID 筛选 */
  tagId?: string | null;
  /** 作者 ID 筛选（个人主页/我的帖子） */
  authorId?: string | null;
  /** 关键词：匹配标题或正文 */
  search?: string | null;
  /** 允许的状态集合，默认仅 published；本人/管理员可传多状态 */
  statuses: iGM_PostStatus[];
  /** 页码（从 1 开始） */
  page: number;
  /** 每页条数 */
  pageSize: number;
}

/** 列表查询结果：当前页行 + 总数 */
export interface iGM_PostListResult {
  items: iGM_PostRow[];
  total: number;
}

// 核心逻辑 //
/** 创建帖子行 */
export function iGM_CreatePost(params: iGM_CreatePostParams): iGM_PostRow {
  const id = iGM_RandomUuid();
  iGM_Db.run(
    `INSERT INTO iGM_Posts
       (iGM_Id, iGM_AuthorId, iGM_Title, iGM_Content,
        iGM_CategoryId, iGM_Status, iGM_CreatedAt, iGM_UpdatedAt)
     VALUES (?, ?, ?, ?, ?, 'published', ?, ?)`,
    [
      id,
      params.authorId,
      params.title,
      params.content,
      params.categoryId,
      params.now,
      params.now,
    ],
  );
  const row = iGM_FindPostById(id);
  if (!row) throw new Error("iGM_CreatePost：创建后查询帖子失败");
  return row;
}

/** 按主键查询帖子 */
export function iGM_FindPostById(id: string): iGM_PostRow | null {
  return (
    (iGM_Db
      .query(`SELECT * FROM iGM_Posts WHERE iGM_Id = ?`)
      .get(id) as iGM_PostRow | undefined) ?? null
  );
}

/** 更新帖子标题、正文与分类，并刷新 updatedAt */
export function iGM_UpdatePost(
  postId: string,
  fields: {
    title: string;
    content: string;
    categoryId: string | null;
    now: string;
  },
): boolean {
  const result = iGM_Db.run(
    `UPDATE iGM_Posts
       SET iGM_Title = ?, iGM_Content = ?, iGM_CategoryId = ?, iGM_UpdatedAt = ?
     WHERE iGM_Id = ?`,
    [fields.title, fields.content, fields.categoryId, fields.now, postId],
  );
  return result.changes > 0;
}

/** 更新帖子状态（作者隐藏/恢复，协管员与管理员可管理任意帖子） */
export function iGM_SetPostStatus(
  postId: string,
  status: iGM_PostStatus,
  now: string,
): boolean {
  const result = iGM_Db.run(
    `UPDATE iGM_Posts SET iGM_Status = ?, iGM_UpdatedAt = ? WHERE iGM_Id = ?`,
    [status, now, postId],
  );
  return result.changes > 0;
}

/** 删除帖子行（关联评论/收藏/标签由外键级联，点赞由业务层事务清理） */
export function iGM_DeletePost(postId: string): boolean {
  const result = iGM_Db.run(`DELETE FROM iGM_Posts WHERE iGM_Id = ?`, [postId]);
  return result.changes > 0;
}

/** 转义 LIKE 通配符，与 ESCAPE '\' 配合防止用户输入扩大匹配范围 */
function iGM_EscapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** 组装筛选条件与绑定参数（列表与计数共用，保证口径一致） */
function iGM_BuildFilters(params: iGM_PostListParams): {
  where: string;
  bindings: (string | number)[];
} {
  const clauses: string[] = [];
  const bindings: (string | number)[] = [];

  if (params.statuses.length > 0) {
    clauses.push(
      `p.iGM_Status IN (${params.statuses.map(() => "?").join(", ")})`,
    );
    bindings.push(...params.statuses);
  }
  if (params.categoryId) {
    clauses.push(`p.iGM_CategoryId = ?`);
    bindings.push(params.categoryId);
  }
  if (params.authorId) {
    clauses.push(`p.iGM_AuthorId = ?`);
    bindings.push(params.authorId);
  }
  if (params.tagId) {
    clauses.push(
      `EXISTS (SELECT 1 FROM iGM_PostTags pt
                WHERE pt.iGM_PostId = p.iGM_Id AND pt.iGM_TagId = ?)`,
    );
    bindings.push(params.tagId);
  }
  if (params.search && params.search.trim().length > 0) {
    const keyword = `%${iGM_EscapeLike(params.search.trim())}%`;
    clauses.push(`(p.iGM_Title LIKE ? ESCAPE '\\' OR p.iGM_Content LIKE ? ESCAPE '\\')`);
    bindings.push(keyword, keyword);
  }

  return {
    where: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    bindings,
  };
}

/** 按筛选条件分页查询帖子（按创建时间倒序） */
export function iGM_ListPosts(params: iGM_PostListParams): iGM_PostListResult {
  const { where, bindings } = iGM_BuildFilters(params);
  const offset = (params.page - 1) * params.pageSize;

  const totalRow = iGM_Db
    .query(`SELECT COUNT(*) AS iGM_Count FROM iGM_Posts p ${where}`)
    .get(...bindings) as { iGM_Count: number };

  const items = iGM_Db
    .query(
      `SELECT p.* FROM iGM_Posts p
       ${where}
       ORDER BY p.iGM_CreatedAt DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...bindings, params.pageSize, offset) as iGM_PostRow[];

  return { items, total: totalRow.iGM_Count };
}

/** 统计某作者在指定状态集合下的帖子数 */
export function iGM_CountPostsByAuthor(
  authorId: string,
  statuses: iGM_PostStatus[] = ["published"],
): number {
  const placeholders = statuses.map(() => "?").join(", ");
  const row = iGM_Db
    .query(
      `SELECT COUNT(*) AS iGM_Count FROM iGM_Posts
        WHERE iGM_AuthorId = ? AND iGM_Status IN (${placeholders})`,
    )
    .get(authorId, ...statuses) as { iGM_Count: number };
  return row.iGM_Count;
}

/** 批量统计一组帖子的可见评论数：postId -> 数量 */
export function iGM_GetCommentCountsForPosts(
  postIds: string[],
): Map<string, number> {
  const map = new Map<string, number>();
  const unique = Array.from(new Set(postIds)).filter(Boolean);
  if (unique.length === 0) return map;
  const placeholders = unique.map(() => "?").join(", ");
  const rows = iGM_Db
    .query(
      `SELECT iGM_PostId AS iGM_TargetId, COUNT(*) AS iGM_Count
         FROM iGM_Comments
        WHERE iGM_Status = 'visible' AND iGM_PostId IN (${placeholders})
        GROUP BY iGM_PostId`,
    )
    .all(...unique) as { iGM_TargetId: string; iGM_Count: number }[];
  for (const row of rows) map.set(row.iGM_TargetId, row.iGM_Count);
  return map;
}

// 导出 //
export default {
  iGM_CreatePost,
  iGM_FindPostById,
  iGM_UpdatePost,
  iGM_SetPostStatus,
  iGM_DeletePost,
  iGM_ListPosts,
  iGM_CountPostsByAuthor,
  iGM_GetCommentCountsForPosts,
};
