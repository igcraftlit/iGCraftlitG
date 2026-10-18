/**
 * 文件路径：apps/launcher-ui/components/iGM_LauncherV2_Market/iGM_LauncherV2_Market.tsx
 * 所属层：前端 / 页面组件层
 * 路由：G_Main（资源中心 · 资源市场）
 * 模块：iGM_LauncherV2_Market
 * 作用：资源市场：跨数据源（Modrinth / CurseForge）检索模组、光影、材质包、整合包与地图
 * 内容：顶部为分类 / 加载器 / 数据源三层筛选栏与关键词搜索，
 *       中部为结果卡片网格（图标、名称、作者、下载量、加载器标签），支持「加载更多」分页；
 *       点击卡片即以遮罩弹出「一卡式详情弹窗」：卡内展示简介与适用 MC 版本，
 *       并提供通道 A（iGCraftLit SDK 下载，后端代理）与通道 B（直接下载，引擎直连并自动调度源）
 *       两个明确按钮；
 *       选定通道后进入「安装确认对话框」：可选「安装到视界」（下拉列出全部已有视界，
 *       自动写入该视界的 mods / shaderpacks 等分类子目录）或「仅下载文件」
 *       （调用原生目录选择器让用户自选保存目录）；确认后才提交下载任务并进入右下角任务管理器；
 *       界面文案已接入多语言（next-intl，键为 market.ui 与 common）
 * 说明：加载器筛选「全部加载器」时不追加任何过滤条件；Modrinth 不提供地图分类，
 *       选择地图时自动切换数据源为 CurseForge
 */

// 导入依赖 //
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Download,
  ExternalLink,
  FolderOpen,
  Layers,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { iGM_LauncherV2_Card as IGM_LauncherV2_Card } from "@/components/iGM_LauncherV2_Primitives/iGM_LauncherV2_Primitives";
import {
  iGM_LauncherV2_OpenLink as IGM_LauncherV2_OpenLink,
  iGM_LauncherV2_PickFolder as IGM_LauncherV2_PickFolder,
  iGM_LauncherV2_StartMarketDownload as IGM_LauncherV2_StartMarketDownload,
  iGM_LauncherV2_UseAuth as IGM_LauncherV2_UseAuth,
  iGM_LauncherV2_UseHorizons as IGM_LauncherV2_UseHorizons,
  iGM_LauncherV2_UseMarket as IGM_LauncherV2_UseMarket,
  iGM_LauncherV2_UseMarketDetail as IGM_LauncherV2_UseMarketDetail,
} from "@/components/iGM_LauncherV2_HostBridge/iGM_LauncherV2_HostBridge";
import {
  IGM_LAUNCHERV2_MARKET_CATEGORIES,
  IGM_LAUNCHERV2_MARKET_LOADERS,
  IGM_LAUNCHERV2_MARKET_PAGE_SIZE,
  IGM_LAUNCHERV2_MARKET_SOURCES,
  type iGM_LauncherV2_MarketCategory,
  type iGM_LauncherV2_MarketItem,
  type iGM_LauncherV2_MarketLoader,
  type iGM_LauncherV2_MarketSource,
} from "@/lib/iGM_LauncherV2_Constants";
import styles from "./iGM_LauncherV2_Market.module.css";

// 类型定义 //

/** 弹窗内的下载通道选择 */
type iGM_LauncherV2_MarketChannel = "sdk" | "direct";

/** 安装确认模式：装入视界 / 仅下载文件 */
type iGM_LauncherV2_MarketInstallMode = "horizon" | "folder";

/** 各分类在视界内对应的子目录名（与外壳落盘规则一致，用于对话框内提示文案） */
const IGM_MARKET_SUBDIR_LABELS: Record<iGM_LauncherV2_MarketCategory, string> = {
  mods: "mods",
  shaders: "shaderpacks",
  resourcepacks: "resourcepacks",
  modpacks: "modpacks",
  worlds: "saves",
};

/** 模块级辅助函数所需的翻译函数签名（t 由组件显式传入，避免在组件外调用 Hook） */
type iGM_LauncherV2_MarketTranslate = ReturnType<typeof useTranslations>;

// 常量与文案 //

/** 下载量缩写：以万 / 亿为单位，保留一位小数（t 由组件传入，避免在组件外调用 Hook） */
function iGM_MarketFormatDownloads(value: number, t: iGM_LauncherV2_MarketTranslate): string {
  if (value >= 100000000) return t("market.ui.downloadsHundredMillion", { value: (value / 100000000).toFixed(1) });
  if (value >= 10000) return t("market.ui.downloadsTenThousand", { value: (value / 10000).toFixed(1) });
  return String(value);
}

/** 文件体积缩写（t 由组件传入，避免在组件外调用 Hook） */
function iGM_MarketFormatSize(bytes: number, t: iGM_LauncherV2_MarketTranslate): string {
  if (bytes <= 0) return t("market.ui.sizeUnknown");
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

/** 加载器标签配色类别 */
function iGM_MarketLoaderTone(label: string): string {
  const key = label.toLowerCase();
  if (key === "fabric") return styles.tagFabric;
  if (key === "forge") return styles.tagForge;
  if (key === "neoforge") return styles.tagNeoforge;
  return styles.tagPlain;
}

// 核心逻辑 //

export function iGM_LauncherV2_Market() {
  const t = useTranslations();
  const market = IGM_LauncherV2_UseMarket();
  const detail = IGM_LauncherV2_UseMarketDetail();
  const horizons = IGM_LauncherV2_UseHorizons();
  const auth = IGM_LauncherV2_UseAuth();
  /** 游客（未登录社区账号）：仅开放直连下载，隐藏 SDK 通道并抑制并发 */
  const isGuest = !(auth.state === "logged-in" && auth.user);

  const [source, setSource] = useState<iGM_LauncherV2_MarketSource>("modrinth");
  const [category, setCategory] = useState<iGM_LauncherV2_MarketCategory>("mods");
  const [loader, setLoader] = useState<iGM_LauncherV2_MarketLoader>("all");
  const [keyword, setKeyword] = useState("");
  /** 已提交的关键词（点搜索或回车才生效，避免逐键触发检索） */
  const [committed, setCommitted] = useState("");
  /** 非空表示详情弹窗已打开，值为待下载的条目 */
  const [picked, setPicked] = useState<iGM_LauncherV2_MarketItem | null>(null);
  /** 打开弹窗时的分类（决定落盘子目录，避免弹窗期间切换分类导致错位） */
  const [pickedCategory, setPickedCategory] = useState<iGM_LauncherV2_MarketCategory>("mods");
  /** 非空表示安装确认对话框已打开，值为用户选定的下载通道 */
  const [channel, setChannel] = useState<iGM_LauncherV2_MarketChannel | null>(null);
  /** 安装确认模式：默认安装到视界 */
  const [installMode, setInstallMode] = useState<iGM_LauncherV2_MarketInstallMode>("horizon");
  /** 安装目标视界 id；空串表示使用当前视界 */
  const [targetHorizonId, setTargetHorizonId] = useState("");
  /** 仅下载模式下的自选保存目录 */
  const [targetFolder, setTargetFolder] = useState("");
  /** 目录选择反馈（用户取消或浏览器预览时的提示） */
  const [folderHint, setFolderHint] = useState("");

  /** 统一的检索入口 */
  const runSearch = (
    nextSource: iGM_LauncherV2_MarketSource,
    nextCategory: iGM_LauncherV2_MarketCategory,
    nextLoader: iGM_LauncherV2_MarketLoader,
    nextKeyword: string,
    offset: number,
  ) => {
    market.search({
      source: nextSource,
      category: nextCategory,
      loader: nextLoader,
      query: nextKeyword,
      offset,
    });
  };

  // 首次进入资源市场即按默认条件（全部加载器）检索一次
  useEffect(() => {
    runSearch("modrinth", "mods", "all", "", 0);
    // 仅在挂载时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeCategory = (next: iGM_LauncherV2_MarketCategory) => {
    setCategory(next);
    // Modrinth 不提供地图分类：选择地图时自动切换数据源
    const nextSource: iGM_LauncherV2_MarketSource = next === "worlds" ? "curseforge" : source;
    if (nextSource !== source) setSource(nextSource);
    runSearch(nextSource, next, loader, committed, 0);
  };

  const changeLoader = (next: iGM_LauncherV2_MarketLoader) => {
    setLoader(next);
    runSearch(source, category, next, committed, 0);
  };

  const changeSource = (next: iGM_LauncherV2_MarketSource) => {
    setSource(next);
    runSearch(next, category, loader, committed, 0);
  };

  const submitSearch = () => {
    setCommitted(keyword);
    runSearch(source, category, loader, keyword, 0);
  };

  const openDetail = (item: iGM_LauncherV2_MarketItem) => {
    setPicked(item);
    setPickedCategory(category);
    detail.load(item.source, item.id, category);
  };

  const closeDetail = () => {
    setPicked(null);
    detail.clear();
    setChannel(null);
  };

  /** 选定通道后进入安装确认对话框：默认沿用当前视界，未选过目录时清空上一次的自选目录 */
  const openConfirm = (next: iGM_LauncherV2_MarketChannel) => {
    setChannel(next);
    setInstallMode("horizon");
    setTargetHorizonId(horizons.currentId || "");
    setTargetFolder("");
    setFolderHint("");
  };

  /** 调用原生目录选择器让用户自选保存目录 */
  const chooseFolder = async () => {
    const chosen = await IGM_LauncherV2_PickFolder(targetFolder);
    if (chosen) {
      setTargetFolder(chosen);
      setFolderHint("");
    } else {
      setFolderHint(t("market.ui.folderCancelled"));
    }
  };

  /** 确认并提交下载任务；仅下载模式必须先选定目录 */
  const confirmDownload = () => {
    if (!picked || !detail.detail?.file || !channel) return;
    if (installMode === "folder" && !targetFolder) {
      setFolderHint(t("market.ui.folderRequired"));
      return;
    }
    const file = detail.detail.file;
    IGM_LauncherV2_StartMarketDownload({
      name: detail.detail.item.name,
      category: pickedCategory,
      url: file.url,
      fileName: file.fileName,
      size: file.size,
      channel,
      mode: installMode,
      horizonId: installMode === "horizon" ? targetHorizonId : "",
      folderPath: installMode === "folder" ? targetFolder : "",
    });
    closeDetail();
  };

  // 详情弹窗或安装确认对话框打开期间支持 Esc 关闭（优先关闭安装确认）
  useEffect(() => {
    if (!picked) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (channel) setChannel(null);
      else closeDetail();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, channel]);

  const hasMore = market.loaded && market.items.length > 0 && market.items.length < market.total;

  return (
    <div className={styles.wrap}>
      <IGM_LauncherV2_Card className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>{t("market.ui.title")}</h2>
            <p className={styles.panelDesc}>{t("market.ui.desc")}</p>
          </div>
          <div className={styles.sourceRow}>
            {IGM_LAUNCHERV2_MARKET_SOURCES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`${styles.chip} ${source === item.id ? styles.chipOn : ""}`}
                onClick={() => changeSource(item.id)}
              >
                {t(item.label)}
              </button>
            ))}
          </div>
        </div>

        {/* 分类筛选 */}
        <div className={styles.filterRow}>
          <span className={styles.filterLabel}>{t("market.ui.categoryLabel")}</span>
          {IGM_LAUNCHERV2_MARKET_CATEGORIES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.chip} ${category === item.id ? styles.chipOn : ""}`}
              onClick={() => changeCategory(item.id)}
            >
              {t(item.label)}
            </button>
          ))}
        </div>

        {/* 加载器筛选：核心筛选项 */}
        <div className={styles.filterRow}>
          <span className={styles.filterLabel}>{t("market.ui.loaderLabel")}</span>
          {IGM_LAUNCHERV2_MARKET_LOADERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.chip} ${loader === item.id ? styles.chipOn : ""}`}
              onClick={() => changeLoader(item.id)}
            >
              {t(item.label)}
            </button>
          ))}
        </div>

        <div className={styles.searchRow}>
          <Search size={14} strokeWidth={2.2} className={styles.searchIcon} />
          <input
            className={styles.input}
            value={keyword}
            placeholder={t("market.ui.searchPlaceholder")}
            onChange={(event) => setKeyword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submitSearch();
            }}
          />
          <button type="button" className={styles.actionButton} onClick={submitSearch}>
            <Search size={14} strokeWidth={2.2} />
            <span>{t("common.search")}</span>
          </button>
        </div>

        <p className={styles.status}>
          {market.loading ? (
            <>
              <Loader2 size={13} strokeWidth={2.4} className={styles.spin} />
              <span>{t("market.ui.searching")}</span>
            </>
          ) : (
            <span>
              {market.message}
              {market.loaded ? t("market.ui.totalSuffix", { count: market.total }) : ""}
            </span>
          )}
        </p>

        {market.items.length === 0 && !market.loading ? (
          <p className={styles.empty}>{t("market.ui.empty")}</p>
        ) : (
          <ul className={styles.grid}>
            {market.items.map((item) => (
              <li key={`${item.source}-${item.id}`}>
                <button type="button" className={styles.card} onClick={() => openDetail(item)}>
                  <span className={styles.cardHead}>
                    {item.iconUrl ? (
                      <img className={styles.icon} src={item.iconUrl} alt="" loading="lazy" />
                    ) : (
                      <span className={styles.iconFallback}>{item.name.slice(0, 1).toUpperCase()}</span>
                    )}
                    <span className={styles.cardTitleBox}>
                      <span className={styles.cardName}>{item.name}</span>
                      <span className={styles.cardAuthor}>{item.author}</span>
                    </span>
                  </span>
                  <span className={styles.cardDesc}>{item.description || t("market.ui.noDescription")}</span>
                  <span className={styles.cardFoot}>
                    <span className={styles.downloads}>
                      {t("market.ui.downloadCount", { count: iGM_MarketFormatDownloads(item.downloads, t) })}
                    </span>
                    <span className={styles.tagRow}>
                      {item.loaders.length === 0 ? (
                        <span className={`${styles.tag} ${styles.tagPlain}`}>{t("market.ui.unlabeled")}</span>
                      ) : (
                        item.loaders.slice(0, 3).map((label) => (
                          <span key={label} className={`${styles.tag} ${iGM_MarketLoaderTone(label)}`}>
                            {label}
                          </span>
                        ))
                      )}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {hasMore ? (
          <div className={styles.moreRow}>
            <button
              type="button"
              className={styles.actionButton}
              disabled={market.loading}
              onClick={() => runSearch(source, category, loader, committed, market.offset + IGM_LAUNCHERV2_MARKET_PAGE_SIZE)}
            >
              <span>{t("market.ui.loadMore", { shown: market.items.length, total: market.total })}</span>
            </button>
          </div>
        ) : null}
      </IGM_LauncherV2_Card>

      {/* 一卡式下载弹窗：卡内完成详情查看与双通道下载选择 */}
      {picked ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <IGM_LauncherV2_Card className={styles.modalCard}>
            <div className={styles.modalHead}>
              <div className={styles.modalTitleBox}>
                {picked.iconUrl ? (
                  <img className={styles.modalIcon} src={picked.iconUrl} alt="" />
                ) : null}
                <div>
                  <h3 className={styles.modalTitle}>{detail.detail?.item.name ?? picked.name}</h3>
                  <p className={styles.modalSub}>
                    {picked.categoryTitle} · {picked.author} ·{" "}
                    {t("market.ui.downloadCount", { count: iGM_MarketFormatDownloads(picked.downloads, t) })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className={styles.iconButton}
                aria-label={t("market.ui.closeDownloadDialog")}
                onClick={closeDetail}
              >
                <X size={15} strokeWidth={2.4} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {/* 适用 MC 版本 */}
              <div className={styles.modalField}>
                <span className={styles.modalLabel}>{t("market.ui.gameVersions")}</span>
                <div className={styles.versionRow}>
                  {(detail.detail?.item.gameVersions ?? picked.gameVersions).length === 0 ? (
                    <span className={styles.tagPlain}>{t("market.ui.noGameVersions")}</span>
                  ) : (
                    (detail.detail?.item.gameVersions ?? picked.gameVersions).map((version) => (
                      <span key={version} className={styles.versionChip}>
                        {version}
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* 支持的加载器 */}
              <div className={styles.modalField}>
                <span className={styles.modalLabel}>{t("market.ui.supportedLoaders")}</span>
                <div className={styles.tagRow}>
                  {(detail.detail?.item.loaders ?? picked.loaders).length === 0 ? (
                    <span className={`${styles.tag} ${styles.tagPlain}`}>{t("market.ui.unlabeled")}</span>
                  ) : (
                    (detail.detail?.item.loaders ?? picked.loaders).map((label) => (
                      <span key={label} className={`${styles.tag} ${iGM_MarketLoaderTone(label)}`}>
                        {label}
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* 简介 */}
              <div className={styles.modalField}>
                <span className={styles.modalLabel}>{t("market.ui.summary")}</span>
                {detail.loading ? (
                  <p className={styles.modalHint}>{t("market.ui.loadingDetail")}</p>
                ) : (
                  <p className={styles.modalBodyText}>
                    {detail.detail?.body || detail.message || t("market.ui.noDescription")}
                  </p>
                )}
              </div>

              {/* 下载文件信息 */}
              <div className={styles.modalField}>
                <span className={styles.modalLabel}>{t("market.ui.downloadFile")}</span>
                {detail.detail?.file ? (
                  <p className={styles.modalHint}>
                    {detail.detail.file.fileName}
                    {detail.detail.file.version ? t("market.ui.adaptVersion", { version: detail.detail.file.version }) : ""} ·{" "}
                    {iGM_MarketFormatSize(detail.detail.file.size, t)}
                  </p>
                ) : (
                  <p className={styles.modalHint}>{t("market.ui.noFile")}</p>
                )}
              </div>
            </div>

            <div className={styles.modalFoot}>
              <button
                type="button"
                className={styles.actionButton}
                onClick={() => {
                  const url = detail.detail?.item.pageUrl || picked.pageUrl;
                  if (url) IGM_LauncherV2_OpenLink(url);
                }}
              >
                <ExternalLink size={14} strokeWidth={2.2} />
                <span>{t("market.ui.openHomepage")}</span>
              </button>
              <button
                type="button"
                className={styles.actionButton}
                disabled={!detail.detail?.file}
                onClick={() => openConfirm("direct")}
              >
                <Download size={14} strokeWidth={2.2} />
                <span>{t("market.ui.channelDirect")}</span>
              </button>
              {/* 游客仅开放直连下载：SDK 通道需登录社区账号后开放 */}
              {isGuest ? (
                <span className={styles.channelHint}>{t("market.ui.sdkGuestHint")}</span>
              ) : (
                <button
                  type="button"
                  className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                  disabled={!detail.detail?.file}
                  onClick={() => openConfirm("sdk")}
                >
                  <Download size={14} strokeWidth={2.2} />
                  <span>{t("market.ui.channelSdk")}</span>
                </button>
              )}
            </div>
          </IGM_LauncherV2_Card>
        </div>
      ) : null}

      {/* 安装确认对话框：选定通道后确认落盘位置（装入视界 / 仅下载文件） */}
      {picked && channel ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <IGM_LauncherV2_Card className={styles.modalCard}>
            <div className={styles.modalHead}>
              <div className={styles.modalTitleBox}>
                <div>
                  <h3 className={styles.modalTitle}>{t("market.ui.chooseInstallMode")}</h3>
                  <p className={styles.modalSub}>
                    {detail.detail?.item.name ?? picked.name}
                    {detail.detail?.file ? ` · ${detail.detail.file.fileName}` : ""}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className={styles.iconButton}
                aria-label={t("market.ui.closeInstallDialog")}
                onClick={() => setChannel(null)}
              >
                <X size={15} strokeWidth={2.4} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {/* 安装方式单选 */}
              <div className={styles.modeRow}>
                <button
                  type="button"
                  className={`${styles.modeCard} ${installMode === "horizon" ? styles.modeCardOn : ""}`}
                  onClick={() => setInstallMode("horizon")}
                >
                  <Layers size={15} strokeWidth={2.2} />
                  <span className={styles.modeTitle}>{t("market.ui.installToHorizon")}</span>
                  <span className={styles.modeDesc}>
                    {t("market.ui.installToHorizonDesc", { subdir: IGM_MARKET_SUBDIR_LABELS[pickedCategory] })}
                  </span>
                </button>
                <button
                  type="button"
                  className={`${styles.modeCard} ${installMode === "folder" ? styles.modeCardOn : ""}`}
                  onClick={() => setInstallMode("folder")}
                >
                  <FolderOpen size={15} strokeWidth={2.2} />
                  <span className={styles.modeTitle}>{t("market.ui.downloadOnly")}</span>
                  <span className={styles.modeDesc}>{t("market.ui.downloadOnlyDesc")}</span>
                </button>
              </div>

              {installMode === "horizon" ? (
                <div className={styles.modalField}>
                  <span className={styles.modalLabel}>{t("market.ui.installToHorizon")}</span>
                  {horizons.items.length === 0 ? (
                    <p className={styles.modalHint}>
                      {t("market.ui.noHorizons")}
                    </p>
                  ) : (
                    <select
                      className={styles.select}
                      value={targetHorizonId}
                      onChange={(event) => setTargetHorizonId(event.target.value)}
                    >
                      <option value="">{t("market.ui.useCurrentHorizon", { name: horizons.currentId || t("market.ui.notSet") })}</option>
                      {horizons.items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                          {item.current ? t("market.ui.currentSuffix") : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              ) : (
                <div className={styles.modalField}>
                  <span className={styles.modalLabel}>{t("market.ui.saveFolderLabel")}</span>
                  <div className={styles.folderRow}>
                    <input
                      className={styles.input}
                      value={targetFolder}
                      placeholder={t("market.ui.folderPlaceholder")}
                      readOnly
                    />
                    <button type="button" className={styles.actionButton} onClick={() => void chooseFolder()}>
                      <FolderOpen size={14} strokeWidth={2.2} />
                      <span>{t("market.ui.browseFolder")}</span>
                    </button>
                  </div>
                  <p className={styles.modalHint}>{folderHint || t("market.ui.folderHint")}</p>
                </div>
              )}
            </div>

            <div className={styles.modalFoot}>
              <button type="button" className={styles.actionButton} onClick={() => setChannel(null)}>
                <span>{t("common.back")}</span>
              </button>
              <button
                type="button"
                className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                onClick={confirmDownload}
              >
                <Download size={14} strokeWidth={2.2} />
                <span>{installMode === "horizon" ? t("market.ui.confirmInstall") : t("market.ui.confirmDownload")}</span>
              </button>
            </div>
          </IGM_LauncherV2_Card>
        </div>
      ) : null}
    </div>
  );
}

// 导出 //
export default iGM_LauncherV2_Market;
