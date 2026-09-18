/**
 * 文件路径：apps/web/src/iGM_Pages/G_Post/iGM_PostDetailPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_Post?postId=xxx（静态壳 + 客户端按查询参数加载，避免动态路由预生成）
 * 模块：G_Post
 * 作用：帖子详情——正文、作者、点赞、收藏、评论楼中楼、发表回复、
 *       作者编辑/删除/隐藏、协管员管理内容
 * 内容：详情卡片、互动操作条、评论撰写框、评论列表、加载/错误/缺参空状态
 * 安全：正文按纯文本渲染（React 默认转义 + 后端 XSS 过滤双重保障）
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  Bookmark,
  EyeOff,
  FileText,
  LoaderCircle,
  MessageSquare,
  Pencil,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import {
  iGM_ApiGetPost,
  iGM_ApiListComments,
  iGM_ApiDeletePost,
  iGM_ApiSetPostStatus,
  iGM_ApiCreateComment,
  iGM_ApiUpdateComment,
  iGM_ApiDeleteComment,
  iGM_ApiSetCommentStatus,
  iGM_ApiToggleLike,
  iGM_ApiToggleFavorite,
} from "../../iGM_Services/iGM_PostClient";
import type {
  iGM_Comment,
  iGM_PostDetail,
} from "../../iGM_Services/iGM_CommunityClient";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
import { iGM_UseLocale } from "../../iGM_Providers/iGM_LocaleProvider";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_Avatar as IGM_Avatar } from "../../iGM_Components/iGM_Avatar/iGM_Avatar";
import { iGM_CommentList as IGM_CommentList } from "../../iGM_Components/iGM_CommentList/iGM_CommentList";
import { iGM_EmptyState as IGM_EmptyState } from "../../iGM_Components/iGM_EmptyState/iGM_EmptyState";
import { iGM_FormatDateTime } from "../../iGM_Components/iGM_Format/iGM_Format";
import pageStyles from "../iGM_Page.module.css";
import styles from "../iGM_Community.module.css";

// 类型定义 //
// （本页状态类型来自 iGM_CommunityClient / iGM_PostClient）

// 核心逻辑 //
/** 帖子详情页主体（在 Suspense 内使用 useSearchParams） */
export function iGM_PostDetailPage() {
  const t = useTranslations();
  const router = useRouter();
  const locale = iGM_UseLocale().locale;
  const { user, status: authStatus, hasRole } = iGM_UseAuth();
  const searchParams = useSearchParams();
  const postId = searchParams.get("postId");

  const [post, setPost] = useState<iGM_PostDetail | null>(null);
  const [comments, setComments] = useState<iGM_Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  // 评论撰写框状态
  const [composerText, setComposerText] = useState("");
  const [composerBusy, setComposerBusy] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);

  /** 加载帖子详情 */
  const iGM_LoadPost = useCallback(async () => {
    if (!postId) return;
    try {
      const response = await iGM_ApiGetPost(postId);
      setPost(response.data?.post ?? null);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    }
  }, [postId, t]);

  /** 加载评论平铺列表 */
  const iGM_LoadComments = useCallback(async () => {
    if (!postId) return;
    try {
      const response = await iGM_ApiListComments(postId);
      setComments(response.data?.items ?? []);
    } catch {
      // 评论加载失败时保留正文阅读，不清空已有错误提示
    }
  }, [postId]);

  useEffect(() => {
    if (!postId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErrorText(null);
    Promise.all([iGM_LoadPost(), iGM_LoadComments()]).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  /** 帖子点赞/取消（乐观更新，失败回滚并提示） */
  async function iGM_HandleTogglePostLike() {
    if (!post || actionBusy) return;
    setActionBusy(true);
    const previous = post;
    setPost({
      ...post,
      likedByMe: !post.likedByMe,
      likeCount: post.likeCount + (post.likedByMe ? -1 : 1),
    });
    try {
      const response = await iGM_ApiToggleLike({
        targetType: "post",
        targetId: post.id,
        liked: !previous.likedByMe,
      });
      setPost((current) =>
        current
          ? {
              ...current,
              likedByMe: response.data?.liked ?? !previous.likedByMe,
              likeCount: response.data?.likeCount ?? current.likeCount,
            }
          : current,
      );
    } catch (error) {
      setPost(previous);
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setActionBusy(false);
    }
  }

  /** 收藏/取消（乐观更新） */
  async function iGM_HandleToggleFavorite() {
    if (!post || actionBusy) return;
    setActionBusy(true);
    const previous = post;
    setPost({
      ...post,
      favoritedByMe: !post.favoritedByMe,
      favoriteCount: post.favoriteCount + (post.favoritedByMe ? -1 : 1),
    });
    try {
      const response = await iGM_ApiToggleFavorite({
        postId: post.id,
        favorited: !previous.favoritedByMe,
      });
      setPost((current) =>
        current
          ? {
              ...current,
              favoritedByMe:
                response.data?.favorited ?? !previous.favoritedByMe,
              favoriteCount:
                response.data?.favoriteCount ?? current.favoriteCount,
            }
          : current,
      );
    } catch (error) {
      setPost(previous);
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setActionBusy(false);
    }
  }

  /** 删除帖子：二次确认后返回社区 */
  async function iGM_HandleDeletePost() {
    if (!post) return;
    const confirmed = window.confirm(t("community.post.deleteConfirm"));
    if (!confirmed) return;
    setActionBusy(true);
    try {
      await iGM_ApiDeletePost(post.id);
      router.replace("/G_Community");
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
      setActionBusy(false);
    }
  }

  /** 隐藏/恢复帖子 */
  async function iGM_HandleTogglePostStatus() {
    if (!post || actionBusy) return;
    setActionBusy(true);
    try {
      const response = await iGM_ApiSetPostStatus(
        post.id,
        post.status === "published" ? "hidden" : "published",
      );
      setPost(response.data?.post ?? post);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setActionBusy(false);
    }
  }

  /** 发表顶层评论 */
  async function iGM_HandleCompose() {
    if (!post || composerBusy) return;
    const content = composerText.trim();
    if (!content) return;
    setComposerBusy(true);
    setComposerError(null);
    try {
      await iGM_ApiCreateComment({ postId: post.id, content });
      setComposerText("");
      await Promise.all([iGM_LoadComments(), iGM_LoadPost()]);
    } catch (error) {
      setComposerError(iGM_ResolveErrorText(t, error));
    } finally {
      setComposerBusy(false);
    }
  }

  /** 楼中楼回复 */
  async function iGM_HandleReply(parentId: string, content: string) {
    if (!post) return;
    await iGM_ApiCreateComment({ postId: post.id, parentId, content });
    await Promise.all([iGM_LoadComments(), iGM_LoadPost()]);
  }

  /** 编辑评论 */
  async function iGM_HandleEditComment(commentId: string, content: string) {
    await iGM_ApiUpdateComment(commentId, content);
    await iGM_LoadComments();
  }

  /** 删除评论 */
  async function iGM_HandleDeleteComment(commentId: string) {
    await iGM_ApiDeleteComment(commentId);
    await Promise.all([iGM_LoadComments(), iGM_LoadPost()]);
  }

  /** 评论点赞：本地乐观更新，失败回滚 */
  async function iGM_HandleToggleCommentLike(comment: iGM_Comment) {
    const previous = comments;
    setComments((current) =>
      current.map((item) =>
        item.id === comment.id
          ? {
              ...item,
              likedByMe: !item.likedByMe,
              likeCount: item.likeCount + (item.likedByMe ? -1 : 1),
            }
          : item,
      ),
    );
    try {
      const response = await iGM_ApiToggleLike({
        targetType: "comment",
        targetId: comment.id,
        liked: !comment.likedByMe,
      });
      setComments((current) =>
        current.map((item) =>
          item.id === comment.id
            ? {
                ...item,
                likedByMe: response.data?.liked ?? !comment.likedByMe,
                likeCount: response.data?.likeCount ?? item.likeCount,
              }
            : item,
        ),
      );
    } catch (error) {
      setComments(previous);
      throw error;
    }
  }

  /** 协管员隐藏/恢复评论 */
  async function iGM_HandleToggleCommentHide(comment: iGM_Comment) {
    await iGM_ApiSetCommentStatus(
      comment.id,
      comment.status === "visible" ? "hidden" : "visible",
    );
    await Promise.all([iGM_LoadComments(), iGM_LoadPost()]);
  }

  /* ---------- 渲染分支 ---------- */
  if (loading) {
    return (
      <div className={styles.stateBox}>
        <LoaderCircle size={16} className="igm-spin" />
        {t("community.state.loading")}
      </div>
    );
  }

  if (!postId) {
    return (
      <IGM_EmptyState
        icon={FileText}
        title={t("community.post.noSelectionTitle")}
        description={t("community.post.noSelectionDesc")}
        action={
          <Link href="/G_Community" className={styles.primaryButton}>
            <ArrowLeft size={15} strokeWidth={1.8} />
            {t("community.post.backToCommunity")}
          </Link>
        }
      />
    );
  }

  if (errorText || !post) {
    return (
      <IGM_EmptyState
        icon={FileText}
        title={t("community.post.notFoundTitle")}
        description={errorText ?? t("community.post.notFoundDesc")}
        action={
          <Link href="/G_Community" className={styles.primaryButton}>
            <ArrowLeft size={15} strokeWidth={1.8} />
            {t("community.post.backToCommunity")}
          </Link>
        }
      />
    );
  }

  const authorName = post.author.displayName ?? post.author.username;
  const isOwner = user?.id === post.author.id;
  const canModerate = hasRole("moderator");
  const categoryKey = `community.categories.${post.category?.slug ?? ""}`;
  const categoryLabel = post.category
    ? t.has(categoryKey)
      ? t(categoryKey)
      : post.category.name
    : null;

  return (
    <div className={styles.stack}>
      {/* 返回社区 */}
      <Link href="/G_Community" className={styles.backLink}>
        <ArrowLeft size={14} strokeWidth={1.8} />
        {t("community.post.backToCommunity")}
      </Link>

      {/* 错误提示条（操作失败时显示，不阻断阅读） */}
      {errorText && (
        <div className={`${styles.alert} ${styles.alertError}`}>{errorText}</div>
      )}

      {/* 帖子正文卡片 */}
      <article className={styles.sectionCard}>
        <header className={styles.detailHeader}>
          <div className={styles.detailMeta}>
            <Link
              href={`/G_User?userId=${encodeURIComponent(post.author.id)}`}
              className={styles.detailMetaAuthor}
            >
              <IGM_Avatar size="sm" src={post.author.avatar} name={authorName} />
              <span>{authorName}</span>
            </Link>
            <span>{iGM_FormatDateTime(locale, post.createdAt)}</span>
            {categoryLabel && <span className={styles.hiddenBadge} style={{ background: "var(--igm-accent-soft)", color: "var(--igm-accent)" }}>{categoryLabel}</span>}
            {post.status === "hidden" && (
              <span className={styles.hiddenBadge}>
                <EyeOff size={12} strokeWidth={2} />
                {t("community.status.hidden")}
              </span>
            )}
          </div>
          <h1 className={styles.detailTitle}>{post.title}</h1>
          {post.tags.length > 0 && (
            <div className={styles.detailTags}>
              {post.tags.map((tag) => (
                <Link
                  key={tag.id}
                  href={`/G_Community?tag=${encodeURIComponent(tag.slug)}`}
                  className={styles.detailTag}
                >
                  {tag.name}
                </Link>
              ))}
            </div>
          )}
        </header>

        <div className={styles.detailContent}>{post.content}</div>

        <hr className={styles.divider} />

        {/* 互动操作条 */}
        <div className={styles.actionRow}>
          {authStatus === "authenticated" && (
            <>
              <button
                type="button"
                className={`${styles.iconAction} ${
                  post.likedByMe ? styles.iconActionActive : ""
                }`}
                disabled={actionBusy}
                onClick={() => void iGM_HandleTogglePostLike()}
              >
                <ThumbsUp size={15} strokeWidth={1.8} />
                {post.likeCount}
              </button>
              <button
                type="button"
                className={`${styles.iconAction} ${
                  post.favoritedByMe ? styles.iconActionActive : ""
                }`}
                disabled={actionBusy}
                onClick={() => void iGM_HandleToggleFavorite()}
              >
                <Bookmark size={15} strokeWidth={1.8} />
                {post.favoriteCount}
              </button>
            </>
          )}
          <span className={styles.iconAction} style={{ cursor: "default" }}>
            <MessageSquare size={15} strokeWidth={1.8} />
            {post.commentCount}
          </span>

          {/* 作者与管理员操作 */}
          {(isOwner || canModerate) && (
            <div className={styles.ownerActions}>
              {isOwner && (
                <Link
                  href={`/G_PostEdit?postId=${encodeURIComponent(post.id)}`}
                  className={styles.ghostButton}
                >
                  <Pencil size={14} strokeWidth={1.8} />
                  {t("community.post.edit")}
                </Link>
              )}
              {(isOwner || canModerate) && (
                <button
                  type="button"
                  className={styles.ghostButton}
                  disabled={actionBusy}
                  onClick={() => void iGM_HandleTogglePostStatus()}
                >
                  <EyeOff size={14} strokeWidth={1.8} />
                  {post.status === "published"
                    ? t("community.post.hide")
                    : t("community.post.restore")}
                </button>
              )}
              {(isOwner || canModerate) && (
                <button
                  type="button"
                  className={styles.dangerButton}
                  disabled={actionBusy}
                  onClick={() => void iGM_HandleDeletePost()}
                >
                  <Trash2 size={14} strokeWidth={1.8} />
                  {t("community.post.delete")}
                </button>
              )}
            </div>
          )}
        </div>
      </article>

      {/* 评论区 */}
      <section className={styles.sectionCard}>
        <h2 className={styles.sectionTitle}>
          <span className={styles.sectionTitleIcon}>
            <MessageSquare size={16} strokeWidth={1.8} />
          </span>
          {t("community.comments.title", { count: post.commentCount })}
        </h2>

        {/* 评论撰写框：登录用户可见，未登录引导去登录 */}
        {authStatus === "authenticated" ? (
          <div className={styles.composer}>
            <textarea
              className={styles.composerTextarea}
              placeholder={t("community.comments.placeholder")}
              value={composerText}
              maxLength={2000}
              onChange={(event) => setComposerText(event.target.value)}
            />
            {composerError && (
              <span className={styles.fieldError}>{composerError}</span>
            )}
            <div className={styles.composerActions}>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={composerBusy || !composerText.trim()}
                onClick={() => void iGM_HandleCompose()}
              >
                {composerBusy && <LoaderCircle size={14} className="igm-spin" />}
                {t("community.comments.submit")}
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.activeFilterRow}>
            <span>{t("community.comments.loginRequired")}</span>
            <Link
              href={`/G_Auth/login?redirect=${encodeURIComponent(
                `/G_Post?postId=${post.id}`,
              )}`}
              className={styles.clearFilter}
            >
              {t("community.comments.goLogin")}
            </Link>
          </div>
        )}

        <hr className={styles.divider} />

        {/* 评论楼中楼 */}
        {comments.length > 0 ? (
          <IGM_CommentList
            comments={comments}
            onReply={iGM_HandleReply}
            onEdit={iGM_HandleEditComment}
            onDelete={iGM_HandleDeleteComment}
            onToggleLike={iGM_HandleToggleCommentLike}
            onToggleHide={iGM_HandleToggleCommentHide}
          />
        ) : (
          <p className={styles.hint}>{t("community.comments.empty")}</p>
        )}
      </section>
    </div>
  );
}

// 导出 //
export default iGM_PostDetailPage;
