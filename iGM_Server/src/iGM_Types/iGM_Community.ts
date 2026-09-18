/**
 * 文件路径：iGM_Server/src/iGM_Types/iGM_Community.ts
 * 所属层：后端 / 类型定义层
 * 路由：G_Community、G_Post
 * 模块：iGM_Community
 * 作用：定义社区帖子、评论、点赞、收藏、分类、标签与用户公开资料的共享类型
 * 内容：数据库行类型与对外 DTO（数据传输对象），DTO 一律不包含密码哈希等敏感字段
 */

// 导入依赖 //
import type { iGM_UserRole } from "./iGM_Auth";

// 类型定义 //
/** 帖子状态：published 已发布 / hidden 被作者或管理员隐藏 */
export type iGM_PostStatus = "published" | "hidden";

/** 评论状态：visible 可见 / hidden 被隐藏 */
export type iGM_CommentStatus = "visible" | "hidden";

/** 点赞目标类型：post 帖子 / comment 评论 */
export type iGM_LikeTargetType = "post" | "comment";

/* ---------- 数据库行类型 ---------- */

export interface iGM_CategoryRow {
  iGM_Id: string;
  iGM_Name: string;
  iGM_Slug: string;
  iGM_SortOrder: number;
}

export interface iGM_TagRow {
  iGM_Id: string;
  iGM_Name: string;
  iGM_Slug: string;
}

export interface iGM_PostRow {
  iGM_Id: string;
  iGM_AuthorId: string;
  iGM_Title: string;
  iGM_Content: string;
  iGM_CategoryId: string | null;
  iGM_Status: iGM_PostStatus;
  iGM_CreatedAt: string;
  iGM_UpdatedAt: string;
}

export interface iGM_CommentRow {
  iGM_Id: string;
  iGM_PostId: string;
  iGM_AuthorId: string;
  iGM_ParentId: string | null;
  iGM_Content: string;
  iGM_Status: iGM_CommentStatus;
  iGM_CreatedAt: string;
  iGM_UpdatedAt: string;
}

/* ---------- 对外 DTO ---------- */

/** 分类 DTO */
export interface iGM_CategoryDto {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
}

/** 标签 DTO */
export interface iGM_TagDto {
  id: string;
  name: string;
  slug: string;
}

/** 作者简要信息 DTO：仅含公开展示字段 */
export interface iGM_AuthorDto {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  role: iGM_UserRole;
}

/** 用户公开资料 DTO：不含邮箱、状态等隐私字段 */
export interface iGM_PublicProfileDto {
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

/** 帖子列表项 DTO：正文以摘要形式返回 */
export interface iGM_PostListItemDto {
  id: string;
  title: string;
  excerpt: string;
  status: iGM_PostStatus;
  author: iGM_AuthorDto;
  category: iGM_CategoryDto | null;
  tags: iGM_TagDto[];
  likeCount: number;
  commentCount: number;
  favoriteCount: number;
  likedByMe: boolean;
  favoritedByMe: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 帖子详情 DTO：包含完整正文 */
export interface iGM_PostDetailDto extends Omit<iGM_PostListItemDto, "excerpt"> {
  content: string;
}

/** 分页帖子列表数据 */
export interface iGM_PostListData {
  items: iGM_PostListItemDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 评论 DTO（平铺返回，前端按 parentId 自行组织楼中楼） */
export interface iGM_CommentDto {
  id: string;
  postId: string;
  parentId: string | null;
  content: string;
  status: iGM_CommentStatus;
  author: iGM_AuthorDto;
  likeCount: number;
  likedByMe: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 我的评论列表项：附带所属帖子摘要，便于跳转 */
export interface iGM_MyCommentItemDto extends iGM_CommentDto {
  postTitle: string;
}

/** 点赞操作返回数据 */
export interface iGM_LikeStateData {
  targetType: iGM_LikeTargetType;
  targetId: string;
  liked: boolean;
  likeCount: number;
}

/** 收藏操作返回数据 */
export interface iGM_FavoriteStateData {
  postId: string;
  favorited: boolean;
  favoriteCount: number;
}

// 核心逻辑 //
/** 允许的帖子状态常量 */
export const iGM_PostStatuses: iGM_PostStatus[] = ["published", "hidden"];

/** 允许的评论状态常量 */
export const iGM_CommentStatuses: iGM_CommentStatus[] = ["visible", "hidden"];

/** 允许的点赞目标类型常量 */
export const iGM_LikeTargetTypes: iGM_LikeTargetType[] = ["post", "comment"];

/** 判断未知字符串是否为合法点赞目标类型 */
export function iGM_IsLikeTargetType(
  value: unknown,
): value is iGM_LikeTargetType {
  return (
    typeof value === "string" &&
    iGM_LikeTargetTypes.includes(value as iGM_LikeTargetType)
  );
}

/** 分类行转 DTO */
export function iGM_ToCategoryDto(row: iGM_CategoryRow): iGM_CategoryDto {
  return {
    id: row.iGM_Id,
    name: row.iGM_Name,
    slug: row.iGM_Slug,
    sortOrder: row.iGM_SortOrder,
  };
}

/** 标签行转 DTO */
export function iGM_ToTagDto(row: iGM_TagRow): iGM_TagDto {
  return { id: row.iGM_Id, name: row.iGM_Name, slug: row.iGM_Slug };
}

// 导出 //
export default {
  iGM_PostStatuses,
  iGM_CommentStatuses,
  iGM_LikeTargetTypes,
  iGM_IsLikeTargetType,
  iGM_ToCategoryDto,
  iGM_ToTagDto,
};
