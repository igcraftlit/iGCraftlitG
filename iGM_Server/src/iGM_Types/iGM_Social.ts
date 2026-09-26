/**
 * 文件路径：iGM_Server/src/iGM_Types/iGM_Social.ts
 * 所属层：后端 / 类型定义层
 * 路由：G_Social
 * 模块：iGM_Social
 * 作用：定义社交关系（关注、好友、黑名单）的数据库行类型与对外 DTO
 * 内容：好友状态枚举、关注/好友/黑名单行、关系汇总 DTO、好友/申请/名单条目 DTO、
 *       动态流条目 DTO
 * 说明：DTO 仅含公开字段；好友行为方向性由字段名（requester/recipient）表达
 */

// 导入依赖 //
import type { iGM_AuthorDto } from "./iGM_Community";

// 类型定义 //
/** 好友申请状态：pending 待处理 / accepted 已通过 / rejected 已拒绝 */
export type iGM_FriendStatus = "pending" | "accepted" | "rejected";

/** 当前用户视角的好友关系状态（个人主页按钮使用） */
export type iGM_FriendState =
  | "accepted"
  | "pending_outgoing"
  | "pending_incoming"
  | "rejected"
  | null;

/** 关注关系行 */
export interface iGM_FollowRow {
  iGM_Id: string;
  iGM_FollowerId: string;
  iGM_FollowingId: string;
  iGM_CreatedAt: string;
}

/** 好友关系行：iGM_UserId 向 iGM_FriendId 发起申请 */
export interface iGM_FriendRow {
  iGM_Id: string;
  iGM_UserId: string;
  iGM_FriendId: string;
  iGM_Status: iGM_FriendStatus;
  iGM_CreatedAt: string;
  iGM_UpdatedAt: string;
}

/** 黑名单行 */
export interface iGM_BlockRow {
  iGM_Id: string;
  iGM_UserId: string;
  iGM_BlockedUserId: string;
  iGM_CreatedAt: string;
}

/* ---------- 对外 DTO ---------- */

/** 当前登录用户与目标用户的关系汇总 */
export interface iGM_RelationStateDto {
  /** 我是否关注了对方 */
  following: boolean;
  /** 对方是否关注了我 */
  followedBy: boolean;
  /** 好友状态（当前用户视角） */
  friendState: iGM_FriendState;
  /** 我是否拉黑了对方 */
  blocked: boolean;
  /** 对方是否拉黑了我 */
  blockedBy: boolean;
}

/** 关注/粉丝/黑名单列表条目 */
export interface iGM_RelationUserDto {
  /** 关系行创建时间 */
  createdAt: string;
  user: iGM_AuthorDto;
}

/** 好友列表条目 */
export interface iGM_FriendEntryDto {
  /** 成为好友的时间 */
  createdAt: string;
  friend: iGM_AuthorDto;
}

/** 好友申请条目（收到的与发出的统一结构，方向由 direction 表达） */
export interface iGM_FriendRequestDto {
  id: string;
  status: iGM_FriendStatus;
  direction: "incoming" | "outgoing";
  createdAt: string;
  requester: iGM_AuthorDto;
  recipient: iGM_AuthorDto;
}

/** 动态流条目类型：post 新发帖 / comment 新评论 */
export type iGM_FeedItemType = "post" | "comment";

/** 动态流条目：展示关注用户与好友的最近发帖、评论 */
export interface iGM_FeedItemDto {
  type: iGM_FeedItemType;
  actor: iGM_AuthorDto;
  /** 行为发生时间 */
  createdAt: string;
  /** 帖子或评论所属帖子 ID */
  postId: string;
  postTitle: string;
  /** comment 类型时的评论内容；post 类型时为帖子摘要 */
  excerpt: string;
}

/** 动态流分页数据 */
export interface iGM_FeedData {
  items: iGM_FeedItemDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// 核心逻辑 //
/** 允许的好友状态常量 */
export const iGM_FriendStatuses: iGM_FriendStatus[] = [
  "pending",
  "accepted",
  "rejected",
];

/** 判断未知字符串是否为合法好友状态 */
export function iGM_IsFriendStatus(
  value: unknown,
): value is iGM_FriendStatus {
  return (
    typeof value === "string" &&
    iGM_FriendStatuses.includes(value as iGM_FriendStatus)
  );
}

// 导出 //
export default { iGM_FriendStatuses, iGM_IsFriendStatus };
