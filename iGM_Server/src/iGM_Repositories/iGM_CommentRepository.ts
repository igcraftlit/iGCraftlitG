/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_CommentRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_Post、G_Community
 * 模块：iGM_CommentRepository
 * 作用：iGM_Comments 表的唯一数据访问出口
 * 内容：创建回复、按主键查询、更新内容、更新状态、删除（先解除子评论挂靠）、
 *       按帖子平铺列表、按作者分页查询（带帖子标题）、作者评论计数
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import { iGM_RandomUuid } from "../iGM_Services/iGM_SecurityService";
import type {
  iGM_CommentRow,
  iGM_CommentStatus,
} from "../iGM_Types/iGM_Community";

// 类型定义 //
/** 创建评论所需字段 */
export interface iGM_CreateCommentParams {
  postId: string;
  authorId: string;
  parentId: string | null;
  content: string;
  now: string;
}

/** 带帖子标题的评论行（我的评论 / 个人主页使用） */
export interface iGM_CommentWithPostRow extends iGM_CommentRow {
  iGM_PostTitle: string;
}

/** 作者评论分页结果 */
export interface iGM_AuthorCommentListResult {
  items: iGM_CommentWithPostRow[];
  total: number;
}

// 核心逻辑 //
/** 创建评论行 */
export function iGM_CreateComment(
  params: iGM_CreateCommentParams,
): iGM_CommentRow {
  const id = iGM_RandomUuid();
  iGM_Db.run(
    `INSERT INTO iGM_Comments
       (iGM_Id, iGM_PostId, iGM_AuthorId, iGM_ParentId,
        iGM_Content, iGM_Status, iGM_CreatedAt, iGM_UpdatedAt)
     VALUES (?, ?, ?, ?, ?, 'visible', ?, ?)`,
    [
      id,
      params.postId,
      params.authorId,
      params.parentId,
      params.content,
      params.now,
      params.now,
    ],
  );
  const row = iGM_FindCommentById(id);
  if (!row) throw new Error("iGM_CreateComment：创建后查询评论失败");
  return row;
}

/** 按主键查询评论 */
export function iGM_FindCommentById(id: string): iGM_CommentRow | null {
  return (
    (iGM_Db
      .query(`SELECT * FROM iGM_Comments WHERE iGM_Id = ?`)
      .get(id) as iGM_CommentRow | undefined) ?? null
  );
}

/** 更新评论内容，并刷新 updatedAt */
export function iGM_UpdateComment(
  commentId: string,
  content: string,
  now: string,
): boolean {
  const result = iGM_Db.run(
    `UPDATE iGM_Comments SET iGM_Content = ?, iGM_UpdatedAt = ? WHERE iGM_Id = ?`,
    [content, now, commentId],
  );
  return result.changes > 0;
}

/** 更新评论状态（隐藏/恢复） */
export function iGM_SetCommentStatus(
  commentId: string,
  status: iGM_CommentStatus,
  now: string,
): boolean {
  const result = iGM_Db.run(
    `UPDATE iGM_Comments SET iGM_Status = ?, iGM_UpdatedAt = ? WHERE iGM_Id = ?`,
    [status, now, commentId],
  );
  return result.changes > 0;
}

/**
 * 删除评论：事务内先将直接子评论的 parentId 置空（成为顶层评论），再删除自身。
 * 该评论自身的点赞由业务层事务提前清理
 */
export function iGM_DeleteComment(commentId: string): boolean {
  const txn = iGM_Db.transaction(() => {
    iGM_Db.run(
      `UPDATE iGM_Comments SET iGM_ParentId = NULL WHERE iGM_ParentId = ?`,
      [commentId],
    );
    return iGM_Db.run(`DELETE FROM iGM_Comments WHERE iGM_Id = ?`, [commentId]);
  });
  return txn().changes > 0;
}

/**
 * 查询某帖子的评论（平铺，按时间正序，前端按 parentId 组织楼中楼）
 * @param includeHidden 是否包含隐藏评论（作者本人/协管员/管理员查看）
 */
export function iGM_ListCommentsByPost(
  postId: string,
  includeHidden: boolean,
): iGM_CommentRow[] {
  const sql = includeHidden
    ? `SELECT * FROM iGM_Comments WHERE iGM_PostId = ? ORDER BY iGM_CreatedAt ASC`
    : `SELECT * FROM iGM_Comments
        WHERE iGM_PostId = ? AND iGM_Status = 'visible'
        ORDER BY iGM_CreatedAt ASC`;
  return iGM_Db.query(sql).all(postId) as iGM_CommentRow[];
}

/** 统计某用户在指定状态集合下的评论数 */
export function iGM_CountCommentsByAuthor(
  authorId: string,
  statuses: iGM_CommentStatus[] = ["visible"],
): number {
  const placeholders = statuses.map(() => "?").join(", ");
  const row = iGM_Db
    .query(
      `SELECT COUNT(*) AS iGM_Count FROM iGM_Comments
        WHERE iGM_AuthorId = ? AND iGM_Status IN (${placeholders})`,
    )
    .get(authorId, ...statuses) as { iGM_Count: number };
  return row.iGM_Count;
}

/**
 * 分页查询某作者的评论（关联帖子标题），按评论时间倒序。
 * 个人主页仅传 visible；我的评论传全部状态
 */
export function iGM_ListCommentsByAuthor(
  authorId: string,
  statuses: iGM_CommentStatus[],
  page: number,
  pageSize: number,
): iGM_AuthorCommentListResult {
  const placeholders = statuses.map(() => "?").join(", ");
  const offset = (page - 1) * pageSize;

  const totalRow = iGM_Db
    .query(
      `SELECT COUNT(*) AS iGM_Count FROM iGM_Comments
        WHERE iGM_AuthorId = ? AND iGM_Status IN (${placeholders})`,
    )
    .get(authorId, ...statuses) as { iGM_Count: number };

  const items = iGM_Db
    .query(
      `SELECT c.*, p.iGM_Title AS iGM_PostTitle
         FROM iGM_Comments c
         JOIN iGM_Posts p ON p.iGM_Id = c.iGM_PostId
        WHERE c.iGM_AuthorId = ? AND c.iGM_Status IN (${placeholders})
        ORDER BY c.iGM_CreatedAt DESC
        LIMIT ? OFFSET ?`,
    )
    .all(authorId, ...statuses, pageSize, offset) as iGM_CommentWithPostRow[];

  return { items, total: totalRow.iGM_Count };
}

// 导出 //
export default {
  iGM_CreateComment,
  iGM_FindCommentById,
  iGM_UpdateComment,
  iGM_SetCommentStatus,
  iGM_DeleteComment,
  iGM_ListCommentsByPost,
  iGM_CountCommentsByAuthor,
  iGM_ListCommentsByAuthor,
};
