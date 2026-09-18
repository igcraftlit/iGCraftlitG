/**
 * 文件路径：apps/web/src/iGM_Pages/G_Community/iGM_CommunityPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_Community（静态壳，查询参数驱动分类/标签/搜索/分页）
 * 模块：G_Community
 * 作用：社区广场——帖子列表、分类筛选、标签筛选、搜索、分页与发帖入口
 * 内容：搜索框、分类胶囊条、当前筛选条件、帖子卡片列表、分页、加载/错误/空状态
 * 说明：纯静态 SSG，数据全部在客户端经 iGM_Request 调用本地后端
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Inbox,
  LoaderCircle,
  PenSquare,
  Search,
  Users,
  X,
} from "lucide-react";
import {
  iGM_ApiListCategories,
  iGM_ApiListPosts,
  type iGM_Category,
  type iGM_PostListData,
} from "../../iGM_Services/iGM_CommunityClient";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_PostCard as IGM_PostCard } from "../../iGM_Components/iGM_PostCard/iGM_PostCard";
import { iGM_Pagination as IGM_Pagination } from "../../iGM_Components/iGM_Pagination/iGM_Pagination";
import { iGM_EmptyState as IGM_EmptyState } from "../../iGM_Components/iGM_EmptyState/iGM_EmptyState";
import pageStyles from "../iGM_Page.module.css";
import styles from "../iGM_Community.module.css";

// 类型定义 //
// （页面状态均为基础类型，帖子数据类型来自 iGM_CommunityClient）

// 核心逻辑 //
/** 社区广场页主体（在 Suspense 内使用 useSearchParams） */
export function iGM_CommunityPage() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();

  // 筛选与分页状态：首屏从查询参数读取，保证静态壳可分享链接
  const [categories, setCategories] = useState<iGM_Category[]>([]);
  const [category, setCategory] = useState(searchParams.get("category") ?? "");
  const [tag, setTag] = useState(searchParams.get("tag") ?? "");
  const [keywordInput, setKeywordInput] = useState(
    searchParams.get("q") ?? "",
  );
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<iGM_PostListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);

  /** 拉取分类列表（仅一次） */
  useEffect(() => {
    let cancelled = false;
    iGM_ApiListCategories()
      .then((response) => {
        if (!cancelled) setCategories(response.data?.items ?? []);
      })
      .catch(() => {
        // 分类加载失败不阻塞列表，筛选条退化为仅“全部”
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** 按当前筛选条件拉取帖子列表 */
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
      setData(response.data);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setLoading(false);
    }
  }, [category, tag, search, page, t]);

  useEffect(() => {
    void iGM_LoadPosts();
  }, [iGM_LoadPosts]);

  /** 将当前筛选条件同步到地址栏，便于分享与浏览器前进后退 */
  function iGM_SyncUrl(next: {
    category?: string;
    tag?: string;
    q?: string;
  }): void {
    const params = new URLSearchParams();
    if (next.category) params.set("category", next.category);
    if (next.tag) params.set("tag", next.tag);
    if (next.q) params.set("q", next.q);
    const query = params.toString();
    router.replace(query ? `/G_Community?${query}` : "/G_Community");
  }

  /** 切换分类：回到第一页并同步地址栏 */
  function iGM_HandleCategoryChange(slug: string): void {
    setCategory(slug);
    setPage(1);
    iGM_SyncUrl({ category: slug, tag, q: search });
  }

  /** 清除标签筛选 */
  function iGM_ClearTag(): void {
    setTag("");
    setPage(1);
    iGM_SyncUrl({ category, q: search });
  }

  /** 提交搜索 */
  function iGM_HandleSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const keyword = keywordInput.trim();
    setSearch(keyword);
    setPage(1);
    iGM_SyncUrl({ category, tag, q: keyword });
  }

  /** 清除搜索词 */
  function iGM_ClearSearch(): void {
    setKeywordInput("");
    setSearch("");
    setPage(1);
    iGM_SyncUrl({ category, tag });
  }

  /** 翻页后回到列表顶部 */
  function iGM_HandlePageChange(nextPage: number): void {
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const activeCategory = categories.find((item) => item.slug === category);

  return (
    <div className={pageStyles.page}>
      {/* 页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <Users size={22} strokeWidth={1.8} />
          </span>
          {t("community.communityPage.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("community.communityPage.description")}
        </p>
      </header>

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
            placeholder={t("community.communityPage.searchPlaceholder")}
            onChange={(event) => setKeywordInput(event.target.value)}
          />
        </form>
        <Link href="/G_PostEdit" className={styles.primaryButton}>
          <PenSquare size={15} strokeWidth={1.8} />
          {t("community.communityPage.newPost")}
        </Link>
      </div>

      {/* 分类筛选条 */}
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

      {/* 当前标签/搜索条件提示 */}
      {(tag || search) && (
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
      {loading ? (
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
              onClick={() => void iGM_LoadPosts()}
            >
              {t("community.state.retry")}
            </button>
          </div>
        </div>
      ) : data && data.items.length > 0 ? (
        <>
          <div className={styles.list}>
            {data.items.map((post) => (
              <IGM_PostCard key={post.id} post={post} />
            ))}
          </div>
          <IGM_Pagination
            page={data.page}
            totalPages={data.totalPages}
            onChange={iGM_HandlePageChange}
          />
        </>
      ) : (
        <IGM_EmptyState
          icon={Inbox}
          title={t("community.state.noPostsTitle")}
          description={t("community.state.noPostsDesc")}
          action={
            <Link href="/G_PostEdit" className={styles.primaryButton}>
              <PenSquare size={15} strokeWidth={1.8} />
              {t("community.communityPage.newPost")}
            </Link>
          }
        />
      )}
    </div>
  );
}

// 导出 //
export default iGM_CommunityPage;
