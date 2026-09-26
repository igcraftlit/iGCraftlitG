/**
 * 文件路径：apps/web/src/iGM_Services/iGM_SocialClient.ts
 * 所属层：前端 / 基础服务层
 * 路由：调用后端 /G_Social/*
 * 模块：iGM_SocialClient
 * 作用：社交关系与动态流后端接口的唯一前端调用出口
 * 内容：关系状态、关注/取消关注、关注/粉丝列表、好友申请列表/发起/处理/删除、
 *       拉黑/取消拉黑/黑名单、动态流
 * 约束：只经 iGM_Request 发请求；类型与后端 iGM_Types/iGM_Social.ts 保持一致
 */

// 导入依赖 //
import {
  iGM_Delete,
  iGM_Get,
  iGM_Post,
  type iGM_ApiResponse,
} from "./iGM_Request";
import type { iGM_Author } from "./iGM_CommunityClient";

// 类型定义 //
/** 好友申请状态 */
export type iGM_FriendStatus = "pending" | "accepted" | "rejected";

/** 当前用户视角好友状态（个人主页按钮使用） */
export type iGM_FriendState =
  | "accepted"
  | "pending_outgoing"
  | "pending_incoming"
  | "rejected"
  | null;

/** 与目标用户关系汇总 */
export interface iGM_RelationState {
  following: boolean;
  followedBy: boolean;
  friendState: iGM_FriendState;
  blocked: boolean;
  blockedBy: boolean;
}

/** 关注/粉丝/黑名单条目 */
export interface iGM_RelationUser {
  createdAt: string;
  user: iGM_Author;
}

/** 好友条目 */
export interface iGM_FriendEntry {
  createdAt: string;
  friend: iGM_Author;
}

/** 好友申请条目 */
export interface iGM_FriendRequest {
  id: string;
  status: iGM_FriendStatus;
  direction: "incoming" | "outgoing";
  createdAt: string;
  requester: iGM_Author;
  recipient: iGM_Author;
}

/** 动态流条目 */
export interface iGM_FeedItem {
  type: "post" | "comment";
  actor: iGM_Author;
  createdAt: string;
  postId: string;
  postTitle: string;
  excerpt: string;
}

/** 关注/粉丝名单数据 */
export interface iGM_RelationListData {
  items: iGM_RelationUser[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  followingCount: number;
  followerCount: number;
}

/** 好友列表数据 */
export interface iGM_FriendListData {
  items: iGM_FriendEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 好友申请列表数据 */
export interface iGM_FriendRequestListData {
  incoming: iGM_FriendRequest[];
  outgoing: iGM_FriendRequest[];
  incomingCount: number;
}

/** 黑名单列表数据 */
export interface iGM_BlockListData {
  items: iGM_RelationUser[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 动态流数据 */
export interface iGM_FeedData {
  items: iGM_FeedItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// 核心逻辑 //
/** 与目标用户关系状态 */
export function iGM_ApiGetRelationState(
  userId: string,
): Promise<iGM_ApiResponse<{ state: iGM_RelationState }>> {
  return iGM_Get(`/G_Social/state?userId=${encodeURIComponent(userId)}`);
}

/* ---------- 关注 ---------- */
export function iGM_ApiFollow(
  userId: string,
): Promise<iGM_ApiResponse<{ state: iGM_RelationState }>> {
  return iGM_Post("/G_Social/follow", { userId });
}

export function iGM_ApiUnfollow(
  userId: string,
): Promise<iGM_ApiResponse<{ state: iGM_RelationState }>> {
  return iGM_Post("/G_Social/unfollow", { userId });
}

/** 关注列表 */
export function iGM_ApiListFollowing(
  userId: string,
  page = 1,
): Promise<iGM_ApiResponse<{ data: iGM_RelationListData }>> {
  return iGM_Get(
    `/G_Social/following?userId=${encodeURIComponent(userId)}&page=${page}`,
  );
}

/** 粉丝列表 */
export function iGM_ApiListFollowers(
  userId: string,
  page = 1,
): Promise<iGM_ApiResponse<{ data: iGM_RelationListData }>> {
  return iGM_Get(
    `/G_Social/followers?userId=${encodeURIComponent(userId)}&page=${page}`,
  );
}

/* ---------- 好友 ---------- */
/** 好友列表 */
export function iGM_ApiListFriends(
  page = 1,
): Promise<iGM_ApiResponse<{ data: iGM_FriendListData }>> {
  return iGM_Get(`/G_Social/friend/list?page=${page}`);
}

/** 好友申请列表（收到 + 发出） */
export function iGM_ApiListFriendRequests(): Promise<
  iGM_ApiResponse<{ data: iGM_FriendRequestListData }>
> {
  return iGM_Get("/G_Social/friend/requests");
}

/** 发起好友申请 */
export function iGM_ApiSendFriendRequest(
  userId: string,
): Promise<iGM_ApiResponse<{ request: iGM_FriendRequest }>> {
  return iGM_Post("/G_Social/friend/request", { userId });
}

/** 处理好友申请 */
export function iGM_ApiRespondFriendRequest(
  requestId: string,
  action: "accept" | "reject",
): Promise<iGM_ApiResponse<{ request: iGM_FriendRequest }>> {
  return iGM_Post("/G_Social/friend/respond", { requestId, action });
}

/** 删除好友 */
export function iGM_ApiRemoveFriend(
  userId: string,
): Promise<iGM_ApiResponse<{ deleted: boolean }>> {
  return iGM_Delete(
    `/G_Social/friend/remove?userId=${encodeURIComponent(userId)}`,
  );
}

/* ---------- 黑名单 ---------- */
export function iGM_ApiBlock(
  userId: string,
): Promise<iGM_ApiResponse<{ blocked: boolean }>> {
  return iGM_Post("/G_Social/block", { userId });
}

export function iGM_ApiUnblock(
  userId: string,
): Promise<iGM_ApiResponse<{ blocked: boolean }>> {
  return iGM_Post("/G_Social/unblock", { userId });
}

/** 黑名单列表 */
export function iGM_ApiListBlocks(
  page = 1,
): Promise<iGM_ApiResponse<{ data: iGM_BlockListData }>> {
  return iGM_Get(`/G_Social/blocks?page=${page}`);
}

/* ---------- 动态流 ---------- */
export function iGM_ApiGetFeed(
  page = 1,
): Promise<iGM_ApiResponse<{ data: iGM_FeedData }>> {
  return iGM_Get(`/G_Social/feed?page=${page}`);
}

// 导出 //
export default {
  iGM_ApiGetRelationState,
  iGM_ApiFollow,
  iGM_ApiUnfollow,
  iGM_ApiListFollowing,
  iGM_ApiListFollowers,
  iGM_ApiListFriends,
  iGM_ApiListFriendRequests,
  iGM_ApiSendFriendRequest,
  iGM_ApiRespondFriendRequest,
  iGM_ApiRemoveFriend,
  iGM_ApiBlock,
  iGM_ApiUnblock,
  iGM_ApiListBlocks,
  iGM_ApiGetFeed,
};
