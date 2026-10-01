/**
 * 文件路径：apps/web/src/iGM_Pages/G_MinecraftVersions/iGM_MinecraftVersionsPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_MinecraftVersions?type=&q=&page=
 * 模块：G_MinecraftVersions
 * 作用：版本资料库——「原版游戏」入口：按年份分组浏览版本并提供下载入口
 * 内容：分区横幅、搜索框、类型筛选胶囊、按年份分组的版本卡片栅格、分页
 * 说明：
 *   - 纯静态 SSG，数据在客户端经 iGM_Request 调用本地后端
 *   - 排序固定为最新优先，前端按发布时间年份分组，年份内按版本号倒序
 *   - 卡片仅展示「完整大小」，不展示客户端/服务端细分
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  CircleDashed,
  Download,
  HardDrive,
  LoaderCircle,
  Search,
} from "lucide-react";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import {
  iGM_ApiListMinecraftVersions,
} from "../../iGM_Services/iGM_MinecraftClient";
import type { iGM_GameVersion, iGM_GameVersionListData } from "../../iGM_Services/iGM_GameClient";
import { iGM_FormatFileSize } from "../../iGM_Services/iGM_FileClient";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_UseLocaleRouter } from "../../iGM_i18n/iGM_UseLocaleRouter";
import { iGM_UseLocale } from "../../iGM_Providers/iGM_LocaleProvider";
import { iGM_Pagination as IGM_Pagination } from "../../iGM_Components/iGM_Pagination/iGM_Pagination";
import { iGM_EmptyState as IGM_EmptyState } from "../../iGM_Components/iGM_EmptyState/iGM_EmptyState";
import { iGM_FormatDate } from "../../iGM_Components/iGM_Format/iGM_Format";
import pageStyles from "../iGM_Page.module.css";
import m10 from "../iGM_Module10.module.css";
import mc from "../iGM_Minecraft.module.css";
import styles from "../iGM_Game.module.css";

// 类型定义 //
/** 每页版本数（模块十八按年份分组展示，需较大分页以容纳完整年份） */
const iGM_PageSize = 50;

/** 版本类型选项（与后端 iGM_GameVersionTypes 一致） */
const iGM_VersionTypes = ["release", "snapshot", "old_beta", "old_alpha"] as const;

/** 年份分组：year 为 null 表示发布时间缺失 */
interface iGM_YearGroup {
  year: number | null;
  items: iGM_GameVersion[];
}

// 核心逻辑 //
/** 版本类型本地化标签 */
function iGM_VersionTypeLabel(
  t: ReturnType<typeof useTranslations>,
  value: string,
): string {
  const key = `game.versionTypes.${value}`;
  return t.has(key) ? t(key) : value;
}

/** 版本号倒序比较（支持 1.20.2 / 1.20.2-pre1 等混合形态） */
function iGM_CompareVersionDesc(a: string, b: string): number {
  return b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" });
}

/** 按年份分组：年份倒序，年份内版本号倒序 */
function iGM_GroupByYear(items: iGM_GameVersion[]): iGM_YearGroup[] {
  const map = new Map<number | null, iGM_GameVersion[]>();
  for (const item of items) {
    const year = item.releaseTime
      ? new Date(item.releaseTime).getFullYear()
      : null;
    const bucket = map.get(year);
    if (bucket) bucket.push(item);
    else map.set(year, [item]);
  }
  return Array.from(map.entries())
    .sort((a, b) => {
      if (a[0] === null) return 1;
      if (b[0] === null) return -1;
      return b[0] - a[0];
    })
    .map(([year, group]) => ({
      year,
      items: group.slice().sort((a, b) => iGM_CompareVersionDesc(a.version, b.version)),
    }));
}

/** 版本资料库主体（在 Suspense 内使用 useSearchParams） */
export function iGM_MinecraftVersionsPage() {
  const t = useTranslations();
  const router = iGM_UseLocaleRouter();
  const { locale } = iGM_UseLocale();
  const searchParams = useSearchParams();

  const [type, setType] = useState(searchParams.get("type") ?? "");
  const [keywordInput, setKeywordInput] = useState(searchParams.get("q") ?? "");
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<iGM_GameVersionListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);

  const basePath = "/G_MinecraftVersions";

  /** 按当前筛选拉取版本列表 */
  const iGM_Load = useCallback(async () => {
    setLoading(true);
    setErrorText(null);
    const query = {
      type: type || undefined,
      search: search || undefined,
      sort: "newest" as const,
      page,
      pageSize: iGM_PageSize,
    };
    try {
      const response = await iGM_ApiListMinecraftVersions(query);
      setData(response.data);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setLoading(false);
    }
  }, [type, search, page, t]);

  useEffect(() => {
    void iGM_Load();
  }, [iGM_Load]);

  /** 年份分组结果 */
  const groups = useMemo(
    () => iGM_GroupByYear(data?.items ?? []),
    [data],
  );

  /** 同步筛选到地址栏 */
  function iGM_SyncUrl(next: { type: string; q: string }): void {
    const params = new URLSearchParams();
    if (next.type) params.set("type", next.type);
    if (next.q) params.set("q", next.q);
    const text = params.toString();
    router.replace(text ? `${basePath}?${text}` : basePath);
  }

  /** 提交搜索 */
  function iGM_HandleSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const keyword = keywordInput.trim();
    setSearch(keyword);
    setPage(1);
    iGM_SyncUrl({ type, q: keyword });
  }

  /** 切换版本类型 */
  function iGM_ToggleType(value: string): void {
    setType(value);
    setPage(1);
    iGM_SyncUrl({ type: value, q: search });
  }

  /** 渲染单个版本卡片 */
  function iGM_RenderCard(item: iGM_GameVersion) {
    return (
      <article key={item.id} className={styles.versionCard}>
        <div className={styles.versionCardHead}>
          <span className={styles.versionName}>{item.version}</span>
          <span className={styles.versionType}>
            {iGM_VersionTypeLabel(t, item.type)}
          </span>
        </div>

        <div className={styles.versionMeta}>
          {item.releaseTime && (
            <div className={styles.versionMetaRow}>
              <Calendar size={13} strokeWidth={1.8} />
              {iGM_FormatDate(locale, item.releaseTime)}
            </div>
          )}
          <div className={styles.versionMetaRow}>
            <HardDrive size={13} strokeWidth={1.8} />
            {t("game.sizeLabel")}
            {typeof item.totalSize === "number"
              ? iGM_FormatFileSize(item.totalSize)
              : t("game.sizeComputing")}
          </div>
          <div className={styles.versionMetaRow}>
            {item.installed ? (
              <CheckCircle2 size={13} strokeWidth={1.8} />
            ) : (
              <CircleDashed size={13} strokeWidth={1.8} />
            )}
            {item.installed ? t("game.installed") : t("game.notInstalled")}
          </div>
        </div>

        <div className={styles.versionActions}>
          <Link
            href={`/G_GameInstall?version=${encodeURIComponent(item.version)}`}
            className={m10.primaryButton}
          >
            <Download size={14} strokeWidth={1.8} />
            {t("game.download")}
          </Link>
          <Link
            href={`/G_MinecraftVersionDetail?id=${encodeURIComponent(item.id)}`}
            className={m10.ghostButton}
          >
            {t("game.detail")}
            <ArrowRight size={14} strokeWidth={1.8} />
          </Link>
        </div>
      </article>
    );
  }

  return (
    <div className={pageStyles.page}>
      {/* 原版游戏入口横幅 */}
      <section className={mc.mcHero}>
        <span className={mc.mcHeroTitle}>
          <span className={mc.mcHeroIcon}>
            <Download size={24} strokeWidth={1.8} />
          </span>
          {t("game.versionsTitle")}
        </span>
        <p className={mc.mcHeroDescription}>{t("game.versionsDescription")}</p>
      </section>

      {/* 搜索 */}
      <div className={mc.toolbar}>
        <form className={mc.searchBox} onSubmit={iGM_HandleSearch}>
          <Search size={15} strokeWidth={2} color="var(--igm-text-muted)" />
          <input
            className={mc.searchInput}
            type="search"
            value={keywordInput}
            placeholder={t("game.searchPlaceholder")}
            onChange={(event) => setKeywordInput(event.target.value)}
          />
        </form>
      </div>

      {/* 筛选区 */}
      <div className={m10.sectionCard}>
        <div className={mc.filterGroup}>
          <span className={mc.filterLabel}>{t("game.filterType")}</span>
          <div className={mc.filterChips}>
            <button
              type="button"
              className={`${mc.mcChip} ${type === "" ? mc.mcChipActive : ""}`}
              onClick={() => iGM_ToggleType("")}
            >
              {t("game.all")}
            </button>
            {iGM_VersionTypes.map((value) => (
              <button
                key={value}
                type="button"
                className={`${mc.mcChip} ${type === value ? mc.mcChipActive : ""}`}
                onClick={() => iGM_ToggleType(value)}
              >
                {iGM_VersionTypeLabel(t, value)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 主体 */}
      {loading ? (
        <div className={m10.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("game.stateLoading")}
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
      ) : groups.length > 0 ? (
        <>
          <div className={styles.yearGroups}>
            {groups.map((group) => (
              <section key={group.year ?? "unknown"} className={styles.yearGroup}>
                <h2 className={styles.yearTitle}>
                  {group.year === null
                    ? t("game.yearUnknown")
                    : t("game.yearGroup", { year: group.year })}
                  <span className={styles.yearTitleLine} />
                </h2>
                <div className={styles.versionGrid}>
                  {group.items.map((item) => iGM_RenderCard(item))}
                </div>
              </section>
            ))}
          </div>
          {data && data.totalPages > 1 && (
            <IGM_Pagination
              page={data.page}
              totalPages={data.totalPages}
              onChange={(next) => setPage(next)}
            />
          )}
        </>
      ) : (
        <IGM_EmptyState
          icon={Download}
          title={t("game.empty")}
          description={t("game.emptyDescription")}
        />
      )}
    </div>
  );
}

// 导出 //
export default iGM_MinecraftVersionsPage;