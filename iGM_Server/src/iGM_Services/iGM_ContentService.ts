/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_ContentService.ts
 * 所属层：后端 / 业务逻辑层
 * 路由：G_Community、G_Post
 * 模块：iGM_ContentService
 * 作用：社区帖子、评论、点赞、收藏与用户公开资料的核心业务编排
 * 内容：基础 XSS 过滤与长度校验、标签解析、权限判定（作者/协管员/管理员）、
 *       帖子与评论 DTO 组装（作者、分类、标签、计数、当前用户状态）、
 *       发帖/编辑/删除、评论/回复、点赞、收藏、公开资料与我的内容查询
 * 安全：纯文本社区——所有 HTML 标签一律剥离；仅作者可编辑本人内容，
 *       moderator 与 admin 可隐藏/删除任意内容
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import {
  iGM_FindUserById,
  iGM_FindUsersByIds,
  iGM_UpdateProfile,
} from "../iGM_Repositories/iGM_UserRepository";
import {
  iGM_CountPostsByAuthor,
  iGM_CreatePost,
  iGM_DeletePost,
  iGM_FindPostById,
  iGM_GetCommentCountsForPosts,
  iGM_ListPosts,
  iGM_SetPostStatus,
  iGM_UpdatePost,
  type iGM_PostListParams,
} from "../iGM_Repositories/iGM_PostRepository";
import {
  iGM_CountCommentsByAuthor,
  iGM_CreateComment,
  iGM_DeleteComment,
  iGM_FindCommentById,
  iGM_ListCommentsByAuthor,
  iGM_ListCommentsByPost,
  iGM_SetCommentStatus,
  iGM_UpdateComment,
} from "../iGM_Repositories/iGM_CommentRepository";
import {
  iGM_FindCategoryById,
  iGM_FindOrCreateTags,
  iGM_FindTagBySlug,
  iGM_GetTagsForPosts,
  iGM_ListCategories,
  iGM_ReplacePostTags,
} from "../iGM_Repositories/iGM_TaxonomyRepository";
import {
  iGM_AddFavorite,
  iGM_AddLike,
  iGM_CountFavorites,
  iGM_CountFavoritesBatch,
  iGM_CountLikes,
  iGM_CountLikesBatch,
  iGM_DeleteLikesForPost,
  iGM_GetFavoritedIdSet,
  iGM_GetLikedIdSet,
  iGM_HasFavorite,
  iGM_HasLike,
  iGM_RemoveFavorite,
  iGM_RemoveLike,
} from "../iGM_Repositories/iGM_InteractionRepository";
import { iGM_ToUserDto, type iGM_UserDto, type iGM_UserRow } from "../iGM_Types/iGM_Auth";
import { iGM_Notify } from "./iGM_NotificationService";
import { iGM_AwardPoints } from "./iGM_PointsService";
import {
  iGM_ToCategoryDto,
  iGM_ToTagDto,
  type iGM_AuthorDto,
  type iGM_CategoryDto,
  type iGM_CommentDto,
  type iGM_FavoriteStateData,
  type iGM_LikeStateData,
  type iGM_LikeTargetType,
  type iGM_MyCommentItemDto,
  type iGM_PostDetailDto,
  type iGM_PostListItemDto,
  type iGM_PostListData,
  type iGM_PublicProfileDto,
} from "../iGM_Types/iGM_Community";

// 类型定义 //
/** 业务错误：message 为前端 i18n 文案键，status 为 HTTP 状态码 */
export class iGM_ContentError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "iGM_ContentError";
  }
}

/** 帖子写入输入（创建/编辑共用） */
export interface iGM_PostInput {
  title: string;
  content: string;
  categoryId?: string | null;
  /** 标签原始字符串：逗号/顿号/分号/空白分隔，服务端解析 */
  tags?: string;
}

/** 帖子列表查询输入 */
export interface iGM_PostQueryInput {
  categorySlug?: string;
  tagSlug?: string;
  authorId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

/** 资料编辑输入（空串视为清空，存 NULL） */
export interface iGM_ProfileInput {
  displayName?: string;
  avatar?: string;
  bio?: string;
  website?: string;
}

// 核心逻辑 //
/* ---------- 校验常量 ---------- */
const iGM_TitleMinLength = 1;
const iGM_TitleMaxLength = 100;
const iGM_ContentMinLength = 1;
const iGM_ContentMaxLength = 10000;
const iGM_CommentMinLength = 1;
const iGM_CommentMaxLength = 2000;
const iGM_DisplayNameMaxLength = 30;
const iGM_BioMaxLength = 200;
const iGM_WebsiteMaxLength = 200;
const iGM_AvatarMaxLength = 500;
const iGM_ExcerptLength = 160;
const iGM_MaxTags = 5;
const iGM_TagNameMaxLength = 20;
const iGM_DefaultPageSize = 10;
const iGM_MaxPageSize = 50;

/* ---------- 基础 XSS 过滤与输入规范化 ---------- */

/**
 * 纯文本内容净化：
 * 1. 移除危险标签整块（script/style/iframe 等）及 HTML 注释；
 * 2. 剥离其余所有 HTML 标签（内容按纯文本渲染，React 默认转义兜底）；
 * 3. 移除 javascript: 协议、内联事件属性残留与控制字符；
 * 4. 规范换行，最多保留一个空行，去除首尾空白
 */
export function iGM_SanitizeContent(input: string): string {
  return input
    .replace(
      /<\s*(script|style|iframe|object|embed|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,
      "",
    )
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*\/?>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/javascript:/gi, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 标题净化：单行文本，折叠所有空白 */
function iGM_SanitizeTitle(input: string): string {
  return iGM_SanitizeContent(input).replace(/\s+/g, " ").trim();
}

/** 可选文本字段：空串归一为 null，否则净化 */
function iGM_NormalizeOptional(
  input: unknown,
  maxLength: number,
  errorKey: string,
): string | null {
  if (typeof input !== "string") return null;
  const cleaned = iGM_SanitizeContent(input);
  if (cleaned.length > maxLength) {
    throw new iGM_ContentError(errorKey, 422);
  }
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * 校验 http/https URL，空串视为未填写；
 * allowSiteRelative 时额外接受站内相对路径（须以 / 开头且不含空白），
 * 用于头像等由本站文件服务生成的 /G_File/preview?fileId=... 引用
 */
function iGM_NormalizeUrl(
  input: unknown,
  maxLength: number,
  errorKey: string,
  options?: { allowSiteRelative?: boolean },
): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (value.length === 0) return null;
  const absolute = /^https?:\/\/[^\s]+$/i.test(value);
  const relative =
    options?.allowSiteRelative === true && /^\/[^\s]*$/.test(value);
  if (value.length > maxLength || (!absolute && !relative)) {
    throw new iGM_ContentError(errorKey, 422);
  }
  return value;
}

/**
 * 解析标签原始字符串：支持中英文逗号、顿号、分号与空白分隔；
 * 去重（大小写不敏感）并限制数量与单个长度
 */
function iGM_ParseTags(raw: string | undefined): string[] {
  if (!raw) return [];
  const parts = raw
    .split(/[,，、;；\s]+/)
    .map((tag) => iGM_SanitizeTitle(tag))
    .filter(Boolean);

  const result: string[] = [];
  const seen = new Set<string>();
  for (const tag of parts) {
    if (tag.length > iGM_TagNameMaxLength) {
      throw new iGM_ContentError("community.errors.tagTooLong", 422);
    }
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
    if (result.length >= iGM_MaxTags) break;
  }
  return result;
}

/** 校验并净化帖子输入，返回可入库字段 */
function iGM_ValidatePostInput(input: iGM_PostInput): {
  title: string;
  content: string;
  tags: string[];
} {
  const title = iGM_SanitizeTitle(String(input.title ?? ""));
  if (title.length < iGM_TitleMinLength || title.length > iGM_TitleMaxLength) {
    throw new iGM_ContentError("community.errors.titleInvalid", 422);
  }
  const content = iGM_SanitizeContent(String(input.content ?? ""));
  if (
    content.length < iGM_ContentMinLength ||
    content.length > iGM_ContentMaxLength
  ) {
    throw new iGM_ContentError("community.errors.contentInvalid", 422);
  }
  return { title, content, tags: iGM_ParseTags(input.tags) };
}

/** 校验并净化评论内容 */
function iGM_ValidateCommentContent(raw: unknown): string {
  const content = iGM_SanitizeContent(String(raw ?? ""));
  if (
    content.length < iGM_CommentMinLength ||
    content.length > iGM_CommentMaxLength
  ) {
    throw new iGM_ContentError("community.errors.commentInvalid", 422);
  }
  return content;
}

/** 规范化分页参数 */
function iGM_ResolvePagination(pageRaw?: number, pageSizeRaw?: number): {
  page: number;
  pageSize: number;
} {
  const page = Number.isFinite(pageRaw) && (pageRaw as number) >= 1
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

/* ---------- 权限 ---------- */

/** 协管员及以上可隐藏/删除任意内容 */
function iGM_CanModerate(user: iGM_UserRow): boolean {
  return user.iGM_Role === "moderator" || user.iGM_Role === "admin";
}

/** 是否为内容作者 */
function iGM_IsOwner(user: iGM_UserRow, authorId: string): boolean {
  return user.iGM_Id === authorId;
}

/* ---------- DTO 组装 ---------- */

/** 用户行转作者简要 DTO */
function iGM_ToAuthorDto(user: iGM_UserRow): iGM_AuthorDto {
  return {
    id: user.iGM_Id,
    username: user.iGM_Username,
    displayName: user.iGM_DisplayName,
    avatar: user.iGM_Avatar,
    role: user.iGM_Role,
  };
}

/** 由帖子行批量组装列表 DTO（作者、分类、标签、计数、当前用户互动状态一次取齐） */
function iGM_AssemblePostList(
  rows: Awaited<ReturnType<typeof iGM_ListPosts>>["items"],
  currentUserId: string | null,
): iGM_PostListItemDto[] {
  if (rows.length === 0) return [];

  const postIds = rows.map((row) => row.iGM_Id);
  const authorRows = iGM_FindUsersByIds(rows.map((row) => row.iGM_AuthorId));
  const authorMap = new Map(authorRows.map((user) => [user.iGM_Id, user]));

  const categoryMap = new Map(
    iGM_ListCategories().map((category) => [category.iGM_Id, category]),
  );
  const tagsMap = iGM_GetTagsForPosts(postIds);
  const likeCounts = iGM_CountLikesBatch("post", postIds);
  const favoriteCounts = iGM_CountFavoritesBatch(postIds);
  const commentCounts = iGM_GetCommentCountsForPosts(postIds);
  const likedSet = iGM_GetLikedIdSet("post", postIds, currentUserId);
  const favoritedSet = iGM_GetFavoritedIdSet(postIds, currentUserId);

  return rows.map((row) => {
    const authorRow = authorMap.get(row.iGM_AuthorId);
    const categoryRow = row.iGM_CategoryId
      ? (categoryMap.get(row.iGM_CategoryId) ?? null)
      : null;
    const tags = (tagsMap.get(row.iGM_Id) ?? []).map(iGM_ToTagDto);

    return {
      id: row.iGM_Id,
      title: row.iGM_Title,
      excerpt: iGM_BuildExcerpt(row.iGM_Content),
      status: row.iGM_Status,
      author: authorRow
        ? iGM_ToAuthorDto(authorRow)
        : iGM_DeletedAuthorPlaceholder(row.iGM_AuthorId),
      category: categoryRow ? iGM_ToCategoryDto(categoryRow) : null,
      tags,
      likeCount: likeCounts.get(row.iGM_Id) ?? 0,
      commentCount: commentCounts.get(row.iGM_Id) ?? 0,
      favoriteCount: favoriteCounts.get(row.iGM_Id) ?? 0,
      likedByMe: likedSet.has(row.iGM_Id),
      favoritedByMe: favoritedSet.has(row.iGM_Id),
      createdAt: row.iGM_CreatedAt,
      updatedAt: row.iGM_UpdatedAt,
    };
  });
}

/** 作者已注销场景的占位（当前无删号功能，仅为类型完整） */
function iGM_DeletedAuthorPlaceholder(authorId: string): iGM_AuthorDto {
  return {
    id: authorId,
    username: "unknown",
    displayName: null,
    avatar: null,
    role: "user",
  };
}

/** 由正文生成单行摘要 */
function iGM_BuildExcerpt(content: string): string {
  const singleLine = content.replace(/\s+/g, " ").trim();
  return singleLine.length > iGM_ExcerptLength
    ? `${singleLine.slice(0, iGM_ExcerptLength)}…`
    : singleLine;
}

/** 组装分页帖子列表响应数据 */
function iGM_BuildPostListData(
  params: iGM_PostListParams,
  currentUserId: string | null,
): iGM_PostListData {
  const { items, total } = iGM_ListPosts(params);
  return {
    items: iGM_AssemblePostList(items, currentUserId),
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}

/** 组装评论 DTO（平铺） */
function iGM_AssembleComments(
  rows: ReturnType<typeof iGM_ListCommentsByPost>,
  currentUserId: string | null,
  postTitleById?: Map<string, string>,
): Array<iGM_CommentDto | iGM_MyCommentItemDto> {
  if (rows.length === 0) return [];

  const authorRows = iGM_FindUsersByIds(rows.map((row) => row.iGM_AuthorId));
  const authorMap = new Map(authorRows.map((user) => [user.iGM_Id, user]));
  const likeCounts = iGM_CountLikesBatch(
    "comment",
    rows.map((row) => row.iGM_Id),
  );
  const likedSet = iGM_GetLikedIdSet(
    "comment",
    rows.map((row) => row.iGM_Id),
    currentUserId,
  );

  return rows.map((row) => {
    const authorRow = authorMap.get(row.iGM_AuthorId);
    const base: iGM_CommentDto = {
      id: row.iGM_Id,
      postId: row.iGM_PostId,
      parentId: row.iGM_ParentId,
      content: row.iGM_Content,
      status: row.iGM_Status,
      author: authorRow
        ? iGM_ToAuthorDto(authorRow)
        : iGM_DeletedAuthorPlaceholder(row.iGM_AuthorId),
      likeCount: likeCounts.get(row.iGM_Id) ?? 0,
      likedByMe: likedSet.has(row.iGM_Id),
      createdAt: row.iGM_CreatedAt,
      updatedAt: row.iGM_UpdatedAt,
    };
    const titled = row as { iGM_PostTitle?: string };
    if (postTitleById || typeof titled.iGM_PostTitle === "string") {
      return {
        ...base,
        postTitle:
          titled.iGM_PostTitle ??
          (postTitleById?.get(row.iGM_PostId) ?? ""),
      } as iGM_MyCommentItemDto;
    }
    return base;
  });
}

/* ---------- 分类 ---------- */

/** 获取全部分类 DTO */
export function iGM_GetCategories(): iGM_CategoryDto[] {
  return iGM_ListCategories().map(iGM_ToCategoryDto);
}

/* ---------- 帖子 ---------- */

/** 发帖：登录用户；事务内写入帖子并替换标签关联 */
export function iGM_CreatePostService(
  user: iGM_UserRow,
  input: iGM_PostInput,
): iGM_PostDetailDto {
  const { title, content, tags } = iGM_ValidatePostInput(input);

  let categoryId: string | null = null;
  if (input.categoryId) {
    const category = iGM_FindCategoryById(input.categoryId);
    if (!category) {
      throw new iGM_ContentError("community.errors.categoryNotFound", 422);
    }
    categoryId = category.iGM_Id;
  }

  const now = new Date().toISOString();
  const post = iGM_Db.transaction(() => {
    const created = iGM_CreatePost({
      authorId: user.iGM_Id,
      title,
      content,
      categoryId,
      now,
    });
    if (tags.length > 0) {
      const tagRows = iGM_FindOrCreateTags(tags);
      iGM_ReplacePostTags(
        created.iGM_Id,
        tagRows.map((tag) => tag.iGM_Id),
      );
    }
    return created;
  })();

  const detail = iGM_GetPostDetail(user, post.iGM_Id);
  if (!detail) throw new Error("iGM_CreatePostService：创建后详情组装失败");
  // 模块五：发帖积分埋点（内部吞异常，不影响主流程）
  iGM_AwardPoints(user.iGM_Id, "post_create", title);
  return detail;
}

/** 编辑帖子：仅作者本人可改标题、正文、分类与标签 */
export function iGM_UpdatePostService(
  user: iGM_UserRow,
  postId: string,
  input: iGM_PostInput,
): iGM_PostDetailDto {
  const post = iGM_FindPostById(postId);
  if (!post) throw new iGM_ContentError("community.errors.postNotFound", 404);
  if (!iGM_IsOwner(user, post.iGM_AuthorId)) {
    throw new iGM_ContentError("auth.errors.forbidden", 403);
  }

  const { title, content, tags } = iGM_ValidatePostInput(input);

  let categoryId: string | null = null;
  if (input.categoryId) {
    const category = iGM_FindCategoryById(input.categoryId);
    if (!category) {
      throw new iGM_ContentError("community.errors.categoryNotFound", 422);
    }
    categoryId = category.iGM_Id;
  }

  const now = new Date().toISOString();
  iGM_Db.transaction(() => {
    iGM_UpdatePost(postId, { title, content, categoryId, now });
    const tagRows = tags.length > 0 ? iGM_FindOrCreateTags(tags) : [];
    iGM_ReplacePostTags(
      postId,
      tagRows.map((tag) => tag.iGM_Id),
    );
  })();

  const detail = iGM_GetPostDetail(user, postId);
  if (!detail) throw new Error("iGM_UpdatePostService：更新后详情组装失败");
  return detail;
}

/** 删除帖子：作者本人或协管员及以上；事务内清理点赞后删除（其余关联外键级联） */
export function iGM_DeletePostService(
  user: iGM_UserRow,
  postId: string,
): void {
  const post = iGM_FindPostById(postId);
  if (!post) throw new iGM_ContentError("community.errors.postNotFound", 404);
  if (!iGM_IsOwner(user, post.iGM_AuthorId) && !iGM_CanModerate(user)) {
    throw new iGM_ContentError("auth.errors.forbidden", 403);
  }
  iGM_Db.transaction(() => {
    iGM_DeleteLikesForPost(postId);
    iGM_DeletePost(postId);
  })();
}

/** 隐藏/恢复帖子：作者本人或协管员及以上 */
export function iGM_SetPostStatusService(
  user: iGM_UserRow,
  postId: string,
  status: "published" | "hidden",
): iGM_PostDetailDto {
  const post = iGM_FindPostById(postId);
  if (!post) throw new iGM_ContentError("community.errors.postNotFound", 404);
  if (!iGM_IsOwner(user, post.iGM_AuthorId) && !iGM_CanModerate(user)) {
    throw new iGM_ContentError("auth.errors.forbidden", 403);
  }
  iGM_SetPostStatus(postId, status, new Date().toISOString());
  const detail = iGM_GetPostDetail(user, postId);
  if (!detail) throw new Error("iGM_SetPostStatusService：状态更新后组装失败");
  return detail;
}

/**
 * 帖子详情：隐藏帖仅作者本人与协管员及以上可见，
 * 对其他访客一律返回“不存在”，避免泄露隐藏内容
 */
export function iGM_GetPostDetail(
  currentUser: iGM_UserRow | null,
  postId: string,
): iGM_PostDetailDto | null {
  const post = iGM_FindPostById(postId);
  if (!post) return null;
  if (
    post.iGM_Status !== "published" &&
    (!currentUser ||
      (!iGM_IsOwner(currentUser, post.iGM_AuthorId) &&
        !iGM_CanModerate(currentUser)))
  ) {
    return null;
  }
  const [item] = iGM_AssemblePostList([post], currentUser?.iGM_Id ?? null);
  if (!item) return null;
  const { excerpt: _excerpt, ...rest } = item;
  return { ...rest, content: post.iGM_Content };
}

/** 社区广场帖子列表：公开访问，仅返回已发布帖子 */
export function iGM_ListPublishedPosts(
  currentUserId: string | null,
  query: iGM_PostQueryInput,
): iGM_PostListData {
  const { page, pageSize } = iGM_ResolvePagination(
    query.page,
    query.pageSize,
  );

  let tagId: string | null = null;
  if (query.tagSlug) {
    const tag = iGM_FindTagBySlug(query.tagSlug);
    if (!tag) return iGM_EmptyPage(page, pageSize);
    tagId = tag.iGM_Id;
  }
  let categoryId: string | null = null;
  if (query.categorySlug) {
    const category = iGM_ListCategories().find(
      (item) => item.iGM_Slug === query.categorySlug,
    );
    if (!category) return iGM_EmptyPage(page, pageSize);
    categoryId = category.iGM_Id;
  }

  const search = query.search?.trim() ? query.search.trim() : null;

  return iGM_BuildPostListData(
    {
      categoryId,
      tagId,
      authorId: query.authorId ?? null,
      search,
      statuses: ["published"],
      page,
      pageSize,
    },
    currentUserId,
  );
}

/** 空分页结果（筛选标签/分类不存在时使用） */
function iGM_EmptyPage(page: number, pageSize: number): iGM_PostListData {
  return { items: [], total: 0, page, pageSize, totalPages: 1 };
}

/** 我的帖子列表：包含全部状态 */
export function iGM_ListMyPostsService(
  user: iGM_UserRow,
  pageRaw?: number,
  pageSizeRaw?: number,
): iGM_PostListData {
  const { page, pageSize } = iGM_ResolvePagination(pageRaw, pageSizeRaw);
  return iGM_BuildPostListData(
    {
      authorId: user.iGM_Id,
      statuses: ["published", "hidden"],
      page,
      pageSize,
    },
    user.iGM_Id,
  );
}

/** 指定用户的公开帖子列表（仅已发布） */
export function iGM_ListUserPostsService(
  currentUserId: string | null,
  userId: string,
  pageRaw?: number,
  pageSizeRaw?: number,
): iGM_PostListData {
  const target = iGM_FindUserById(userId);
  if (!target || target.iGM_Status !== "active") {
    throw new iGM_ContentError("community.errors.userNotFound", 404);
  }
  const { page, pageSize } = iGM_ResolvePagination(pageRaw, pageSizeRaw);
  return iGM_BuildPostListData(
    { authorId: userId, statuses: ["published"], page, pageSize },
    currentUserId,
  );
}

/* ---------- 评论 ---------- */

/** 发表评论或回复；评论通知帖子作者，回复通知父评论作者 */
export function iGM_CreateCommentService(
  user: iGM_UserRow,
  postId: string,
  parentId: string | null,
  rawContent: unknown,
  locale?: string,
): iGM_CommentDto {
  const post = iGM_FindPostById(postId);
  if (!post || post.iGM_Status !== "published") {
    throw new iGM_ContentError("community.errors.postNotFound", 404);
  }
  const content = iGM_ValidateCommentContent(rawContent);

  let resolvedParentId: string | null = null;
  let parentAuthorId: string | null = null;
  if (parentId) {
    const parent = iGM_FindCommentById(parentId);
    // 父评论必须存在、属于同一帖子且未被隐藏
    if (
      !parent ||
      parent.iGM_PostId !== postId ||
      parent.iGM_Status !== "visible"
    ) {
      throw new iGM_ContentError("community.errors.parentInvalid", 422);
    }
    resolvedParentId = parent.iGM_Id;
    parentAuthorId = parent.iGM_AuthorId;
  }

  const comment = iGM_CreateComment({
    postId,
    authorId: user.iGM_Id,
    parentId: resolvedParentId,
    content,
    now: new Date().toISOString(),
  });

  // 模块四：评论通知帖子作者、回复通知父评论作者（自我触发在服务内自动跳过）
  const actorName = user.iGM_DisplayName ?? user.iGM_Username;
  const link = `/G_Post?postId=${postId}`;
  if (parentAuthorId) {
    iGM_Notify({
      userId: parentAuthorId,
      actorId: user.iGM_Id,
      actorName,
      type: "reply",
      title: post.iGM_Title,
      link,
      locale,
    });
  } else {
    iGM_Notify({
      userId: post.iGM_AuthorId,
      actorId: user.iGM_Id,
      actorName,
      type: "comment",
      title: post.iGM_Title,
      link,
      locale,
    });
  }

  const [dto] = iGM_AssembleComments([comment], user.iGM_Id);
  // 模块五：评论积分埋点（内部吞异常，不影响主流程）
  iGM_AwardPoints(user.iGM_Id, "comment_create");
  return dto as iGM_CommentDto;
}

/** 编辑评论：仅作者本人 */
export function iGM_UpdateCommentService(
  user: iGM_UserRow,
  commentId: string,
  rawContent: unknown,
): iGM_CommentDto {
  const comment = iGM_FindCommentById(commentId);
  if (!comment) {
    throw new iGM_ContentError("community.errors.commentNotFound", 404);
  }
  if (!iGM_IsOwner(user, comment.iGM_AuthorId)) {
    throw new iGM_ContentError("auth.errors.forbidden", 403);
  }
  const content = iGM_ValidateCommentContent(rawContent);
  iGM_UpdateComment(commentId, content, new Date().toISOString());
  const updated = iGM_FindCommentById(commentId);
  const [dto] = iGM_AssembleComments(
    updated ? [updated] : [],
    user.iGM_Id,
  );
  return dto as iGM_CommentDto;
}

/** 删除评论：作者本人或协管员及以上 */
export function iGM_DeleteCommentService(
  user: iGM_UserRow,
  commentId: string,
): void {
  const comment = iGM_FindCommentById(commentId);
  if (!comment) {
    throw new iGM_ContentError("community.errors.commentNotFound", 404);
  }
  if (!iGM_IsOwner(user, comment.iGM_AuthorId) && !iGM_CanModerate(user)) {
    throw new iGM_ContentError("auth.errors.forbidden", 403);
  }
  iGM_Db.transaction(() => {
    // 多态点赞无外键约束，先手动清理
    iGM_Db.run(
      `DELETE FROM iGM_Likes WHERE iGM_TargetType = 'comment' AND iGM_TargetId = ?`,
      [commentId],
    );
    iGM_DeleteComment(commentId);
  })();
}

/** 隐藏/恢复评论：协管员及以上（作者可删除但不提供隐藏） */
export function iGM_SetCommentStatusService(
  user: iGM_UserRow,
  commentId: string,
  status: "visible" | "hidden",
): iGM_CommentDto {
  iGM_RequireModerator(user);
  const comment = iGM_FindCommentById(commentId);
  if (!comment) {
    throw new iGM_ContentError("community.errors.commentNotFound", 404);
  }
  iGM_SetCommentStatus(commentId, status, new Date().toISOString());
  const updated = iGM_FindCommentById(commentId);
  const [dto] = iGM_AssembleComments(updated ? [updated] : [], user.iGM_Id);
  return dto as iGM_CommentDto;
}

/** 要求协管员及以上角色，否则抛 403 */
function iGM_RequireModerator(user: iGM_UserRow): void {
  if (!iGM_CanModerate(user)) {
    throw new iGM_ContentError("auth.errors.forbidden", 403);
  }
}

/**
 * 帖子评论平铺列表：
 * 普通访客只见可见评论；评论作者本人可见自己被隐藏的评论；协管员可见全部
 */
export function iGM_ListPostCommentsService(
  currentUser: iGM_UserRow | null,
  postId: string,
): iGM_CommentDto[] {
  const post = iGM_FindPostById(postId);
  if (!post) throw new iGM_ContentError("community.errors.postNotFound", 404);

  const isModerator = currentUser ? iGM_CanModerate(currentUser) : false;
  const rows = iGM_ListCommentsByPost(postId, isModerator);
  const visibleRows = isModerator
    ? rows
    : rows.filter(
        (row) =>
          row.iGM_Status === "visible" ||
          (currentUser !== null && row.iGM_AuthorId === currentUser.iGM_Id),
      );
  return iGM_AssembleComments(
    visibleRows,
    currentUser?.iGM_Id ?? null,
  ) as iGM_CommentDto[];
}

/* ---------- 点赞 / 收藏 ---------- */

/** 点赞或取消点赞（帖子或评论） */
export function iGM_ToggleLikeService(
  user: iGM_UserRow,
  targetType: iGM_LikeTargetType,
  targetId: string,
  liked: boolean,
): iGM_LikeStateData {
  if (targetType === "post") {
    const post = iGM_FindPostById(targetId);
    if (!post || post.iGM_Status !== "published") {
      throw new iGM_ContentError("community.errors.postNotFound", 404);
    }
  } else {
    const comment = iGM_FindCommentById(targetId);
    if (!comment || comment.iGM_Status !== "visible") {
      throw new iGM_ContentError("community.errors.commentNotFound", 404);
    }
  }

  const now = new Date().toISOString();
  if (liked) {
    iGM_AddLike(targetType, targetId, user.iGM_Id, now);
    // 模块五：被赞积分埋点——点赞时给内容作者加分，自我点赞不发分
    const ownerId =
      targetType === "post"
        ? (iGM_FindPostById(targetId)?.iGM_AuthorId ?? null)
        : (iGM_FindCommentById(targetId)?.iGM_AuthorId ?? null);
    if (ownerId && ownerId !== user.iGM_Id) {
      iGM_AwardPoints(ownerId, "like_received");
    }
  } else {
    iGM_RemoveLike(targetType, targetId, user.iGM_Id);
  }
  return {
    targetType,
    targetId,
    liked: iGM_HasLike(targetType, targetId, user.iGM_Id),
    likeCount: iGM_CountLikes(targetType, targetId),
  };
}

/** 收藏或取消收藏帖子 */
export function iGM_ToggleFavoriteService(
  user: iGM_UserRow,
  postId: string,
  favorited: boolean,
): iGM_FavoriteStateData {
  const post = iGM_FindPostById(postId);
  if (!post || post.iGM_Status !== "published") {
    throw new iGM_ContentError("community.errors.postNotFound", 404);
  }
  if (favorited) {
    iGM_AddFavorite(postId, user.iGM_Id, new Date().toISOString());
  } else {
    iGM_RemoveFavorite(postId, user.iGM_Id);
  }
  return {
    postId,
    favorited: iGM_HasFavorite(postId, user.iGM_Id),
    favoriteCount: iGM_CountFavorites(postId),
  };
}

/* ---------- 用户资料 ---------- */

/** 获取指定用户公开资料（含已发布帖子数与可见评论数） */
export function iGM_GetPublicProfileService(
  userId: string,
): iGM_PublicProfileDto {
  const user = iGM_FindUserById(userId);
  if (!user || user.iGM_Status !== "active") {
    throw new iGM_ContentError("community.errors.userNotFound", 404);
  }
  return {
    id: user.iGM_Id,
    username: user.iGM_Username,
    displayName: user.iGM_DisplayName,
    avatar: user.iGM_Avatar,
    bio: user.iGM_Bio,
    website: user.iGM_Website,
    role: user.iGM_Role,
    createdAt: user.iGM_CreatedAt,
    postCount: iGM_CountPostsByAuthor(user.iGM_Id, ["published"]),
    commentCount: iGM_CountCommentsByAuthor(user.iGM_Id, ["visible"]),
  };
}

/** 更新本人公开资料，返回最新的完整用户 DTO */
export function iGM_UpdateMyProfileService(
  user: iGM_UserRow,
  input: iGM_ProfileInput,
): iGM_UserDto {
  const displayName = iGM_NormalizeOptional(
    input.displayName,
    iGM_DisplayNameMaxLength,
    "community.errors.displayNameInvalid",
  );
  const bio = iGM_NormalizeOptional(
    input.bio,
    iGM_BioMaxLength,
    "community.errors.bioInvalid",
  );
  const website = iGM_NormalizeUrl(
    input.website,
    iGM_WebsiteMaxLength,
    "community.errors.websiteInvalid",
  );
  const avatar = iGM_NormalizeUrl(
    input.avatar,
    iGM_AvatarMaxLength,
    "community.errors.avatarInvalid",
    { allowSiteRelative: true },
  );

  iGM_UpdateProfile(user.iGM_Id, {
    displayName,
    avatar,
    bio,
    website,
    now: new Date().toISOString(),
  });
  const refreshed = iGM_FindUserById(user.iGM_Id);
  if (!refreshed) throw new Error("iGM_UpdateMyProfileService：更新后查询失败");
  return iGM_ToUserDto(refreshed);
}

/** 我的评论列表（含全部状态，附带帖子标题） */
export function iGM_ListMyCommentsService(
  user: iGM_UserRow,
  pageRaw?: number,
  pageSizeRaw?: number,
): { items: iGM_MyCommentItemDto[]; total: number; page: number; pageSize: number; totalPages: number } {
  const { page, pageSize } = iGM_ResolvePagination(pageRaw, pageSizeRaw);
  const { items, total } = iGM_ListCommentsByAuthor(
    user.iGM_Id,
    ["visible", "hidden"],
    page,
    pageSize,
  );
  const dtos = iGM_AssembleComments(items, user.iGM_Id);
  return {
    items: dtos as iGM_MyCommentItemDto[],
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** 指定用户的公开评论列表（仅可见，附带帖子标题） */
export function iGM_ListUserCommentsService(
  currentUserId: string | null,
  userId: string,
  pageRaw?: number,
  pageSizeRaw?: number,
): { items: iGM_MyCommentItemDto[]; total: number; page: number; pageSize: number; totalPages: number } {
  const target = iGM_FindUserById(userId);
  if (!target || target.iGM_Status !== "active") {
    throw new iGM_ContentError("community.errors.userNotFound", 404);
  }
  const { page, pageSize } = iGM_ResolvePagination(pageRaw, pageSizeRaw);
  const { items, total } = iGM_ListCommentsByAuthor(
    userId,
    ["visible"],
    page,
    pageSize,
  );
  const dtos = iGM_AssembleComments(items, currentUserId);
  return {
    items: dtos as iGM_MyCommentItemDto[],
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

// 导出 //
export default {
  iGM_SanitizeContent,
  iGM_GetCategories,
  iGM_CreatePostService,
  iGM_UpdatePostService,
  iGM_DeletePostService,
  iGM_SetPostStatusService,
  iGM_GetPostDetail,
  iGM_ListPublishedPosts,
  iGM_ListMyPostsService,
  iGM_ListUserPostsService,
  iGM_CreateCommentService,
  iGM_UpdateCommentService,
  iGM_DeleteCommentService,
  iGM_SetCommentStatusService,
  iGM_ListPostCommentsService,
  iGM_ToggleLikeService,
  iGM_ToggleFavoriteService,
  iGM_GetPublicProfileService,
  iGM_UpdateMyProfileService,
  iGM_ListMyCommentsService,
  iGM_ListUserCommentsService,
};
