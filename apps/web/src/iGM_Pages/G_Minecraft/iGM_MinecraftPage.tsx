/**
 * 文件路径：apps/web/src/iGM_Pages/G_Minecraft/iGM_MinecraftPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_Minecraft?type=&version=&loader=&platform=&q=&page=
 * 模块：G_Minecraft
 * 作用：Minecraft 资源分区首页——多维筛选、搜索、资源栅格、上传入口
 * 内容：分区横幅、资源类型/MC 版本/加载器/平台四组筛选胶囊、搜索框、
 *       资源卡片栅格（封面/类型/标题/下载量/兼容信息）、分页
 * 说明：纯静态 SSG，数据在客户端经 iGM_Request 调用本地后端
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Blocks,
  Download,
  LoaderCircle,
  Search,
  Upload,
} from "lucide-react";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import {
  iGM_ApiListMinecraft,
  iGM_ApiMinecraftOptions,
  type iGM_MinecraftOptions,
  type iGM_MinecraftQuery,
} from "../../iGM_Services/iGM_MinecraftClient";
import type { iGM_ResourceListData } from "../../iGM_Services/iGM_ResourceClient";
import { iGM_FilePreviewUrl } from "../../iGM_Services/iGM_FileClient";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_UseLocaleRouter } from "../../iGM_i18n/iGM_UseLocaleRouter";
import { iGM_Pagination as IGM_Pagination } from "../../iGM_Components/iGM_Pagination/iGM_Pagination";
import { iGM_EmptyState as IGM_EmptyState } from "../../iGM_Components/iGM_EmptyState/iGM_EmptyState";
import pageStyles from "../iGM_Page.module.css";
import m10 from "../iGM_Module10.module.css";
import styles from "../iGM_Minecraft.module.css";

// 类型定义 //
/** 每页资源数 */
const iGM_PageSize = 12;

/** 筛选维度（用于事件处理与 URL 同步） */
type iGM_FilterKey = "type" | "version" | "loader" | "platform";

// 核心逻辑 //
/** 资源类型的本地化标签（缺失时回退原值） */
function iGM_TypeLabel(t: ReturnType<typeof useTranslations>, value: string | null): string {
  if (!value) return "";
  const key = `minecraft.resourceTypes.${value}`;
  return t.has(key) ? t(key) : value;
}

/** Minecraft 分区首页主体（在 Suspense 内使用 useSearchParams） */
export function iGM_MinecraftPage() {
  const t = useTranslations();
  const router = iGM_UseLocaleRouter();
  const searchParams = useSearchParams();

  const [options, setOptions] = useState<iGM_MinecraftOptions | null>(null);
  const [type, setType] = useState(searchParams.get("type") ?? "");
  const [version, setVersion] = useState(searchParams.get("version") ?? "");
  const [loader, setLoader] = useState(searchParams.get("loader") ?? "");
  const [platform, setPlatform] = useState(searchParams.get("platform") ?? "");
  const [keywordInput, setKeywordInput] = useState(searchParams.get("q") ?? "");
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<iGM_ResourceListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);

  /** 拉取表单选项字典（仅一次） */
  useEffect(() => {
    let cancelled = false;
    iGM_ApiMinecraftOptions()
      .then((response) => {
        if (!cancelled) setOptions(response.data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  /** 按当前筛选拉取资源列表 */
  const iGM_Load = useCallback(async () => {
    setLoading(true);
    setErrorText(null);
    const query: iGM_MinecraftQuery = {
      type: type || undefined,
      version: version || undefined,
      loader: loader || undefined,
      platform: platform || undefined,
      search: search || undefined,
      page,
      pageSize: iGM_PageSize,
    };
    try {
      const response = await iGM_ApiListMinecraft(query);
      setData(response.data);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setLoading(false);
    }
  }, [type, version, loader, platform, search, page, t]);

  useEffect(() => {
    void iGM_Load();
  }, [iGM_Load]);

  /** 同步筛选到地址栏，便于分享 */
  function iGM_SyncUrl(next: Record<string, string>): void {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
    }
    const text = params.toString();
    router.replace(text ? `/G_Minecraft?${text}` : "/G_Minecraft");
  }

  /** 切换某个筛选维度 */
  function iGM_ToggleFilter(key: iGM_FilterKey, value: string): void {
    const next = {
      type,
      version,
      loader,
      platform,
      q: search,
      [key]: value,
    };
    if (key === "type") setType(value);
    if (key === "version") setVersion(value);
    if (key === "loader") setLoader(value);
    if (key === "platform") setPlatform(value);
    setPage(1);
    iGM_SyncUrl(next);
  }

  /** 提交搜索 */
  function iGM_HandleSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const keyword = keywordInput.trim();
    setSearch(keyword);
    setPage(1);
    iGM_SyncUrl({ type, version, loader, platform, q: keyword });
  }

  /** 渲染一组筛选胶囊 */
  function iGM_RenderFilterGroup(
    label: string,
    values: string[],
    current: string,
    key: iGM_FilterKey,
    localized = false,
  ) {
    return (
      <div className={styles.filterGroup}>
        <span className={styles.filterLabel}>{label}</span>
        <div className={styles.filterChips}>
          <button
            type="button"
            className={`${styles.mcChip} ${current === "" ? styles.mcChipActive : ""}`}
            onClick={() => iGM_ToggleFilter(key, "")}
          >
            {t("minecraft.all")}
          </button>
          {values.map((value) => (
            <button
              key={value}
              type="button"
              className={`${styles.mcChip} ${current === value ? styles.mcChipActive : ""}`}
              onClick={() => iGM_ToggleFilter(key, value)}
            >
              {localized ? iGM_TypeLabel(t, value) : value}
            </button>
          ))}
        </div>
      </div>
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
        <Link href="/G_MinecraftUpload" className={m10.primaryButton}>
          <Upload size={15} strokeWidth={1.8} />
          {t("minecraft.upload")}
        </Link>
      </div>

      {/* 筛选区 */}
      <div className={m10.sectionCard}>
        {iGM_RenderFilterGroup(
          t("minecraft.filterType"),
          options?.resourceTypes ?? [],
          type,
          "type",
          true,
        )}
        {iGM_RenderFilterGroup(
          t("minecraft.filterVersion"),
          options?.versionOptions ?? [],
          version,
          "version",
        )}
        {iGM_RenderFilterGroup(
          t("minecraft.filterLoader"),
          options?.loaders ?? [],
          loader,
          "loader",
        )}
        {iGM_RenderFilterGroup(
          t("minecraft.filterPlatform"),
          options?.platforms ?? [],
          platform,
          "platform",
        )}
      </div>

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
            <button type="button" className={m10.ghostButton} onClick={() => void iGM_Load()}>
              {t("community.state.retry")}
            </button>
          </div>
        </div>
      ) : data && data.items.length > 0 ? (
        <>
          <div className={styles.mcGrid}>
            {data.items.map((item) => (
              <article key={item.id} className={styles.mcCard}>
                {/* 封面 */}
                <div className={styles.mcCardCover}>
                  {item.cover ? (
                    <img
                      src={iGM_FilePreviewUrl(item.cover.id)}
                      alt={item.title}
                      crossOrigin="anonymous"
                      loading="lazy"
                    />
                  ) : (
                    <div className={styles.mcCardCoverFallback}>
                      <Blocks size={26} strokeWidth={1.5} />
                    </div>
                  )}
                  {item.resourceType && (
                    <span className={styles.mcCardType}>
                      {iGM_TypeLabel(t, item.resourceType)}
                    </span>
                  )}
                </div>

                {/* 标题与统计 */}
                <Link
                  href={`/G_MinecraftDetail?resourceId=${encodeURIComponent(item.id)}`}
                  className={styles.mcCardTitle}
                >
                  {item.title}
                </Link>
                <div className={styles.mcCardMeta}>
                  <span className={styles.mcCardMetaItem}>
                    <Download size={12} strokeWidth={1.8} />
                    {t("minecraft.downloadCount", { count: item.downloadCount })}
                  </span>
                </div>

                {/* 兼容信息 */}
                <div className={styles.mcCardChips}>
                  {item.platforms.map((value) => (
                    <span key={value} className={styles.mcCardChip}>{value}</span>
                  ))}
                  {item.loaders.map((value) => (
                    <span key={value} className={styles.mcCardChip}>{value}</span>
                  ))}
                  {item.mcVersions.slice(0, 3).map((value) => (
                    <span key={value} className={styles.mcCardChip}>{value}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>
          <IGM_Pagination
            page={data.page}
            totalPages={data.totalPages}
            onChange={(next) => {
              setPage(next);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          />
        </>
      ) : (
        <IGM_EmptyState
          icon={Blocks}
          title={t("minecraft.empty")}
          description={t("minecraft.emptyDescription")}
        />
      )}
    </div>
  );
}

// 导出 //
export default iGM_MinecraftPage;
