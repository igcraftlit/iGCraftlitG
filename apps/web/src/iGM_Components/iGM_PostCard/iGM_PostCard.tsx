/**
 * 文件路径：apps/web/src/iGM_Components/iGM_PostCard/iGM_PostCard.tsx
 * 所属层：前端 / 通用组件层
 * 路由：G_Community、G_User、G_UserPosts
 * 模块：iGM_PostCard
 * 作用：帖子列表项卡片
 * 内容：作者信息、分类与隐藏标记、标题摘要、标签、点赞/评论/收藏计数，
 *       标题与标签均为站内链接（静态导出下使用查询参数）
 */

// 导入依赖 //
"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Bookmark, EyeOff, MessageSquare, ThumbsUp } from "lucide-react";
import type { iGM_PostListItem } from "../../iGM_Services/iGM_CommunityClient";
import { iGM_UseLocale } from "../../iGM_Providers/iGM_LocaleProvider";
import { iGM_FormatRelative } from "../iGM_Format/iGM_Format";
import { iGM_Avatar as IGM_Avatar } from "../iGM_Avatar/iGM_Avatar";
import styles from "./iGM_PostCard.module.css";

// 类型定义 //
export interface iGM_PostCardProps {
  post: iGM_PostListItem;
}

// 核心逻辑 //
/** 帖子列表卡片 */
export function iGM_PostCard({ post }: iGM_PostCardProps) {
  const t = useTranslations();
  const { locale } = iGM_UseLocale();
  const displayName = post.author.displayName ?? post.author.username;
  /** 官方分类优先取语言包译名，自定义分类回退数据库原名 */
  const categoryLabel = (slug: string, fallback: string): string => {
    const key = `community.categories.${slug}`;
    return t.has(key) ? t(key) : fallback;
  };

  return (
    <article className={styles.card}>
      {/* 作者与分类行 */}
      <div className={styles.metaRow}>
        <Link
          href={`/G_User?userId=${encodeURIComponent(post.author.id)}`}
          className={styles.authorLink}
        >
          <IGM_Avatar
            size="sm"
            src={post.author.avatar}
            name={displayName}
          />
          <span>{displayName}</span>
        </Link>
        <span className={styles.dot} />
        <span>{iGM_FormatRelative(locale, post.createdAt)}</span>
        {post.category && (
          <>
            <span className={styles.dot} />
            <Link
              href={`/G_Community?category=${encodeURIComponent(post.category.slug)}`}
              className={styles.categoryBadge}
            >
              {categoryLabel(post.category.slug, post.category.name)}
            </Link>
          </>
        )}
        {post.status === "hidden" && (
          <span className={styles.hiddenBadge}>
            <EyeOff size={12} strokeWidth={2} style={{ marginRight: 4 }} />
            {t("community.status.hidden")}
          </span>
        )}
      </div>

      {/* 标题与摘要 */}
      <Link href={`/G_Post?postId=${encodeURIComponent(post.id)}`}>
        <h3 className={styles.title}>{post.title}</h3>
      </Link>
      <p className={styles.excerpt}>{post.excerpt}</p>

      {/* 标签 */}
      {post.tags.length > 0 && (
        <div className={styles.tagRow}>
          {post.tags.map((tag) => (
            <Link
              key={tag.id}
              href={`/G_Community?tag=${encodeURIComponent(tag.slug)}`}
              className={styles.tag}
            >
              {tag.name}
            </Link>
          ))}
        </div>
      )}

      {/* 互动计数 */}
      <div className={styles.footer}>
        <span
          className={`${styles.stat} ${post.likedByMe ? styles.statActive : ""}`}
        >
          <ThumbsUp size={14} strokeWidth={1.8} />
          {post.likeCount}
        </span>
        <span className={styles.stat}>
          <MessageSquare size={14} strokeWidth={1.8} />
          {post.commentCount}
        </span>
        <span
          className={`${styles.stat} ${post.favoritedByMe ? styles.statActiveBookmark : ""}`}
        >
          <Bookmark size={14} strokeWidth={1.8} />
          {post.favoriteCount}
        </span>
      </div>
    </article>
  );
}

// 导出 //
export default iGM_PostCard;
