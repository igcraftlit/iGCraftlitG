/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_Community.ts
 * 所属层：后端 / 路由层
 * 路由：/G_Community/*
 * 模块：G_Community
 * 作用：社区广场与用户个人中心相关接口集合
 * 内容：分类列表、帖子列表（分类/标签/搜索/分页）、发帖、
 *       指定用户公开资料与公开帖子/评论、本人资料编辑、我的帖子、我的评论
 * 约束：统一响应 { success, code, message, data }；写接口要求登录并做基础限流
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
  type iGM_RouteContext,
} from "./iGM_RouteSupport";
import {
  iGM_CreatePostService,
  iGM_GetCategories,
  iGM_GetPublicProfileService,
  iGM_ListMyCommentsService,
  iGM_ListMyPostsService,
  iGM_ListPublishedPosts,
  iGM_ListUserCommentsService,
  iGM_ListUserPostsService,
  iGM_UpdateMyProfileService,
} from "../iGM_Services/iGM_ContentService";

// 类型定义 //
// （路由层无额外类型，统一响应类型见 iGM_Types/iGM_Response.ts）

// 核心逻辑 //
/* ---------- 分类列表 ---------- */
function iGM_HandleCategories(ctx: iGM_RouteContext) {
  void ctx;
  return iGM_Ok({ items: iGM_GetCategories() });
}

/* ---------- 帖子列表（分类/标签/搜索/分页） ---------- */
function iGM_HandlePosts(ctx: iGM_RouteContext) {
  const currentUser = iGM_CurrentUser(ctx);
  const { page, pageSize } = iGM_PageQuery(ctx);
  const data = iGM_ListPublishedPosts(currentUser?.iGM_Id ?? null, {
    categorySlug: iGM_Query(ctx.query, "category") || undefined,
    tagSlug: iGM_Query(ctx.query, "tag") || undefined,
    authorId: iGM_Query(ctx.query, "author") || undefined,
    search: iGM_Query(ctx.query, "q") || undefined,
    page,
    pageSize,
  });
  return iGM_Ok(data);
}

/* ---------- 发帖 ---------- */
function iGM_HandleCreatePost(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "createPost", `user:${user.iGM_Id}`);

  const categoryId = iGM_Field(ctx.body, "categoryId").trim();
  const post = iGM_CreatePostService(user, {
    title: iGM_Field(ctx.body, "title"),
    content: iGM_Field(ctx.body, "content"),
    categoryId: categoryId.length > 0 ? categoryId : null,
    tags: iGM_Field(ctx.body, "tags"),
  });
  ctx.set.status = 201;
  return iGM_Ok({ post }, "community.messages.postCreated");
}

/* ---------- 指定用户公开资料 ---------- */
function iGM_HandleProfile(ctx: iGM_RouteContext) {
  const userId = iGM_Query(ctx.query, "userId");
  if (!userId) {
    return iGM_Ok({ profile: null });
  }
  return iGM_Ok({ profile: iGM_GetPublicProfileService(userId) });
}

/* ---------- 更新本人资料 ---------- */
function iGM_HandleUpdateProfile(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "profileUpdate", `user:${user.iGM_Id}`);

  // 仅接受白名单字段；空串由业务层归一为 NULL（清空）
  const updated = iGM_UpdateMyProfileService(user, {
    displayName: iGM_Field(ctx.body, "displayName"),
    avatar: iGM_Field(ctx.body, "avatar"),
    bio: iGM_Field(ctx.body, "bio"),
    website: iGM_Field(ctx.body, "website"),
  });
  return iGM_Ok({ user: updated }, "community.messages.profileUpdated");
}

/* ---------- 我的帖子（仅本人，含隐藏帖） ---------- */
function iGM_HandleMyPosts(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  const { page, pageSize } = iGM_PageQuery(ctx);
  return iGM_Ok(iGM_ListMyPostsService(user, page, pageSize));
}

/* ---------- 我的评论（仅本人，含被隐藏评论） ---------- */
function iGM_HandleMyComments(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  const { page, pageSize } = iGM_PageQuery(ctx);
  return iGM_Ok(iGM_ListMyCommentsService(user, page, pageSize));
}

/* ---------- 指定用户公开帖子 ---------- */
function iGM_HandleUserPosts(ctx: iGM_RouteContext) {
  const currentUser = iGM_CurrentUser(ctx);
  const userId = iGM_Query(ctx.query, "userId");
  const { page, pageSize } = iGM_PageQuery(ctx);
  return iGM_Ok(
    iGM_ListUserPostsService(
      currentUser?.iGM_Id ?? null,
      userId,
      page,
      pageSize,
    ),
  );
}

/* ---------- 指定用户公开评论 ---------- */
function iGM_HandleUserComments(ctx: iGM_RouteContext) {
  const currentUser = iGM_CurrentUser(ctx);
  const userId = iGM_Query(ctx.query, "userId");
  const { page, pageSize } = iGM_PageQuery(ctx);
  return iGM_Ok(
    iGM_ListUserCommentsService(
      currentUser?.iGM_Id ?? null,
      userId,
      page,
      pageSize,
    ),
  );
}

/**
 * G_Community 社区路由集合
 * 业务错误统一抛 iGM_ContentError / iGM_AuthError，
 * 由 iGM_ServerMain 全局错误处理器格式化为统一响应体
 */
export const G_Community = new Elysia({ name: "G_Community" })
  .get("/G_Community/categories", iGM_HandleCategories as never)
  .get("/G_Community/posts", iGM_HandlePosts as never)
  .post("/G_Community/posts", iGM_HandleCreatePost as never)
  .get("/G_Community/profile", iGM_HandleProfile as never)
  .post("/G_Community/profile", iGM_HandleUpdateProfile as never)
  .get("/G_Community/me/posts", iGM_HandleMyPosts as never)
  .get("/G_Community/me/comments", iGM_HandleMyComments as never)
  .get("/G_Community/user-posts", iGM_HandleUserPosts as never)
  .get("/G_Community/user-comments", iGM_HandleUserComments as never);

// 导出 //
export default G_Community;
