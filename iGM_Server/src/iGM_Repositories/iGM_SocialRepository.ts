/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_SocialRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_Social
 * 模块：iGM_SocialRepository
 * 作用：关注（iGM_Follows）、好友（iGM_Friends）、黑名单（iGM_Blocks）
 *       三张表的唯一数据访问出口
 * 内容：关注增删查与关注/粉丝列表及计数；好友申请创建、状态流转、双向好友查询、
 *       待处理申请列表、好友删除；黑名单增删查与列表
 * 说明：所有写入由服务层完成黑名单与自我关系校验后调用；好友关系按双向匹配
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import { iGM_RandomUuid } from "../iGM_Services/iGM_SecurityService";
import type {
  iGM_BlockRow,
  iGM_FollowRow,
  iGM_FriendRow,
  iGM_FriendStatus,
} from "../iGM_Types/iGM_Social";

// 类型定义 //
/** 名单分页参数 */
export interface iGM_RelationListParams {
  userId: string;
  limit: number;
  offset: number;
}

// 核心逻辑 //
/* ---------- 关注 ---------- */

/** 创建关注关系；已存在（唯一约束）时返回 false，不重复写入 */
export async function iGM_CreateFollow(
  followerId: string,
  followingId: string,
  now: string,
): Promise<boolean> {
  const result = await iGM_Db.run(
    `INSERT INTO iGM_Follows
       (iGM_Id, iGM_FollowerId, iGM_FollowingId, iGM_CreatedAt)
     VALUES (?, ?, ?, ?)
     ON CONFLICT DO NOTHING`,
    [iGM_RandomUuid(), followerId, followingId, now],
  );
  return result.changes > 0;
}

/** 取消关注；无关注关系时返回 false */
export async function iGM_DeleteFollow(
  followerId: string,
  followingId: string,
): Promise<boolean> {
  const result = await iGM_Db.run(
    `DELETE FROM iGM_Follows
      WHERE iGM_FollowerId = ? AND iGM_FollowingId = ?`,
    [followerId, followingId],
  );
  return result.changes > 0;
}

/** 查询单条关注关系 */
export async function iGM_FindFollow(
  followerId: string,
  followingId: string,
): Promise<iGM_FollowRow | null> {
  return (
    ((await iGM_Db
      .query(
        `SELECT * FROM iGM_Follows
          WHERE iGM_FollowerId = ? AND iGM_FollowingId = ?`,
      )
      .get(followerId, followingId)) as iGM_FollowRow | undefined) ?? null
  );
}

/** 关注列表（我关注的人，按关注时间倒序） */
export async function iGM_ListFollowing(
  params: iGM_RelationListParams,
): Promise<iGM_FollowRow[]> {
  return (await iGM_Db
    .query(
      `SELECT * FROM iGM_Follows
        WHERE iGM_FollowerId = ?
        ORDER BY iGM_CreatedAt DESC, iGM_Id DESC
        LIMIT ? OFFSET ?`,
    )
    .all(params.userId, params.limit, params.offset)) as iGM_FollowRow[];
}

/** 粉丝列表（关注我的人，按关注时间倒序） */
export async function iGM_ListFollowers(
  params: iGM_RelationListParams,
): Promise<iGM_FollowRow[]> {
  return (await iGM_Db
    .query(
      `SELECT * FROM iGM_Follows
        WHERE iGM_FollowingId = ?
        ORDER BY iGM_CreatedAt DESC, iGM_Id DESC
        LIMIT ? OFFSET ?`,
    )
    .all(params.userId, params.limit, params.offset)) as iGM_FollowRow[];
}

/** 关注数 / 粉丝数 */
export async function iGM_CountFollowing(userId: string): Promise<number> {
  return (
    (await iGM_Db
      .query(`SELECT COUNT(*) AS iGM_Count FROM iGM_Follows WHERE iGM_FollowerId = ?`)
      .get(userId)) as { iGM_Count: number }
  ).iGM_Count;
}

export async function iGM_CountFollowers(userId: string): Promise<number> {
  return (
    (await iGM_Db
      .query(`SELECT COUNT(*) AS iGM_Count FROM iGM_Follows WHERE iGM_FollowingId = ?`)
      .get(userId)) as { iGM_Count: number }
  ).iGM_Count;
}

/* ---------- 好友 ---------- */

/** 按方向查询好友行（requesterId → recipientId） */
export async function iGM_FindFriendRow(
  requesterId: string,
  recipientId: string,
): Promise<iGM_FriendRow | null> {
  return (
    ((await iGM_Db
      .query(
        `SELECT * FROM iGM_Friends
          WHERE iGM_UserId = ? AND iGM_FriendId = ?`,
      )
      .get(requesterId, recipientId)) as iGM_FriendRow | undefined) ?? null
  );
}

/** 查询两人之间任意方向的好友行 */
export async function iGM_FindFriendEither(
  userA: string,
  userB: string,
): Promise<iGM_FriendRow | null> {
  return (
    ((await iGM_Db
      .query(
        `SELECT * FROM iGM_Friends
          WHERE (iGM_UserId = ? AND iGM_FriendId = ?)
             OR (iGM_UserId = ? AND iGM_FriendId = ?)`,
      )
      .get(userA, userB, userB, userA)) as iGM_FriendRow | undefined) ?? null
  );
}

/** 创建好友申请（初始 pending） */
export async function iGM_CreateFriendRequest(
  requesterId: string,
  recipientId: string,
  now: string,
): Promise<iGM_FriendRow> {
  const row: iGM_FriendRow = {
    iGM_Id: iGM_RandomUuid(),
    iGM_UserId: requesterId,
    iGM_FriendId: recipientId,
    iGM_Status: "pending",
    iGM_CreatedAt: now,
    iGM_UpdatedAt: now,
  };
  await iGM_Db.run(
    `INSERT INTO iGM_Friends
       (iGM_Id, iGM_UserId, iGM_FriendId, iGM_Status, iGM_CreatedAt, iGM_UpdatedAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      row.iGM_Id,
      row.iGM_UserId,
      row.iGM_FriendId,
      row.iGM_Status,
      row.iGM_CreatedAt,
      row.iGM_UpdatedAt,
    ],
  );
  return row;
}

/** 更新好友行状态 */
export async function iGM_UpdateFriendStatus(
  id: string,
  status: iGM_FriendStatus,
  now: string,
): Promise<boolean> {
  const result = await iGM_Db.run(
    `UPDATE iGM_Friends SET iGM_Status = ?, iGM_UpdatedAt = ? WHERE iGM_Id = ?`,
    [status, now, id],
  );
  return result.changes > 0;
}

/**
 * 好友列表：双向匹配 accepted 且对方用户存在（status=active）。
 * 返回统一结构，对端 ID 与成为好友的时间由对端方向行决定。
 */
export async function iGM_ListFriends(
  params: iGM_RelationListParams,
): Promise<{ friendId: string; createdAt: string }[]> {
  return (await iGM_Db
    .query(
      `SELECT CASE WHEN f.iGM_UserId = ? THEN f.iGM_FriendId ELSE f.iGM_UserId END
                 AS friendId,
              f.iGM_UpdatedAt AS createdAt
         FROM iGM_Friends f
         JOIN iGM_Users u ON u.iGM_Id =
              CASE WHEN f.iGM_UserId = ? THEN f.iGM_FriendId ELSE f.iGM_UserId END
        WHERE f.iGM_Status = 'accepted'
          AND ((f.iGM_UserId = ?) OR (f.iGM_FriendId = ?))
          AND u.iGM_Status = 'active'
        ORDER BY f.iGM_UpdatedAt DESC, f.iGM_Id DESC
        LIMIT ? OFFSET ?`,
    )
    .all(
      params.userId,
      params.userId,
      params.userId,
      params.userId,
      params.limit,
      params.offset,
    )) as { friendId: string; createdAt: string }[];
}

/** 收到的好友申请（待处理） */
export async function iGM_ListIncomingRequests(userId: string): Promise<iGM_FriendRow[]> {
  return (await iGM_Db
    .query(
      `SELECT * FROM iGM_Friends
        WHERE iGM_FriendId = ? AND iGM_Status = 'pending'
        ORDER BY iGM_CreatedAt DESC, iGM_Id DESC`,
    )
    .all(userId)) as iGM_FriendRow[];
}

/** 发出的好友申请（待处理） */
export async function iGM_ListOutgoingRequests(userId: string): Promise<iGM_FriendRow[]> {
  return (await iGM_Db
    .query(
      `SELECT * FROM iGM_Friends
        WHERE iGM_UserId = ? AND iGM_Status = 'pending'
        ORDER BY iGM_CreatedAt DESC, iGM_Id DESC`,
    )
    .all(userId)) as iGM_FriendRow[];
}

/** 统计未处理的收到申请数（导航角标使用） */
export async function iGM_CountIncomingRequests(userId: string): Promise<number> {
  return (
    (await iGM_Db
      .query(
        `SELECT COUNT(*) AS iGM_Count FROM iGM_Friends
          WHERE iGM_FriendId = ? AND iGM_Status = 'pending'`,
      )
      .get(userId)) as { iGM_Count: number }
  ).iGM_Count;
}

/**
 * 删除好友：删除两人之间任意方向的 accepted 行。
 * pending/rejected 行不由此接口处理。
 */
export async function iGM_DeleteFriendship(userId: string, friendId: string): Promise<boolean> {
  const result = await iGM_Db.run(
    `DELETE FROM iGM_Friends
      WHERE iGM_Status = 'accepted'
        AND ((iGM_UserId = ? AND iGM_FriendId = ?)
          OR (iGM_UserId = ? AND iGM_FriendId = ?))`,
    [userId, friendId, friendId, userId],
  );
  return result.changes > 0;
}

/* ---------- 黑名单 ---------- */

/** 拉黑；已在黑名单时返回 false */
export async function iGM_CreateBlock(
  userId: string,
  blockedUserId: string,
  now: string,
): Promise<boolean> {
  const result = await iGM_Db.run(
    `INSERT INTO iGM_Blocks
       (iGM_Id, iGM_UserId, iGM_BlockedUserId, iGM_CreatedAt)
     VALUES (?, ?, ?, ?)
     ON CONFLICT DO NOTHING`,
    [iGM_RandomUuid(), userId, blockedUserId, now],
  );
  return result.changes > 0;
}

/** 取消拉黑 */
export async function iGM_DeleteBlock(userId: string, blockedUserId: string): Promise<boolean> {
  const result = await iGM_Db.run(
    `DELETE FROM iGM_Blocks
      WHERE iGM_UserId = ? AND iGM_BlockedUserId = ?`,
    [userId, blockedUserId],
  );
  return result.changes > 0;
}

/** 查询单条拉黑关系 */
export async function iGM_FindBlock(
  userId: string,
  blockedUserId: string,
): Promise<iGM_BlockRow | null> {
  return (
    ((await iGM_Db
      .query(
        `SELECT * FROM iGM_Blocks
          WHERE iGM_UserId = ? AND iGM_BlockedUserId = ?`,
      )
      .get(userId, blockedUserId)) as iGM_BlockRow | undefined) ?? null
  );
}

/** 黑名单列表（按拉黑时间倒序，仅含仍存在的用户） */
export async function iGM_ListBlocks(params: iGM_RelationListParams): Promise<iGM_BlockRow[]> {
  return (await iGM_Db
    .query(
      `SELECT b.* FROM iGM_Blocks b
         JOIN iGM_Users u ON u.iGM_Id = b.iGM_BlockedUserId
        WHERE b.iGM_UserId = ? AND u.iGM_Status = 'active'
        ORDER BY b.iGM_CreatedAt DESC, b.iGM_Id DESC
        LIMIT ? OFFSET ?`,
    )
    .all(params.userId, params.limit, params.offset)) as iGM_BlockRow[];
}

// 导出 //
export default {
  iGM_CreateFollow,
  iGM_DeleteFollow,
  iGM_FindFollow,
  iGM_ListFollowing,
  iGM_ListFollowers,
  iGM_CountFollowing,
  iGM_CountFollowers,
  iGM_FindFriendRow,
  iGM_FindFriendEither,
  iGM_CreateFriendRequest,
  iGM_UpdateFriendStatus,
  iGM_ListFriends,
  iGM_ListIncomingRequests,
  iGM_ListOutgoingRequests,
  iGM_CountIncomingRequests,
  iGM_DeleteFriendship,
  iGM_CreateBlock,
  iGM_DeleteBlock,
  iGM_FindBlock,
  iGM_ListBlocks,
};
