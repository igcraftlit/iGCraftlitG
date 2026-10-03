/**
 * 文件路径：apps/web/src/iGM_Pages/G_Minecraft/iGM_MinecraftPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_Minecraft?q=&type=&page=（旧 source/version/loader/platform 参数忽略）
 * 模块：G_Minecraft
 * 作用：Minecraft 资源生态融合页——本站资源与 Modrinth 资源统一搜索、
 *       混合排序、统一卡片，按来源分流到各自详情页
 * 内容：分区横幅、全局搜索框、五类资源胶囊、来源降级提示、统一资源卡片
 *       （封面/来源徽章/类型/名称/简介/作者/下载量）、分页、空态与错误重试
 * 说明：
 *   - 纯静态 SSG，数据在客户端经 iGM_Request 调用本地后端
 *   - 社交生态优化：移除来源切换与本站专属筛选，统一走
 *     GET /G_Resource/unified-search，不区分来源混合排序
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  Blocks,
  Download,
  LoaderCircle,
  Package,
  Search,
  Upload,
  User,
} from "lucide-react";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import {
  iGM_ApiUnifiedResourceSearch,
  iGM_UnifiedResourceTypes,
  type iGM_UnifiedResource,
  type iGM_UnifiedResourceType,
  type iGM_UnifiedResourceTypeFilter,
} from "../../iGM_Services/iGM_ResourceClient";
import { iGM_ResolveMediaUrl } from "../../iGM_Services/iGM_FileClient";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_UseLocaleRouter } from "../../iGM_i18n/iGM_UseLocaleRouter";
import { iGM_Pagination as IGM_Pagination } from "../../iGM_Components/iGM_Pagination/iGM_Pagination";
import { iGM_EmptyState as IGM_EmptyState } from "../../iGM_Components/iGM_EmptyState/iGM_EmptyState";
import pageStyles from "../iGM_Page.module.css";
import m10 from "../iGM_Module10.module.css";
import styles from "../iGM_Minecraft.module.css";

// 类型定义 //
/** 融合搜索固定页大小（与后端 iGM_UnifiedResourceDefaultPageSize 对齐） */
const iGM_PageSize = 24;

/** 合法类型参数白名单；非法值（含旧来源参数）归一化为 all */
function iGM_ResolveTypeFilter(raw: string | null): iGM_UnifiedResourceTypeFilter {
  return raw && (iGM_UnifiedResourceTypes as readonly string[]).includes(raw)
    ? (raw as iGM_UnifiedResourceType)
    : "all";
}

// 核心逻辑 //
/** Minecraft 融合资源页主体（在 Suspense 内使用 useSearchParams） */
export function iGM_MinecraftPage() {
  const t = useTranslations();
  const router = iGM_UseLocaleRouter();
  const searchParams = useSearchParams();

  const [type, setType] = useState<iGM_UnifiedResourceTypeFilter>(() =>
    iGM_ResolveTypeFilter(searchParams.get("type")),
  );
  const [keywordInput, setKeywordInput] = useState(searchParams.get("q") ?? "");
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [page, setPage] = useState(() => {
    const raw = Number.parseInt(searchParams.get("page") ?? "1", 10);
    return Number.isFinite(raw) && raw > 0 ? raw : 1;
  });
  const [data, setData] = useState<iGM_UnifiedResource[] | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const [degraded, setDegraded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);

  /** 同步筛选状态到地址栏（保留既有参数语义，忽略历史 source 等参数） */
  const iGM_SyncUrl = useCallback(
    (next: { q?: string; type?: iGM_UnifiedResourceTypeFilter; page?: number }) => {
      const params = new URLSearchParams();
      const q = next.q ?? search;
      const typeValue = next.type ?? type;
      const pageValue = next.page ?? page;
      if (q) params.set("q", q);
      if (typeValue !== "all") params.set("type", typeValue);
      if (pageValue > 1) params.set("page", String(pageValue));
      router.replace(`/G_Minecraft?${params.toString()}`);
    },
    [router, search, type, page],
  );

  /** 拉取融合搜索结果 */
  const iGM_Load = useCallback(async () => {
    setLoading(true);
    setErrorText(null);
    try {
      const response = await iGM_ApiUnifiedResourceSearch({
        q: search || undefined,
        type,
        page,
        pageSize: iGM_PageSize,
      });
      const payload = response.data;
      if (!payload) {
        setData([]);
        setTotalPages(1);
        setDegraded(false);
        return;
      }
      setData(payload.items);
      setTotalPages(payload.totalPages);
      // 以后端归一化后的类型为准，避免非法入参残留
      setType(payload.type);
      setDegraded(payload.degraded);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [search, type, page, t]);

  useEffect(() => {
    void iGM_Load();
  }, [iGM_Load]);

  /** 提交关键词搜索 */
  function iGM_HandleSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const keyword = keywordInput.trim();
    setSearch(keyword);
    setPage(1);
    iGM_SyncUrl({ q: keyword, page: 1 });
  }

  /** 切换资源类型胶囊 */
  function iGM_HandleTypeChange(next: iGM_UnifiedResourceTypeFilter): void {
    setType(next);
    setPage(1);
    iGM_SyncUrl({ type: next, page: 1 });
  }

  /** 翻页 */
  function iGM_HandlePageChange(next: number): void {
    setPage(next);
    iGM_SyncUrl({ page: next });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** 渲染单张统一资源卡片 */
  function iGM_RenderUnifiedCard(item: iGM_UnifiedResource) {
    const isSite = item.source === "site";
    return (
      <article key={`${item.source}:${item.sourceId}`} className={styles.urCard}>
        <Link href={item.detailUrl} className={styles.urCover}>
          {item.coverUrl ? (
            <img
              src={iGM_ResolveMediaUrl(item.coverUrl)}
              alt={item.name}
              loading="lazy"
              crossOrigin={isSite ? "anonymous" : undefined}
            />
          ) : (
            <span className={styles.urCoverFallback}>
              <Package size={20} strokeWidth={1.5} />
            </span>
          )}
          <span className={styles.urBadges}>
            <span
              className={`${styles.urSourceBadge} ${
                isSite ? styles.urSourceSite : styles.urSourceModrinth
              }`}
            >
              {isSite
                ? t("minecraft.sourceSite")
                : t("thirdParty.sourceModrinth")}
            </span>
          </span>
          <span className={styles.urTypeBadge}>
            {t(`thirdParty.resourceTypes.${item.type}`)}
          </span>
        </Link>

        <div className={styles.urBody}>
          <Link href={item.detailUrl} className={styles.urTitle}>
            {item.name}
          </Link>
          {item.summary && (
            <p className={styles.urSummary}>{item.summary}</p>
          )}
          <div className={styles.urMeta}>
            <span className={styles.urMetaItem}>
              <Download size={12} strokeWidth={1.8} />
              {t("thirdParty.downloadCount", { count: item.downloads })}
            </span>
            {item.author.name && (
              <span className={`${styles.urMetaItem} ${styles.urMetaAuthor}`}>
                <User size={12} strokeWidth={1.8} />
                {item.author.name}
              </span>
            )}
          </div>
        </div>
      </article>
    );
  }

  return (
    <div className={pageStyles.page}>
      {/* 分区横幅 */}
      <section className={styles.mcHero}>
        <span className={styles.mcHeroTitle}>
          <span className={styles.mcHeroIcon}>
            <Blocks size={24} strokeWidth={1.8} />
          </span>
          {t("minecraft.title")}
        </span>
        <p className={styles.mcHeroDescription}>{t("minecraft.description")}</p>
      </section>

      {/* 搜索与上传入口 */}
      <div className={styles.toolbar}>
        <form className={styles.searchBox} onSubmit={iGM_HandleSearch}>
          <Search size={15} strokeWidth={2} color="var(--igm-text-muted)" />
          <input
            className={styles.searchInput}
            type="search"
            value={keywordInput}
            placeholder={t("minecraft.searchPlaceholder")}
            onChange={(event) => setKeywordInput(event.target.value)}
          />
        </form>
        <Link href="/G_MinecraftVersions" className={m10.ghostButton}>
          <Blocks size={15} strokeWidth={1.8} />
          {t("minecraft.gameVersions")}
        </Link>
        <Link href="/G_MinecraftUpload" className={m10.primaryButton}>
          <Upload size={15} strokeWidth={1.8} />
          {t("minecraft.upload")}
        </Link>
      </div>

      {/* 统一类型胶囊（全类型 + 模组/光影/资源包/地图/数据包） */}
      <div className={m10.sectionCard}>
        <div className={styles.urTypeRow}>
          <button
            type="button"
            className={`${styles.urTypeChip} ${
              type === "all" ? styles.urTypeChipActive : ""
            }`}
            onClick={() => iGM_HandleTypeChange("all")}
          >
            {t("minecraft.all")}
          </button>
          {iGM_UnifiedResourceTypes.map((value) => (
            <button
              key={value}
              type="button"
              className={`${styles.urTypeChip} ${
                type === value ? styles.urTypeChipActive : ""
              }`}
              onClick={() => iGM_HandleTypeChange(value)}
            >
              {t(`thirdParty.resourceTypes.${value}`)}
            </button>
          ))}
        </div>
      </div>

      {/* 来源降级提示：任一来源不可用时低调展示，列表仍可用 */}
      {degraded && !loading && !errorText && (
        <div className={styles.urDegraded} role="status">
          <AlertTriangle size={14} strokeWidth={1.9} />
          {t("minecraft.unified.degradedHint")}
        </div>
      )}

      {/* 主体 */}
      {loading ? (
        <div className={m10.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("minecraft.stateLoading")}
        </div>
      ) : errorText ? (
        <div className={m10.sectionCard}>
          <div className={`${m10.alert} ${m10.alertError}`}>{errorText}</div>
          <div>
            <button
              type="button"
              className={m10.ghostButton}
              onClick={() => void iGM_Load()}
            >
              {t("community.state.retry")}
            </button>
          </div>
        </div>
      ) : data && data.length > 0 ? (
        <>
          <div className={styles.urGrid}>{data.map(iGM_RenderUnifiedCard)}</div>
          {totalPages > 1 && (
            <IGM_Pagination page={page} totalPages={totalPages} onChange={iGM_HandlePageChange} />
          )}
        </>
      ) : (
        <IGM_EmptyState
          icon={Package}
          title={t("minecraft.empty")}
          description={t("minecraft.emptyDescription")}
        />
      )}
    </div>
  );
}

// 导出 //
export default iGM_MinecraftPage;
