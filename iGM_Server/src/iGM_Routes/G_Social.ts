/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_Social.ts
 * 所属层：后端 / 路由层
 * 路由：/G_Social/*
 * 模块：G_Social
 * 作用：社交关系与动态流接口集合
 * 内容：关系状态汇总、关注/取消关注、关注/粉丝列表、好友申请/处理/删除、
 *       拉黑/取消拉黑/黑名单、动态流
 * 约束：统一响应 { success, code, message, data }；
 *       除名单与状态公开只读外，写入要求登录并做基础限流
 */

// 导入依赖 //
import { Elysia } from "elysia";
import { iGM_Ok } from "../iGM_Types/iGM_Response";
import { iGM_RequireUser } from "../iGM_Middleware/iGM_AuthGuard";
import {
  iGM_CurrentUser,
  iGM_EnforceRateLimit,
  iGM_Field,
  iGM_PageQuery,
  iGM_Query,
  iGM_RequestLocale,
  type iGM_RouteContext,
} from "./iGM_RouteSupport";
import {
  iGM_BlockService,
  iGM_FollowService,
  iGM_GetFeedService,
  iGM_GetRelationStateService,
  iGM_ListBlocksService,
  iGM_ListFollowersService,
  iGM_ListFollowingService,
  iGM_ListFriendRequestsService,
  iGM_ListFriendsService,
  iGM_RemoveFriendService,
  iGM_RespondFriendRequestService,
  iGM_SendFriendRequestService,
  iGM_UnblockService,
  iGM_UnfollowService,
  iGM_SocialError,
} from "../iGM_Services/iGM_SocialService";

// 类型定义 //
// （路由层无额外类型，统一响应类型见 iGM_Types/iGM_Response.ts）

// 核心逻辑 //
/* ---------- 关系状态（个人主页按钮） ---------- */
function iGM_HandleState(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  const targetId = iGM_Query(ctx.query, "userId").trim();
  if (!targetId) throw new iGM_SocialError("social.errors.userNotFound", 404);
  return iGM_Ok({
    state: iGM_GetRelationStateService(user.iGM_Id, targetId),
  });
}

/* ---------- 关注 / 取消关注 ---------- */
function iGM_HandleFollow(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "socialWrite", `user:${user.iGM_Id}`);
  const targetId = iGM_Field(ctx.body, "userId").trim();
  return iGM_Ok({ state: iGM_FollowService(user, targetId) });
}

function iGM_HandleUnfollow(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "socialWrite", `user:${user.iGM_Id}`);
  const targetId = iGM_Field(ctx.body, "userId").trim();
  return iGM_Ok({ state: iGM_UnfollowService(user, targetId) });
}

/* ---------- 关注列表 / 粉丝列表（公开只读） ---------- */
function iGM_HandleFollowing(ctx: iGM_RouteContext) {
  const userId = iGM_Query(ctx.query, "userId").trim();
  const { page, pageSize } = iGM_PageQuery(ctx);
  if (!userId) throw new iGM_SocialError("social.errors.userNotFound", 404);
  return iGM_Ok({
    data: iGM_ListFollowingService(userId, page, pageSize),
  });
}

function iGM_HandleFollowers(ctx: iGM_RouteContext) {
  const userId = iGM_Query(ctx.query, "userId").trim();
  const { page, pageSize } = iGM_PageQuery(ctx);
  if (!userId) throw new iGM_SocialError("social.errors.userNotFound", 404);
  return iGM_Ok({
    data: iGM_ListFollowersService(userId, page, pageSize),
  });
}

/* ---------- 好友 ---------- */
function iGM_HandleFriendList(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  const { page, pageSize } = iGM_PageQuery(ctx);
  return iGM_Ok({ data: iGM_ListFriendsService(user.iGM_Id, page, pageSize) });
}

function iGM_HandleFriendRequests(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  return iGM_Ok({ data: iGM_ListFriendRequestsService(user.iGM_Id) });
}

function iGM_HandleFriendRequest(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "socialWrite", `user:${user.iGM_Id}`);
  const targetId = iGM_Field(ctx.body, "userId").trim();
  return iGM_Ok({
    request: iGM_SendFriendRequestService(
      user,
      targetId,
      iGM_RequestLocale(ctx),
    ),
  });
}

function iGM_HandleFriendRespond(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "socialWrite", `user:${user.iGM_Id}`);
  const requestId = iGM_Field(ctx.body, "requestId").trim();
  const action = iGM_Field(ctx.body, "action").trim();
  if (action !== "accept" && action !== "reject") {
    throw new iGM_SocialError("social.errors.actionInvalid", 422);
  }
  return iGM_Ok({
    request: iGM_RespondFriendRequestService(
      user,
      requestId,
      action,
      iGM_RequestLocale(ctx),
    ),
  });
}

function iGM_HandleFriendRemove(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "socialWrite", `user:${user.iGM_Id}`);
  const friendId = iGM_Query(ctx.query, "userId").trim();
  iGM_RemoveFriendService(user, friendId);
  return iGM_Ok({ deleted: true });
}

/* ---------- 黑名单 ---------- */
function iGM_HandleBlock(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "socialWrite", `user:${user.iGM_Id}`);
  const targetId = iGM_Field(ctx.body, "userId").trim();
  iGM_BlockService(user, targetId);
  return iGM_Ok({ blocked: true });
}

function iGM_HandleUnblock(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "socialWrite", `user:${user.iGM_Id}`);
  const targetId = iGM_Field(ctx.body, "userId").trim();
  iGM_UnblockService(user, targetId);
  return iGM_Ok({ blocked: false });
}

function iGM_HandleBlockList(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  const { page, pageSize } = iGM_PageQuery(ctx);
  return iGM_Ok({ data: iGM_ListBlocksService(user.iGM_Id, page, pageSize) });
}

/* ---------- 动态流 ---------- */
function iGM_HandleFeed(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  const { page, pageSize } = iGM_PageQuery(ctx);
  return iGM_Ok({ data: iGM_GetFeedService(user.iGM_Id, page, pageSize) });
}

/**
 * G_Social 社交路由集合
 */
export const G_Social = new Elysia({ name: "G_Social" })
  .get("/G_Social/state", iGM_HandleState as never)
  .post("/G_Social/follow", iGM_HandleFollow as never)
  .post("/G_Social/unfollow", iGM_HandleUnfollow as never)
  .get("/G_Social/following", iGM_HandleFollowing as never)
  .get("/G_Social/followers", iGM_HandleFollowers as never)
  .get("/G_Social/friend/list", iGM_HandleFriendList as never)
  .get("/G_Social/friend/requests", iGM_HandleFriendRequests as never)
  .post("/G_Social/friend/request", iGM_HandleFriendRequest as never)
  .post("/G_Social/friend/respond", iGM_HandleFriendRespond as never)
  .delete("/G_Social/friend/remove", iGM_HandleFriendRemove as never)
  .post("/G_Social/block", iGM_HandleBlock as never)
  .post("/G_Social/unblock", iGM_HandleUnblock as never)
  .get("/G_Social/blocks", iGM_HandleBlockList as never)
  .get("/G_Social/feed", iGM_HandleFeed as never);

// 导出 //
export default G_Social;
