/**
 * 文件路径：apps/web/src/iGM_Pages/G_Minecraft/iGM_MinecraftPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_Minecraft?source=&type=&version=&loader=&platform=&q=&page=
 * 模块：G_Minecraft
 * 作用：Minecraft 资源分区首页——来源切换（本站资源 / 第三方资源）、多维筛选、搜索、资源横条列表
 * 内容：分区横幅、来源切换标签、资源类型/MC 版本/加载器/平台筛选胶囊、搜索框、
 *       本站资源卡片横条（封面/类型/标题/下载量/兼容信息）与第三方资源横条、分页
 * 说明：
 *   - 纯静态 SSG，数据在客户端经 iGM_Request 调用本地后端
 *   - 模块二十一：第三方资源并入本页，来源切换标签切换本站资源与第三方资源
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
  Package,
  Search,
  Upload,
  User,
} from "lucide-react";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import {
  iGM_ApiListMinecraft,
  iGM_ApiMinecraftOptions,
  type iGM_MinecraftOptions,
  type iGM_MinecraftQuery,
} from "../../iGM_Services/iGM_MinecraftClient";
import type { iGM_ResourceListData } from "../../iGM_Services/iGM_ResourceClient";
import {
  iGM_ApiSearchThirdParty,
  type iGM_ThirdPartyResource,
  type iGM_ThirdPartyResourceType,
  type iGM_ThirdPartySearchData,
} from "../../iGM_Services/iGM_ThirdPartyClient";
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

/** 资源来源：本站资源 / 第三方资源 */
type iGM_Source = "site" | "thirdparty";

/** 第三方资源类型选项（与后端 iGM_ThirdPartyResourceTypes 一致） */
const iGM_ThirdPartyTypes: readonly iGM_ThirdPartyResourceType[] = [
  "mod",
  "shader",
  "resourcepack",
  "map",
  "datapack",
];

/** 地址栏查询拼装参数 */
interface iGM_QueryInput {
  source: iGM_Source;
  type?: string;
  version?: string;
  loader?: string;
  platform?: string;
  q?: string;
}

// 核心逻辑 //
/** 资源类型的本地化标签（缺失时回退原值） */
function iGM_TypeLabel(t: ReturnType<typeof useTranslations>, value: string | null): string {
  if (!value) return "";
  const key = `minecraft.resourceTypes.${value}`;
  return t.has(key) ? t(key) : value;
}

/** 第三方资源类型的本地化标签（缺失时回退原值） */
function iGM_ThirdPartyTypeLabel(
  t: ReturnType<typeof useTranslations>,
  value: string,
): string {
  const key = `thirdParty.resourceTypes.${value}`;
  return t.has(key) ? t(key) : value;
}

/** 按来源拼装地址栏查询串（第三方仅保留 type 与 q） */
function iGM_BuildQuery(input: iGM_QueryInput): string {
  const params = new URLSearchParams();
  params.set("source", input.source);
  if (input.type) params.set("type", input.type);
  if (input.q) params.set("q", input.q);
  if (input.source === "site") {
    if (input.version) params.set("version", input.version);
    if (input.loader) params.set("loader", input.loader);
    if (input.platform) params.set("platform", input.platform);
  }
  return `/G_Minecraft?${params.toString()}`;
}

/** Minecraft 分区首页主体（在 Suspense 内使用 useSearchParams） */
export function iGM_MinecraftPage() {
  const t = useTranslations();
  const router = iGM_UseLocaleRouter();
  const searchParams = useSearchParams();

  const [options, setOptions] = useState<iGM_MinecraftOptions | null>(null);
  const [source, setSource] = useState<iGM_Source>(
    searchParams.get("source") === "thirdparty" ? "thirdparty" : "site",
  );
  const [type, setType] = useState(searchParams.get("type") ?? "");
  const [version, setVersion] = useState(searchParams.get("version") ?? "");
  const [loader, setLoader] = useState(searchParams.get("loader") ?? "");
  const [platform, setPlatform] = useState(searchParams.get("platform") ?? "");
  const [keywordInput, setKeywordInput] = useState(searchParams.get("q") ?? "");
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<iGM_ResourceListData | null>(null);
  const [tpData, setTpData] = useState<iGM_ThirdPartySearchData | null>(null);
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

  /** 按当前来源与筛选拉取资源列表 */
  const iGM_Load = useCallback(async () => {
    setLoading(true);
    setErrorText(null);
    try {
      if (source === "thirdparty") {
        const response = await iGM_ApiSearchThirdParty({
          q: search || undefined,
          type: (type as iGM_ThirdPartyResourceType) || undefined,
          page,
          pageSize: iGM_PageSize,
        });
        setTpData(response.data);
      } else {
        const query: iGM_MinecraftQuery = {
          type: type || undefined,
          version: version || undefined,
          loader: loader || undefined,
          platform: platform || undefined,
          search: search || undefined,
          page,
          pageSize: iGM_PageSize,
        };
        const response = await iGM_ApiListMinecraft(query);
        setData(response.data);
      }
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setLoading(false);
    }
  }, [source, type, version, loader, platform, search, page, t]);

  useEffect(() => {
    void iGM_Load();
  }, [iGM_Load]);

  /**
   * 切换资源来源，重置分页并同步地址栏。
   * 两栏的资源类型取值域不同（本站为上传类型、第三方为 Modrinth 类型），
   * 切换时一并清空类型筛选，避免把对方的类型值带过去导致查不到结果。
   */
  function iGM_SwitchSource(next: iGM_Source): void {
    if (next === source) return;
    setSource(next);
    setType("");
    setPage(1);
    setErrorText(null);
    router.replace(
      iGM_BuildQuery({ source: next, version, loader, platform, q: search }),
    );
  }

  /** 切换本站资源筛选维度 */
  function iGM_ToggleFilter(key: iGM_FilterKey, value: string): void {
    if (key === "type") setType(value);
    if (key === "version") setVersion(value);
    if (key === "loader") setLoader(value);
    if (key === "platform") setPlatform(value);
    setPage(1);
    router.replace(
      iGM_BuildQuery({
        source: "site",
        type: key === "type" ? value : type,
        version: key === "version" ? value : version,
        loader: key === "loader" ? value : loader,
        platform: key === "platform" ? value : platform,
        q: search,
      }),
    );
  }

  /** 切换第三方资源类型 */
  function iGM_ToggleThirdPartyType(value: string): void {
    setType(value);
    setPage(1);
    router.replace(iGM_BuildQuery({ source: "thirdparty", type: value, q: search }));
  }

  /** 提交搜索（两栏共用） */
  function iGM_HandleSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const keyword = keywordInput.trim();
    setSearch(keyword);
    setPage(1);
    router.replace(
      iGM_BuildQuery({ source, type, version, loader, platform, q: keyword }),
    );
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

  /** 渲染第三方资源横条卡片 */
  function iGM_RenderThirdPartyCard(item: iGM_ThirdPartyResource) {
    const href = `/G_ThirdPartyDetail?id=${encodeURIComponent(item.id)}`;
    return (
      <article key={item.id} className={styles.tpCard}>
        <Link href={href} className={styles.tpCover}>
          {item.coverUrl ? (
            // 第三方图源，使用原生 img 避免额外域名配置
            <img src={item.coverUrl} alt={item.name} loading="lazy" />
          ) : (
            <span className={styles.tpCoverFallback}>
              <Package size={18} strokeWidth={1.5} />
            </span>
          )}
        </Link>

        <div className={styles.tpBody}>
          <Link href={href} className={styles.tpTitle}>
            {item.name}
          </Link>
          <div className={styles.tpMeta}>
            <span className={styles.tpSource}>{t("thirdParty.sourceModrinth")}</span>
            {item.author && (
              <span className={styles.tpMetaItem}>
                <User size={12} strokeWidth={1.8} />
                {item.author}
              </span>
            )}
            <span className={styles.tpMetaItem}>
              <Download size={12} strokeWidth={1.8} />
              {item.downloads === null
                ? t("thirdParty.unspecified")
                : t("thirdParty.downloadCount", { count: item.downloads })}
            </span>
          </div>
        </div>

        <span className={styles.tpType}>{iGM_ThirdPartyTypeLabel(t, item.type)}</span>
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
        {/* 模块十七：本体版本资料库入口 */}
        <Link href="/G_MinecraftVersions" className={m10.ghostButton}>
          <Blocks size={15} strokeWidth={1.8} />
          {t("minecraft.gameVersions")}
        </Link>
        <Link href="/G_MinecraftUpload" className={m10.primaryButton}>
          <Upload size={15} strokeWidth={1.8} />
          {t("minecraft.upload")}
        </Link>
      </div>

      {/* 来源切换标签 */}
      <div className={styles.sourceTabs}>
        <button
          type="button"
          className={`${styles.sourceTab} ${source === "site" ? styles.sourceTabActive : ""}`}
          onClick={() => iGM_SwitchSource("site")}
        >
          {t("minecraft.sourceSite")}
        </button>
        <button
          type="button"
          className={`${styles.sourceTab} ${source === "thirdparty" ? styles.sourceTabActive : ""}`}
          onClick={() => iGM_SwitchSource("thirdparty")}
        >
          {t("minecraft.sourceThirdParty")}
        </button>
      </div>

      {/* 筛选区（随来源切换） */}
      {source === "thirdparty" ? (
        <div className={m10.sectionCard}>
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>{t("thirdParty.filterType")}</span>
            <div className={styles.filterChips}>
              <button
                type="button"
                className={`${styles.mcChip} ${type === "" ? styles.mcChipActive : ""}`}
                onClick={() => iGM_ToggleThirdPartyType("")}
              >
                {t("thirdParty.all")}
              </button>
              {iGM_ThirdPartyTypes.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`${styles.mcChip} ${type === value ? styles.mcChipActive : ""}`}
                  onClick={() => iGM_ToggleThirdPartyType(value)}
                >
                  {iGM_ThirdPartyTypeLabel(t, value)}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
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
      )}

      {/* 主体 */}
      {loading ? (
        <div className={m10.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {source === "thirdparty" ? t("thirdParty.stateLoading") : t("minecraft.stateLoading")}
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
      ) : source === "thirdparty" ? (
        tpData && tpData.items.length > 0 ? (
          <>
            <div className={styles.mcGrid}>
              {tpData.items.map((item) => iGM_RenderThirdPartyCard(item))}
            </div>
            {tpData.totalPages > 1 && (
              <IGM_Pagination
                page={tpData.page}
                totalPages={tpData.totalPages}
                onChange={(next) => {
                  setPage(next);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              />
            )}
          </>
        ) : (
          <IGM_EmptyState
            icon={Package}
            title={t("thirdParty.empty")}
            description={t("thirdParty.emptyDescription")}
          />
        )
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
                      <Blocks size={18} strokeWidth={1.5} />
                    </div>
                  )}
                </div>

                {/* 标题 / 统计 / 兼容信息 */}
                <div className={styles.mcCardBody}>
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
                </div>

                {/* 类型标记 */}
                {item.resourceType && (
                  <span className={`${styles.mcCardType} ${styles.mcCardTypeStatic}`}>
                    {iGM_TypeLabel(t, item.resourceType)}
                  </span>
                )}
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