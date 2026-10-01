/**
 * 文件路径：apps/web/src/iGM_Pages/G_DownloadCenter/iGM_DownloadCenterPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_DownloadCenter?taskId=xxx（静态壳，查询参数用于高亮指定任务）
 * 模块：G_DownloadCenter
 * 作用：第三方资源下载中心——集中展示与管理全部下载任务
 * 内容：任务卡片（资源名/类型/版本/来源平台、进度条、已下载与总大小、速度、剩余时间）、
 *       暂停/继续、取消、重试、打开文件所在目录、已完成任务折叠与清空已完成
 * 说明：
 *   - 纯静态 SSG，数据在客户端经 iGM_Request 调用本地后端
 *   - 每个进行中的任务经 WebSocket 订阅实时进度；断线后自动重连并重新拉取最新状态
 *   - 第三方资源文件不落本站服务器，本页只做任务编排；本模块仅 Modrinth 来源
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FolderOpen,
  HardDriveDownload,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  Timer,
  Trash2,
  XCircle,
  Zap,
} from "lucide-react";
import {
  iGM_ApiCancelThirdPartyDownload,
  iGM_ApiClearCompletedThirdPartyDownloads,
  iGM_ApiGetThirdPartyDownload,
  iGM_ApiListThirdPartyDownloads,
  iGM_ApiPauseThirdPartyDownload,
  iGM_ApiRetryThirdPartyDownload,
  iGM_GetThirdPartyWsUrl,
  type iGM_DownloadEvent,
  type iGM_DownloadTask,
  type iGM_DownloadTaskStatus,
  type iGM_DownloadWsMessage,
} from "../../iGM_Services/iGM_ThirdPartyClient";
import { iGM_FormatFileSize } from "../../iGM_Services/iGM_FileClient";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_EmptyState as IGM_EmptyState } from "../../iGM_Components/iGM_EmptyState/iGM_EmptyState";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import pageStyles from "../iGM_Page.module.css";
import m10 from "../iGM_Module10.module.css";
import styles from "./iGM_DownloadCenterPage.module.css";

// 类型定义 //
/** WebSocket 订阅条目（含心跳与重连定时器） */
interface iGM_SocketEntry {
  socket: WebSocket | null;
  heartbeat: ReturnType<typeof setInterval> | null;
  reconnect: ReturnType<typeof setTimeout> | null;
}

/** 断线重连间隔（毫秒） */
const iGM_ReconnectDelayMs = 3000;
/** 心跳间隔（毫秒） */
const iGM_HeartbeatMs = 25000;

// 核心逻辑 //
/** 任务是否处于终态（终态无需继续订阅） */
function iGM_IsTerminal(status: iGM_DownloadTaskStatus): boolean {
  return status === "completed" || status === "failed" || status === "canceled";
}

/** 把后端下发的状态字符串归一化为已知状态（未知时回退 downloading） */
function iGM_NormalizeStatus(value: string): iGM_DownloadTaskStatus {
  const known: iGM_DownloadTaskStatus[] = [
    "pending",
    "downloading",
    "paused",
    "completed",
    "failed",
    "canceled",
  ];
  return (known.find((item) => item === value) ??
    "downloading") as iGM_DownloadTaskStatus;
}

/** 把后端下发的 i18n 文案键或原文解析为当前语言文本（找不到键就原样显示） */
function iGM_ResolveText(
  t: ReturnType<typeof useTranslations>,
  text: string,
): string {
  return text.includes(".") && t.has(text) ? t(text) : text;
}

/** 剩余时间本地化文本 */
function iGM_FormatRemaining(
  t: ReturnType<typeof useTranslations>,
  seconds: number,
): string {
  if (seconds < 60) {
    return t("downloadCenter.remainingSeconds", {
      seconds: Math.max(0, Math.round(seconds)),
    });
  }
  const minutes = Math.floor(seconds / 60);
  return t("downloadCenter.remainingMinutes", {
    minutes,
    seconds: Math.round(seconds % 60),
  });
}

/** 下载中心页主体（在 Suspense 内使用 useSearchParams） */
export function iGM_DownloadCenterPage() {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const focusId = searchParams.get("taskId");

  const [tasks, setTasks] = useState<iGM_DownloadTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  /** 已完成任务区是否展开（默认收起） */
  const [showCompleted, setShowCompleted] = useState(false);
  /** 已展开「文件所在目录」的任务 id */
  const [openPathId, setOpenPathId] = useState<string | null>(null);

  /** 任务快照映射：供 WebSocket 回调判断是否需要继续订阅 */
  const tasksMapRef = useRef<Map<string, iGM_DownloadTask>>(new Map());
  /** 组件是否已卸载 */
  const disposedRef = useRef(false);
  /** taskId → WebSocket 订阅条目 */
  const socketsRef = useRef<Map<string, iGM_SocketEntry>>(new Map());

  /** 写入 / 更新单个任务 */
  const iGM_UpsertTask = useCallback((next: iGM_DownloadTask) => {
    setTasks((prev) => {
      const index = prev.findIndex((item) => item.id === next.id);
      if (index === -1) return [next, ...prev];
      const copy = prev.slice();
      copy[index] = next;
      return copy;
    });
  }, []);

  /** 应用一条进度事件 */
  const iGM_ApplyEvent = useCallback((event: iGM_DownloadEvent) => {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== event.taskId) return task;
        if (event.type === "start") {
          return {
            ...task,
            status: "downloading",
            filename: event.payload.filename,
            size: event.payload.size,
            downloaded: 0,
            progress: 0,
            speed: 0,
            eta: null,
            error: null,
          };
        }
        if (event.type === "progress") {
          return {
            ...task,
            status: iGM_NormalizeStatus(event.payload.status),
            downloaded: event.payload.downloaded,
            progress: event.payload.percent,
            speed: event.payload.speed,
            eta: event.payload.eta,
            error: event.payload.error,
          };
        }
        if (event.type === "file_done") {
          return { ...task, filePath: event.payload.path, size: event.payload.size };
        }
        if (event.type === "complete") {
          return {
            ...task,
            status: "completed",
            downloaded: event.payload.downloaded,
            progress: 100,
            speed: 0,
            eta: 0,
            filePath: event.payload.filePath,
          };
        }
        if (event.type === "error") {
          return {
            ...task,
            status: "failed",
            error: event.payload.error,
            speed: 0,
            eta: null,
          };
        }
        if (event.type === "canceled") {
          return { ...task, status: "canceled", speed: 0, eta: null };
        }
        return task;
      }),
    );
  }, []);

  /** 关闭订阅并释放定时器 */
  const iGM_DisposeSocket = useCallback((entry: iGM_SocketEntry) => {
    if (entry.heartbeat) clearInterval(entry.heartbeat);
    if (entry.reconnect) clearTimeout(entry.reconnect);
    const socket = entry.socket;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      try {
        socket.close();
      } catch {
        // 关闭异常忽略
      }
    }
  }, []);

  /** 拉取单个任务最新快照（断线重连后调用） */
  const iGM_LoadOne = useCallback(
    async (taskId: string) => {
      try {
        const response = await iGM_ApiGetThirdPartyDownload(taskId);
        if (response.data?.task) iGM_UpsertTask(response.data.task);
      } catch {
        // 单任务拉取失败不阻塞其他订阅
      }
    },
    [iGM_UpsertTask],
  );

  /** 构造并订阅一个任务的 WebSocket（断线自动重连） */
  const iGM_OpenSocket = useCallback(
    (taskId: string, entries: Map<string, iGM_SocketEntry>): iGM_SocketEntry => {
      const entry: iGM_SocketEntry = {
        socket: null,
        heartbeat: null,
        reconnect: null,
      };
      try {
        const socket = new WebSocket(iGM_GetThirdPartyWsUrl(taskId));
        entry.socket = socket;
        socket.onopen = () => {
          // 重连成功后重新拉取最新状态，避免遗漏离线期间的事件
          void iGM_LoadOne(taskId);
          entry.heartbeat = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: "ping" }));
            }
          }, iGM_HeartbeatMs);
        };
        socket.onmessage = (message) => {
          try {
            const payload = JSON.parse(String(message.data)) as iGM_DownloadWsMessage;
            if (payload.type === "snapshot") {
              iGM_UpsertTask(payload.task);
              return;
            }
            if (payload.type === "event") iGM_ApplyEvent(payload.event);
          } catch {
            // 非法消息忽略
          }
        };
        socket.onclose = () => {
          if (entry.heartbeat) {
            clearInterval(entry.heartbeat);
            entry.heartbeat = null;
          }
          if (disposedRef.current) return;
          const current = tasksMapRef.current.get(taskId);
          if (!current || iGM_IsTerminal(current.status)) return;
          entry.reconnect = setTimeout(() => {
            entries.set(taskId, iGM_OpenSocket(taskId, entries));
          }, iGM_ReconnectDelayMs);
        };
      } catch {
        // 构造失败：等待下一次任务状态变化时重试
      }
      return entry;
    },
    [iGM_ApplyEvent, iGM_LoadOne, iGM_UpsertTask],
  );

  /** 首屏拉取全部任务 */
  const iGM_LoadAll = useCallback(async () => {
    setLoading(true);
    setErrorText(null);
    try {
      const response = await iGM_ApiListThirdPartyDownloads();
      setTasks(response.data?.items ?? []);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void iGM_LoadAll();
  }, [iGM_LoadAll]);

  /** 同步任务快照映射 */
  useEffect(() => {
    tasksMapRef.current = new Map(tasks.map((task) => [task.id, task]));
  }, [tasks]);

  /** 需要订阅的进行中任务 id（终态任务不订阅） */
  const watchIds = useMemo(
    () =>
      tasks
        .filter((task) => !iGM_IsTerminal(task.status))
        .map((task) => task.id)
        .sort()
        .join(","),
    [tasks],
  );

  useEffect(() => {
    const entries = socketsRef.current;
    const ids = watchIds ? watchIds.split(",") : [];

    // 关闭不再需要订阅的任务
    for (const [id, entry] of Array.from(entries.entries())) {
      if (!ids.includes(id)) {
        iGM_DisposeSocket(entry);
        entries.delete(id);
      }
    }

    // 订阅新任务
    for (const id of ids) {
      if (entries.has(id)) continue;
      entries.set(id, iGM_OpenSocket(id, entries));
    }
  }, [watchIds, iGM_DisposeSocket, iGM_OpenSocket]);

  /** 卸载时释放全部订阅（挂载时重置标记，兼容开发模式重复挂载） */
  useEffect(() => {
    const entries = socketsRef.current;
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      for (const entry of entries.values()) iGM_DisposeSocket(entry);
      entries.clear();
    };
  }, [iGM_DisposeSocket]);

  /** 高亮任务若为终态则自动展开已完成区 */
  useEffect(() => {
    if (!focusId) return;
    const target = tasks.find((task) => task.id === focusId);
    if (target && iGM_IsTerminal(target.status)) setShowCompleted(true);
  }, [focusId, tasks]);

  /** 暂停 / 继续 */
  async function iGM_HandlePause(task: iGM_DownloadTask): Promise<void> {
    if (busyId) return;
    setBusyId(task.id);
    setErrorText(null);
    try {
      const response = await iGM_ApiPauseThirdPartyDownload(
        task.id,
        task.status !== "paused",
      );
      if (response.data?.task) iGM_UpsertTask(response.data.task);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setBusyId(null);
    }
  }

  /** 取消任务 */
  async function iGM_HandleCancel(task: iGM_DownloadTask): Promise<void> {
    if (busyId) return;
    if (!window.confirm(t("downloadCenter.cancelConfirm"))) return;
    setBusyId(task.id);
    setErrorText(null);
    try {
      const response = await iGM_ApiCancelThirdPartyDownload(task.id, false);
      if (response.data?.task) iGM_UpsertTask(response.data.task);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setBusyId(null);
    }
  }

  /** 重试失败 / 已取消的任务（后端复用同一任务，保留断点续传） */
  async function iGM_HandleRetry(task: iGM_DownloadTask): Promise<void> {
    if (busyId) return;
    setBusyId(task.id);
    setErrorText(null);
    try {
      const response = await iGM_ApiRetryThirdPartyDownload(task.id);
      if (response.data?.task) iGM_UpsertTask(response.data.task);
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setBusyId(null);
    }
  }

  /** 清空已完成任务 */
  async function iGM_HandleClearCompleted(): Promise<void> {
    if (clearing) return;
    if (!window.confirm(t("downloadCenter.clearCompletedConfirm"))) return;
    setClearing(true);
    setErrorText(null);
    try {
      await iGM_ApiClearCompletedThirdPartyDownloads();
      setTasks((prev) => prev.filter((task) => !iGM_IsTerminal(task.status)));
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setClearing(false);
    }
  }

  /** 切换「文件所在目录」路径文本展示 */
  function iGM_TogglePath(taskId: string): void {
    setOpenPathId((prev) => (prev === taskId ? null : taskId));
  }

  /** 渲染单个任务卡片 */
  function iGM_RenderTask(task: iGM_DownloadTask) {
    const percent = Math.min(100, Math.max(0, task.progress));
    const busy = busyId === task.id;
    const focused = focusId === task.id;
    const isTerminal = iGM_IsTerminal(task.status);

    return (
      <article
        key={task.id}
        className={`${styles.taskCard} ${focused ? styles.taskCardFocus : ""}`}
      >
        <div className={styles.taskHead}>
          <span className={styles.taskName}>{task.name}</span>
          <span className={styles.statusBadge}>
            {t.has(`downloadCenter.status.${task.status}`)
              ? t(`downloadCenter.status.${task.status}`)
              : task.status}
          </span>
        </div>

        <div className={styles.taskMeta}>
          <span className={styles.typeBadge}>
            {t.has(`thirdParty.resourceTypes.${task.type}`)
              ? t(`thirdParty.resourceTypes.${task.type}`)
              : task.type}
          </span>
          <span className={styles.metaItem}>
            {t("downloadCenter.versionLabel")}
            {task.version}
          </span>
          <span className={styles.sourceBadge}>
            {t("thirdParty.sourceModrinth")}
          </span>
          <span className={styles.metaItem}>{task.filename}</span>
        </div>

        {/* 进度条 */}
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${percent}%` }} />
        </div>

        {/* 统计信息 */}
        <div className={styles.taskStats}>
          <span className={styles.statItem}>
            <Download size={13} strokeWidth={1.8} />
            {t("downloadCenter.progressText", {
              downloaded: iGM_FormatFileSize(task.downloaded),
              total: iGM_FormatFileSize(task.size),
            })}
          </span>
          <span className={styles.statItem}>
            <Zap size={13} strokeWidth={1.8} />
            {t("downloadCenter.speed", {
              speed: iGM_FormatFileSize(task.speed),
            })}
          </span>
          <span className={styles.statItem}>
            <Timer size={13} strokeWidth={1.8} />
            {task.status === "completed"
              ? t("downloadCenter.status.completed")
              : task.eta === null || isTerminal
                ? t("downloadCenter.remainingUnknown")
                : iGM_FormatRemaining(t, task.eta)}
          </span>
        </div>

        {task.error && (
          <div className={`${m10.alert} ${m10.alertError}`}>
            <AlertCircle
              size={14}
              strokeWidth={1.8}
              style={{ verticalAlign: "-2px", marginRight: 6 }}
            />
            {iGM_ResolveText(t, task.error)}
          </div>
        )}

        {/* 文件所在目录：后端未提供打开目录接口，此处展示路径文本 */}
        {openPathId === task.id && (
          <div className={styles.filePathRow}>
            <FolderOpen size={13} strokeWidth={1.8} />
            <span className={styles.filePathText}>
              {task.filePath ?? t("downloadCenter.filePathPending")}
            </span>
          </div>
        )}

        <div className={styles.taskActions}>
          {task.status === "completed" && (
            <>
              <span className={styles.completedHint}>
                <CheckCircle2 size={14} strokeWidth={1.8} />
                {t("downloadCenter.completedHint")}
              </span>
              <button
                type="button"
                className={m10.ghostButton}
                onClick={() => iGM_TogglePath(task.id)}
              >
                <FolderOpen size={15} strokeWidth={1.8} />
                {t("downloadCenter.openFolder")}
              </button>
            </>
          )}

          {!isTerminal && (
            <>
              <button
                type="button"
                className={m10.ghostButton}
                disabled={busy}
                onClick={() => void iGM_HandlePause(task)}
              >
                {busy ? (
                  <LoaderCircle size={15} className="igm-spin" />
                ) : task.status === "paused" ? (
                  <Play size={15} strokeWidth={1.8} />
                ) : (
                  <Pause size={15} strokeWidth={1.8} />
                )}
                {task.status === "paused"
                  ? t("downloadCenter.resume")
                  : t("downloadCenter.pause")}
              </button>
              <button
                type="button"
                className={m10.dangerButton}
                disabled={busy}
                onClick={() => void iGM_HandleCancel(task)}
              >
                <XCircle size={15} strokeWidth={1.8} />
                {t("downloadCenter.cancel")}
              </button>
            </>
          )}

          {(task.status === "failed" || task.status === "canceled") && (
            <button
              type="button"
              className={m10.primaryButton}
              disabled={busy}
              onClick={() => void iGM_HandleRetry(task)}
            >
              {busy ? (
                <LoaderCircle size={15} className="igm-spin" />
              ) : (
                <RotateCcw size={15} strokeWidth={1.8} />
              )}
              {t("downloadCenter.retry")}
            </button>
          )}
        </div>
      </article>
    );
  }

  const activeTasks = useMemo(
    () => tasks.filter((task) => !iGM_IsTerminal(task.status)),
    [tasks],
  );
  const completedTasks = useMemo(
    () => tasks.filter((task) => iGM_IsTerminal(task.status)),
    [tasks],
  );

  return (
    <div className={pageStyles.page}>
      {/* 页头 */}
      <section className={styles.hero}>
        <span className={styles.heroTitle}>
          <span className={styles.heroIcon}>
            <HardDriveDownload size={24} strokeWidth={1.8} />
          </span>
          {t("downloadCenter.title")}
        </span>
        <p className={styles.heroDescription}>{t("downloadCenter.description")}</p>
      </section>

      {errorText && (
        <div className={`${m10.alert} ${m10.alertError}`}>{errorText}</div>
      )}

      {loading ? (
        <div className={m10.stateBox}>
          <LoaderCircle size={16} className="igm-spin" />
          {t("downloadCenter.stateLoading")}
        </div>
      ) : tasks.length === 0 ? (
        <IGM_EmptyState
          icon={HardDriveDownload}
          title={t("downloadCenter.empty")}
          description={t("downloadCenter.emptyDescription")}
          action={
            <Link href="/G_Minecraft?source=thirdparty" className={m10.primaryButton}>
              <Download size={15} strokeWidth={1.8} />
              {t("downloadCenter.browseResources")}
            </Link>
          }
        />
      ) : (
        <>
          {/* 进行中任务 */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>
              {t("downloadCenter.activeTitle")}
              <span className={styles.sectionCount}>{activeTasks.length}</span>
            </h2>
            {activeTasks.length > 0 ? (
              <div className={styles.taskList}>
                {activeTasks.map((task) => iGM_RenderTask(task))}
              </div>
            ) : (
              <p className={m10.hint}>{t("downloadCenter.activeEmpty")}</p>
            )}
          </section>

          {/* 已完成任务（折叠） */}
          <section className={styles.section}>
            <div className={styles.sectionHeadRow}>
              <button
                type="button"
                className={styles.sectionToggle}
                onClick={() => setShowCompleted((prev) => !prev)}
              >
                {showCompleted ? (
                  <ChevronDown size={16} strokeWidth={1.8} />
                ) : (
                  <ChevronRight size={16} strokeWidth={1.8} />
                )}
                {t("downloadCenter.completedTitle")}
                <span className={styles.sectionCount}>{completedTasks.length}</span>
              </button>
              {completedTasks.length > 0 && (
                <button
                  type="button"
                  className={m10.ghostButton}
                  disabled={clearing}
                  onClick={() => void iGM_HandleClearCompleted()}
                >
                  {clearing ? (
                    <LoaderCircle size={15} className="igm-spin" />
                  ) : (
                    <Trash2 size={15} strokeWidth={1.8} />
                  )}
                  {t("downloadCenter.clearCompleted")}
                </button>
              )}
            </div>

            {showCompleted &&
              (completedTasks.length > 0 ? (
                <div className={styles.taskList}>
                  {completedTasks.map((task) => iGM_RenderTask(task))}
                </div>
              ) : (
                <p className={m10.hint}>{t("downloadCenter.completedEmpty")}</p>
              ))}
          </section>
        </>
      )}
    </div>
  );
}

// 导出 //
export default iGM_DownloadCenterPage;