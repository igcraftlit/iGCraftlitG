/**
 * 文件路径：apps/web/src/iGM_Services/iGM_PostClient.ts
 * 所属层：前端 / 基础服务层
 * 路由：调用后端 /G_Post/*
 * 模块：iGM_PostClient
 * 作用：单篇帖子与评论操作相关后端接口的唯一前端调用出口
 * 内容：帖子详情、编辑、删除、隐藏/恢复；评论列表、发表回复、
 *       编辑评论、删除评论、隐藏/恢复评论；点赞与收藏状态切换
 * 约束：只经 iGM_Request 发请求，会话 Cookie 由 iGM_Request 统一携带
 */

// 导入依赖 //
import {
  iGM_Delete,
  iGM_Get,
  iGM_Post,
  iGM_Put,
  type iGM_ApiResponse,
} from "./iGM_Request";
import type {
  iGM_Comment,
  iGM_CommentStatus,
  iGM_MyCommentItem,
  iGM_PostDetail,
  iGM_PostStatus,
} from "./iGM_CommunityClient";

// 类型定义 //
/** 点赞目标类型 */
export type iGM_LikeTarget = "post" | "comment";

/** 点赞操作返回 */
export interface iGM_LikeState {
  targetType: iGM_LikeTarget;
  targetId: string;
  liked: boolean;
  likeCount: number;
}

/** 收藏操作返回 */
export interface iGM_FavoriteState {
  postId: string;
  favorited: boolean;
  favoriteCount: number;
}

// 核心逻辑 //
/** 帖子详情 */
export function iGM_ApiGetPost(
  postId: string,
): Promise<iGM_ApiResponse<{ post: iGM_PostDetail }>> {
  return iGM_Get(`/G_Post/detail?postId=${encodeURIComponent(postId)}`);
}

/** 编辑帖子 */
export function iGM_ApiUpdatePost(payload: {
  postId: string;
  title: string;
  content: string;
  categoryId: string | null;
  tags: string;
}): Promise<iGM_ApiResponse<{ post: iGM_PostDetail }>> {
  return iGM_Put("/G_Post/edit", payload);
}

/** 删除帖子 */
export function iGM_ApiDeletePost(
  postId: string,
): Promise<iGM_ApiResponse<{ deleted: boolean }>> {
  return iGM_Delete(`/G_Post/delete?postId=${encodeURIComponent(postId)}`);
}

/** 隐藏/恢复帖子 */
export function iGM_ApiSetPostStatus(
  postId: string,
  status: iGM_PostStatus,
): Promise<iGM_ApiResponse<{ post: iGM_PostDetail }>> {
  return iGM_Post("/G_Post/status", { postId, status });
}

/** 帖子评论平铺列表 */
export function iGM_ApiListComments(
  postId: string,
): Promise<iGM_ApiResponse<{ items: iGM_Comment[] }>> {
  return iGM_Get(`/G_Post/comments?postId=${encodeURIComponent(postId)}`);
}

/** 发表评论或回复 */
export function iGM_ApiCreateComment(input: {
  postId: string;
  parentId?: string | null;
  content: string;
}): Promise<iGM_ApiResponse<{ comment: iGM_Comment }>> {
  return iGM_Post("/G_Post/comments", {
    postId: input.postId,
    parentId: input.parentId ?? null,
    content: input.content,
  });
}

/** 编辑评论 */
export function iGM_ApiUpdateComment(
  commentId: string,
  content: string,
): Promise<iGM_ApiResponse<{ comment: iGM_Comment }>> {
  return iGM_Put("/G_Post/comments/edit", { commentId, content });
}

/** 删除评论 */
export function iGM_ApiDeleteComment(
  commentId: string,
): Promise<iGM_ApiResponse<{ deleted: boolean }>> {
  return iGM_Delete(
    `/G_Post/comments/delete?commentId=${encodeURIComponent(commentId)}`,
  );
}

/** 隐藏/恢复评论（协管员及以上） */
export function iGM_ApiSetCommentStatus(
  commentId: string,
  status: iGM_CommentStatus,
): Promise<iGM_ApiResponse<{ comment: iGM_MyCommentItem }>> {
  return iGM_Post("/G_Post/comments/status", { commentId, status });
}

/** 点赞/取消点赞 */
export function iGM_ApiToggleLike(input: {
  targetType: iGM_LikeTarget;
  targetId: string;
  liked: boolean;
}): Promise<iGM_ApiResponse<iGM_LikeState>> {
  return iGM_Post("/G_Post/like", input);
}

/** 收藏/取消收藏 */
export function iGM_ApiToggleFavorite(input: {
  postId: string;
  favorited: boolean;
}): Promise<iGM_ApiResponse<iGM_FavoriteState>> {
  return iGM_Post("/G_Post/favorite", input);
}

// 导出 //
export default {
  iGM_ApiGetPost,
  iGM_ApiUpdatePost,
  iGM_ApiSetPostStatus,
  iGM_ApiDeletePost,
  iGM_ApiListComments,
  iGM_ApiCreateComment,
  iGM_ApiUpdateComment,
  iGM_ApiDeleteComment,
  iGM_ApiSetCommentStatus,
  iGM_ApiToggleLike,
  iGM_ApiToggleFavorite,
};
