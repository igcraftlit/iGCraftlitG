/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Pages/iGM_Launcher_InstancesPage.tsx
 * 所属层：前端 / 页面层
 * 路由：G_Instances（SPA 页 id：instances）
 * 模块：iGM_Launcher_InstancesPage
 * 作用：实例列表页，提供搜索、筛选、排序、视图切换、新建入口、本机游戏扫描与统一启动
 * 内容：数据来自状态中心（外壳内读 D:/IGLAUNCHER/data，浏览器内读 localStorage）；
 *       删除走二次确认对话框，重命名走输入对话框，复制自动生成新名称与新目录；
 *       模块五新增「扫描本机游戏」面板：展示扫描到的 .minecraft 目录与版本，
 *       支持浏览本机目录（系统目录选择器）并扫描，把版本一键导入为实例
 *       （目录指向原游戏目录，不复制文件）；
 *       模块七改为勾选式启动：卡片复选框单选，页面底部「启动游戏」按钮在未勾选时置灰；
 *       模块八改为弹窗选登录方式：点「启动游戏」先弹正版 / 离线选择，确认后跳独立启动进度页
 */

// 导入依赖 //
"use client";

import { useMemo, useState } from "react";
import {
  FolderOpen,
  FolderSearch,
  LayoutGrid,
  List,
  Play,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  IGM_LAUNCHER_LOADER_OPTIONS,
  type iGM_Launcher_InstanceRecord,
  type iGM_Launcher_LoaderType,
} from "@igm-launcher/shared";
import {
  iGM_Launcher_Badge as IGM_Launcher_Badge,
  iGM_Launcher_Button as IGM_Launcher_Button,
  iGM_Launcher_Card as IGM_Launcher_Card,
  iGM_Launcher_PageHeader as IGM_Launcher_PageHeader,
  iGM_Launcher_PlaceholderNote as IGM_Launcher_PlaceholderNote,
} from "@/components/iGM_Launcher_Primitives/iGM_Launcher_Primitives";
import {
  iGM_Launcher_Input as IGM_Launcher_Input,
  iGM_Launcher_Select as IGM_Launcher_Select,
  iGM_Launcher_Segmented as IGM_Launcher_Segmented,
} from "@/components/iGM_Launcher_Forms/iGM_Launcher_FormControls";
import { iGM_Launcher_InstanceCard as IGM_Launcher_InstanceCard } from "@/components/iGM_Launcher_Instance/iGM_Launcher_InstanceCard";
import {
  iGM_Launcher_ConfirmDialog as IGM_Launcher_ConfirmDialog,
  iGM_Launcher_LaunchModeDialog as IGM_Launcher_LaunchModeDialog,
  iGM_Launcher_PromptDialog as IGM_Launcher_PromptDialog,
} from "@/components/iGM_Launcher_Dialogs/iGM_Launcher_Dialogs";
import { iGM_Launcher_UseStore } from "@/components/iGM_Launcher_Store/iGM_Launcher_StoreProvider";
import { iGM_Launcher_UseShellLayout } from "@/components/iGM_Launcher_AppShell/iGM_Launcher_AppShell";
import styles from "./iGM_Launcher_InstancesPage.module.css";

// 类型定义 //
type iGM_Launcher_SortKey = "lastPlayed" | "name" | "created";
type iGM_Launcher_ViewMode = "grid" | "list";

// 核心逻辑 //

/** 排序：上次游玩倒序（未游玩排最后） */
function iGM_Launcher_SortInstances(
  list: iGM_Launcher_InstanceRecord[],
  sortKey: iGM_Launcher_SortKey,
): iGM_Launcher_InstanceRecord[] {
  const sorted = [...list];
  if (sortKey === "name") {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
    return sorted;
  }
  if (sortKey === "created") {
    sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return sorted;
  }
  sorted.sort((a, b) => {
    if (!a.lastPlayedAt && !b.lastPlayedAt) return b.createdAt.localeCompare(a.createdAt);
    if (!a.lastPlayedAt) return 1;
    if (!b.lastPlayedAt) return -1;
    return b.lastPlayedAt.localeCompare(a.lastPlayedAt);
  });
  return sorted;
}

export function iGM_Launcher_InstancesPage() {
  const t = useTranslations("instances");
  const tCommon = useTranslations("common");
  const { navigate } = iGM_Launcher_UseShellLayout();
  const {
    loading,
    instances,
    selectedInstanceId,
    selectInstance,
    mcBindings,
    duplicateInstance,
    deleteInstance,
    renameInstance,
    gameDirs,
    scanResults,
    scanningGameDirs,
    scanGameDirs,
    addGameDir,
    pickDir,
    importInstance,
  } = iGM_Launcher_UseStore();

  const [keyword, setKeyword] = useState("");
  const [versionFilter, setVersionFilter] = useState("");
  const [loaderFilter, setLoaderFilter] = useState("");
  const [sortKey, setSortKey] = useState<iGM_Launcher_SortKey>("lastPlayed");
  const [view, setView] = useState<iGM_Launcher_ViewMode>("grid");
  const [pendingDelete, setPendingDelete] = useState<iGM_Launcher_InstanceRecord | null>(null);
  const [pendingRename, setPendingRename] = useState<iGM_Launcher_InstanceRecord | null>(null);
  // 模块五：扫描面板开关与「浏览并扫描」的进行中标记
  const [scanPanelOpen, setScanPanelOpen] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  // 模块八：待启动实例（非空时弹出登录方式选择对话框，确认后跳转独立启动进度页）
  const [launchTarget, setLaunchTarget] = useState<iGM_Launcher_InstanceRecord | null>(null);

  /** 默认选中的正版绑定：优先标记为默认的绑定，否则取第一条 */
  const defaultBindingId = useMemo(
    () => mcBindings.find((item) => item.isDefault)?.id ?? mcBindings[0]?.id ?? "",
    [mcBindings],
  );

  // 版本筛选候选：实例中实际出现过的版本
  const versionOptions = useMemo(
    () => Array.from(new Set(instances.map((item) => item.minecraftVersion))).sort().reverse(),
    [instances],
  );

  const visibleInstances = useMemo(() => {
    const lowerKeyword = keyword.trim().toLowerCase();
    const filtered = instances.filter((item) => {
      if (versionFilter && item.minecraftVersion !== versionFilter) return false;
      if (loaderFilter && item.loader !== (loaderFilter as iGM_Launcher_LoaderType)) return false;
      if (!lowerKeyword) return true;
      return (
        item.name.toLowerCase().includes(lowerKeyword) ||
        item.note.toLowerCase().includes(lowerKeyword)
      );
    });
    return iGM_Launcher_SortInstances(filtered, sortKey);
  }, [instances, keyword, versionFilter, loaderFilter, sortKey]);

  // 模块七：当前勾选的实例（用于底部启动栏展示名称与启动目标）
  const selectedInstance = useMemo(
    () => instances.find((item) => item.id === selectedInstanceId) ?? null,
    [instances, selectedInstanceId],
  );

  const isFiltering = Boolean(keyword.trim() || versionFilter || loaderFilter);
  const loaderOptions = [
    { value: "", label: t("allLoaders") },
    ...IGM_LAUNCHER_LOADER_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label,
    })),
  ];

  const openEditor = (instanceId?: string) => {
    navigate("instancesEdit", instanceId ? { instanceId } : undefined);
  };

  /** 打开扫描面板：首次打开时立即扫描一次本机常见目录 */
  const openScanPanel = () => {
    setScanPanelOpen(true);
    void scanGameDirs();
  };

  /**
   * 浏览并扫描：调起系统目录选择器由用户自行选择，选中后直接扫描并登记；
   * 用户取消选择时不提示、不登记。所选目录不含 versions/ 时由桥接层
   * 自动回退一层到其下的 .minecraft，选到哪一级都能识别。
   */
  const browseAndScan = async () => {
    setBrowsing(true);
    try {
      const picked = await pickDir();
      if (!picked) return;
      await addGameDir(picked);
    } finally {
      setBrowsing(false);
    }
  };

  return (
    <div className={styles.page}>
      <IGM_Launcher_PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <div className={styles.headerActions}>
            <IGM_Launcher_Button
              variant="secondary"
              disabled={scanningGameDirs}
              onClick={openScanPanel}
            >
              <FolderSearch size={15} strokeWidth={1.8} />
              {scanningGameDirs ? t("scanning") : t("scanGame")}
            </IGM_Launcher_Button>
            <IGM_Launcher_Button variant="primary" onClick={() => openEditor()}>
              <Plus size={15} strokeWidth={1.8} />
              {t("newInstance")}
            </IGM_Launcher_Button>
          </div>
        }
      />

      {/* 模块五：扫描本机游戏面板 */}
      {scanPanelOpen ? (
        <IGM_Launcher_Card className={styles.scanPanel}>
          <div className={styles.scanHead}>
            <h2 className={styles.scanTitle}>
              <FolderSearch size={15} strokeWidth={1.8} />
              {t("scanTitle")}
            </h2>
            <IGM_Launcher_Button
              variant="ghost"
              className={styles.scanClose}
              aria-label={tCommon("cancel")}
              onClick={() => setScanPanelOpen(false)}
            >
              <X size={15} strokeWidth={1.8} />
            </IGM_Launcher_Button>
          </div>
          <p className={styles.scanDesc}>{t("scanDesc")}</p>

          {/* 浏览本机目录并扫描 */}
          <div className={styles.scanManual}>
            <IGM_Launcher_Button
              variant="secondary"
              disabled={browsing}
              onClick={() => void browseAndScan()}
            >
              <FolderOpen size={14} strokeWidth={1.8} />
              {t("scanBrowse")}
            </IGM_Launcher_Button>
          </div>

          {gameDirs.length === 0 ? (
            <p className={styles.scanEmpty}>{t("scanEmpty")}</p>
          ) : (
            <ul className={styles.scanList}>
              {gameDirs.map((dir) => {
                const result = scanResults.find((item) => item.path === dir.path);
                return (
                  <li key={dir.id} className={styles.scanItem}>
                    <div className={styles.scanItemHead}>
                      <span className={styles.scanPath} title={dir.path}>
                        {dir.path}
                      </span>
                      {dir.isDefault ? (
                        <IGM_Launcher_Badge tone="accent">{t("scanDefault")}</IGM_Launcher_Badge>
                      ) : null}
                      <IGM_Launcher_Badge tone="muted">
                        {t("scanVersionCount", { count: dir.versionCount })}
                      </IGM_Launcher_Badge>
                      {dir.hasLibraries ? (
                        <IGM_Launcher_Badge tone="neutral">{t("scanLibraries")}</IGM_Launcher_Badge>
                      ) : null}
                      {dir.hasAssets ? (
                        <IGM_Launcher_Badge tone="neutral">{t("scanAssets")}</IGM_Launcher_Badge>
                      ) : null}
                    </div>
                    {result && result.versions.length > 0 ? (
                      <div className={styles.scanVersions}>
                        {result.versions.map((version) => (
                          <div key={version.jsonPath} className={styles.scanVersionRow}>
                            <span className={styles.scanVersionName}>{version.id}</span>
                            <IGM_Launcher_Badge tone={version.loader === "fabric" ? "accent" : "neutral"}>
                              {version.loader}
                            </IGM_Launcher_Badge>
                            <IGM_Launcher_Button
                              variant="secondary"
                              className={styles.scanImport}
                              onClick={() => void importInstance(version.jsonPath)}
                            >
                              {t("scanImport")}
                            </IGM_Launcher_Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className={styles.scanNoVersion}>{t("scanNoVersion")}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className={styles.scanHint}>{t("scanHint")}</p>
        </IGM_Launcher_Card>
      ) : null}

      {/* 工具栏：搜索 / 筛选 / 排序 / 视图切换 */}
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <Search size={14} strokeWidth={1.8} className={styles.searchIcon} />
          <IGM_Launcher_Input
            className={styles.searchInput}
            value={keyword}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </div>

        <IGM_Launcher_Select
          className={styles.filterSelect}
          value={versionFilter}
          aria-label={t("filterVersion")}
          onChange={(event) => setVersionFilter(event.target.value)}
        >
          <option value="">{t("allVersions")}</option>
          {versionOptions.map((version) => (
            <option key={version} value={version}>
              {version}
            </option>
          ))}
        </IGM_Launcher_Select>

        <IGM_Launcher_Select
          className={styles.filterSelect}
          value={loaderFilter}
          aria-label={t("filterLoader")}
          onChange={(event) => setLoaderFilter(event.target.value)}
        >
          {loaderOptions.map((option) => (
            <option key={option.value || "all"} value={option.value}>
              {option.label}
            </option>
          ))}
        </IGM_Launcher_Select>

        <IGM_Launcher_Segmented
          ariaLabel={t("sortLastPlayed")}
          value={sortKey}
          onChange={(value) => setSortKey(value as iGM_Launcher_SortKey)}
          options={[
            { value: "lastPlayed", label: t("sortLastPlayed") },
            { value: "name", label: t("sortName") },
            { value: "created", label: t("sortCreated") },
          ]}
        />

        <IGM_Launcher_Segmented
          ariaLabel={t("viewLabel")}
          value={view}
          onChange={(value) => setView(value as iGM_Launcher_ViewMode)}
          options={[
            { value: "grid", label: t("viewGrid"), icon: LayoutGrid },
            { value: "list", label: t("viewList"), icon: List },
          ]}
        />
      </div>

      {loading ? (
        <p className={styles.stateLine}>{tCommon("loading")}</p>
      ) : instances.length === 0 ? (
        /* 空状态：首次使用的引导 */
        <IGM_Launcher_Card className={styles.emptyCard}>
          <h2 className={styles.emptyTitle}>{t("emptyTitle")}</h2>
          <p className={styles.emptyDesc}>{t("emptyDesc")}</p>
          <IGM_Launcher_Button variant="primary" onClick={() => openEditor()}>
            <Plus size={15} strokeWidth={1.8} />
            {t("emptyAction")}
          </IGM_Launcher_Button>
        </IGM_Launcher_Card>
      ) : visibleInstances.length === 0 ? (
        /* 筛选后为空：与首次空状态区分 */
        <IGM_Launcher_Card className={styles.emptyCard}>
          <h2 className={styles.emptyTitle}>{t("filteredEmptyTitle")}</h2>
          <p className={styles.emptyDesc}>{t("filteredEmptyDesc")}</p>
        </IGM_Launcher_Card>
      ) : (
        <>
          <p className={styles.countLine}>{t("count", { count: visibleInstances.length })}</p>
          <div className={view === "grid" ? styles.grid : styles.list}>
            {visibleInstances.map((instance) => (
              <IGM_Launcher_InstanceCard
                key={instance.id}
                instance={instance}
                view={view}
                selected={instance.id === selectedInstanceId}
                onToggleChecked={() =>
                  selectInstance(instance.id === selectedInstanceId ? null : instance.id)
                }
                onEdit={() => {
                  selectInstance(instance.id);
                  openEditor(instance.id);
                }}
                onCopy={() => void duplicateInstance(instance.id)}
                onRename={() => setPendingRename(instance)}
                onDelete={() => setPendingDelete(instance)}
              />
            ))}
          </div>
        </>
      )}

      {/* 模块七：底部统一启动栏——必须先勾选实例，未勾选时按钮置灰并给出提示 */}
      {loading || instances.length === 0 ? null : (
        <div className={styles.launchBar}>
          <span className={styles.launchInfo}>
            {selectedInstance !== null ? (
              <>
                <Play size={14} strokeWidth={1.8} className={styles.launchIcon} />
                {selectedInstance.name}
              </>
            ) : (
              t("selectHint")
            )}
          </span>
          <IGM_Launcher_Button
            variant="primary"
            disabled={selectedInstance === null}
            onClick={() => {
              if (selectedInstance) setLaunchTarget(selectedInstance);
            }}
          >
            <Play size={15} strokeWidth={1.8} />
            {t("launch")}
          </IGM_Launcher_Button>
        </div>
      )}

      {/* 模块八：启动前必须由用户显式选择登录方式（正版 / 离线），不记忆上一次选择 */}
      <IGM_Launcher_LaunchModeDialog
        open={launchTarget !== null}
        instanceName={launchTarget?.name ?? ""}
        bindings={mcBindings}
        defaultBindingId={defaultBindingId}
        confirmLabel={t("launch")}
        onCancel={() => setLaunchTarget(null)}
        onConfirm={(mode, bindingId) => {
          const target = launchTarget;
          setLaunchTarget(null);
          if (target) navigate("launchProgress", { instanceId: target.id, mode, bindingId });
        }}
      />

      {isFiltering ? null : <IGM_Launcher_PlaceholderNote>{t("emptyHint")}</IGM_Launcher_PlaceholderNote>}

      <IGM_Launcher_ConfirmDialog
        open={pendingDelete !== null}
        danger
        title={t("confirmDeleteTitle")}
        description={t("confirmDeleteDesc", { name: pendingDelete?.name ?? "" })}
        confirmLabel={t("confirmDelete")}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (target) void deleteInstance(target.id);
        }}
      />

      <IGM_Launcher_PromptDialog
        open={pendingRename !== null}
        title={t("renameTitle")}
        label={t("renamePlaceholder")}
        placeholder={t("renamePlaceholder")}
        initialValue={pendingRename?.name ?? ""}
        confirmLabel={tCommon("save")}
        onCancel={() => setPendingRename(null)}
        onConfirm={(value) => {
          const target = pendingRename;
          setPendingRename(null);
          if (target) void renameInstance(target.id, value);
        }}
      />
    </div>
  );
}

// 导出 //
export default iGM_Launcher_InstancesPage;