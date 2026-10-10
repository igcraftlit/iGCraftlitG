/**
 * 文件路径：apps/web/src/iGM_Pages/G_Search/iGM_SearchPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_Search?q=&type=&page=
 * 模块：G_Search
 * 作用：全站搜索结果页——关键词输入、类型筛选、结果列表、分页与空状态
 * 内容：顶部搜索框（可改词重搜）、分类标签（全部/帖子/资源/用户/组织）、
 *       结果条目（类型图标 + 标题 + 摘要 + 跳转链接，关键词高亮）、分页、空结果提示
 * 说明：纯客户端渲染，数据经 iGM_SearchClient 从后端 /G_Search 获取；
 *       查询状态与 URL 同步，便于分享与前进后退
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Building2,
  FileText,
  LoaderCircle,
  Package,
  Search,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import { iGM_Avatar as IGM_Avatar } from "../../iGM_Components/iGM_Avatar/iGM_Avatar";
import { iGM_Highlight as IGM_Highlight } from "../../iGM_Components/iGM_Highlight/iGM_Highlight";
import { iGM_Pagination as IGM_Pagination } from "../../iGM_Components/iGM_Pagination/iGM_Pagination";
import { iGM_EmptyState as IGM_EmptyState } from "../../iGM_Components/iGM_EmptyState/iGM_EmptyState";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_UseLocaleRouter } from "../../iGM_i18n/iGM_UseLocaleRouter";
import {
  iGM_ApiSearch,
  type iGM_SearchData,
  type iGM_SearchItem,
  type iGM_SearchType,
  type iGM_SearchTypeFilter,
} from "../../iGM_Services/iGM_SearchClient";
import pageStyles from "../iGM_Page.module.css";
import styles from "./iGM_Search.module.css";

// 类型定义 //
/** 类型标签配置 */
interface iGM_SearchTab {
  value: iGM_SearchTypeFilter;
  key: string;
}

/** 各实体类型对应的图标（结果条目与标签共用） */
const iGM_TypeIcon: Record<iGM_SearchType, LucideIcon> = {
  post: FileText,
  resource: Package,
  user: UserRound,
  org: Building2,
};

/** 分类标签顺序 */
const iGM_SearchTabs: iGM_SearchTab[] = [
  { value: "all", key: "search.type.all" },
  { value: "post", key: "search.type.post" },
  { value: "resource", key: "search.type.resource" },
  { value: "user", key: "search.type.user" },
  { value: "org", key: "search.type.org" },
];

/** 归一化类型参数（非法值回退 all） */
function iGM_ReadType(raw: string | null): iGM_SearchTypeFilter {
  return raw === "post" || raw === "resource" || raw === "user" || raw === "org"
    ? raw
    : "all";
}

// 核心逻辑 //
/** 全站搜索页 */
export function iGM_SearchPage() {
  const t = useTranslations();
  const router = iGM_UseLocaleRouter();
  const searchParams = useSearchParams();

  const keyword = (searchParams.get("q") ?? "").trim();
  const type = iGM_ReadType(searchParams.get("type"));
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);

  /** 搜索框输入（与已提交关键词解耦，便于编辑后重搜） */
  const [input, setInput] = useState(keyword);
  const [data, setData] = useState<iGM_SearchData | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  // 关键词变化时同步输入框（如浏览器前进/后退或点击其他入口跳转）
  useEffect(() => {
    setInput(keyword);
  }, [keyword]);

  const iGM_Load = useCallback(async () => {
    if (!keyword) {
      setData(null);
      setErrorText(null);
      return;
    }
    setLoading(true);
    setErrorText(null);
    try {
      const response = await iGM_ApiSearch({ q: keyword, type, page });
      setData(response.data);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setLoading(false);
    }
  }, [keyword, type, page, t]);

  useEffect(() => {
    void iGM_Load();
  }, [iGM_Load]);

  /** 跳转搜索（更新 URL 并触发加载） */
  function iGM_Go(nextQ: string, nextType: iGM_SearchTypeFilter, nextPage = 1) {
    const search = new URLSearchParams();
    if (nextQ) search.set("q", nextQ);
    if (nextType !== "all") search.set("type", nextType);
    if (nextPage > 1) search.set("page", String(nextPage));
    const query = search.toString();
    router.push(`/G_Search${query ? `?${query}` : ""}`);
  }

  /** 提交搜索框 */
  function iGM_HandleSubmit(event: React.FormEvent) {
    event.preventDefault();
    iGM_Go(input.trim(), type, 1);
  }

  /** 渲染单条结果 */
  function iGM_RenderItem(item: iGM_SearchItem) {
    const Icon = iGM_TypeIcon[item.type];
    return (
      <li key={`${item.type}-${item.id}`}>
        <Link href={item.url} className={styles.result}>
          <span className={styles.resultIcon} aria-hidden>
            {item.avatar ? (
              <IGM_Avatar src={item.avatar} name={item.title} size="sm" />
            ) : (
              <Icon size={18} strokeWidth={1.8} />
            )}
          </span>
          <span className={styles.resultBody}>
            <span className={styles.resultTitle}>
              <IGM_Highlight text={item.title} keyword={keyword} />
            </span>
            {item.excerpt && (
              <span className={styles.resultExcerpt}>
                <IGM_Highlight text={item.excerpt} keyword={keyword} />
              </span>
            )}
          </span>
          <span className={styles.resultType}>{t(`search.type.${item.type}`)}</span>
        </Link>
      </li>
    );
  }

  return (
    <div className={pageStyles.page}>
      {/* 页头：搜索框 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <Search size={22} strokeWidth={1.8} />
          </span>
          {t("search.title")}
        </h1>
        <form className={styles.searchForm} onSubmit={iGM_HandleSubmit} role="search">
          <span className={styles.searchField}>
            <Search size={16} strokeWidth={1.8} className={styles.searchIcon} />
            <input
              type="search"
              className={styles.searchInput}
              value={input}
              placeholder={t("search.placeholder")}
              aria-label={t("search.placeholder")}
              onChange={(event) => setInput(event.target.value)}
            />
          </span>
          <button type="submit" className={styles.searchButton}>
            {t("search.submit")}
          </button>
        </form>
      </header>

      {/* 分类标签 */}
      <nav className={styles.tabs} aria-label={t("search.type.label")}>
        {iGM_SearchTabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={`${styles.tab} ${type === tab.value ? styles.tabActive : ""}`}
            aria-pressed={type === tab.value}
            onClick={() => iGM_Go(keyword, tab.value, 1)}
          >
            {t(tab.key)}
          </button>
        ))}
      </nav>

      {/* 结果区 */}
      {!keyword ? (
        <IGM_EmptyState
          icon={Search}
          title={t("search.initial.title")}
          description={t("search.initial.description")}
        />
      ) : loading ? (
        <div className={styles.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("search.state.loading")}
        </div>
      ) : errorText ? (
        <div className={styles.sectionCard}>
          <div className={styles.alertError}>{errorText}</div>
          <button
            type="button"
            className={styles.ghostButton}
            onClick={() => void iGM_Load()}
          >
            {t("search.state.retry")}
          </button>
        </div>
      ) : data && data.items.length > 0 ? (
        <>
          <p className={styles.summary}>
            {t("search.summary", { count: data.total })}
          </p>
          <ul className={styles.results}>{data.items.map(iGM_RenderItem)}</ul>
          <IGM_Pagination
            page={data.page}
            totalPages={data.totalPages}
            onChange={(next) => iGM_Go(keyword, type, next)}
          />
        </>
      ) : (
        <IGM_EmptyState
          icon={Search}
          title={t("search.empty.title")}
          description={t("search.empty.description")}
        />
      )}
    </div>
  );
}

// 导出 //
export default iGM_SearchPage;
