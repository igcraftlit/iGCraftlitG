/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_Post.ts
 * 所属层：后端 / 路由层
 * 路由：/G_Post/*
 * 模块：G_Post
 * 作用：单篇帖子与评论的操作接口集合
 * 内容：帖子详情、编辑、删除、隐藏/恢复；评论列表、发表评论/回复、
 *       编辑评论、删除评论、隐藏/恢复评论；帖子与评论点赞、帖子收藏
 * 约束：统一响应 { success, code, message, data }；
 *       写接口要求登录、基础限流；编辑限作者、删除/隐藏作者或协管员及以上
 */

// 导入依赖 //
import { Elysia } from "elysia";
import { iGM_Ok } from "../iGM_Types/iGM_Response";
import { iGM_RequireUser } from "../iGM_Middleware/iGM_AuthGuard";
import {
  iGM_BoolField,
  iGM_CurrentUser,
  iGM_EnforceRateLimit,
  iGM_Field,
  iGM_Query,
  iGM_RequestLocale,
  type iGM_RouteContext,
} from "./iGM_RouteSupport";
import { iGM_ContentError } from "../iGM_Services/iGM_ContentService";
import { iGM_IsLikeTargetType } from "../iGM_Types/iGM_Community";
import {
  iGM_CreateCommentService,
  iGM_DeleteCommentService,
  iGM_DeletePostService,
  iGM_GetPostDetail,
  iGM_ListPostCommentsService,
  iGM_SetCommentStatusService,
  iGM_SetPostStatusService,
  iGM_ToggleFavoriteService,
  iGM_ToggleLikeService,
  iGM_UpdateCommentService,
  iGM_UpdatePostService,
} from "../iGM_Services/iGM_ContentService";

// 类型定义 //
// （路由层无额外类型，统一响应类型见 iGM_Types/iGM_Response.ts）

// 核心逻辑 //
/* ---------- 帖子详情 ---------- */
function iGM_HandleDetail(ctx: iGM_RouteContext) {
  const postId = iGM_Query(ctx.query, "postId");
  if (!postId) {
    throw new iGM_ContentError("community.errors.postNotFound", 404);
  }
  const post = iGM_GetPostDetail(iGM_CurrentUser(ctx), postId);
  if (!post) {
    throw new iGM_ContentError("community.errors.postNotFound", 404);
  }
  return iGM_Ok({ post });
}

/* ---------- 编辑帖子 ---------- */
function iGM_HandleEditPost(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "createPost", `user:${user.iGM_Id}`);

  const postId = iGM_Field(ctx.body, "postId").trim();
  if (!postId) {
    throw new iGM_ContentError("community.errors.postNotFound", 404);
  }
  const categoryId = iGM_Field(ctx.body, "categoryId").trim();
  const post = iGM_UpdatePostService(user, postId, {
    title: iGM_Field(ctx.body, "title"),
    content: iGM_Field(ctx.body, "content"),
    categoryId: categoryId.length > 0 ? categoryId : null,
    tags: iGM_Field(ctx.body, "tags"),
  });
  return iGM_Ok({ post }, "community.messages.postUpdated");
}

/* ---------- 删除帖子 ---------- */
function iGM_HandleDeletePost(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  const postId = iGM_Query(ctx.query, "postId");
  if (!postId) {
    throw new iGM_ContentError("community.errors.postNotFound", 404);
  }
  iGM_DeletePostService(user, postId);
  return iGM_Ok({ deleted: true }, "community.messages.postDeleted");
}

/* ---------- 隐藏/恢复帖子 ---------- */
function iGM_HandleSetPostStatus(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  const postId = iGM_Field(ctx.body, "postId").trim();
  const status = iGM_Field(ctx.body, "status");
  if (!postId) {
    throw new iGM_ContentError("community.errors.postNotFound", 404);
  }
  if (status !== "published" && status !== "hidden") {
    throw new iGM_ContentError("community.errors.badRequest", 400);
  }
  const post = iGM_SetPostStatusService(user, postId, status);
  return iGM_Ok({ post }, "community.messages.postUpdated");
}

/* ---------- 评论列表 ---------- */
function iGM_HandleComments(ctx: iGM_RouteContext) {
  const postId = iGM_Query(ctx.query, "postId");
  if (!postId) {
    throw new iGM_ContentError("community.errors.postNotFound", 404);
  }
  const items = iGM_ListPostCommentsService(iGM_CurrentUser(ctx), postId);
  return iGM_Ok({ items });
}

/* ---------- 发表评论/回复 ---------- */
function iGM_HandleCreateComment(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "createComment", `user:${user.iGM_Id}`);

  const postId = iGM_Field(ctx.body, "postId").trim();
  const parentId = iGM_Field(ctx.body, "parentId").trim();
  if (!postId) {
    throw new iGM_ContentError("community.errors.postNotFound", 404);
  }
  const comment = iGM_CreateCommentService(
    user,
    postId,
    parentId.length > 0 ? parentId : null,
    iGM_Field(ctx.body, "content"),
    iGM_RequestLocale(ctx),
  );
  ctx.set.status = 201;
  return iGM_Ok({ comment }, "community.messages.commentCreated");
}

/* ---------- 编辑评论 ---------- */
function iGM_HandleEditComment(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  const commentId = iGM_Field(ctx.body, "commentId").trim();
  if (!commentId) {
    throw new iGM_ContentError("community.errors.commentNotFound", 404);
  }
  const comment = iGM_UpdateCommentService(
    user,
    commentId,
    iGM_Field(ctx.body, "content"),
  );
  return iGM_Ok({ comment }, "community.messages.commentUpdated");
}

/* ---------- 删除评论 ---------- */
function iGM_HandleDeleteComment(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  const commentId = iGM_Query(ctx.query, "commentId");
  if (!commentId) {
    throw new iGM_ContentError("community.errors.commentNotFound", 404);
  }
  iGM_DeleteCommentService(user, commentId);
  return iGM_Ok({ deleted: true }, "community.messages.commentDeleted");
}

/* ---------- 隐藏/恢复评论（协管员及以上） ---------- */
function iGM_HandleSetCommentStatus(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  const commentId = iGM_Field(ctx.body, "commentId").trim();
  const status = iGM_Field(ctx.body, "status");
  if (!commentId) {
    throw new iGM_ContentError("community.errors.commentNotFound", 404);
  }
  if (status !== "visible" && status !== "hidden") {
    throw new iGM_ContentError("community.errors.badRequest", 400);
  }
  const comment = iGM_SetCommentStatusService(user, commentId, status);
  return iGM_Ok({ comment }, "community.messages.commentUpdated");
}

/* ---------- 点赞/取消点赞（帖子或评论） ---------- */
function iGM_HandleLike(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "interact", `user:${user.iGM_Id}`);

  const targetType = iGM_Field(ctx.body, "targetType");
  const targetId = iGM_Field(ctx.body, "targetId").trim();
  const liked = iGM_BoolField(ctx.body, "liked");
  if (!iGM_IsLikeTargetType(targetType) || !targetId) {
    throw new iGM_ContentError("community.errors.badRequest", 400);
  }
  return iGM_Ok(iGM_ToggleLikeService(user, targetType, targetId, liked));
}

/* ---------- 收藏/取消收藏帖子 ---------- */
function iGM_HandleFavorite(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "interact", `user:${user.iGM_Id}`);

  const postId = iGM_Field(ctx.body, "postId").trim();
  const favorited = iGM_BoolField(ctx.body, "favorited");
  if (!postId) {
    throw new iGM_ContentError("community.errors.postNotFound", 404);
  }
  return iGM_Ok(iGM_ToggleFavoriteService(user, postId, favorited));
}

/**
 * G_Post 帖子路由集合
 * 业务错误统一抛 iGM_ContentError / iGM_AuthError，
 * 由 iGM_ServerMain 全局错误处理器格式化为统一响应体
 */
export const G_Post = new Elysia({ name: "G_Post" })
  .get("/G_Post/detail", iGM_HandleDetail as never)
  .put("/G_Post/edit", iGM_HandleEditPost as never)
  .delete("/G_Post/delete", iGM_HandleDeletePost as never)
  .post("/G_Post/status", iGM_HandleSetPostStatus as never)
  .get("/G_Post/comments", iGM_HandleComments as never)
  .post("/G_Post/comments", iGM_HandleCreateComment as never)
  .put("/G_Post/comments/edit", iGM_HandleEditComment as never)
  .delete("/G_Post/comments/delete", iGM_HandleDeleteComment as never)
  .post("/G_Post/comments/status", iGM_HandleSetCommentStatus as never)
  .post("/G_Post/like", iGM_HandleLike as never)
  .post("/G_Post/favorite", iGM_HandleFavorite as never);

// 导出 //
export default G_Post;
