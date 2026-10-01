/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_SocialService.ts
 * 所属层：后端 / 业务逻辑层
 * 路由：G_Social
 * 模块：iGM_SocialService
 * 作用：社交关系（关注、好友、黑名单）与用户动态流的业务编排
 * 内容：关系状态汇总、关注/取消关注、好友申请/同意/拒绝/删除、拉黑/取消拉黑、
 *       各类名单查询、动态流（关注与好友的最近发帖、评论）聚合分页
 * 安全：自我操作拒绝；任一方拉黑时关注/加好友/发私信均拒绝（私信在
 *       iGM_MessageService 复用本服务的黑名单判断）；拉黑时清理关注与好友关系
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import {
  iGM_CountFollowers,
  iGM_CountFollowing,
  iGM_CreateFollow,
  iGM_DeleteFollow,
  iGM_FindFollow,
  iGM_ListFollowers,
  iGM_ListFollowing,
} from "../iGM_Repositories/iGM_SocialRepository";
import {
  iGM_CountIncomingRequests,
  iGM_CreateFriendRequest,
  iGM_DeleteFriendship,
  iGM_FindFriendEither,
  iGM_FindFriendRow,
  iGM_ListFriends,
  iGM_ListIncomingRequests,
  iGM_ListOutgoingRequests,
  iGM_UpdateFriendStatus,
} from "../iGM_Repositories/iGM_SocialRepository";
import {
  iGM_CreateBlock,
  iGM_DeleteBlock,
  iGM_FindBlock,
  iGM_ListBlocks,
} from "../iGM_Repositories/iGM_SocialRepository";
import { iGM_FindUserById, iGM_FindUsersByIds } from "../iGM_Repositories/iGM_UserRepository";
import { iGM_ResolveUserOrgBadge } from "../iGM_Repositories/iGM_OrgVerifyRepository";
import { iGM_Notify } from "./iGM_NotificationService";
import type { iGM_UserRow } from "../iGM_Types/iGM_Auth";
import type {
  iGM_FeedData,
  iGM_FeedItemDto,
  iGM_FriendEntryDto,
  iGM_FriendRequestDto,
  iGM_FriendState,
  iGM_RelationStateDto,
  iGM_RelationUserDto,
} from "../iGM_Types/iGM_Social";
import type { iGM_AuthorDto } from "../iGM_Types/iGM_Community";

// 类型定义 //
/** 社交业务错误：message 为前端 i18n 文案键，status 为 HTTP 状态码 */
export class iGM_SocialError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "iGM_SocialError";
  }
}

/** 名单分页结果（统一结构：条目 + 双方计数） */
export interface iGM_RelationListData {
  items: iGM_RelationUserDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** 我的关注数（关注列表）或粉丝数（粉丝列表） */
  followingCount: number;
  followerCount: number;
}

/** 好友列表数据 */
export interface iGM_FriendListData {
  items: iGM_FriendEntryDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 好友申请列表数据：收到 + 发出 */
export interface iGM_FriendRequestListData {
  incoming: iGM_FriendRequestDto[];
  outgoing: iGM_FriendRequestDto[];
  incomingCount: number;
}

/** 黑名单列表数据 */
export interface iGM_BlockListData {
  items: iGM_RelationUserDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// 核心逻辑 //
const iGM_DefaultPageSize = 20;
const iGM_MaxPageSize = 100;

/** 用户行转作者简要 DTO（含认证组织徽标） */
async function iGM_ToAuthorDto(user: iGM_UserRow): Promise<iGM_AuthorDto> {
  return {
    id: user.iGM_Id,
    username: user.iGM_Username,
    displayName: user.iGM_DisplayName,
    avatar: user.iGM_Avatar,
    role: user.iGM_Role,
    verifiedOrg: await iGM_ResolveUserOrgBadge(
      user.iGM_VerifiedOrgId ?? null,
      user.iGM_Email,
    ),
  };
}

/** 规范化分页参数 */
function iGM_ResolvePagination(pageRaw?: number, pageSizeRaw?: number): {
  page: number;
  pageSize: number;
} {
  const page =
    Number.isFinite(pageRaw) && (pageRaw as number) >= 1
      ? Math.floor(pageRaw as number)
      : 1;
  const pageSize =
    Number.isFinite(pageSizeRaw) &&
    (pageSizeRaw as number) >= 1 &&
    (pageSizeRaw as number) <= iGM_MaxPageSize
      ? Math.floor(pageSizeRaw as number)
      : iGM_DefaultPageSize;
  return { page, pageSize };
}

/* ---------- 通用校验 ---------- */

/** 目标用户必须存在且 active，否则按不存在处理，避免泄露状态 */
async function iGM_RequireActiveTarget(userId: string): Promise<iGM_UserRow> {
  const target = await iGM_FindUserById(userId);
  if (!target || target.iGM_Status !== "active") {
    throw new iGM_SocialError("social.errors.userNotFound", 404);
  }
  return target;
}

/** 拒绝自我关系操作 */
function iGM_RejectSelf(meId: string, targetId: string): void {
  if (meId === targetId) {
    throw new iGM_SocialError("social.errors.cannotSelf", 422);
  }
}

/* ---------- 黑名单判断（供私信服务复用） ---------- */

/**
 * 判断 me 与 target 之间是否存在任一方向的拉黑。
 * 返回：null 无拉黑；"me" 我拉黑了对方；"target" 对方拉黑了我
 */
export async function iGM_GetBlockDirection(
  meId: string,
  targetId: string,
): Promise<"me" | "target" | null> {
  if (await iGM_FindBlock(meId, targetId)) return "me";
  if (await iGM_FindBlock(targetId, meId)) return "target";
  return null;
}

/* ---------- 关系状态汇总 ---------- */

/** 当前登录用户与目标用户的关系汇总（个人主页按钮使用） */
export async function iGM_GetRelationStateService(
  meId: string,
  targetId: string,
): Promise<iGM_RelationStateDto> {
  const following = (await iGM_FindFollow(meId, targetId)) !== null;
  const followedBy = (await iGM_FindFollow(targetId, meId)) !== null;
  const blockDirection = await iGM_GetBlockDirection(meId, targetId);

  return {
    following,
    followedBy,
    friendState: await iGM_ResolveFriendState(meId, targetId),
    blocked: blockDirection === "me",
    blockedBy: blockDirection === "target",
  };
}

/** 计算当前用户视角的好友状态 */
async function iGM_ResolveFriendState(
  meId: string,
  targetId: string,
): Promise<iGM_FriendState> {
  const outgoing = await iGM_FindFriendRow(meId, targetId);
  if (outgoing) {
    if (outgoing.iGM_Status === "accepted") return "accepted";
    if (outgoing.iGM_Status === "pending") return "pending_outgoing";
    return "rejected";
  }
  const incoming = await iGM_FindFriendRow(targetId, meId);
  if (incoming) {
    if (incoming.iGM_Status === "accepted") return "accepted";
    if (incoming.iGM_Status === "pending") return "pending_incoming";
    return "rejected";
  }
  return null;
}

/* ---------- 关注 ---------- */

/** 关注用户：自我、黑名单拦截；已关注为幂等成功 */
export async function iGM_FollowService(
  user: iGM_UserRow,
  targetId: string,
): Promise<iGM_RelationStateDto> {
  iGM_RejectSelf(user.iGM_Id, targetId);
  await iGM_RequireActiveTarget(targetId);
  if (await iGM_GetBlockDirection(user.iGM_Id, targetId)) {
    throw new iGM_SocialError("social.errors.blocked", 422);
  }
  await iGM_CreateFollow(user.iGM_Id, targetId, new Date().toISOString());
  return await iGM_GetRelationStateService(user.iGM_Id, targetId);
}

/** 取消关注：幂等成功 */
export async function iGM_UnfollowService(
  user: iGM_UserRow,
  targetId: string,
): Promise<iGM_RelationStateDto> {
  iGM_RejectSelf(user.iGM_Id, targetId);
  await iGM_DeleteFollow(user.iGM_Id, targetId);
  return await iGM_GetRelationStateService(user.iGM_Id, targetId);
}

/* ---------- 好友 ---------- */

/** 发送好友申请：黑名单拦截；已有申请/好友按状态拒绝或允许重新申请 */
export async function iGM_SendFriendRequestService(
  user: iGM_UserRow,
  targetId: string,
  locale?: string,
): Promise<iGM_FriendRequestDto> {
  iGM_RejectSelf(user.iGM_Id, targetId);
  await iGM_RequireActiveTarget(targetId);
  if (await iGM_GetBlockDirection(user.iGM_Id, targetId)) {
    throw new iGM_SocialError("social.errors.blocked", 422);
  }

  const now = new Date().toISOString();
  const outgoing = await iGM_FindFriendRow(user.iGM_Id, targetId);
  if (outgoing) {
    if (outgoing.iGM_Status === "accepted") {
      throw new iGM_SocialError("social.errors.alreadyFriend", 422);
    }
    if (outgoing.iGM_Status === "pending") {
      throw new iGM_SocialError("social.errors.alreadyRequested", 422);
    }
    // rejected：允许重新发起，原行回到 pending
    await iGM_UpdateFriendStatus(outgoing.iGM_Id, "pending", now);
  } else {
    const incoming = await iGM_FindFriendRow(targetId, user.iGM_Id);
    if (incoming && incoming.iGM_Status === "accepted") {
      throw new iGM_SocialError("social.errors.alreadyFriend", 422);
    }
    if (incoming && incoming.iGM_Status === "pending") {
      // 对方已先发起申请：直接通过，互为好友
      await iGM_UpdateFriendStatus(incoming.iGM_Id, "accepted", now);
    } else {
      await iGM_CreateFriendRequest(user.iGM_Id, targetId, now);
    }
  }

  // 通知对方收到好友申请（自我触发在通知服务内跳过）
  await iGM_Notify({
    userId: targetId,
    actorId: user.iGM_Id,
    actorName: user.iGM_DisplayName ?? user.iGM_Username,
    type: "friend_request",
    title: user.iGM_DisplayName ?? user.iGM_Username,
    link: "/G_Friends",
    locale,
  });

  return await iGM_BuildRequestDto(user.iGM_Id, targetId);
}

/** 处理好友申请：accept 同意 / reject 拒绝；仅处理收到的 pending 申请 */
export async function iGM_RespondFriendRequestService(
  user: iGM_UserRow,
  requestId: string,
  action: "accept" | "reject",
  locale?: string,
): Promise<iGM_FriendRequestDto> {
  const incoming = (await iGM_ListIncomingRequests(user.iGM_Id)).find(
    (row) => row.iGM_Id === requestId,
  );
  if (!incoming) {
    throw new iGM_SocialError("social.errors.requestNotFound", 404);
  }
  const now = new Date().toISOString();
  await iGM_UpdateFriendStatus(
    incoming.iGM_Id,
    action === "accept" ? "accepted" : "rejected",
    now,
  );

  if (action === "accept") {
    // 通知申请者申请已通过
    await iGM_Notify({
      userId: incoming.iGM_UserId,
      actorId: user.iGM_Id,
      actorName: user.iGM_DisplayName ?? user.iGM_Username,
      type: "friend_accept",
      title: user.iGM_DisplayName ?? user.iGM_Username,
      link: "/G_Friends",
      locale,
    });
  }

  return await iGM_BuildRequestDto(user.iGM_Id, incoming.iGM_UserId);
}

/** 删除好友：解除双方 accepted 关系 */
export async function iGM_RemoveFriendService(
  user: iGM_UserRow,
  friendId: string,
): Promise<void> {
  iGM_RejectSelf(user.iGM_Id, friendId);
  const removed = await iGM_DeleteFriendship(user.iGM_Id, friendId);
  if (!removed) throw new iGM_SocialError("social.errors.friendNotFound", 404);
}

/** 组装单条申请 DTO（按当前用户方向） */
async function iGM_BuildRequestDto(
  meId: string,
  otherId: string,
): Promise<iGM_FriendRequestDto> {
  const row = await iGM_FindFriendEither(meId, otherId);
  if (!row) throw new iGM_SocialError("social.errors.requestNotFound", 404);
  const requester = await iGM_FindUserById(row.iGM_UserId);
  const recipient = await iGM_FindUserById(row.iGM_FriendId);
  if (!requester || !recipient) {
    throw new iGM_SocialError("social.errors.userNotFound", 404);
  }
  return {
    id: row.iGM_Id,
    status: row.iGM_Status,
    direction: row.iGM_FriendId === meId ? "incoming" : "outgoing",
    createdAt: row.iGM_CreatedAt,
    requester: await iGM_ToAuthorDto(requester),
    recipient: await iGM_ToAuthorDto(recipient),
  };
}

/* ---------- 黑名单 ---------- */

/**
 * 拉黑用户：拒绝自我；拉黑同时清理双向关注、好友（含 pending 申请），
 * 保证拉黑后双方不存在互动关系；已拉黑为幂等成功
 */
export async function iGM_BlockService(
  user: iGM_UserRow,
  targetId: string,
): Promise<void> {
  iGM_RejectSelf(user.iGM_Id, targetId);
  await iGM_RequireActiveTarget(targetId);
  const now = new Date().toISOString();
  await iGM_CreateBlock(user.iGM_Id, targetId, now);
  // 清理双向关注
  await iGM_DeleteFollow(user.iGM_Id, targetId);
  await iGM_DeleteFollow(targetId, user.iGM_Id);
  // 清理两人之间的好友与申请行（任意状态、任意方向）
  await iGM_Db.run(
    `DELETE FROM iGM_Friends
      WHERE (iGM_UserId = ? AND iGM_FriendId = ?)
         OR (iGM_UserId = ? AND iGM_FriendId = ?)`,
    [user.iGM_Id, targetId, targetId, user.iGM_Id],
  );
}

/** 取消拉黑：幂等成功 */
export async function iGM_UnblockService(
  user: iGM_UserRow,
  targetId: string,
): Promise<void> {
  iGM_RejectSelf(user.iGM_Id, targetId);
  await iGM_DeleteBlock(user.iGM_Id, targetId);
}

/* ---------- 名单查询 ---------- */

/** 关注列表 */
export async function iGM_ListFollowingService(
  userId: string,
  pageRaw?: number,
  pageSizeRaw?: number,
): Promise<iGM_RelationListData> {
  const { page, pageSize } = iGM_ResolvePagination(pageRaw, pageSizeRaw);
  const rows = await iGM_ListFollowing({
    userId,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  const users = await iGM_FindUsersByIds(rows.map((row) => row.iGM_FollowingId));
  const userMap = new Map(users.map((item) => [item.iGM_Id, item]));
  const total = await iGM_CountFollowing(userId);
  const followingCount = total;
  const followerCount = await iGM_CountFollowers(userId);
  const items: iGM_RelationUserDto[] = [];
  for (const row of rows) {
    const u = userMap.get(row.iGM_FollowingId);
    if (u) items.push({ createdAt: row.iGM_CreatedAt, user: await iGM_ToAuthorDto(u) });
  }
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    followingCount,
    followerCount,
  };
}

/** 粉丝列表 */
export async function iGM_ListFollowersService(
  userId: string,
  pageRaw?: number,
  pageSizeRaw?: number,
): Promise<iGM_RelationListData> {
  const { page, pageSize } = iGM_ResolvePagination(pageRaw, pageSizeRaw);
  const rows = await iGM_ListFollowers({
    userId,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  const users = await iGM_FindUsersByIds(rows.map((row) => row.iGM_FollowerId));
  const userMap = new Map(users.map((item) => [item.iGM_Id, item]));
  const total = await iGM_CountFollowers(userId);
  const followingCount = await iGM_CountFollowing(userId);
  const followerCount = total;
  const items: iGM_RelationUserDto[] = [];
  for (const row of rows) {
    const u = userMap.get(row.iGM_FollowerId);
    if (u) items.push({ createdAt: row.iGM_CreatedAt, user: await iGM_ToAuthorDto(u) });
  }
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    followingCount,
    followerCount,
  };
}

/** 好友列表（双向 accepted） */
export async function iGM_ListFriendsService(
  userId: string,
  pageRaw?: number,
  pageSizeRaw?: number,
): Promise<iGM_FriendListData> {
  const { page, pageSize } = iGM_ResolvePagination(pageRaw, pageSizeRaw);
  const entries = await iGM_ListFriends({
    userId,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  const users = await iGM_FindUsersByIds(entries.map((entry) => entry.friendId));
  const userMap = new Map(users.map((item) => [item.iGM_Id, item]));
  const items: iGM_FriendEntryDto[] = [];
  for (const entry of entries) {
    const u = userMap.get(entry.friendId);
    if (u) items.push({ createdAt: entry.createdAt, friend: await iGM_ToAuthorDto(u) });
  }

  // 好友总数：双向匹配去重
  const totalRow = ((await iGM_Db
    .query(
      `SELECT COUNT(*) AS iGM_Count FROM (
         SELECT CASE WHEN iGM_UserId = ? THEN iGM_FriendId ELSE iGM_UserId END AS fid
           FROM iGM_Friends
          WHERE iGM_Status = 'accepted'
            AND (iGM_UserId = ? OR iGM_FriendId = ?)
          GROUP BY fid)`,
    )
    .get(userId, userId, userId)) as { iGM_Count: number });

  return {
    items,
    total: totalRow.iGM_Count,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalRow.iGM_Count / pageSize)),
  };
}

/** 好友申请列表（收到的与发出的） */
export async function iGM_ListFriendRequestsService(userId: string): Promise<iGM_FriendRequestListData> {
  const toDto = async (row: {
    iGM_Id: string;
    iGM_Status: "pending" | "accepted" | "rejected";
    iGM_CreatedAt: string;
    iGM_UserId: string;
    iGM_FriendId: string;
  }): Promise<iGM_FriendRequestDto | null> => {
    const requester = await iGM_FindUserById(row.iGM_UserId);
    const recipient = await iGM_FindUserById(row.iGM_FriendId);
    if (!requester || !recipient) return null;
    return {
      id: row.iGM_Id,
      status: row.iGM_Status,
      direction: row.iGM_FriendId === userId ? "incoming" : "outgoing",
      createdAt: row.iGM_CreatedAt,
      requester: await iGM_ToAuthorDto(requester),
      recipient: await iGM_ToAuthorDto(recipient),
    };
  };
  const incomingRows = await iGM_ListIncomingRequests(userId);
  const incoming: iGM_FriendRequestDto[] = [];
  for (const row of incomingRows) {
    const dto = await toDto(row);
    if (dto !== null) incoming.push(dto);
  }
  const outgoingRows = await iGM_ListOutgoingRequests(userId);
  const outgoing: iGM_FriendRequestDto[] = [];
  for (const row of outgoingRows) {
    const dto = await toDto(row);
    if (dto !== null) outgoing.push(dto);
  }
  return {
    incoming,
    outgoing,
    incomingCount: await iGM_CountIncomingRequests(userId),
  };
}

/** 黑名单列表 */
export async function iGM_ListBlocksService(
  userId: string,
  pageRaw?: number,
  pageSizeRaw?: number,
): Promise<iGM_BlockListData> {
  const { page, pageSize } = iGM_ResolvePagination(pageRaw, pageSizeRaw);
  const rows = await iGM_ListBlocks({
    userId,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  const users = await iGM_FindUsersByIds(rows.map((row) => row.iGM_BlockedUserId));
  const userMap = new Map(users.map((item) => [item.iGM_Id, item]));
  const items: iGM_RelationUserDto[] = [];
  for (const row of rows) {
    const u = userMap.get(row.iGM_BlockedUserId);
    if (u) items.push({ createdAt: row.iGM_CreatedAt, user: await iGM_ToAuthorDto(u) });
  }

  const totalRow = ((await iGM_Db
    .query(`SELECT COUNT(*) AS iGM_Count FROM iGM_Blocks WHERE iGM_UserId = ?`)
    .get(userId)) as { iGM_Count: number });

  return {
    items,
    total: totalRow.iGM_Count,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalRow.iGM_Count / pageSize)),
  };
}

/* ---------- 动态流 ---------- */

/**
 * 用户动态流：来源为我关注的用户与已通过好友（去重），
 * 聚合其最近已发布帖子与可见评论，按时间倒序合并后分页。
 * 无任何关注/好友时返回空。
 */
export async function iGM_GetFeedService(
  userId: string,
  pageRaw?: number,
  pageSizeRaw?: number,
): Promise<iGM_FeedData> {
  const { page, pageSize } = iGM_ResolvePagination(pageRaw, pageSizeRaw);
  const sourceIds = await iGM_GetFeedSourceIds(userId);
  if (sourceIds.length === 0) {
    return { items: [], total: 0, page, pageSize, totalPages: 1 };
  }

  // 计数口径：帖子 + 评论
  const placeholders = sourceIds.map(() => "?").join(", ");
  const postTotal = (
    (await iGM_Db
      .query(
        `SELECT COUNT(*) AS iGM_Count FROM iGM_Posts
          WHERE iGM_Status = 'published' AND iGM_AuthorId IN (${placeholders})`,
      )
      .get(...sourceIds)) as { iGM_Count: number }
  ).iGM_Count;
  const commentTotal = (
    (await iGM_Db
      .query(
        `SELECT COUNT(*) AS iGM_Count FROM iGM_Comments c
           JOIN iGM_Posts p ON p.iGM_Id = c.iGM_PostId
          WHERE c.iGM_Status = 'visible' AND p.iGM_Status = 'published'
            AND c.iGM_AuthorId IN (${placeholders})`,
      )
      .get(...sourceIds)) as { iGM_Count: number }
  ).iGM_Count;
  const total = postTotal + commentTotal;

  // 多取一页数据用于内存合并分页
  const fetchSize = page * pageSize;
  const postRows = (await iGM_Db
    .query(
      `SELECT iGM_Id, iGM_AuthorId, iGM_Title, iGM_Content, iGM_CreatedAt
         FROM iGM_Posts
        WHERE iGM_Status = 'published' AND iGM_AuthorId IN (${placeholders})
        ORDER BY iGM_CreatedAt DESC, iGM_Id DESC
        LIMIT ?`,
    )
    .all(...sourceIds, fetchSize)) as Array<{
    iGM_Id: string;
    iGM_AuthorId: string;
    iGM_Title: string;
    iGM_Content: string;
    iGM_CreatedAt: string;
  }>;
  const commentRows = (await iGM_Db
    .query(
      `SELECT c.iGM_Id, c.iGM_AuthorId, c.iGM_PostId, c.iGM_Content, c.iGM_CreatedAt,
              p.iGM_Title AS iGM_PostTitle
         FROM iGM_Comments c
         JOIN iGM_Posts p ON p.iGM_Id = c.iGM_PostId
        WHERE c.iGM_Status = 'visible' AND p.iGM_Status = 'published'
          AND c.iGM_AuthorId IN (${placeholders})
        ORDER BY c.iGM_CreatedAt DESC, c.iGM_Id DESC
        LIMIT ?`,
    )
    .all(...sourceIds, fetchSize)) as Array<{
    iGM_Id: string;
    iGM_AuthorId: string;
    iGM_PostId: string;
    iGM_PostTitle: string;
    iGM_Content: string;
    iGM_CreatedAt: string;
  }>;

  const actorRows = await iGM_FindUsersByIds(
    Array.from(new Set([...postRows.map((r) => r.iGM_AuthorId), ...commentRows.map((r) => r.iGM_AuthorId)])),
  );
  const actorMap = new Map(actorRows.map((item) => [item.iGM_Id, item]));

  const items: iGM_FeedItemDto[] = [];
  for (const row of postRows) {
    const actor = actorMap.get(row.iGM_AuthorId);
    if (!actor) continue;
    items.push({
      type: "post",
      actor: await iGM_ToAuthorDto(actor),
      createdAt: row.iGM_CreatedAt,
      postId: row.iGM_Id,
      postTitle: row.iGM_Title,
      excerpt: iGM_BuildExcerpt(row.iGM_Content),
    });
  }
  for (const row of commentRows) {
    const actor = actorMap.get(row.iGM_AuthorId);
    if (!actor) continue;
    items.push({
      type: "comment",
      actor: await iGM_ToAuthorDto(actor),
      createdAt: row.iGM_CreatedAt,
      postId: row.iGM_PostId,
      postTitle: row.iGM_PostTitle,
      excerpt: iGM_BuildExcerpt(row.iGM_Content),
    });
  }

  items.sort((a, b) => {
    if (a.createdAt === b.createdAt) return a.postId < b.postId ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });

  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** 获取动态流来源用户：关注 + 双向好友，去重且仅 active */
async function iGM_GetFeedSourceIds(userId: string): Promise<string[]> {
  const followingRows = await iGM_ListFollowing({ userId, limit: iGM_MaxPageSize, offset: 0 });
  const friendEntries = await iGM_ListFriends({ userId, limit: iGM_MaxPageSize, offset: 0 });
  const ids = new Set<string>();
  for (const row of followingRows) ids.add(row.iGM_FollowingId);
  for (const entry of friendEntries) ids.add(entry.friendId);
  return Array.from(ids);
}

/** 单行摘要（复用内容服务长度口径） */
function iGM_BuildExcerpt(content: string): string {
  const singleLine = content.replace(/\s+/g, " ").trim();
  return singleLine.length > 160 ? `${singleLine.slice(0, 160)}…` : singleLine;
}

// 导出 //
export default {
  iGM_GetBlockDirection,
  iGM_GetRelationStateService,
  iGM_FollowService,
  iGM_UnfollowService,
  iGM_SendFriendRequestService,
  iGM_RespondFriendRequestService,
  iGM_RemoveFriendService,
  iGM_BlockService,
  iGM_UnblockService,
  iGM_ListFollowingService,
  iGM_ListFollowersService,
  iGM_ListFriendsService,
  iGM_ListFriendRequestsService,
  iGM_ListBlocksService,
  iGM_GetFeedService,
};
