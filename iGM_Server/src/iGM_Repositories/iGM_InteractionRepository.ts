/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_InteractionRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_Post、G_Community
 * 模块：iGM_InteractionRepository
 * 作用：点赞（iGM_Likes）与收藏（iGM_Favorites）的唯一数据访问出口
 * 内容：幂等点赞/取消、收藏/取消、批量计数、当前用户的点赞/收藏状态集合
 * 说明：点赞为多态目标（post/comment），删除帖子时由业务层事务清理相关数据
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import { iGM_RandomUuid } from "../iGM_Services/iGM_SecurityService";
import type { iGM_LikeTargetType } from "../iGM_Types/iGM_Community";

// 类型定义 //
interface iGM_LikeRow {
  iGM_Id: string;
  iGM_TargetType: iGM_LikeTargetType;
  iGM_TargetId: string;
  iGM_UserId: string;
  iGM_CreatedAt: string;
}

/** 计数行：目标 ID 与数量 */
interface iGM_CountRow {
  iGM_TargetId: string;
  iGM_Count: number;
}

// 核心逻辑 //
/** 查询用户是否已点赞指定目标 */
export function iGM_HasLike(
  targetType: iGM_LikeTargetType,
  targetId: string,
  userId: string,
): boolean {
  const row = iGM_Db
    .query(
      `SELECT iGM_Id FROM iGM_Likes
        WHERE iGM_TargetType = ? AND iGM_TargetId = ? AND iGM_UserId = ?`,
    )
    .get(targetType, targetId, userId);
  return row !== null && row !== undefined;
}

/** 点赞（幂等：已点赞时不重复写入），返回当前是否处于点赞状态 */
export function iGM_AddLike(
  targetType: iGM_LikeTargetType,
  targetId: string,
  userId: string,
  now: string,
): boolean {
  iGM_Db.run(
    `INSERT OR IGNORE INTO iGM_Likes
       (iGM_Id, iGM_TargetType, iGM_TargetId, iGM_UserId, iGM_CreatedAt)
     VALUES (?, ?, ?, ?, ?)`,
    [iGM_RandomUuid(), targetType, targetId, userId, now],
  );
  return true;
}

/** 取消点赞，返回当前是否处于点赞状态 */
export function iGM_RemoveLike(
  targetType: iGM_LikeTargetType,
  targetId: string,
  userId: string,
): boolean {
  iGM_Db.run(
    `DELETE FROM iGM_Likes
      WHERE iGM_TargetType = ? AND iGM_TargetId = ? AND iGM_UserId = ?`,
    [targetType, targetId, userId],
  );
  return false;
}

/** 统计单个目标的点赞数 */
export function iGM_CountLikes(
  targetType: iGM_LikeTargetType,
  targetId: string,
): number {
  const row = iGM_Db
    .query(
      `SELECT COUNT(*) AS iGM_Count FROM iGM_Likes
        WHERE iGM_TargetType = ? AND iGM_TargetId = ?`,
    )
    .get(targetType, targetId) as { iGM_Count: number };
  return row.iGM_Count;
}

/**
 * 批量统计一组目标的点赞数
 * @returns targetId -> 数量 映射
 */
export function iGM_CountLikesBatch(
  targetType: iGM_LikeTargetType,
  targetIds: string[],
): Map<string, number> {
  const map = new Map<string, number>();
  const unique = Array.from(new Set(targetIds)).filter(Boolean);
  if (unique.length === 0) return map;
  const placeholders = unique.map(() => "?").join(", ");
  const rows = iGM_Db
    .query(
      `SELECT iGM_TargetId AS iGM_TargetId, COUNT(*) AS iGM_Count
         FROM iGM_Likes
        WHERE iGM_TargetType = ? AND iGM_TargetId IN (${placeholders})
        GROUP BY iGM_TargetId`,
    )
    .all(targetType, ...unique) as iGM_CountRow[];
  for (const row of rows) map.set(row.iGM_TargetId, row.iGM_Count);
  return map;
}

/** 查询某用户在一组目标中已点赞的目标 ID 集合 */
export function iGM_GetLikedIdSet(
  targetType: iGM_LikeTargetType,
  targetIds: string[],
  userId: string | null,
): Set<string> {
  const result = new Set<string>();
  const unique = Array.from(new Set(targetIds)).filter(Boolean);
  if (!userId || unique.length === 0) return result;
  const placeholders = unique.map(() => "?").join(", ");
  const rows = iGM_Db
    .query(
      `SELECT iGM_TargetId AS iGM_TargetId FROM iGM_Likes
        WHERE iGM_TargetType = ? AND iGM_UserId = ?
          AND iGM_TargetId IN (${placeholders})`,
    )
    .all(targetType, userId, ...unique) as Pick<iGM_LikeRow, "iGM_TargetId">[];
  for (const row of rows) result.add(row.iGM_TargetId);
  return result;
}

/* ---------- 收藏 ---------- */

/** 查询用户是否已收藏指定帖子 */
export function iGM_HasFavorite(postId: string, userId: string): boolean {
  const row = iGM_Db
    .query(
      `SELECT iGM_Id FROM iGM_Favorites WHERE iGM_PostId = ? AND iGM_UserId = ?`,
    )
    .get(postId, userId);
  return row !== null && row !== undefined;
}

/** 收藏帖子（幂等） */
export function iGM_AddFavorite(postId: string, userId: string, now: string): void {
  iGM_Db.run(
    `INSERT OR IGNORE INTO iGM_Favorites
       (iGM_Id, iGM_PostId, iGM_UserId, iGM_CreatedAt)
     VALUES (?, ?, ?, ?)`,
    [iGM_RandomUuid(), postId, userId, now],
  );
}

/** 取消收藏 */
export function iGM_RemoveFavorite(postId: string, userId: string): void {
  iGM_Db.run(
    `DELETE FROM iGM_Favorites WHERE iGM_PostId = ? AND iGM_UserId = ?`,
    [postId, userId],
  );
}

/** 统计单个帖子的收藏数 */
export function iGM_CountFavorites(postId: string): number {
  const row = iGM_Db
    .query(`SELECT COUNT(*) AS iGM_Count FROM iGM_Favorites WHERE iGM_PostId = ?`)
    .get(postId) as { iGM_Count: number };
  return row.iGM_Count;
}

/** 批量统计一组帖子的收藏数 */
export function iGM_CountFavoritesBatch(postIds: string[]): Map<string, number> {
  const map = new Map<string, number>();
  const unique = Array.from(new Set(postIds)).filter(Boolean);
  if (unique.length === 0) return map;
  const placeholders = unique.map(() => "?").join(", ");
  const rows = iGM_Db
    .query(
      `SELECT iGM_PostId AS iGM_TargetId, COUNT(*) AS iGM_Count
         FROM iGM_Favorites
        WHERE iGM_PostId IN (${placeholders})
        GROUP BY iGM_PostId`,
    )
    .all(...unique) as iGM_CountRow[];
  for (const row of rows) map.set(row.iGM_TargetId, row.iGM_Count);
  return map;
}

/** 查询某用户在一组帖子中已收藏的帖子 ID 集合 */
export function iGM_GetFavoritedIdSet(
  postIds: string[],
  userId: string | null,
): Set<string> {
  const result = new Set<string>();
  const unique = Array.from(new Set(postIds)).filter(Boolean);
  if (!userId || unique.length === 0) return result;
  const placeholders = unique.map(() => "?").join(", ");
  const rows = iGM_Db
    .query(
      `SELECT iGM_PostId AS iGM_TargetId FROM iGM_Favorites
        WHERE iGM_UserId = ? AND iGM_PostId IN (${placeholders})`,
    )
    .all(userId, ...unique) as Pick<iGM_LikeRow, "iGM_TargetId">[];
  for (const row of rows) result.add(row.iGM_TargetId);
  return result;
}

/** 删除帖子时清理其多态点赞（帖子自身与该帖全部评论的点赞） */
export function iGM_DeleteLikesForPost(postId: string): void {
  iGM_Db.run(
    `DELETE FROM iGM_Likes
      WHERE (iGM_TargetType = 'post' AND iGM_TargetId = ?)
         OR (iGM_TargetType = 'comment'
             AND iGM_TargetId IN (SELECT iGM_Id FROM iGM_Comments WHERE iGM_PostId = ?))`,
    [postId, postId],
  );
}

// 导出 //
export default {
  iGM_HasLike,
  iGM_AddLike,
  iGM_RemoveLike,
  iGM_CountLikes,
  iGM_CountLikesBatch,
  iGM_GetLikedIdSet,
  iGM_HasFavorite,
  iGM_AddFavorite,
  iGM_RemoveFavorite,
  iGM_CountFavorites,
  iGM_CountFavoritesBatch,
  iGM_GetFavoritedIdSet,
  iGM_DeleteLikesForPost,
};
