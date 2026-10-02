/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Pages/iGM_Launcher_ResourceCenterPage.tsx
 * 所属层：前端 / 页面层
 * 路由：G_ResourceCenter（SPA 页 id：resourceCenter）
 * 模块：iGM_Launcher_ResourceCenterPage
 * 作用：资源中心页，合并原「下载中心」与「资源库」两个入口：
 *       上半部资源下载清单（资源搜索 / 详情 / 下载任务 + 版本库列表 / 类型筛选 / 下载安装入口），
 *       下半部版本与资源关系图（iGM_Launcher_RelationGraph）
 * 内容：资源视图——资源搜索（thirdParty:search，关键字与类型筛选）、资源卡片列表、
 *       点击展开版本选择（thirdParty:resource）、选版本 + 目标目录后发起下载
 *       （thirdParty:download-start）；任务列表（thirdParty:download-list）在有进行中任务时轮询，
 *       支持暂停/继续、取消、重试、移除、打开文件所在目录，已完成任务折叠与一键清空；
 *       版本视图——同步状态条、版本类型筛选、按年份分组、已安装标记与下载 / 重新下载入口；
 *       关系图——以 store 中最新正式版为初始中心，节点点击重新居中，
 *       版本节点提供下载安装入口、资源节点切回资源视图并按名称检索。
 *
 * 说明：资源文件不落本站，下载任务由主站后端统一管理（与网站下载中心共用同一套任务），
 *       界面进度与状态全部来自后端返回值，不伪造任何进度；
 *       关系图资源节点与第三方资源 id 分属不同资源空间，故资源入口按资源名检索而非按 id 详情。
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  Boxes,
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
  iGM_Launcher_GroupVersionsByYear,
  iGM_Launcher_JoinPath,
  type iGM_Launcher_BridgeResponse,
  type iGM_Launcher_ResourceGraphNode,
  type iGM_Launcher_ThirdPartyResource,
  type iGM_Launcher_ThirdPartyResourceType,
  type iGM_Launcher_ThirdPartyTask,
  type iGM_Launcher_ThirdPartyTaskStatus,
  type iGM_Launcher_ThirdPartyVersion,
  type iGM_Launcher_VersionType,
} from "@igm-launcher/shared";
import {
  iGM_Launcher_Badge as IGM_Launcher_Badge,
  iGM_Launcher_Button as IGM_Launcher_Button,
  iGM_Launcher_Card as IGM_Launcher_Card,
  iGM_Launcher_PageHeader as IGM_Launcher_PageHeader,
  iGM_Launcher_PlaceholderNote as IGM_Launcher_PlaceholderNote,
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
import { iGM_Launcher_UseShellLayout } from "@/components/iGM_Launcher_AppShell/iGM_Launcher_AppShell";
import { iGM_Launcher_RelationGraph as IGM_Launcher_RelationGraph } from "@/components/iGM_Launcher_Graph/iGM_Launcher_RelationGraph";
import styles from "./iGM_Launcher_ResourceCenterPage.module.css";

// 类型定义 //
/** 资源中心上半部视图：resources 资源下载清单 / versions 版本库 */
type iGM_Launcher_ResourceCenterView = "resources" | "versions";

/** 第三方资源类型筛选值：空串表示全部 */
type iGM_Launcher_ThirdPartyTypeFilter = iGM_Launcher_ThirdPartyResourceType | "";

/** 版本类型筛选值：空串表示全部 */
type iGM_Launcher_VersionTypeFilter = iGM_Launcher_VersionType | "";

/** 版本类型筛选选项（与网站 G_MinecraftVersions 的筛选项保持一致） */
const IGM_VERSION_TYPE_FILTERS: iGM_Launcher_VersionType[] = [
  "release",
  "snapshot",
  "old_beta",
  "old_alpha",
];

/** 版本类型到徽章色调 */
const IGM_VERSION_TYPE_TONE: Record<
  iGM_Launcher_VersionType,
  "neutral" | "accent" | "success" | "muted"
> = {
  release: "accent",
  snapshot: "neutral",
  old_beta: "muted",
  old_alpha: "muted",
  unknown: "muted",
};

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

/** ISO 时间格式化为 YYYY-MM-DD HH:mm，空值回退占位符 */
function iGM_Launcher_FormatSyncedAt(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

// 核心逻辑 //
export function iGM_Launcher_ResourceCenterPage() {
  const t = useTranslations("thirdParty");
  const tCommon = useTranslations("common");
  const tVersions = useTranslations("versions");
  const tRC = useTranslations("resourceCenter");
  const { instances, pickDir, versionLibrary, syncingLibrary, syncVersionLibrary, refreshVersionLibrary } =
    iGM_Launcher_UseStore();
  const { navigate } = iGM_Launcher_UseShellLayout();

  // 上半部视图切换：资源下载清单 / 版本库
  const [view, setView] = useState<iGM_Launcher_ResourceCenterView>("resources");

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
  // 自动定位所用的目标实例；用户手动改过目录（targetEdited）后不再覆盖其选择
  const [targetInstanceId, setTargetInstanceId] = useState("");
  const [targetEdited, setTargetEdited] = useState(false);
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

  /* ---------- 版本库状态 ---------- */
  const [versionTypeFilter, setVersionTypeFilter] = useState<iGM_Launcher_VersionTypeFilter>("");

  /* ---------- 下载目标的自动匹配 ---------- */

  /** 资源类型对应的实例内目标子目录（mods / shaderpacks / resourcepacks / saves / datapacks） */
  const subdirOfType = (type: iGM_Launcher_ThirdPartyResourceType): string =>
    IGM_LAUNCHER_THIRD_PARTY_INSTANCE_SUBDIRS[type] ?? "mods";

  /** 当前生效的目标实例：优先用户选择，缺省取首个实例 */
  const targetInstance = useMemo(
    () => instances.find((item) => item.id === targetInstanceId) ?? instances[0] ?? null,
    [instances, targetInstanceId],
  );

  /**
   * 自动定位下载目录到「当前实例 / 对应类型子文件夹」。
   * force 为 true 时（切换资源）忽略用户上次的手动选择，重新按规则定位；
   * 找不到实例时不改动，交由用户手动选择目标文件夹。
   */
  const applyAutoTarget = (type: iGM_Launcher_ThirdPartyResourceType, force = false) => {
    if (!force && targetEdited) return;
    const instance = instances.find((item) => item.id === targetInstanceId) ?? instances[0] ?? null;
    if (!instance) return;
    setTargetDir(iGM_Launcher_JoinPath(instance.directory, subdirOfType(type)));
  };

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

  // 每次进入资源中心都实时重算版本库安装状态（以本机真实文件为准，不沿用缓存）
  useEffect(() => {
    void refreshVersionLibrary();
  }, [refreshVersionLibrary]);

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
    // 切换资源即按「当前实例 + 资源类型」重新自动定位目标文件夹（用户仍可手动改）
    setTargetEdited(false);
    applyAutoTarget(resource.type, true);
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

  const hasActiveTask = useMemo(
    () => tasks.some((task) => iGM_Launcher_TaskActive(task.status)),
    [tasks],
  );

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
    /*
     * 把所选版本的完整 downloadUrl 与文件名一并交给主进程：
     * 引擎按直链下载，不再把本地版本 id 当作 Modrinth version id 二次解析，避免 404。
     */
    const selected = versions[resource.id]?.find((item) => item.id === versionId);
    const response = await iGM_Launcher_BridgeCall("thirdParty:download-start", {
      resourceId: resource.id,
      versionId,
      downloadUrl: selected?.downloadUrl ?? "",
      filename: selected?.filename ?? "",
      sha1: selected?.sha1 ?? "",
      size: selected?.size ?? 0,
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
  const completedTasks = useMemo(
    () => tasks.filter((task) => task.status === "completed"),
    [tasks],
  );

  /* ---------- 关系图联动 ---------- */

  /** 关系图初始中心：取 store 版本库中首个正式版（无正式版则取首个版本） */
  const graphCenterVersion = useMemo(() => {
    const entries = versionLibrary.entries;
    const release = entries.find((item) => item.type === "release");
    return release?.version ?? entries[0]?.version ?? "";
  }, [versionLibrary.entries]);

  /** 版本节点入口：跳转到下载安装页 */
  const handleOpenVersion = (version: string) => {
    navigate("gameInstall", { version });
  };

  /**
   * 资源节点入口：切回资源视图并按资源名检索。
   * 关系图资源来自主站资源库，与第三方资源 id 分属不同空间，
   * 故按标题检索而非按 id 拉详情，保证点击始终有可用结果。
   */
  const handleOpenResource = (node: iGM_Launcher_ResourceGraphNode) => {
    setView("resources");
    setKeyword(node.label);
    setTypeFilter("");
    void loadResources(1, node.label, "");
    document.getElementById("resourceCenter-downloads")?.scrollIntoView({ block: "start" });
  };

  /* ---------- 版本库视图数据 ---------- */

  const filteredEntries = useMemo(
    () =>
      versionTypeFilter
        ? versionLibrary.entries.filter((item) => item.type === versionTypeFilter)
        : versionLibrary.entries,
    [versionLibrary.entries, versionTypeFilter],
  );

  const versionGroups = useMemo(
    () => iGM_Launcher_GroupVersionsByYear(filteredEntries),
    [filteredEntries],
  );

  const installedCount = useMemo(
    () => versionLibrary.entries.filter((item) => item.installed).length,
    [versionLibrary.entries],
  );

  const versionTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of versionLibrary.entries) {
      counts[item.type] = (counts[item.type] ?? 0) + 1;
    }
    return counts;
  }, [versionLibrary.entries]);

  const versionTypeLabel = (type: iGM_Launcher_VersionType): string => tVersions(`type_${type}`);

  /* ---------- 下载任务卡片 ---------- */

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
                  iGM_Launcher_BridgeCall("thirdParty:download-retry", { taskId: task.id }),
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

  /* ---------- 资源下载清单视图 ---------- */

  const renderResourcesView = () => (
    <>
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
                      <IGM_Launcher_Badge tone="neutral">
                        {t(`type_${resource.type}`)}
                      </IGM_Launcher_Badge>
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
                          {/* 有实例时优先自动定位到该实例下的对应文件夹，可切换实例 */}
                          {instances.length > 0 ? (
                            <IGM_Launcher_Select
                              value={targetInstance?.id ?? ""}
                              onChange={(event) => {
                                const nextId = event.target.value;
                                setTargetInstanceId(nextId);
                                const next = instances.find((item) => item.id === nextId);
                                if (next) {
                                  setTargetEdited(false);
                                  setTargetDir(
                                    iGM_Launcher_JoinPath(next.directory, subdirOfType(resource.type)),
                                  );
                                }
                              }}
                            >
                              {instances.map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name}
                                </option>
                              ))}
                            </IGM_Launcher_Select>
                          ) : null}
                          <div className={styles.targetRow}>
                            <IGM_Launcher_Input
                              value={targetDir}
                              placeholder={t("targetDirPlaceholder")}
                              onChange={(event) => {
                                setTargetEdited(true);
                                setTargetDir(event.target.value);
                              }}
                            />
                            <IGM_Launcher_Button
                              variant="secondary"
                              onClick={() =>
                                void pickDir(targetDir.trim() || undefined).then((path) => {
                                  if (path) {
                                    setTargetEdited(true);
                                    setTargetDir(path);
                                  }
                                })
                              }
                            >
                              <FolderOpen size={14} strokeWidth={1.8} />
                              {tCommon("browse")}
                            </IGM_Launcher_Button>
                          </div>
                        </IGM_Launcher_Field>

                        {/* 防呆提示：明确告知各类文件应放入的文件夹（灰色小字） */}
                        <p className={styles.note}>
                          {t("folderHint", { folder: subdirOfType(resource.type) })}
                        </p>
                        <p className={styles.note}>{t("folderHintList")}</p>

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
          <IGM_Launcher_Button variant="secondary" disabled={searching} onClick={handleLoadMore}>
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
    </>
  );

  /* ---------- 版本库视图 ---------- */

  const renderVersionsView = () => (
    <>
      {/* 同步状态 */}
      <IGM_Launcher_Card className={styles.statusCard}>
        <div className={styles.statusRow}>
          <span className={styles.statusLabel}>
            <RefreshCw size={15} strokeWidth={1.8} />
            {tVersions("syncStatus")}
          </span>
          <IGM_Launcher_Badge tone={versionLibrary.source === "empty" ? "muted" : "success"}>
            {tVersions(`source_${versionLibrary.source}`)}
          </IGM_Launcher_Badge>
          <span className={styles.statusMeta}>
            {tVersions("lastSynced", { time: iGM_Launcher_FormatSyncedAt(versionLibrary.syncedAt) })}
          </span>
          <span className={styles.statusMeta}>
            {tVersions("counts", {
              total: versionLibrary.total || versionLibrary.entries.length,
              installed: installedCount,
            })}
          </span>
          <IGM_Launcher_Button
            variant="secondary"
            disabled={syncingLibrary}
            onClick={() => void syncVersionLibrary()}
          >
            <RefreshCw size={15} strokeWidth={1.8} />
            {syncingLibrary ? tVersions("syncing") : tVersions("syncNow")}
          </IGM_Launcher_Button>
        </div>
      </IGM_Launcher_Card>

      {/* 版本类型筛选：与网站版本资料库一致，先按类型区分再按年份分组 */}
      <IGM_Launcher_Card className={styles.filterCard}>
        <span className={styles.filterLabel}>{tVersions("filterType")}</span>
        <div className={styles.chips}>
          <button
            type="button"
            className={`${styles.chip} ${versionTypeFilter === "" ? styles.chipActive : ""}`}
            onClick={() => setVersionTypeFilter("")}
          >
            {tVersions("typeAll")}
          </button>
          {IGM_VERSION_TYPE_FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              className={`${styles.chip} ${versionTypeFilter === value ? styles.chipActive : ""}`}
              onClick={() => setVersionTypeFilter(value)}
            >
              {versionTypeLabel(value)}
              <span className={styles.chipCount}>{versionTypeCounts[value] ?? 0}</span>
            </button>
          ))}
        </div>
      </IGM_Launcher_Card>

      {versionGroups.length === 0 ? (
        versionLibrary.entries.length > 0 ? (
          <IGM_Launcher_Card className={styles.emptyCard}>
            <h2 className={styles.emptyTitle}>{tVersions("filteredEmptyTitle")}</h2>
            <p className={styles.emptyDesc}>{tVersions("filteredEmptyDesc")}</p>
            <IGM_Launcher_Button variant="secondary" onClick={() => setVersionTypeFilter("")}>
              {tVersions("showAll")}
            </IGM_Launcher_Button>
          </IGM_Launcher_Card>
        ) : (
          <IGM_Launcher_Card className={styles.emptyCard}>
            <h2 className={styles.emptyTitle}>{tVersions("emptyTitle")}</h2>
            <p className={styles.emptyDesc}>{tVersions("emptyDesc")}</p>
            <IGM_Launcher_Button
              variant="primary"
              disabled={syncingLibrary}
              onClick={() => void syncVersionLibrary()}
            >
              <RefreshCw size={15} strokeWidth={1.8} />
              {tVersions("syncNow")}
            </IGM_Launcher_Button>
          </IGM_Launcher_Card>
        )
      ) : (
        versionGroups.map((group) => (
          <section key={group.year} className={styles.yearGroup}>
            <h2 className={styles.yearTitle}>
              {group.year === "—" ? tVersions("yearUnknown") : group.year}
            </h2>
            <div className={styles.versionGrid}>
              {group.entries.map((entry) => (
                <IGM_Launcher_Card key={entry.id} className={styles.versionCard}>
                  <div className={styles.versionHead}>
                    <span className={styles.versionName}>{entry.version}</span>
                    <IGM_Launcher_Badge tone={IGM_VERSION_TYPE_TONE[entry.type]}>
                      {versionTypeLabel(entry.type)}
                    </IGM_Launcher_Badge>
                  </div>
                  <dl className={styles.versionMetaList}>
                    <div className={styles.metaItem}>
                      <dt>{tVersions("releaseTime")}</dt>
                      <dd>{entry.releaseTime ? entry.releaseTime.slice(0, 10) : "—"}</dd>
                    </div>
                    <div className={styles.metaItem}>
                      <dt>{tVersions("totalSize")}</dt>
                      <dd>
                        {iGM_Launcher_FormatSize(entry.totalSize) || tVersions("sizePending")}
                      </dd>
                    </div>
                  </dl>
                  <div className={styles.versionActions}>
                    {entry.installed ? (
                      <>
                        {/* 已下载仍允许重新下载：用于覆盖修复（本地文件被删改后可恢复） */}
                        <IGM_Launcher_Badge tone="success">{tVersions("installed")}</IGM_Launcher_Badge>
                        <IGM_Launcher_Button
                          variant="ghost"
                          onClick={() => navigate("gameInstall", { version: entry.version })}
                        >
                          <RefreshCw size={14} strokeWidth={1.8} />
                          {tVersions("redownload")}
                        </IGM_Launcher_Button>
                      </>
                    ) : (
                      <IGM_Launcher_Button
                        variant="secondary"
                        onClick={() => navigate("gameInstall", { version: entry.version })}
                      >
                        <Download size={14} strokeWidth={1.8} />
                        {tRC("downloadInstall")}
                      </IGM_Launcher_Button>
                    )}
                  </div>
                </IGM_Launcher_Card>
              ))}
            </div>
          </section>
        ))
      )}

      {installedCount > 0 ? (
        <IGM_Launcher_Button variant="ghost" onClick={() => navigate("instances")}>
          <Boxes size={15} strokeWidth={1.8} />
          {tVersions("viewInstances")}
        </IGM_Launcher_Button>
      ) : null}

      <IGM_Launcher_PlaceholderNote>{tRC("versionsHint")}</IGM_Launcher_PlaceholderNote>
    </>
  );

  return (
    <div className={styles.page}>
      <IGM_Launcher_PageHeader title={tRC("title")} description={tRC("subtitle")} />

      {/* 上半部：资源下载清单（资源下载 / 版本库两个子视图） */}
      <IGM_Launcher_Card className={styles.sectionCard} as="section">
        <div className={styles.sectionHeader} id="resourceCenter-downloads">
          <div>
            <h2 className={styles.sectionTitle}>{tRC("downloadsTitle")}</h2>
            <p className={styles.sectionDesc}>{tRC("downloadsDesc")}</p>
          </div>
          <div className={styles.viewTabs}>
            <button
              type="button"
              className={`${styles.tab} ${view === "resources" ? styles.tabActive : ""}`}
              onClick={() => setView("resources")}
            >
              {tRC("tabResources")}
            </button>
            <button
              type="button"
              className={`${styles.tab} ${view === "versions" ? styles.tabActive : ""}`}
              onClick={() => setView("versions")}
            >
              {tRC("tabVersions")}
            </button>
          </div>
        </div>

        <div className={styles.sectionBody}>
          {view === "resources" ? renderResourcesView() : renderVersionsView()}
        </div>
      </IGM_Launcher_Card>

      {/* 下半部：版本 / 资源关系图 */}
      <IGM_Launcher_Card className={styles.sectionCard} as="section">
        <div className={styles.sectionHeader} id="resourceCenter-graph">
          <div>
            <h2 className={styles.sectionTitle}>{tRC("graphTitle")}</h2>
            <p className={styles.sectionDesc}>{tRC("graphDesc")}</p>
          </div>
        </div>
        <div className={styles.sectionBody}>
          <IGM_Launcher_RelationGraph
            centerVersion={graphCenterVersion || undefined}
            onOpenVersion={handleOpenVersion}
            onOpenResource={handleOpenResource}
          />
        </div>
      </IGM_Launcher_Card>
    </div>
  );
}

// 导出 //
export default iGM_Launcher_ResourceCenterPage;
