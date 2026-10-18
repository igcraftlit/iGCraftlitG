/**
 * 文件路径：apps/launcher-ui/components/iGM_LauncherV2_ResourceCenter/iGM_LauncherV2_ResourceCenter.tsx
 * 所属层：前端 / 页面组件层
 * 路由：G_Main（资源中心页签）
 * 模块：iGM_LauncherV2_ResourceCenter
 * 作用：资源中心：版本浏览列表 + 资源市场 + 一卡式安装弹窗
 * 内容：顶部提供「游戏版本 / 资源市场」二级切换；
 *       游戏版本视图按四类归档（全部正式版 / 快照版 / 远古版本 / 特别版）浏览并搜索版本，
 *       点击任意版本卡片即以遮罩弹出一张「一卡式安装弹窗」，在同一张卡片内完成
 *       视界名称、加载器、加载器版本、存放路径四项配置，点击「开始安装」即调用
 *       downloads.start 把版本 / 加载器展示名 / 视界名称 / 存放根目录交给下载中心，
 *       外壳按该根目录生成标准 iGML_Matrix 结构后再下载；
 *       资源市场视图由 iGM_LauncherV2_Market 子组件承载（Modrinth / CurseForge 双源检索、
 *       分类与三加载器筛选、一卡式双通道下载弹窗）
 * 说明：版本总量可达数百条，列表按过滤结果渲染并限制最大条数，避免 DOM 过大
 */

// 导入依赖 //
"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FolderOpen, Search, X } from "lucide-react";
import {
  iGM_LauncherV2_Card as IGM_LauncherV2_Card,
} from "@/components/iGM_LauncherV2_Primitives/iGM_LauncherV2_Primitives";
import {
  iGM_LauncherV2_PickFolder as IGM_LauncherV2_PickFolder,
  iGM_LauncherV2_UseDownloads as IGM_LauncherV2_UseDownloads,
  iGM_LauncherV2_UseLoaders as IGM_LauncherV2_UseLoaders,
  iGM_LauncherV2_UseSettings as IGM_LauncherV2_UseSettings,
  iGM_LauncherV2_UseVersions as IGM_LauncherV2_UseVersions,
} from "@/components/iGM_LauncherV2_HostBridge/iGM_LauncherV2_HostBridge";
import { iGM_LauncherV2_Market as IGM_LauncherV2_Market } from "@/components/iGM_LauncherV2_Market/iGM_LauncherV2_Market";
import type { iGM_LauncherV2_LoaderEntry } from "@/lib/iGM_LauncherV2_Constants";
import {
  iGM_LauncherV2_VersionCategoryOf,
  type iGM_LauncherV2_VersionCategory,
} from "@/lib/iGM_LauncherV2_VersionRelations";
import styles from "./iGM_LauncherV2_ResourceCenter.module.css";

// 类型定义 //

/** 加载器类别 */
type iGM_LauncherV2_LoaderKind = iGM_LauncherV2_LoaderEntry["kind"];

/** 资源中心的二级视图 */
type iGM_LauncherV2_ResourceView = "versions" | "market";

// 常量与文案 //

/** 二级视图切换标签 */
const IGM_RESOURCE_VIEWS: { id: iGM_LauncherV2_ResourceView; label: string }[] = [
  { id: "versions", label: "游戏版本" },
  { id: "market", label: "资源市场" },
];

/** 第一步的四类归档标签 */
const IGM_RESOURCE_TABS: { id: iGM_LauncherV2_VersionCategory; label: string }[] = [
  { id: "release", label: "全部正式版" },
  { id: "snapshot", label: "快照版" },
  { id: "old", label: "远古版本" },
  { id: "special", label: "特别版" },
];

/** 安装弹窗中「选择加载器」下拉框的选项 */
const IGM_RESOURCE_LOADER_OPTIONS: { id: iGM_LauncherV2_LoaderKind; label: string }[] = [
  { id: "vanilla", label: "Vanilla（原版）" },
  { id: "fabric", label: "Fabric" },
  { id: "forge", label: "Forge" },
  { id: "neoforge", label: "NeoForge" },
];

/** 加载器类别名：用于拼接视界名称默认值与 loaderLabel 兜底 */
const IGM_RESOURCE_LOADER_NAME: Record<iGM_LauncherV2_LoaderKind, string> = {
  vanilla: "Vanilla",
  fabric: "Fabric",
  forge: "Forge",
  neoforge: "NeoForge",
};

/** 单次渲染的最大版本条数 */
const IGM_VERSION_RENDER_LIMIT = 400;

// 核心逻辑 //

export function iGM_LauncherV2_ResourceCenter() {
  const versions = IGM_LauncherV2_UseVersions();
  const loaders = IGM_LauncherV2_UseLoaders();
  const downloads = IGM_LauncherV2_UseDownloads();
  const settings = IGM_LauncherV2_UseSettings();

  const [category, setCategory] = useState<iGM_LauncherV2_VersionCategory>("release");
  const [keyword, setKeyword] = useState("");
  /** 当前二级视图：游戏版本 / 资源市场 */
  const [view, setView] = useState<iGM_LauncherV2_ResourceView>("versions");
  /** 非空表示安装弹窗已打开，值为待安装的版本号 */
  const [installId, setInstallId] = useState("");
  /** 安装弹窗中选中的加载器类别 */
  const [loaderKind, setLoaderKind] = useState<iGM_LauncherV2_LoaderKind>("vanilla");
  /** 各加载器类别当前选中的具体版本号（key 为类别） */
  const [loaderPick, setLoaderPick] = useState<Record<string, string>>({});
  /** 安装弹窗中的视界名称输入值 */
  const [horizonName, setHorizonName] = useState("");
  /** 用户是否手动改过视界名称；改过之后不再随加载器自动覆盖 */
  const [horizonTouched, setHorizonTouched] = useState(false);
  /** 安装弹窗中的存放根目录（默认取启动器当前根目录） */
  const [rootPath, setRootPath] = useState("");
  /** 用户是否手动改过存放路径；改过之后不再随设置回推覆盖 */
  const [rootTouched, setRootTouched] = useState(false);

  // 第一步：按归档 + 关键词过滤版本卡片
  const visibleVersions = useMemo(() => {
    const lowered = keyword.trim().toLowerCase();
    return versions.versions
      .filter((item) => iGM_LauncherV2_VersionCategoryOf(item) === category)
      .filter((item) => (lowered ? item.id.toLowerCase().includes(lowered) : true))
      .slice(0, IGM_VERSION_RENDER_LIMIT);
  }, [versions.versions, category, keyword]);

  /** 该 MC 版本下指定加载器类别的可用版本（外壳已按版本号降序，首项为最新） */
  const loaderCandidates = useMemo(
    () => loaders.loaders.filter((item) => item.kind === loaderKind),
    [loaders.loaders, loaderKind],
  );

  /** 当前生效的加载器条目：用户已选则以选择为准，否则回落到首项 */
  const pickedEntry: iGM_LauncherV2_LoaderEntry | null = useMemo(() => {
    if (loaderKind === "vanilla" || loaderCandidates.length === 0) return null;
    const picked = loaderPick[loaderKind];
    return loaderCandidates.find((item) => item.id === picked) ?? loaderCandidates[0];
  }, [loaderKind, loaderCandidates, loaderPick]);

  /** 交给外壳的加载器展示名：原版固定为 Vanilla，其余取所选加载器条目的展示名 */
  const loaderLabel =
    loaderKind === "vanilla"
      ? IGM_RESOURCE_LOADER_NAME.vanilla
      : pickedEntry?.label || IGM_RESOURCE_LOADER_NAME[loaderKind];

  // 视界名称随加载器变化自动更新；用户手动改过后不再覆盖
  useEffect(() => {
    if (!installId || horizonTouched) return;
    setHorizonName(`${installId}-${loaderLabel}`);
  }, [installId, loaderLabel, horizonTouched]);

  // 存放路径默认取启动器当前根目录；用户手动输入或选择过之后不再覆盖
  useEffect(() => {
    if (rootTouched) return;
    const current = settings.paths?.userRoot ?? "";
    if (current) setRootPath(current);
  }, [settings.paths?.userRoot, rootTouched]);

  // Esc 关闭安装弹窗
  useEffect(() => {
    if (!installId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setInstallId("");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [installId]);

  /** 打开安装弹窗：重置配置并拉取该版本的加载器列表 */
  const openInstall = (versionId: string) => {
    setInstallId(versionId);
    setLoaderKind("vanilla");
    setLoaderPick({});
    setHorizonTouched(false);
    setHorizonName(`${versionId}-${IGM_RESOURCE_LOADER_NAME.vanilla}`);
    versions.loadLoaders(versionId);
  };

  /** 关闭安装弹窗 */
  const closeInstall = () => {
    setInstallId("");
    setHorizonTouched(false);
    setRootTouched(false);
  };

  /** 浏览存放路径：调用原生目录选择器，用户取消时不做任何改动 */
  const browseRoot = async () => {
    const picked = await IGM_LauncherV2_PickFolder(rootPath);
    if (!picked) return;
    setRootTouched(true);
    setRootPath(picked);
  };

  /** 切换加载器类别：重新拉取该 MC 版本下的加载器列表 */
  const changeLoaderKind = (kind: iGM_LauncherV2_LoaderKind) => {
    setLoaderKind(kind);
    if (installId) versions.loadLoaders(installId);
  };

  /** 开始安装：把版本 / 加载器展示名 / 视界名称 / 存放根目录交给下载中心，随后关闭弹窗 */
  const startInstall = () => {
    if (!installId) return;
    downloads.start({
      versionId: installId,
      loaderLabel,
      horizonName: horizonName.trim() || `${installId}-${loaderLabel}`,
      rootPath: rootPath.trim(),
    });
    closeInstall();
  };

  /** 二级视图切换条：两个视图共用，故抽为变量 */
  const viewTabs = (
    <div className={styles.viewRow}>
      {IGM_RESOURCE_VIEWS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`${styles.viewTab} ${view === item.id ? styles.viewTabOn : ""}`}
          onClick={() => setView(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );

  // 资源市场视图：独立组件承载，不干扰版本列表的状态与滚动位置
  if (view === "market") {
    return (
      <div className={styles.wrap}>
        {viewTabs}
        <IGM_LauncherV2_Market />
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      {viewTabs}
      <IGM_LauncherV2_Card className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>游戏版本</h2>
            <p className={styles.panelDesc}>
              共 {versions.versions.length} 个版本；当前分类显示 {visibleVersions.length} 条。点击卡片打开安装弹窗。
            </p>
          </div>
          <div className={styles.filterRow}>
            {IGM_RESOURCE_TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`${styles.chip} ${category === item.id ? styles.chipOn : ""}`}
                onClick={() => setCategory(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.searchRow}>
          <Search size={14} strokeWidth={2.2} className={styles.searchIcon} />
          <input
            className={styles.input}
            value={keyword}
            placeholder="按版本号搜索，例如 1.20.1"
            onChange={(event) => setKeyword(event.target.value)}
          />
        </div>

        {versions.loading ? (
          <p className={styles.empty}>正在获取版本列表…</p>
        ) : visibleVersions.length === 0 ? (
          <p className={styles.empty}>该分类下没有匹配的版本，请调整分类或关键词。</p>
        ) : (
          <ul className={styles.versionGrid}>
            {visibleVersions.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={styles.versionCard}
                  onClick={() => openInstall(item.id)}
                >
                  <span className={styles.versionCardId}>{item.id}</span>
                  <span className={styles.versionCardMeta}>
                    {item.releaseTime ? item.releaseTime.slice(0, 10) : "发布时间未知"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {visibleVersions.length >= IGM_VERSION_RENDER_LIMIT ? (
          <p className={styles.dialogHint}>
            该分类版本数量较多，已显示前 {IGM_VERSION_RENDER_LIMIT} 条，可用关键词进一步筛选。
          </p>
        ) : null}
      </IGM_LauncherV2_Card>

      {/* 一卡式安装弹窗：遮罩铺满整窗，卡片内一次完成全部配置 */}
      {installId ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <IGM_LauncherV2_Card className={styles.modalCard}>
            <div className={styles.modalHead}>
              <h3 className={styles.modalTitle}>安装 {installId}</h3>
              <button
                type="button"
                className={styles.iconButton}
                aria-label="关闭安装弹窗"
                onClick={closeInstall}
              >
                <X size={15} strokeWidth={2.4} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {/* 配置项一：视界名称 */}
              <div className={styles.modalField}>
                <span className={styles.modalLabel}>视界名称</span>
                <input
                  className={styles.modalInput}
                  value={horizonName}
                  placeholder={`${installId}-Vanilla`}
                  onChange={(event) => {
                    setHorizonTouched(true);
                    setHorizonName(event.target.value);
                  }}
                />
              </div>

              {/* 配置项二：选择加载器 */}
              <div className={styles.modalField}>
                <span className={styles.modalLabel}>选择加载器</span>
                <select
                  className={styles.select}
                  value={loaderKind}
                  onChange={(event) => changeLoaderKind(event.target.value as iGM_LauncherV2_LoaderKind)}
                >
                  {IGM_RESOURCE_LOADER_OPTIONS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 配置项三：加载器版本 */}
              <div className={styles.modalField}>
                <span className={styles.modalLabel}>加载器版本</span>
                {loaderKind === "vanilla" ? (
                  <select className={styles.select} value="" disabled>
                    <option value="">原版无需加载器版本</option>
                  </select>
                ) : (
                  <select
                    className={styles.select}
                    value={pickedEntry?.id ?? ""}
                    disabled={loaderCandidates.length === 0}
                    onChange={(event) =>
                      setLoaderPick((current) => ({ ...current, [loaderKind]: event.target.value }))
                    }
                  >
                    {loaderCandidates.length === 0 ? (
                      <option value="">暂无可用版本</option>
                    ) : (
                      loaderCandidates.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))
                    )}
                  </select>
                )}
                {loaderKind !== "vanilla" && loaders.loading ? (
                  <p className={styles.modalHint}>正在获取该加载器在该版本下的可用列表…</p>
                ) : null}
              </div>

              {/* 配置项四：存放路径（默认路径 + 浏览文件夹） */}
              <div className={styles.modalField}>
                <span className={styles.modalLabel}>存放路径</span>
                <div className={styles.pathRow}>
                  <input
                    className={styles.modalInput}
                    value={rootPath}
                    placeholder={"D:\\iGML_Data"}
                    onChange={(event) => {
                      setRootTouched(true);
                      setRootPath(event.target.value);
                    }}
                  />
                  <button
                    type="button"
                    className={styles.actionButton}
                    onClick={() => void browseRoot()}
                  >
                    <FolderOpen size={14} strokeWidth={2.2} />
                    <span>浏览文件夹</span>
                  </button>
                </div>
                <p className={styles.modalHint}>
                  将在此路径下生成标准 iGML_Matrix 目录结构（.minecraft / horizons 等）并完成下载。
                </p>
              </div>
            </div>

            <div className={styles.modalFoot}>
              <button type="button" className={styles.actionButton} onClick={closeInstall}>
                取消
              </button>
              <button
                type="button"
                className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
                onClick={startInstall}
              >
                <Download size={15} strokeWidth={2.2} />
                <span>开始安装</span>
              </button>
            </div>
          </IGM_LauncherV2_Card>
        </div>
      ) : null}
    </div>
  );
}

// 导出 //
export default iGM_LauncherV2_ResourceCenter;
