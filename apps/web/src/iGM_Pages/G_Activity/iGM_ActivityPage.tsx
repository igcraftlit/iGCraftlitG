/**
 * 文件路径：apps/web/src/iGM_Pages/G_Activity/iGM_ActivityPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_Activity（静态壳，查询参数驱动状态筛选/搜索/分页）
 * 模块：G_Activity
 * 作用：社区活动列表——活动卡片展示、状态筛选、搜索、分页与创建入口
 * 内容：页头、搜索框与创建按钮、状态胶囊筛选条、活动卡片列表、分页、
 *       加载/错误/空状态
 * 说明：纯静态 SSG，数据全部在客户端经 iGM_Request 调用本地后端
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  CalendarDays,
  CalendarPlus,
  Clock,
  LoaderCircle,
  MapPin,
  Search,
  Users,
} from "lucide-react";
import {
  iGM_ApiListActivities,
  type iGM_ActivityListData,
  type iGM_ActivityStatus,
} from "../../iGM_Services/iGM_ActivityClient";
import { iGM_FilePreviewUrl } from "../../iGM_Services/iGM_FileClient";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
// JSX 要求组件标识符首字母大写，iGM_ 前缀组件在使用处统一别名为 IGM_
import { iGM_Avatar as IGM_Avatar } from "../../iGM_Components/iGM_Avatar/iGM_Avatar";
import { iGM_Pagination as IGM_Pagination } from "../../iGM_Components/iGM_Pagination/iGM_Pagination";
import { iGM_EmptyState as IGM_EmptyState } from "../../iGM_Components/iGM_EmptyState/iGM_EmptyState";
import pageStyles from "../iGM_Page.module.css";
import styles from "../iGM_Module4.module.css";

// 类型定义 //
/** 每页活动数 */
const iGM_ActivityPageSize = 10;

/** 状态筛选项：空字符串表示全部 */
const iGM_StatusFilters: Array<iGM_ActivityStatus | ""> = [
  "",
  "draft",
  "open",
  "closed",
];

/** 活动状态到徽标样式的映射 */
const iGM_StatusBadgeClass: Record<iGM_ActivityStatus, string> = {
  draft: styles.badgeDraft,
  open: styles.badgeOpen,
  closed: styles.badgeClosed,
};

// 核心逻辑 //
/** 解析地址栏状态参数：非合法状态一律视为“全部” */
function iGM_ReadStatusFilter(value: string | null): iGM_ActivityStatus | "" {
  return value === "draft" || value === "open" || value === "closed" ? value : "";
}

/** 活动列表页主体（在 Suspense 内使用 useSearchParams） */
export function iGM_ActivityPage() {
  const t = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();

  // 筛选与分页状态：首屏从查询参数读取，保证静态壳可分享链接
  const [status, setStatus] = useState<iGM_ActivityStatus | "">(
    iGM_ReadStatusFilter(searchParams.get("status")),
  );
  const [keywordInput, setKeywordInput] = useState(searchParams.get("q") ?? "");
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<iGM_ActivityListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);

  /** 按当前筛选条件拉取活动列表 */
  const iGM_LoadActivities = useCallback(async () => {
    setLoading(true);
    setErrorText(null);
    try {
      const response = await iGM_ApiListActivities({
        status: status || undefined,
        search: search || undefined,
        page,
        pageSize: iGM_ActivityPageSize,
      });
      setData(response.data);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setLoading(false);
    }
  }, [status, search, page, t]);

  useEffect(() => {
    void iGM_LoadActivities();
  }, [iGM_LoadActivities]);

  /** 将当前筛选条件同步到地址栏，便于分享与浏览器前进后退 */
  function iGM_SyncUrl(next: {
    status?: iGM_ActivityStatus | "";
    q?: string;
  }): void {
    const params = new URLSearchParams();
    if (next.status) params.set("status", next.status);
    if (next.q) params.set("q", next.q);
    const query = params.toString();
    router.replace(query ? `/G_Activity?${query}` : "/G_Activity");
  }

  /** 切换状态筛选：回到第一页并同步地址栏 */
  function iGM_HandleStatusChange(nextStatus: iGM_ActivityStatus | ""): void {
    setStatus(nextStatus);
    setPage(1);
    iGM_SyncUrl({ status: nextStatus, q: search });
  }

  /** 提交搜索 */
  function iGM_HandleSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const keyword = keywordInput.trim();
    setSearch(keyword);
    setPage(1);
    iGM_SyncUrl({ status, q: keyword });
  }

  /** 翻页后回到列表顶部 */
  function iGM_HandlePageChange(nextPage: number): void {
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className={pageStyles.page}>
      {/* 页头 */}
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <CalendarDays size={22} strokeWidth={1.8} />
          </span>
          {t("activity.title")}
        </h1>
        <p className={pageStyles.pageDescription}>{t("activity.description")}</p>
      </header>

      {/* 搜索与创建入口 */}
      <div className={styles.toolbar}>
        <form className={styles.searchBox} onSubmit={iGM_HandleSearch}>
          <span className={styles.searchIcon}>
            <Search size={15} strokeWidth={2} />
          </span>
          <input
            className={styles.searchInput}
            type="search"
            value={keywordInput}
            placeholder={t("activity.searchPlaceholder")}
            onChange={(event) => setKeywordInput(event.target.value)}
          />
        </form>
        <Link href="/G_ActivityEdit" className={styles.primaryButton}>
          <CalendarPlus size={15} strokeWidth={1.8} />
          {t("activity.create")}
        </Link>
      </div>

      {/* 状态筛选条 */}
      <div className={styles.chips}>
        {iGM_StatusFilters.map((item) => (
          <button
            key={item || "all"}
            type="button"
            className={`${styles.chip} ${status === item ? styles.chipActive : ""}`}
            onClick={() => iGM_HandleStatusChange(item)}
          >
            {item === "" ? t("activity.filterAll") : t(`activity.statusLabel.${item}`)}
          </button>
        ))}
      </div>

      {/* 列表主体 */}
      {loading ? (
        <div className={styles.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("activity.stateLoading")}
        </div>
      ) : errorText ? (
        <div className={styles.sectionCard}>
          <div className={`${styles.alert} ${styles.alertError}`}>{errorText}</div>
          <div>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => void iGM_LoadActivities()}
            >
              {t("community.state.retry")}
            </button>
          </div>
        </div>
      ) : data && data.items.length > 0 ? (
        <>
          <div className={styles.list}>
            {data.items.map((item) => {
              const creatorName = item.creator.displayName ?? item.creator.username;
              return (
                <article key={item.id} className={styles.activityCard}>
                  {/* 封面 */}
                  <div className={styles.activityCover}>
                    {item.cover ? (
                      <img
                        src={iGM_FilePreviewUrl(item.cover.id)}
                        alt={item.title}
                        loading="lazy"
                      />
                    ) : (
                      <div className={styles.activityCoverFallback}>
                        <CalendarDays size={28} strokeWidth={1.5} />
                      </div>
                    )}
                  </div>

                  {/* 主体 */}
                  <div className={styles.activityMain}>
                    <div className={styles.activityTitleRow}>
                      <Link
                        href={`/G_ActivityDetail?activityId=${encodeURIComponent(item.id)}`}
                        className={styles.activityTitle}
                      >
                        {item.title}
                      </Link>
                      <span
                        className={`${styles.badge} ${iGM_StatusBadgeClass[item.status]}`}
                      >
                        {t(`activity.statusLabel.${item.status}`)}
                      </span>
                    </div>
                    <p className={styles.activityExcerpt}>{item.excerpt}</p>
                    <div className={styles.activityMeta}>
                      {item.location && (
                        <span className={styles.activityMetaItem}>
                          <MapPin size={13} strokeWidth={1.8} />
                          {item.location}
                        </span>
                      )}
                      {(item.startTime || item.endTime) && (
                        <span className={styles.activityMetaItem}>
                          <Clock size={13} strokeWidth={1.8} />
                          {item.startTime
                            ? new Date(item.startTime).toLocaleString()
                            : ""}
                          {item.startTime && item.endTime ? " - " : ""}
                          {item.endTime
                            ? new Date(item.endTime).toLocaleString()
                            : ""}
                        </span>
                      )}
                      <span className={styles.activityMetaItem}>
                        <Users size={13} strokeWidth={1.8} />
                        {t("activity.registeredCount", {
                          count: item.registeredCount,
                        })}
                      </span>
                    </div>
                    <div className={styles.activityFooter}>
                      <IGM_Avatar
                        src={item.creator.avatar}
                        name={creatorName}
                        size="sm"
                      />
                      <span>{creatorName}</span>
                    </div>
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
          icon={CalendarDays}
          title={t("activity.empty")}
          description={t("activity.emptyDescription")}
        />
      )}
    </div>
  );
}

// 导出 //
export default iGM_ActivityPage;
