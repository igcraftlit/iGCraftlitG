/**
 * 文件路径：apps/web/src/iGM_Pages/G_User/iGM_UserProfilePage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_User?userId=xxx（缺省且已登录时查看自己）
 * 模块：G_User
 * 作用：用户公开个人主页——头像、昵称、简介、网站、角色、统计、
 *       发帖列表与评论列表两个标签页；本人额外提供个人中心入口
 * 内容：资料卡片、帖子/评论切换标签、帖子卡片列表、我的评论条目、分页
 * 说明：仅展示公开内容；含隐藏内容的“我的帖子/我的评论”走独立页面
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  FileText,
  Globe,
  LoaderCircle,
  MessageSquare,
  MessageSquareText,
  PencilLine,
  Settings2,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import {
  iGM_ApiGetProfile,
  iGM_ApiUserPosts,
  iGM_ApiUserComments,
  type iGM_MyCommentItem,
  type iGM_PostListData,
  type iGM_CommentPageData,
  type iGM_PublicProfile,
} from "../../iGM_Services/iGM_CommunityClient";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
import { iGM_UseLocale } from "../../iGM_Providers/iGM_LocaleProvider";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_Avatar as IGM_Avatar } from "../../iGM_Components/iGM_Avatar/iGM_Avatar";
import { iGM_PostCard as IGM_PostCard } from "../../iGM_Components/iGM_PostCard/iGM_PostCard";
import { iGM_Pagination as IGM_Pagination } from "../../iGM_Components/iGM_Pagination/iGM_Pagination";
import { iGM_EmptyState as IGM_EmptyState } from "../../iGM_Components/iGM_EmptyState/iGM_EmptyState";
import { iGM_FormatDate } from "../../iGM_Components/iGM_Format/iGM_Format";
import pageStyles from "../iGM_Page.module.css";
import styles from "../iGM_Community.module.css";

// 类型定义 //
/** 个人主页标签页类型 */
type iGM_ProfileTab = "posts" | "comments";

// 核心逻辑 //
/** 用户个人主页主体（在 Suspense 内使用 useSearchParams） */
export function iGM_UserProfilePage() {
  const t = useTranslations();
  const locale = iGM_UseLocale().locale;
  const { user, status } = iGM_UseAuth();
  const searchParams = useSearchParams();
  const queryUserId = searchParams.get("userId");
  // 未指定 userId 且已登录时查看自己的公开主页
  const targetUserId = queryUserId ?? (status === "authenticated" ? user?.id ?? null : null);
  const isSelf =
    status === "authenticated" && targetUserId !== null && targetUserId === user?.id;

  const [profile, setProfile] = useState<iGM_PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [tab, setTab] = useState<iGM_ProfileTab>("posts");
  const [page, setPage] = useState(1);
  const [postsData, setPostsData] = useState<iGM_PostListData | null>(null);
  const [commentsData, setCommentsData] = useState<iGM_CommentPageData | null>(null);
  const [listLoading, setListLoading] = useState(false);

  /** 加载公开资料 */
  useEffect(() => {
    if (!targetUserId) {
      setLoading(false);
      setProfile(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErrorText(null);
    iGM_ApiGetProfile(targetUserId)
      .then((response) => {
        if (cancelled) return;
        setProfile(response.data?.profile ?? null);
      })
      .catch((error) => {
        if (!cancelled) setErrorText(iGM_ResolveErrorText(t, error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [targetUserId, t]);

  /** 加载当前标签页数据 */
  const iGM_LoadList = useCallback(async () => {
    if (!targetUserId) return;
    setListLoading(true);
    try {
      if (tab === "posts") {
        const response = await iGM_ApiUserPosts(targetUserId, page);
        setPostsData(response.data);
      } else {
        const response = await iGM_ApiUserComments(targetUserId, page);
        setCommentsData(response.data);
      }
    } catch {
      // 标签页加载失败时保留已展示数据，不覆盖页面级错误
    } finally {
      setListLoading(false);
    }
  }, [targetUserId, tab, page]);

  useEffect(() => {
    void iGM_LoadList();
  }, [iGM_LoadList]);

  /** 切换标签时回到第一页 */
  function iGM_SwitchTab(nextTab: iGM_ProfileTab): void {
    setTab(nextTab);
    setPage(1);
  }

  /** 渲染单条评论（公开主页视图） */
  function iGM_RenderCommentItem(item: iGM_MyCommentItem) {
    return (
      <article key={item.id} className={styles.myCommentCard}>
        <div className={styles.myCommentMeta}>
          <Link href={`/G_Post?postId=${encodeURIComponent(item.postId)}`}>
            <FileText size={13} strokeWidth={1.8} />
            {item.postTitle}
          </Link>
          <span>{iGM_FormatDate(locale, item.createdAt)}</span>
        </div>
        <p className={styles.myCommentContent}>{item.content}</p>
      </article>
    );
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

  if (!targetUserId) {
    return (
      <IGM_EmptyState
        icon={UserRound}
        title={t("community.profile.noSelectionTitle")}
        description={t("community.profile.noSelectionDesc")}
        action={
          <Link href="/G_Auth/login" className={styles.primaryButton}>
            {t("community.profile.goLogin")}
          </Link>
        }
      />
    );
  }

  if (errorText || !profile) {
    return (
      <IGM_EmptyState
        icon={UserRound}
        title={t("community.profile.notFoundTitle")}
        description={errorText ?? t("community.profile.notFoundDesc")}
        action={
          <Link href="/G_Community" className={styles.primaryButton}>
            {t("community.post.backToCommunity")}
          </Link>
        }
      />
    );
  }

  const displayName = profile.displayName ?? profile.username;
  const roleKey = `community.roles.${profile.role}`;

  return (
    <div className={styles.stack}>
      {/* 资料卡片 */}
      <section className={styles.profileHeaderCard}>
        <IGM_Avatar size="lg" src={profile.avatar} name={displayName} />
        <div className={styles.profileMain}>
          <div className={styles.profileNameRow}>
            <h1 className={styles.profileName}>{displayName}</h1>
            {profile.displayName && (
              <span className={styles.profileUsername}>@{profile.username}</span>
            )}
            <span className={styles.profileRoleBadge}>
              <ShieldCheck size={13} strokeWidth={1.8} />
              {t(roleKey)}
            </span>
          </div>
          {profile.bio && <p className={styles.profileBio}>{profile.bio}</p>}
          <div className={styles.profileMetaRow}>
            {profile.website && (
              <a
                href={profile.website}
                target="_blank"
                rel="noreferrer noopener"
                className={styles.profileWebsite}
              >
                <Globe size={13} strokeWidth={1.8} />
                {profile.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </a>
            )}
            <span className={styles.profileJoined}>
              {t("community.profile.joinedAt", {
                date: iGM_FormatDate(locale, profile.createdAt),
              })}
            </span>
          </div>
          <div className={styles.profileStats}>
            <span>
              <FileText size={14} strokeWidth={1.8} />
              {t("community.profile.postCount", { count: profile.postCount })}
            </span>
            <span>
              <MessageSquare size={14} strokeWidth={1.8} />
              {t("community.profile.commentCount", { count: profile.commentCount })}
            </span>
          </div>
        </div>

        {/* 本人快捷入口：我的帖子 / 我的评论 / 资料设置 */}
        {isSelf && (
          <div className={styles.profileSelfActions}>
            <Link href="/G_UserPosts" className={styles.ghostButton}>
              <FileText size={14} strokeWidth={1.8} />
              {t("community.profile.myPosts")}
            </Link>
            <Link href="/G_UserComments" className={styles.ghostButton}>
              <MessageSquareText size={14} strokeWidth={1.8} />
              {t("community.profile.myComments")}
            </Link>
            <Link href="/G_UserSettings" className={styles.primaryButton}>
              <Settings2 size={14} strokeWidth={1.8} />
              {t("community.profile.editProfile")}
            </Link>
          </div>
        )}
      </section>

      {/* 标签切换 */}
      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tabButton} ${tab === "posts" ? styles.tabActive : ""}`}
          onClick={() => iGM_SwitchTab("posts")}
        >
          <FileText size={14} strokeWidth={1.8} />
          {t("community.profile.tabPosts")}
        </button>
        <button
          type="button"
          className={`${styles.tabButton} ${tab === "comments" ? styles.tabActive : ""}`}
          onClick={() => iGM_SwitchTab("comments")}
        >
          <PencilLine size={14} strokeWidth={1.8} />
          {t("community.profile.tabComments")}
        </button>
      </div>

      {/* 标签内容 */}
      {listLoading ? (
        <div className={styles.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("community.state.loading")}
        </div>
      ) : tab === "posts" ? (
        postsData && postsData.items.length > 0 ? (
          <>
            <div className={styles.list}>
              {postsData.items.map((post) => (
                <IGM_PostCard key={post.id} post={post} />
              ))}
            </div>
            <IGM_Pagination
              page={postsData.page}
              totalPages={postsData.totalPages}
              onChange={setPage}
            />
          </>
        ) : (
          <IGM_EmptyState
            icon={FileText}
            title={t("community.profile.emptyPostsTitle")}
            description={t("community.profile.emptyPostsDesc")}
          />
        )
      ) : commentsData && commentsData.items.length > 0 ? (
        <>
          <div className={styles.list}>
            {commentsData.items.map((item) => iGM_RenderCommentItem(item))}
          </div>
          <IGM_Pagination
            page={commentsData.page}
            totalPages={commentsData.totalPages}
            onChange={setPage}
          />
        </>
      ) : (
        <IGM_EmptyState
          icon={MessageSquare}
          title={t("community.profile.emptyCommentsTitle")}
          description={t("community.profile.emptyCommentsDesc")}
        />
      )}
    </div>
  );
}

// 导出 //
export default iGM_UserProfilePage;
