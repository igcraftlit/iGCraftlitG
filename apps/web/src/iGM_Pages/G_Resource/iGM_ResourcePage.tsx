/**
 * 文件路径：apps/web/src/iGM_Pages/G_Resource/iGM_ResourcePage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_Resource（静态壳，查询参数驱动分类/标签/搜索/分页）
 * 模块：G_Resource
 * 作用：资源库——资源列表、分类筛选、标签筛选、搜索、分页与上传入口
 * 内容：搜索框、分类胶囊条、标签胶囊条、当前筛选条件、资源卡片列表、
 *       分页、加载/错误/空状态
 * 说明：纯静态 SSG，数据全部在客户端经 iGM_Request 调用本地后端
 */

// 导入依赖 //
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Calendar,
  Download,
  FileArchive,
  HardDrive,
  Library,
  LoaderCircle,
  Search,
  Upload,
  X,
} from "lucide-react";
import {
  iGM_ApiListResourceCategories,
  iGM_ApiListResources,
  type iGM_ResourceCategory,
  type iGM_ResourceListData,
  type iGM_ResourceTag,
} from "../../iGM_Services/iGM_ResourceClient";
import {
  iGM_FilePreviewUrl,
  iGM_FormatFileSize,
} from "../../iGM_Services/iGM_FileClient";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
// JSX 要求组件标识符首字母大写，iGM_ 前缀组件在使用处统一别名为 IGM_
import { iGM_Avatar as IGM_Avatar } from "../../iGM_Components/iGM_Avatar/iGM_Avatar";
import { iGM_Pagination as IGM_Pagination } from "../../iGM_Components/iGM_Pagination/iGM_Pagination";
import { iGM_EmptyState as IGM_EmptyState } from "../../iGM_Components/iGM_EmptyState/iGM_EmptyState";
import pageStyles from "../iGM_Page.module.css";
import styles from "../iGM_Module4.module.css";

// 类型定义 //
/** 每页资源数 */
const iGM_ResourcePageSize = 10;
/** 标签筛选条最多展示的标签数 */
const iGM_ResourceTagLimit = 12;
/** 资源卡片上最多展示的标签数 */
const iGM_ResourceCardTagLimit = 5;

// 核心逻辑 //
/** 资源库列表页主体（在 Suspense 内使用 useSearchParams） */
export function iGM_ResourcePage() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();

  // 筛选与分页状态：首屏从查询参数读取，保证静态壳可分享链接
  const [categories, setCategories] = useState<iGM_ResourceCategory[]>([]);
  const [category, setCategory] = useState(searchParams.get("category") ?? "");
  const [tag, setTag] = useState(searchParams.get("tag") ?? "");
  const [keywordInput, setKeywordInput] = useState(
    searchParams.get("q") ?? "",
  );
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<iGM_ResourceListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);

  /** 拉取资源分类字典（仅一次） */
  useEffect(() => {
    let cancelled = false;
    iGM_ApiListResourceCategories()
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

  /** 按当前筛选条件拉取资源列表 */
  const iGM_LoadResources = useCallback(async () => {
    setLoading(true);
    setErrorText(null);
    try {
      const response = await iGM_ApiListResources({
        category: category || undefined,
        tag: tag || undefined,
        search: search || undefined,
        page,
        pageSize: iGM_ResourcePageSize,
      });
      setData(response.data);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setLoading(false);
    }
  }, [category, tag, search, page, t]);

  useEffect(() => {
    void iGM_LoadResources();
  }, [iGM_LoadResources]);

  /** 从当前页资源中收集去重标签（无独立标签字典接口） */
  const availableTags = useMemo<iGM_ResourceTag[]>(() => {
    const collected = new Map<string, iGM_ResourceTag>();
    for (const item of data?.items ?? []) {
      for (const itemTag of item.tags) {
        if (collected.size >= iGM_ResourceTagLimit) break;
        if (!collected.has(itemTag.slug)) collected.set(itemTag.slug, itemTag);
      }
    }
    return [...collected.values()];
  }, [data]);

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
    router.replace(query ? `/G_Resource?${query}` : "/G_Resource");
  }

  /** 切换分类：回到第一页并同步地址栏 */
  function iGM_HandleCategoryChange(slug: string): void {
    setCategory(slug);
    setPage(1);
    iGM_SyncUrl({ category: slug, tag, q: search });
  }

  /** 切换标签：回到第一页并同步地址栏 */
  function iGM_HandleTagChange(slug: string): void {
    setTag(slug);
    setPage(1);
    iGM_SyncUrl({ category, tag: slug, q: search });
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
  const activeCategoryLabel = activeCategory
    ? t.has(`resource.categories.${activeCategory.slug}`)
      ? t(`resource.categories.${activeCategory.slug}`)
      : activeCategory.name
    : null;
  const activeTagLabel =
    availableTags.find((item) => item.slug === tag)?.name ?? tag;

  return (
    <div className={pageStyles.page}>
      {/* 页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <Library size={22} strokeWidth={1.8} />
          </span>
          {t("resource.title")}
        </h1>
        <p className={pageStyles.pageDescription}>{t("resource.description")}</p>
      </header>

      {/* 搜索与上传入口 */}
      <div className={styles.toolbar}>
        <form className={styles.searchBox} onSubmit={iGM_HandleSearch}>
          <span className={styles.searchIcon}>
            <Search size={15} strokeWidth={2} />
          </span>
          <input
            className={styles.searchInput}
            type="search"
            value={keywordInput}
            placeholder={t("resource.searchPlaceholder")}
            onChange={(event) => setKeywordInput(event.target.value)}
          />
        </form>
        <Link href="/G_ResourceEdit" className={styles.primaryButton}>
          <Upload size={15} strokeWidth={1.8} />
          {t("resource.upload")}
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
          const labelKey = `resource.categories.${item.slug}`;
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

      {/* 标签筛选条：标签来源为当前页资源，无独立标签字典 */}
      {availableTags.length > 0 && (
        <div className={styles.chips}>
          {availableTags.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.chip} ${
                tag === item.slug ? styles.chipActive : ""
              }`}
              onClick={() => iGM_HandleTagChange(item.slug)}
            >
              {item.name}
            </button>
          ))}
        </div>
      )}

      {/* 当前筛选条件提示 */}
      {(category || tag || search) && (
        <div className={styles.activeFilterRow}>
          <span>{t("community.filters.activeFilters")}</span>
          {activeCategoryLabel && (
            <span className={styles.filterTag}>{activeCategoryLabel}</span>
          )}
          {tag && <span className={styles.filterTag}>{activeTagLabel}</span>}
          {search && <span className={styles.filterTag}>{search}</span>}
          {tag && (
            <button
              type="button"
              className={styles.clearFilter}
              onClick={iGM_ClearTag}
            >
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
          {t("resource.stateLoading")}
        </div>
      ) : errorText ? (
        <div className={styles.sectionCard}>
          <div className={`${styles.alert} ${styles.alertError}`}>{errorText}</div>
          <div>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => void iGM_LoadResources()}
            >
              {t("community.state.retry")}
            </button>
          </div>
        </div>
      ) : data && data.items.length > 0 ? (
        <>
          <div className={styles.list}>
            {data.items.map((item) => {
              const uploaderName =
                item.uploader.displayName ?? item.uploader.username;
              return (
                <article key={item.id} className={styles.resourceCard}>
                  {/* 封面 */}
                  <div className={styles.resourceCover}>
                    {item.cover ? (
                      <img
                        src={iGM_FilePreviewUrl(item.cover.id)}
                        alt={item.title}
                        loading="lazy"
                      />
                    ) : (
                      <div className={styles.resourceCoverFallback}>
                        <FileArchive size={28} strokeWidth={1.5} />
                      </div>
                    )}
                  </div>

                  {/* 主体信息 */}
                  <div className={styles.resourceMain}>
                    <div className={styles.resourceTitleRow}>
                      <Link
                        href={`/G_ResourceDetail?resourceId=${encodeURIComponent(item.id)}`}
                        className={styles.resourceTitle}
                      >
                        {item.title}
                      </Link>
                      {item.status === "hidden" && (
                        <span className={`${styles.badge} ${styles.badgeHidden}`}>
                          {t("resource.hide")}
                        </span>
                      )}
                    </div>
                    {item.excerpt && (
                      <p className={styles.resourceExcerpt}>{item.excerpt}</p>
                    )}
                    <div className={styles.resourceMeta}>
                      <span className={styles.resourceMetaItem}>
                        <Download size={13} strokeWidth={1.8} />
                        {t("resource.downloadCount", {
                          count: item.downloadCount,
                        })}
                      </span>
                      <span className={styles.resourceMetaItem}>
                        <HardDrive size={13} strokeWidth={1.8} />
                        {iGM_FormatFileSize(item.file.size)}
                      </span>
                      <span className={styles.resourceMetaItem}>
                        <Calendar size={13} strokeWidth={1.8} />
                        {new Date(item.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {item.tags.length > 0 && (
                      <div className={styles.resourceTags}>
                        {item.tags.slice(0, iGM_ResourceCardTagLimit).map((itemTag) => (
                          <span key={itemTag.id} className={styles.resourceTag}>
                            {itemTag.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 上传者 */}
                  <div className={styles.resourceFooter}>
                    <IGM_Avatar
                      size="sm"
                      src={item.uploader.avatar}
                      name={uploaderName}
                    />
                    <span>{uploaderName}</span>
                  </div>
                </article>
              );
            })}
          </div>
          <IGM_Pagination
            page={data.page}
            totalPages={data.totalPages}
            onChange={iGM_HandlePageChange}
          />
        </>
      ) : (
        <IGM_EmptyState
          icon={Library}
          title={t("resource.empty")}
          description={t("resource.emptyDescription")}
        />
      )}
    </div>
  );
}

// 导出 //
export default iGM_ResourcePage;
