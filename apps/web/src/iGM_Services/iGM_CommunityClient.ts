/**
 * 文件路径：apps/web/src/iGM_Services/iGM_CommunityClient.ts
 * 所属层：前端 / 基础服务层
 * 路由：调用后端 /G_Community/*
 * 模块：iGM_CommunityClient
 * 作用：社区广场与个人中心相关后端接口的唯一前端调用出口
 * 内容：分类、帖子列表（分类/标签/搜索/分页）、发帖、用户公开资料、
 *       本人资料编辑、我的帖子、我的评论、指定用户公开帖子与评论
 * 约束：只经 iGM_Request 发请求；类型与后端 iGM_Types/iGM_Community.ts 保持一致
 */

// 导入依赖 //
import { iGM_Get, iGM_Post, type iGM_ApiResponse } from "./iGM_Request";
import type { iGM_User, iGM_UserRole } from "./iGM_AuthClient";

// 类型定义 //
/** 帖子状态 */
export type iGM_PostStatus = "published" | "hidden";

/** 评论状态 */
export type iGM_CommentStatus = "visible" | "hidden";

/** 分类 */
export interface iGM_Category {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
}

/** 标签 */
export interface iGM_Tag {
  id: string;
  name: string;
  slug: string;
}

/** 作者简要信息 */
export interface iGM_Author {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  role: iGM_UserRole;
}

/** 帖子列表项 */
export interface iGM_PostListItem {
  id: string;
  title: string;
  excerpt: string;
  status: iGM_PostStatus;
  author: iGM_Author;
  category: iGM_Category | null;
  tags: iGM_Tag[];
  likeCount: number;
  commentCount: number;
  favoriteCount: number;
  likedByMe: boolean;
  favoritedByMe: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 帖子详情 */
export interface iGM_PostDetail extends Omit<iGM_PostListItem, "excerpt"> {
  content: string;
}

/** 分页数据 */
export interface iGM_PostListData {
  items: iGM_PostListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 评论 */
export interface iGM_Comment {
  id: string;
  postId: string;
  parentId: string | null;
  content: string;
  status: iGM_CommentStatus;
  author: iGM_Author;
  likeCount: number;
  likedByMe: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 我的评论/用户评论列表项（附帖子标题） */
export interface iGM_MyCommentItem extends iGM_Comment {
  postTitle: string;
}

/** 评论分页数据 */
export interface iGM_CommentPageData {
  items: iGM_MyCommentItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 用户公开资料 */
export interface iGM_PublicProfile {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  bio: string | null;
  website: string | null;
  role: iGM_UserRole;
  createdAt: string;
  postCount: number;
  commentCount: number;
}

/** 帖子列表查询参数 */
export interface iGM_PostQuery {
  category?: string;
  tag?: string;
  author?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

/** 发帖/编辑提交载荷 */
export interface iGM_PostPayload {
  postId?: string;
  title: string;
  content: string;
  categoryId: string | null;
  /** 标签原始字符串，后端解析 */
  tags: string;
}

/** 资料编辑提交载荷 */
export interface iGM_ProfilePayload {
  displayName: string;
  avatar: string;
  bio: string;
  website: string;
}

// 核心逻辑 //
/** 拼接查询字符串（跳过空值） */
function iGM_BuildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

/** 获取全部分类 */
export function iGM_ApiListCategories(): Promise<
  iGM_ApiResponse<{ items: iGM_Category[] }>
> {
  return iGM_Get("/G_Community/categories");
}

/** 获取帖子列表（分类/标签/搜索/分页） */
export function iGM_ApiListPosts(
  query: iGM_PostQuery,
): Promise<iGM_ApiResponse<iGM_PostListData>> {
  return iGM_Get(
    `/G_Community/posts${iGM_BuildQuery({
      category: query.category,
      tag: query.tag,
      author: query.author,
      q: query.q,
      page: query.page,
      pageSize: query.pageSize,
    })}`,
  );
}

/** 发帖 */
export function iGM_ApiCreatePost(
  payload: iGM_PostPayload,
): Promise<iGM_ApiResponse<{ post: iGM_PostDetail }>> {
  return iGM_Post("/G_Community/posts", payload);
}

/** 获取指定用户公开资料 */
export function iGM_ApiGetProfile(
  userId: string,
): Promise<iGM_ApiResponse<{ profile: iGM_PublicProfile | null }>> {
  return iGM_Get(`/G_Community/profile?userId=${encodeURIComponent(userId)}`);
}

/** 更新本人资料 */
export function iGM_ApiUpdateProfile(
  payload: iGM_ProfilePayload,
): Promise<iGM_ApiResponse<{ user: iGM_User }>> {
  return iGM_Post("/G_Community/profile", payload);
}

/** 我的帖子（含隐藏帖） */
export function iGM_ApiMyPosts(
  page = 1,
): Promise<iGM_ApiResponse<iGM_PostListData>> {
  return iGM_Get(`/G_Community/me/posts?page=${page}`);
}

/** 我的评论（含被隐藏评论） */
export function iGM_ApiMyComments(
  page = 1,
): Promise<iGM_ApiResponse<iGM_CommentPageData>> {
  return iGM_Get(`/G_Community/me/comments?page=${page}`);
}

/** 指定用户的公开帖子 */
export function iGM_ApiUserPosts(
  userId: string,
  page = 1,
): Promise<iGM_ApiResponse<iGM_PostListData>> {
  return iGM_Get(
    `/G_Community/user-posts?userId=${encodeURIComponent(userId)}&page=${page}`,
  );
}

/** 指定用户的公开评论 */
export function iGM_ApiUserComments(
  userId: string,
  page = 1,
): Promise<iGM_ApiResponse<iGM_CommentPageData>> {
  return iGM_Get(
    `/G_Community/user-comments?userId=${encodeURIComponent(userId)}&page=${page}`,
  );
}

// 导出 //
export default {
  iGM_ApiListCategories,
  iGM_ApiListPosts,
  iGM_ApiCreatePost,
  iGM_ApiGetProfile,
  iGM_ApiUpdateProfile,
  iGM_ApiMyPosts,
  iGM_ApiMyComments,
  iGM_ApiUserPosts,
  iGM_ApiUserComments,
};
