/**
 * 文件路径：apps/web/src/iGM_Pages/G_Community/iGM_CommunitySquarePanel.tsx
 * 所属层：前端 / 页面层（G_Community 子面板）
 * 路由：/G_Community?tab=square（默认）&scope=posts|users&q=&category=&tag=&page=
 * 模块：G_Community
 * 作用：社区广场「广场」标签——帖子列表与全站用户搜索的统一入口
 * 内容：搜索框 + 帖子/用户范围分段控件；帖子范围含分类/标签筛选与分页；
 *       用户范围调用 /G_Social/users/search 渲染用户卡片与加好友/私信操作
 * 说明：纯静态 SSG，数据全部在客户端经 iGM_Request 调用本地后端
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  FileText,
  Inbox,
  LoaderCircle,
  MessageCircle,
  PenSquare,
  Search,
  SearchCode,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import {
  iGM_ApiListCategories,
  iGM_ApiListPosts,
  type iGM_Category,
  type iGM_PostListData,
} from "../../iGM_Services/iGM_CommunityClient";
import {
  iGM_ApiSearchUsers,
  type iGM_UserSearchData,
} from "../../iGM_Services/iGM_SocialClient";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_PostCard as IGM_PostCard } from "../../iGM_Components/iGM_PostCard/iGM_PostCard";
import { iGM_Pagination as IGM_Pagination } from "../../iGM_Components/iGM_Pagination/iGM_Pagination";
import { iGM_EmptyState as IGM_EmptyState } from "../../iGM_Components/iGM_EmptyState/iGM_EmptyState";
import { iGM_UserCard as IGM_UserCard } from "../../iGM_Components/iGM_UserCard/iGM_UserCard";
import { iGM_FriendButton as IGM_FriendButton } from "../../iGM_Components/iGM_FriendButton/iGM_FriendButton";
import { iGM_UseLocaleRouter } from "../../iGM_i18n/iGM_UseLocaleRouter";
import socialStyles from "../iGM_Module10.module.css";
import styles from "../iGM_Community.module.css";
import hubStyles from "./iGM_CommunityHub.module.css";

// 类型定义 //
/** 广场搜索范围 */
type iGM_SquareScope = "posts" | "users";

interface iGM_CommunitySquarePanelProps {
  /** 未登录时用户范围搜索不可用，由父级据此显示登录引导 */
  authenticated: boolean;
}

// 核心逻辑 //
/** 广场标签：帖子/用户双范围搜索 */
export function iGM_CommunitySquarePanel({
  authenticated,
}: iGM_CommunitySquarePanelProps) {
  const t = useTranslations();
  const router = iGM_UseLocaleRouter();
  const searchParams = useSearchParams();

  // 首屏状态从查询参数读取，保证静态壳可分享链接
  const [categories, setCategories] = useState<iGM_Category[]>([]);
  const [category, setCategory] = useState(searchParams.get("category") ?? "");
  const [tag, setTag] = useState(searchParams.get("tag") ?? "");
  const [scope, setScope] = useState<iGM_SquareScope>(
    searchParams.get("scope") === "users" ? "users" : "posts",
  );
  const [keywordInput, setKeywordInput] = useState(searchParams.get("q") ?? "");
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [page, setPage] = useState(1);
  const [postsData, setPostsData] = useState<iGM_PostListData | null>(null);
  const [usersData, setUsersData] = useState<iGM_UserSearchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);

  /** 合并写入地址栏（保留 tab、peerId 等其他查询参数） */
  function iGM_SyncUrl(next: Record<string, string | undefined>): void {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const query = params.toString();
    router.replace(query ? `/G_Community?${query}` : "/G_Community");
  }

  /** 拉取分类列表（仅一次，失败退化为仅“全部”） */
  useEffect(() => {
    let cancelled = false;
    iGM_ApiListCategories()
      .then((response) => {
        if (!cancelled) setCategories(response.data?.items ?? []);
      })
      .catch(() => {
        // 分类加载失败不阻塞列表
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** 帖子范围：按筛选条件拉取帖子列表 */
  const iGM_LoadPosts = useCallback(async () => {
    setLoading(true);
    setErrorText(null);
    try {
      const response = await iGM_ApiListPosts({
        category: category || undefined,
        tag: tag || undefined,
        q: search || undefined,
        page,
        pageSize: 10,
      });
      setPostsData(response.data);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setLoading(false);
    }
  }, [category, tag, search, page, t]);

  /** 用户范围：按 iGMUid/用户名拉取用户（需登录） */
  const iGM_LoadUsers = useCallback(async () => {
    if (!authenticated) return;
    setLoading(true);
    setErrorText(null);
    try {
      const response = await iGM_ApiSearchUsers(search, page);
      setUsersData(response.data?.data ?? null);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setLoading(false);
    }
  }, [authenticated, search, page, t]);

  useEffect(() => {
    if (scope === "posts") void iGM_LoadPosts();
    else if (search) void iGM_LoadUsers();
    else {
      // 用户范围空关键词：不发请求，直接展示引导
      setUsersData(null);
      setLoading(false);
      setErrorText(null);
    }
  }, [scope, search, iGM_LoadPosts, iGM_LoadUsers]);

  /** 提交搜索（范围共用一个关键词） */
  function iGM_HandleSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const keyword = keywordInput.trim();
    setSearch(keyword);
    setPage(1);
    iGM_SyncUrl({
      q: keyword || undefined,
      page: undefined,
      category: scope === "posts" ? category || undefined : undefined,
      tag: scope === "posts" ? tag || undefined : undefined,
    });
  }

  /** 切换帖子/用户范围：重置分页并同步地址栏 */
  function iGM_HandleScopeChange(nextScope: iGM_SquareScope): void {
    if (nextScope === scope) return;
    setScope(nextScope);
    setPage(1);
    iGM_SyncUrl({
      scope: nextScope === "users" ? "users" : undefined,
      page: undefined,
      category: nextScope === "posts" ? category || undefined : undefined,
      tag: nextScope === "posts" ? tag || undefined : undefined,
    });
  }

  /** 切换分类：回到第一页并同步地址栏 */
  function iGM_HandleCategoryChange(slug: string): void {
    setCategory(slug);
    setPage(1);
    iGM_SyncUrl({ category: slug || undefined, page: undefined, q: search || undefined });
  }

  /** 清除标签筛选 */
  function iGM_ClearTag(): void {
    setTag("");
    setPage(1);
    iGM_SyncUrl({ tag: undefined, page: undefined, q: search || undefined });
  }

  /** 清除搜索词 */
  function iGM_ClearSearch(): void {
    setKeywordInput("");
    setSearch("");
    setPage(1);
    iGM_SyncUrl({ q: undefined, page: undefined });
  }

  /** 翻页后回到列表顶部 */
  function iGM_HandlePageChange(nextPage: number): void {
    setPage(nextPage);
    iGM_SyncUrl({ page: nextPage === 1 ? undefined : String(nextPage) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** 收到对方好友申请时跳转到好友标签的收到申请子标签 */
  function iGM_GoIncoming(): void {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "friends");
    params.set("subtab", "incoming");
    router.replace(`/G_Community?${params.toString()}`);
  }

  const activeCategory = categories.find((item) => item.slug === category);

  return (
    <>
      {/* 搜索与发帖入口 */}
      <div className={styles.toolbar}>
        <form className={styles.searchBox} onSubmit={iGM_HandleSearch}>
          <span className={styles.searchIcon}>
            <Search size={15} strokeWidth={2} />
          </span>
          <input
            className={styles.searchInput}
            type="search"
            value={keywordInput}
            placeholder={
              scope === "posts"
                ? t("community.communityPage.searchPlaceholder")
                : t("community.communityPage.searchUsersPlaceholder")
            }
            onChange={(event) => setKeywordInput(event.target.value)}
          />
        </form>
        <div className={hubStyles.scopeRow} role="tablist" aria-label={t("community.communityPage.scopeLabel")}>
          <button
            type="button"
            role="tab"
            aria-selected={scope === "posts"}
            className={`${hubStyles.scopeButton} ${
              scope === "posts" ? hubStyles.scopeButtonActive : ""
            }`}
            onClick={() => iGM_HandleScopeChange("posts")}
          >
            <FileText size={14} strokeWidth={1.8} />
            {t("community.communityPage.scopePosts")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={scope === "users"}
            className={`${hubStyles.scopeButton} ${
              scope === "users" ? hubStyles.scopeButtonActive : ""
            }`}
            onClick={() => iGM_HandleScopeChange("users")}
          >
            <Users size={14} strokeWidth={1.8} />
            {t("community.communityPage.scopeUsers")}
          </button>
        </div>
        {scope === "posts" && (
          <Link href="/G_PostEdit" className={styles.primaryButton}>
            <PenSquare size={15} strokeWidth={1.8} />
            {t("community.communityPage.newPost")}
          </Link>
        )}
      </div>

      {/* 帖子范围：分类筛选条 */}
      {scope === "posts" && (
        <div className={styles.chips}>
          <button
            type="button"
            className={`${styles.chip} ${category === "" ? styles.chipActive : ""}`}
            onClick={() => iGM_HandleCategoryChange("")}
          >
            {t("community.filters.allCategories")}
          </button>
          {categories.map((item) => {
            const labelKey = `community.categories.${item.slug}`;
            const label = t.has(labelKey) ? t(labelKey) : item.name;
            return (
              <button
                key={item.id}
                type="button"
                className={`${styles.chip} ${
                  category === item.slug ? styles.chipActive : ""
                }`}
                onClick={() => iGM_HandleCategoryChange(item.slug)}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* 当前标签/搜索条件提示 */}
      {scope === "posts" && (tag || search) && (
        <div className={styles.activeFilterRow}>
          <span>{t("community.filters.activeFilters")}</span>
          {activeCategory && (
            <span className={styles.filterTag}>
              {t.has(`community.categories.${activeCategory.slug}`)
                ? t(`community.categories.${activeCategory.slug}`)
                : activeCategory.name}
            </span>
          )}
          {tag && <span className={styles.filterTag}>{tag}</span>}
          {search && <span className={styles.filterTag}>{search}</span>}
          {tag && (
            <button type="button" className={styles.clearFilter} onClick={iGM_ClearTag}>
              <X size={12} strokeWidth={2} />
              {t("community.filters.clearTag")}
            </button>
          )}
          {search && (
            <button
              type="button"
              className={styles.clearFilter}
              onClick={iGM_ClearSearch}
            >
              <X size={12} strokeWidth={2} />
              {t("community.filters.clearSearch")}
            </button>
          )}
        </div>
      )}

      {/* 列表主体 */}
      {scope === "users" && !authenticated ? (
        <IGM_EmptyState
          icon={UserRound}
          title={t("community.communityPage.usersLoginTitle")}
          description={t("community.communityPage.usersLoginDesc")}
          action={
            <Link href="/G_Auth/login" className={styles.primaryButton}>
              {t("community.comments.goLogin")}
            </Link>
          }
        />
      ) : scope === "users" && !search ? (
        <IGM_EmptyState
          icon={SearchCode}
          title={t("community.communityPage.usersIdleTitle")}
          description={t("community.communityPage.usersIdleDesc")}
        />
      ) : loading ? (
        <div className={styles.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("community.state.loading")}
        </div>
      ) : errorText ? (
        <div className={styles.sectionCard}>
          <div className={`${styles.alert} ${styles.alertError}`}>{errorText}</div>
          <div>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() =>
                void (scope === "posts" ? iGM_LoadPosts() : iGM_LoadUsers())
              }
            >
              {t("community.state.retry")}
            </button>
          </div>
        </div>
      ) : scope === "posts" && postsData && postsData.items.length > 0 ? (
        <>
          <div className={styles.list}>
            {postsData.items.map((post) => (
              <IGM_PostCard key={post.id} post={post} />
            ))}
          </div>
          <IGM_Pagination
            page={postsData.page}
            totalPages={postsData.totalPages}
            onChange={iGM_HandlePageChange}
          />
        </>
      ) : scope === "users" && usersData && usersData.items.length > 0 ? (
        <>
          <div className={socialStyles.sectionCard}>
            <div className={socialStyles.list}>
              {usersData.items.map((entry) => {
                const profile = entry.user;
                return (
                  <IGM_UserCard
                    key={profile.id}
                    user={profile}
                    subtitle={t("community.communityPage.userUid", {
                      uid: profile.uid,
                    })}
                  >
                    {entry.isSelf ? (
                      <span className={socialStyles.badge}>
                        {t("community.communityPage.userSelf")}
                      </span>
                    ) : (
                      <>
                        <IGM_FriendButton
                          targetId={profile.id}
                          initialState={entry.friendState}
                          onRespond={iGM_GoIncoming}
                        />
                        <Link
                          href={`/G_Community?tab=messages&peerId=${encodeURIComponent(profile.id)}`}
                          className={socialStyles.iconButton}
                          title={t("social.sendMessage")}
                        >
                          <MessageCircle size={15} strokeWidth={1.8} />
                        </Link>
                      </>
                    )}
                  </IGM_UserCard>
                );
              })}
            </div>
          </div>
          <IGM_Pagination
            page={usersData.page}
            totalPages={usersData.totalPages}
            onChange={iGM_HandlePageChange}
          />
        </>
      ) : (
        <IGM_EmptyState
          icon={Inbox}
          title={
            scope === "posts"
              ? t("community.state.noPostsTitle")
              : t("community.communityPage.usersEmptyTitle")
          }
          description={
            scope === "posts"
              ? t("community.state.noPostsDesc")
              : t("community.communityPage.usersEmptyDesc")
          }
          action={
            scope === "posts" ? (
              <Link href="/G_PostEdit" className={styles.primaryButton}>
                <PenSquare size={15} strokeWidth={1.8} />
                {t("community.communityPage.newPost")}
              </Link>
            ) : undefined
          }
        />
      )}
    </>
  );
}

// 导出 //
export default iGM_CommunitySquarePanel;
