/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Pages/iGM_Launcher_DownloadsPage.tsx
 * 所属层：前端 / 页面层
 * 路由：G_Downloads（SPA 页 id：downloads）
 * 模块：iGM_Launcher_DownloadsPage
 * 作用：下载中心，上半部分浏览 Modrinth 第三方资源，下半部分展示当前下载任务
 * 内容：资源搜索（thirdParty:search，支持关键字与类型筛选）、资源卡片列表
 *       （封面 / 名称 / 类型徽章 / 作者 / Modrinth 来源标识）；
 *       点击卡片展开版本选择（thirdParty:resource），选择版本 + 目标目录后
 *       发起下载（thirdParty:download-start）；
 *       任务列表（thirdParty:download-list）在存在进行中任务时按固定间隔轮询，
 *       每个任务展示资源名称 / 类型 / 版本、进度条、已下载与总大小、速度、剩余时间，
 *       支持暂停/继续、取消、重试、移除、打开文件所在目录；
 *       已完成任务折叠展示，支持一键清空已完成，并提供「安装到实例」路径提示
 *
 * 说明：本页只支持 Fabric 加载器与 Modrinth 平台；资源文件不落本站，
 *       下载任务由主站后端统一管理（与网站下载中心共用同一套任务），
 *       界面进度与状态全部来自后端返回值，不伪造任何进度；
 *       浏览器调试环境无本机磁盘与原生能力，桥接层会如实拒绝并回传原因。
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FolderOpen,
  Loader2,
  Package,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  IGM_LAUNCHER_THIRD_PARTY_INSTANCE_SUBDIRS,
  IGM_LAUNCHER_THIRD_PARTY_PAGE_SIZE,
  IGM_LAUNCHER_THIRD_PARTY_POLL_MS,
  IGM_LAUNCHER_THIRD_PARTY_TYPES,
  iGM_Launcher_FormatSize,
  iGM_Launcher_JoinPath,
  type iGM_Launcher_BridgeResponse,
  type iGM_Launcher_ThirdPartyResource,
  type iGM_Launcher_ThirdPartyResourceType,
  type iGM_Launcher_ThirdPartyTask,
  type iGM_Launcher_ThirdPartyTaskStatus,
  type iGM_Launcher_ThirdPartyVersion,
} from "@igm-launcher/shared";
import {
  iGM_Launcher_Badge as IGM_Launcher_Badge,
  iGM_Launcher_Button as IGM_Launcher_Button,
  iGM_Launcher_Card as IGM_Launcher_Card,
  iGM_Launcher_PageHeader as IGM_Launcher_PageHeader,
} from "@/components/iGM_Launcher_Primitives/iGM_Launcher_Primitives";
import {
  iGM_Launcher_Field as IGM_Launcher_Field,
  iGM_Launcher_Input as IGM_Launcher_Input,
  iGM_Launcher_Select as IGM_Launcher_Select,
} from "@/components/iGM_Launcher_Forms/iGM_Launcher_FormControls";
import {
  iGM_Launcher_BridgeCall,
  iGM_Launcher_SendHostMessage,
} from "@/components/iGM_Launcher_Bridge/iGM_Launcher_BridgeClient";
import { iGM_Launcher_ResolveServerMessage } from "@/components/iGM_Launcher_Bridge/iGM_Launcher_ServerError";
import { iGM_Launcher_UseStore } from "@/components/iGM_Launcher_Store/iGM_Launcher_StoreProvider";
import styles from "./iGM_Launcher_DownloadsPage.module.css";

// 类型定义 //
/** 类型筛选值：空串表示全部 */
type iGM_Launcher_ThirdPartyTypeFilter = iGM_Launcher_ThirdPartyResourceType | "";

/** 任务状态到徽章色调（基础徽章无危险色，失败与取消统一用弱化色） */
function iGM_Launcher_TaskTone(
  status: iGM_Launcher_ThirdPartyTaskStatus,
): "neutral" | "accent" | "success" | "muted" {
  if (status === "completed") return "success";
  if (status === "downloading") return "accent";
  if (status === "failed" || status === "canceled") return "muted";
  return "neutral";
}

/** 任务是否处于进行中（进行中才需要轮询） */
function iGM_Launcher_TaskActive(status: iGM_Launcher_ThirdPartyTaskStatus): boolean {
  return status === "pending" || status === "downloading";
}

/** 字节数格式化：0 与未知统一显示 0 B，避免空串 */
function iGM_Launcher_Bytes(value: number): string {
  return iGM_Launcher_FormatSize(value) || "0 B";
}

/** 剩余时间格式化：秒 -> 1m20s / 45s，未知返回空串由界面显示占位 */
function iGM_Launcher_EtaText(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
}

// 核心逻辑 //
export function iGM_Launcher_DownloadsPage() {
  const t = useTranslations("thirdParty");
  const tCommon = useTranslations("common");
  const { instances, pickDir } = iGM_Launcher_UseStore();

  /* ---------- 资源浏览状态 ---------- */

  const [keyword, setKeyword] = useState("");
  const [typeFilter, setTypeFilter] = useState<iGM_Launcher_ThirdPartyTypeFilter>("");
  const [resources, setResources] = useState<iGM_Launcher_ThirdPartyResource[]>([]);
  const [searchPage, setSearchPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const [expandedId, setExpandedId] = useState("");
  const [versions, setVersions] = useState<Record<string, iGM_Launcher_ThirdPartyVersion[]>>({});
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState("");
  const [selectedVersion, setSelectedVersion] = useState<Record<string, string>>({});

  const [targetDir, setTargetDir] = useState("");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const [startNotice, setStartNotice] = useState("");

  /* ---------- 下载任务状态 ---------- */

  const [tasks, setTasks] = useState<iGM_Launcher_ThirdPartyTask[]>([]);
  const [tasksError, setTasksError] = useState("");
  const [tasksLoading, setTasksLoading] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [installTaskId, setInstallTaskId] = useState("");
  const [installInstanceId, setInstallInstanceId] = useState("");
  const [revealedPath, setRevealedPath] = useState("");

  /* ---------- 资源搜索 ---------- */

  const loadResources = useCallback(
    async (page: number, kw: string, type: iGM_Launcher_ThirdPartyTypeFilter) => {
      setSearching(true);
      setSearchError("");
      const response = await iGM_Launcher_BridgeCall("thirdParty:search", {
        query: kw.trim() || undefined,
        resourceType: type || undefined,
        page,
        pageSize: IGM_LAUNCHER_THIRD_PARTY_PAGE_SIZE,
      });
      setSearching(false);
      const data = response.data;
      if (!response.success || !data) {
        setSearchError(iGM_Launcher_ResolveServerMessage(t, response.message, "searchFailed"));
        return;
      }
      setResources(data.items);
      setTotal(data.total);
      setSearchPage(data.page || page);
      setTotalPages(data.totalPages || 0);
    },
    [t],
  );

  // 首帧加载一次（空关键字、全部类型），避免页面初视为空白
  useEffect(() => {
    void loadResources(1, "", "");
  }, [loadResources]);

  const handleSearchSubmit = (event: FormEvent) => {
    event.preventDefault();
    void loadResources(1, keyword, typeFilter);
  };

  const handleTypeChange = (value: iGM_Launcher_ThirdPartyTypeFilter) => {
    setTypeFilter(value);
    void loadResources(1, keyword, value);
  };

  const handleLoadMore = () => {
    void loadResources(searchPage + 1, keyword, typeFilter);
  };

  /** 展开 / 收起版本选择：首次展开时拉取版本列表并缓存 */
  const handleToggleResource = async (resource: iGM_Launcher_ThirdPartyResource) => {
    if (expandedId === resource.id) {
      setExpandedId("");
      return;
    }
    setExpandedId(resource.id);
    setStartError("");
    setStartNotice("");
    setVersionsError("");
    if (versions[resource.id]) return;
    setVersionsLoading(true);
    const response = await iGM_Launcher_BridgeCall("thirdParty:resource", {
      resourceId: resource.id,
    });
    setVersionsLoading(false);
    const data = response.data;
    if (!response.success || !data) {
      setVersionsError(iGM_Launcher_ResolveServerMessage(t, response.message, "versionsFailed"));
      return;
    }
    setVersions((current) => ({ ...current, [resource.id]: data.versions }));
  };

  /* ---------- 下载任务 ---------- */

  const refreshTasks = useCallback(async () => {
    setTasksLoading(true);
    const response = await iGM_Launcher_BridgeCall("thirdParty:download-list");
    setTasksLoading(false);
    const data = response.data;
    if (!response.success || !data) {
      setTasksError(iGM_Launcher_ResolveServerMessage(t, response.message, "tasksFailed"));
      return;
    }
    setTasksError("");
    setTasks(data.items);
  }, [t]);

  useEffect(() => {
    void refreshTasks();
  }, [refreshTasks]);

  const hasActiveTask = useMemo(() => tasks.some((task) => iGM_Launcher_TaskActive(task.status)), [tasks]);

  // 仅在有进行中的任务时轮询，空闲时不打网络
  useEffect(() => {
    if (!hasActiveTask) return;
    const timer = window.setInterval(() => {
      void refreshTasks();
    }, IGM_LAUNCHER_THIRD_PARTY_POLL_MS);
    return () => window.clearInterval(timer);
  }, [hasActiveTask, refreshTasks]);

  /** 统一的下载任务操作：失败回显原因，成功后刷新列表 */
  const handleTaskAction = async (action: () => Promise<iGM_Launcher_BridgeResponse>) => {
    const response = await action();
    if (!response.success) {
      setTasksError(iGM_Launcher_ResolveServerMessage(t, response.message, "actionFailed"));
      return;
    }
    setTasksError("");
    await refreshTasks();
  };

  const handleStartDownload = async (resource: iGM_Launcher_ThirdPartyResource) => {
    const versionId = selectedVersion[resource.id] ?? "";
    if (!versionId) {
      setStartError(t("versionRequired"));
      return;
    }
    const target = targetDir.trim();
    if (!target) {
      setStartError(t("targetDirRequired"));
      return;
    }
    setStarting(true);
    setStartError("");
    setStartNotice("");
    const response = await iGM_Launcher_BridgeCall("thirdParty:download-start", {
      resourceId: resource.id,
      versionId,
      target,
    });
    setStarting(false);
    if (!response.success || !response.data) {
      setStartError(iGM_Launcher_ResolveServerMessage(t, response.message, "startFailed"));
      return;
    }
    /*
     * 下载过程独立到窄进度窗口：无论建单成功与否都必须弹出窗口，
     * 建单失败时把引擎错误（engineError）原样带过去，由窗口展示红字，
     * 以此彻底消除「点击下载无反应」的静默失败。
     */
    const { task, engine, engineError } = response.data;
    const versionLabel =
      versions[resource.id]?.find((item) => item.id === versionId)?.version ?? "";
    iGM_Launcher_SendHostMessage({
      type: "window:open-download-progress",
      taskId: task?.id ?? "",
      resourceName: resource.name,
      version: versionLabel,
      targetDir: task?.targetDir ?? target,
      engine,
      engineError,
    });
    setStartNotice(t("startQueued"));
    await refreshTasks();
  };

  const handleClearCompleted = async () => {
    const response = await iGM_Launcher_BridgeCall("thirdParty:download-clear-completed");
    const data = response.data;
    if (!response.success || !data) {
      setTasksError(iGM_Launcher_ResolveServerMessage(t, response.message, "clearCompletedFailed"));
      return;
    }
    await refreshTasks();
  };

  /** 打开文件所在目录：系统未接管时回退为高亮路径文本 */
  const handleOpenPath = async (path: string) => {
    const response = await iGM_Launcher_BridgeCall("shell:open-path", { openPath: path });
    if (response.success && response.data?.opened) {
      setRevealedPath("");
      return;
    }
    setRevealedPath(path);
  };

  const activeTasks = useMemo(() => tasks.filter((task) => task.status !== "completed"), [tasks]);
  const completedTasks = useMemo(() => tasks.filter((task) => task.status === "completed"), [tasks]);

  /** 单个任务卡片 */
  const renderTask = (task: iGM_Launcher_ThirdPartyTask) => {
    const active = iGM_Launcher_TaskActive(task.status);
    const percent = Math.max(0, Math.min(100, Math.round(task.progress)));
    const speedText = task.speed > 0 ? `${iGM_Launcher_FormatSize(task.speed)}/s` : "—";
    const etaText = iGM_Launcher_EtaText(task.eta) || "—";
    const installInstance =
      instances.find((item) => item.id === installInstanceId) ?? instances[0] ?? null;
    const installTarget = installInstance
      ? iGM_Launcher_JoinPath(
          installInstance.directory,
          IGM_LAUNCHER_THIRD_PARTY_INSTANCE_SUBDIRS[task.type],
        )
      : "";
    return (
      <IGM_Launcher_Card key={task.id} className={styles.taskCard}>
        <div className={styles.taskHead}>
          <span className={styles.taskName}>{task.name}</span>
          <IGM_Launcher_Badge tone="neutral">{t(`type_${task.type}`)}</IGM_Launcher_Badge>
          <span className={styles.taskVersion}>{task.version}</span>
          <IGM_Launcher_Badge tone={iGM_Launcher_TaskTone(task.status)}>
            {t(`status_${task.status}`)}
          </IGM_Launcher_Badge>
        </div>

        {/* 进度条：完全由后端返回的 progress 驱动 */}
        <div className={styles.progressTrack}>
          <div className={styles.progressBar} style={{ width: `${percent}%` }} />
        </div>

        <div className={styles.metaRow}>
          <span className={styles.metaText}>{t("progressPercent", { percent })}</span>
          <span className={styles.metaText}>
            {t("taskSize", {
              done: iGM_Launcher_Bytes(task.downloaded),
              total: iGM_Launcher_FormatSize(task.size) || t("taskSizeUnknown"),
            })}
          </span>
          {active || task.status === "paused" ? (
            <>
              <span className={styles.metaText}>
                {t("speedLabel")} {speedText}
              </span>
              <span className={styles.metaText}>
                {t("etaLabel")} {etaText}
              </span>
            </>
          ) : null}
        </div>

        {task.filePath ? (
          <div className={styles.detailRow}>
            <span className={styles.metaLabel}>
              <FolderOpen size={13} strokeWidth={1.8} />
              {t("folderPathLabel")}
            </span>
            <span className={styles.pathText}>{task.filePath}</span>
          </div>
        ) : null}

        {task.status === "failed" && task.error ? (
          <p className={styles.errorText}>
            <AlertCircle size={13} strokeWidth={1.8} />
            {iGM_Launcher_ResolveServerMessage(t, task.error, "serverGeneric")}
          </p>
        ) : null}

        {revealedPath && revealedPath === task.filePath ? (
          <p className={styles.hintText}>{t("revealPathHint")}</p>
        ) : null}

        <div className={styles.taskActions}>
          {task.status === "pending" || task.status === "downloading" ? (
            <IGM_Launcher_Button
              variant="secondary"
              onClick={() =>
                void handleTaskAction(() =>
                  iGM_Launcher_BridgeCall("thirdParty:download-pause", {
                    taskId: task.id,
                    paused: true,
                  }),
                )
              }
            >
              <Pause size={14} strokeWidth={1.8} />
              {t("pauseAction")}
            </IGM_Launcher_Button>
          ) : null}

          {task.status === "paused" ? (
            <IGM_Launcher_Button
              variant="secondary"
              onClick={() =>
                void handleTaskAction(() =>
                  iGM_Launcher_BridgeCall("thirdParty:download-pause", {
                    taskId: task.id,
                    paused: false,
                  }),
                )
              }
            >
              <Play size={14} strokeWidth={1.8} />
              {t("resumeAction")}
            </IGM_Launcher_Button>
          ) : null}

          {task.status === "failed" || task.status === "canceled" ? (
            <IGM_Launcher_Button
              variant="secondary"
              onClick={() =>
                void handleTaskAction(() =>
                  iGM_Launcher_BridgeCall("thirdParty:download-retry", {
                    taskId: task.id,
                  }),
                )
              }
            >
              <RotateCcw size={14} strokeWidth={1.8} />
              {t("retryAction")}
            </IGM_Launcher_Button>
          ) : null}

          {active || task.status === "paused" ? (
            <IGM_Launcher_Button
              variant="ghost"
              onClick={() =>
                void handleTaskAction(() =>
                  iGM_Launcher_BridgeCall("thirdParty:download-cancel", { taskId: task.id }),
                )
              }
            >
              <XCircle size={14} strokeWidth={1.8} />
              {t("cancelAction")}
            </IGM_Launcher_Button>
          ) : null}

          {task.filePath ? (
            <IGM_Launcher_Button variant="ghost" onClick={() => void handleOpenPath(task.filePath)}>
              <FolderOpen size={14} strokeWidth={1.8} />
              {t("openFolderAction")}
            </IGM_Launcher_Button>
          ) : null}

          {task.status === "completed" ? (
            <IGM_Launcher_Button
              variant="secondary"
              onClick={() => setInstallTaskId(installTaskId === task.id ? "" : task.id)}
            >
              <Download size={14} strokeWidth={1.8} />
              {t("installToInstance")}
            </IGM_Launcher_Button>
          ) : null}

          {task.status === "failed" || task.status === "canceled" || task.status === "completed" ? (
            <IGM_Launcher_Button
              variant="ghost"
              onClick={() =>
                void handleTaskAction(() =>
                  iGM_Launcher_BridgeCall("thirdParty:download-remove", { taskId: task.id }),
                )
              }
            >
              <Trash2 size={14} strokeWidth={1.8} />
              {t("removeAction")}
            </IGM_Launcher_Button>
          ) : null}
        </div>

        {/* 安装到实例：当前版本仅提供目标目录提示与打开下载目录，不自动复制文件 */}
        {task.status === "completed" && installTaskId === task.id ? (
          <div className={styles.installPanel}>
            <h4 className={styles.installTitle}>{t("installTitle")}</h4>
            {instances.length === 0 ? (
              <p className={styles.note}>{t("installNoInstance")}</p>
            ) : (
              <>
                <IGM_Launcher_Field label={t("installSelectInstance")}>
                  <IGM_Launcher_Select
                    value={installInstance?.id ?? ""}
                    onChange={(event) => setInstallInstanceId(event.target.value)}
                  >
                    {instances.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </IGM_Launcher_Select>
                </IGM_Launcher_Field>
                <div className={styles.detailRow}>
                  <span className={styles.metaLabel}>{t("installTargetLabel")}</span>
                  <span className={styles.pathText}>{installTarget}</span>
                </div>
                <p className={styles.note}>{t("installHint")}</p>
                {task.filePath ? (
                  <IGM_Launcher_Button
                    variant="ghost"
                    onClick={() => void handleOpenPath(task.filePath)}
                  >
                    <FolderOpen size={14} strokeWidth={1.8} />
                    {t("installOpenSource")}
                  </IGM_Launcher_Button>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </IGM_Launcher_Card>
    );
  };

  return (
    <div className={styles.page}>
      <IGM_Launcher_PageHeader title={t("title")} description={t("subtitle")} />

      {/* 搜索框：真实调用 thirdParty:search */}
      <form className={styles.searchBox} onSubmit={handleSearchSubmit}>
        <Search size={15} strokeWidth={1.8} className={styles.searchIcon} />
        <input
          type="search"
          className={styles.searchInput}
          placeholder={t("searchPlaceholder")}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <IGM_Launcher_Button variant="secondary" type="submit" disabled={searching}>
          {searching ? t("searching") : t("searchAction")}
        </IGM_Launcher_Button>
      </form>

      {/* 类型筛选 */}
      <div className={styles.categoryRow}>
        <button
          type="button"
          className={`${styles.chip} ${typeFilter === "" ? styles.chipActive : ""}`}
          onClick={() => handleTypeChange("")}
        >
          {t("typeAll")}
        </button>
        {IGM_LAUNCHER_THIRD_PARTY_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            className={`${styles.chip} ${typeFilter === type ? styles.chipActive : ""}`}
            onClick={() => handleTypeChange(type)}
          >
            {t(`type_${type}`)}
          </button>
        ))}
      </div>

      {searchError ? (
        <p className={styles.errorText}>
          <AlertCircle size={13} strokeWidth={1.8} />
          {searchError}
        </p>
      ) : null}

      <h3 className={styles.sectionTitle}>{t("resultsSummary", { total })}</h3>

      {resources.length === 0 ? (
        <IGM_Launcher_Card className={styles.emptyCard}>
          <p className={styles.note}>{searching ? t("searching") : t("noResults")}</p>
          <p className={styles.hintText}>{t("noResultsHint")}</p>
        </IGM_Launcher_Card>
      ) : (
        <div className={styles.grid}>
          {resources.map((resource) => {
            const expanded = expandedId === resource.id;
            const list = versions[resource.id] ?? [];
            const picked = selectedVersion[resource.id] ?? "";
            const pickedVersion = list.find((item) => item.id === picked) ?? null;
            return (
              <IGM_Launcher_Card key={resource.id} className={styles.resourceCard}>
                <button
                  type="button"
                  className={styles.resourceMain}
                  onClick={() => void handleToggleResource(resource)}
                >
                  <span className={styles.cover}>
                    {resource.coverUrl ? (
                      <img
                        src={resource.coverUrl}
                        alt={resource.name}
                        className={styles.coverImage}
                        loading="lazy"
                      />
                    ) : (
                      <Package size={20} strokeWidth={1.6} />
                    )}
                  </span>
                  <span className={styles.resourceBody}>
                    <span className={styles.resourceNameRow}>
                      <span className={styles.resourceName}>{resource.name}</span>
                      <IGM_Launcher_Badge tone="neutral">{t(`type_${resource.type}`)}</IGM_Launcher_Badge>
                    </span>
                    <span className={styles.resourceDesc}>{resource.description}</span>
                  </span>
                  <span className={styles.resourceMeta}>
                    <span>{t("sourceModrinth")}</span>
                    <span>
                      {t("authorLabel")} {resource.author || tCommon("unknown")}
                    </span>
                    <span>
                      {t("downloadsLabel")} {resource.downloads}
                    </span>
                  </span>
                  <span className={styles.expandIcon}>
                    {expanded ? (
                      <ChevronDown size={16} strokeWidth={1.8} />
                    ) : (
                      <ChevronRight size={16} strokeWidth={1.8} />
                    )}
                  </span>
                </button>

                {expanded ? (
                  <div className={styles.versionPanel}>
                    {versionsLoading ? (
                      <p className={styles.note}>
                        <Loader2 size={13} strokeWidth={1.8} className={styles.spin} />
                        {t("versionsLoading")}
                      </p>
                    ) : versionsError ? (
                      <p className={styles.errorText}>
                        <AlertCircle size={13} strokeWidth={1.8} />
                        {versionsError}
                      </p>
                    ) : list.length === 0 ? (
                      <p className={styles.note}>{t("versionsEmpty")}</p>
                    ) : (
                      <>
                        <IGM_Launcher_Field label={t("versionPickerTitle")}>
                          <IGM_Launcher_Select
                            value={picked}
                            onChange={(event) =>
                              setSelectedVersion((current) => ({
                                ...current,
                                [resource.id]: event.target.value,
                              }))
                            }
                          >
                            <option value="">{t("selectVersion")}</option>
                            {list.map((version) => (
                              <option key={version.id} value={version.id}>
                                {version.version} · {t(`versionType_${version.versionType}`)}
                              </option>
                            ))}
                          </IGM_Launcher_Select>
                        </IGM_Launcher_Field>

                        {pickedVersion ? (
                          <div className={styles.versionMeta}>
                            <IGM_Launcher_Badge
                              tone={pickedVersion.versionType === "release" ? "success" : "muted"}
                            >
                              {t(`versionType_${pickedVersion.versionType}`)}
                            </IGM_Launcher_Badge>
                            <span className={styles.metaText}>
                              {t("gameVersionLabel")}{" "}
                              {pickedVersion.gameVersions.join(", ") || "—"}
                            </span>
                            <span className={styles.metaText}>
                              {t("loaderLabel")} {pickedVersion.loaders.join(", ") || "—"}
                            </span>
                            <span className={styles.metaText}>
                              {t("versionSizeLabel")} {iGM_Launcher_Bytes(pickedVersion.size)}
                            </span>
                            <span className={styles.metaText}>
                              {t("versionDateLabel")}{" "}
                              {pickedVersion.publishedAt
                                ? pickedVersion.publishedAt.slice(0, 10)
                                : "—"}
                            </span>
                          </div>
                        ) : null}

                        <IGM_Launcher_Field label={t("targetDirLabel")} hint={t("fabricNote")}>
                          <div className={styles.targetRow}>
                            <IGM_Launcher_Input
                              value={targetDir}
                              placeholder={t("targetDirPlaceholder")}
                              onChange={(event) => setTargetDir(event.target.value)}
                            />
                            <IGM_Launcher_Button
                              variant="secondary"
                              onClick={() =>
                                void pickDir(targetDir.trim() || undefined).then((path) => {
                                  if (path) setTargetDir(path);
                                })
                              }
                            >
                              <FolderOpen size={14} strokeWidth={1.8} />
                              {tCommon("browse")}
                            </IGM_Launcher_Button>
                          </div>
                        </IGM_Launcher_Field>

                        {startError ? (
                          <p className={styles.errorText}>
                            <AlertCircle size={13} strokeWidth={1.8} />
                            {startError}
                          </p>
                        ) : null}
                        {startNotice ? (
                          <p className={styles.okText}>
                            <CheckCircle2 size={13} strokeWidth={1.8} />
                            {startNotice}
                          </p>
                        ) : null}

                        <IGM_Launcher_Button
                          variant="primary"
                          disabled={starting || !picked}
                          onClick={() => void handleStartDownload(resource)}
                        >
                          <Download size={14} strokeWidth={2} />
                          {starting ? t("starting") : t("startDownload")}
                        </IGM_Launcher_Button>
                      </>
                    )}
                  </div>
                ) : null}
              </IGM_Launcher_Card>
            );
          })}
        </div>
      )}

      {searchPage < totalPages ? (
        <div className={styles.moreRow}>
          <IGM_Launcher_Button
            variant="secondary"
            disabled={searching}
            onClick={handleLoadMore}
          >
            <Download size={14} strokeWidth={1.8} />
            {t("loadMore")}
          </IGM_Launcher_Button>
        </div>
      ) : null}

      {/* 当前下载任务 */}
      <div className={styles.sectionHead}>
        <h3 className={styles.sectionTitle}>
          {t("tasksTitle")}
          {tasks.length > 0 ? ` · ${t("tasksCount", { count: tasks.length })}` : ""}
        </h3>
        <IGM_Launcher_Button
          variant="ghost"
          disabled={tasksLoading}
          onClick={() => void refreshTasks()}
        >
          <RefreshCw size={14} strokeWidth={1.8} />
          {t("refreshTasks")}
        </IGM_Launcher_Button>
      </div>

      {tasksError ? (
        <p className={styles.errorText}>
          <AlertCircle size={13} strokeWidth={1.8} />
          {tasksError}
        </p>
      ) : null}

      {tasks.length === 0 ? (
        <IGM_Launcher_Card className={styles.emptyCard}>
          <p className={styles.note}>{t("tasksEmpty")}</p>
          <p className={styles.hintText}>{t("tasksEmptyHint")}</p>
        </IGM_Launcher_Card>
      ) : (
        <>
          {activeTasks.map(renderTask)}

          {completedTasks.length > 0 ? (
            <>
              <div className={styles.completedHead}>
                <button
                  type="button"
                  className={styles.completedToggle}
                  onClick={() => setShowCompleted((current) => !current)}
                >
                  {showCompleted ? (
                    <ChevronDown size={15} strokeWidth={1.8} />
                  ) : (
                    <ChevronRight size={15} strokeWidth={1.8} />
                  )}
                  {t("completedSection", { count: completedTasks.length })}
                </button>
                <IGM_Launcher_Button variant="ghost" onClick={() => void handleClearCompleted()}>
                  <Trash2 size={14} strokeWidth={1.8} />
                  {t("clearCompleted")}
                </IGM_Launcher_Button>
              </div>
              {showCompleted ? (
                <div className={styles.completedList}>{completedTasks.map(renderTask)}</div>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

// 导出 //
export default iGM_Launcher_DownloadsPage;