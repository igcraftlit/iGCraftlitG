/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Pages/iGM_Launcher_DownloadProgressWindow.tsx
 * 所属层：前端 / 页面层
 * 路由：G_DownloadProgress（独立窗口，非启动器 SPA 页）
 * 模块：iGM_Launcher_DownloadProgressWindow
 * 作用：独立下载进度窗口——下载中心点「开始下载」后由主进程创建的窄窗界面，
 *       展示资源名称 / 版本、实时进度、引擎状态与错误，并提供取消 / 打开文件夹
 * 内容：就绪握手（downloadProgress:init）拉取任务与引擎信息；
 *       订阅主进程推送的下载进度事件并按常量周期轮询任务快照作为兜底
 *       （游戏本体下载任务编号以 dl- 开头，走 minecraft:* 且不轮询第三方后端）；
 *       5 秒无任何回调时熔断提示「Zig 引擎无响应」；
 *       引擎级错误（未捕获异常 / 动态库缺失降级）以红字或降级提示展示；
 *       无边框窗口自绘拖动区与最小化 / 关闭按钮
 *
 * 说明：本窗口是独立渲染进程，不共享主窗口内存与 SPA 状态，
 *       全部数据均来自宿主消息与桥接调用（thirdParty:download-status /
 *       download-cancel 与 shell:open-path），不伪造任何进度。
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  Loader2,
  Minus,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  IGM_LAUNCHER_PROGRESS_NO_CALLBACK_MS,
  IGM_LAUNCHER_PROGRESS_POLL_MS,
  iGM_Launcher_FormatSize,
  type iGM_Launcher_ThirdPartyEngine,
  type iGM_Launcher_ThirdPartyTask,
} from "@igm-launcher/shared";
import {
  iGM_Launcher_BridgeCall,
  iGM_Launcher_SendHostMessage,
  iGM_Launcher_SubscribeDownloadProgress,
} from "@/components/iGM_Launcher_Bridge/iGM_Launcher_BridgeClient";
import styles from "./iGM_Launcher_DownloadProgressWindow.module.css";

// 类型定义 //
/** 主进程回填的窗口元信息 */
interface iGM_Launcher_DownloadProgressMeta {
  taskId: string;
  resourceName: string;
  version: string;
  targetDir: string;
  engine: iGM_Launcher_ThirdPartyEngine;
  engineError: string;
}

/** 引擎提示：danger 为红字错误，warning 为降级提示 */
interface iGM_Launcher_DownloadProgressNotice {
  text: string;
  tone: "danger" | "warning";
}

// 核心逻辑 //
/** 任务是否处于终态（终态后停止轮询与超时熔断） */
function iGM_Launcher_ProgressTaskTerminal(task: iGM_Launcher_ThirdPartyTask): boolean {
  return task.status === "completed" || task.status === "failed" || task.status === "canceled";
}

/** 进度百分比钳制到 0-100，避免异常值撑破进度条 */
function iGM_Launcher_ProgressPercent(task: iGM_Launcher_ThirdPartyTask | null): number {
  if (!task) return 0;
  return Math.max(0, Math.min(100, Math.round(task.progress)));
}

export function iGM_Launcher_DownloadProgressWindow() {
  const t = useTranslations("downloadProgressWindow");
  const tThird = useTranslations("thirdParty");

  const [meta, setMeta] = useState<iGM_Launcher_DownloadProgressMeta | null>(null);
  const [task, setTask] = useState<iGM_Launcher_ThirdPartyTask | null>(null);
  const [notice, setNotice] = useState<iGM_Launcher_DownloadProgressNotice | null>(null);
  const [noResponse, setNoResponse] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [actionError, setActionError] = useState("");

  /** 是否已收到过任何进度回调（用于 5 秒超时熔断判定） */
  const gotCallbackRef = useRef(false);
  /** 是否已收到引擎级错误（引擎错误优先于熔断提示，避免覆盖具体原因） */
  const engineErrorRef = useRef(false);
  /** 任务是否已进入终态（终态后不再熔断 / 轮询） */
  const terminalRef = useRef(false);

  /** 应用一份任务快照；终态记录到 ref 供轮询与熔断判断 */
  const applyTask = useCallback((next: iGM_Launcher_ThirdPartyTask | null) => {
    if (!next) return;
    gotCallbackRef.current = true;
    if (iGM_Launcher_ProgressTaskTerminal(next)) terminalRef.current = true;
    setTask(next);
  }, []);

  /** 由引擎信息推导提示：已降级为 HTTP 时用弱提示，其余为红字错误 */
  const buildNotice = useCallback(
    (
      engineError: string,
      engine: iGM_Launcher_ThirdPartyEngine,
      hasTask: boolean,
    ): iGM_Launcher_DownloadProgressNotice | null => {
      if (!engineError) return null;
      const tone = hasTask && engine === "http" ? "warning" : "danger";
      return { text: engineError, tone };
    },
    [],
  );

  /* ---------- 就绪握手 / 事件订阅 / 超时熔断 ---------- */

  useEffect(() => {
    const unsubscribe = iGM_Launcher_SubscribeDownloadProgress((event) => {
      if (event.type === "init") {
        if (event.engineError) engineErrorRef.current = true;
        setMeta({
          taskId: event.taskId,
          resourceName: event.resourceName,
          version: event.version,
          targetDir: event.targetDir,
          engine: event.engine,
          engineError: event.engineError,
        });
        setNotice(buildNotice(event.engineError, event.engine, Boolean(event.taskId)));
        return;
      }
      if (event.engineError) {
        engineErrorRef.current = true;
        setNotice(buildNotice(event.engineError, "sdk", Boolean(event.task)));
      }
      applyTask(event.task);
    });

    // 就绪握手：主进程据此回填任务与引擎信息
    const sent = iGM_Launcher_SendHostMessage({ type: "downloadProgress:init" });
    if (!sent) {
      // 浏览器预览环境无宿主通道，直接给出红字，避免空白窗口
      setNoResponse(true);
    }

    // 超时熔断：窗口打开后规定时间内无任何进度回调即判定引擎无响应；
    // 已有引擎级错误时不再覆盖，保证红字展示的是具体原因
    const timer = window.setTimeout(() => {
      if (!gotCallbackRef.current && !terminalRef.current && !engineErrorRef.current) {
        setNoResponse(true);
      }
    }, IGM_LAUNCHER_PROGRESS_NO_CALLBACK_MS);

    return () => {
      unsubscribe();
      window.clearTimeout(timer);
    };
  }, [applyTask, buildNotice]);

  /* ---------- 任务快照轮询（作为主动推送的兜底） ---------- */

  const taskId = meta?.taskId ?? "";
  /*
   * 游戏本体下载任务的编号前缀为 dl-（由下载引擎 iGM_Launcher_NewId("dl") 生成），
   * 其状态与取消走 minecraft:* 桥接、进度由主进程主动推送，
   * 不轮询第三方后端（否则会对不存在的第三方任务误报红字错误）。
   */
  const isGameDownload = taskId.startsWith("dl-");

  useEffect(() => {
    if (!taskId || isGameDownload) return;
    let stopped = false;
    const tick = async () => {
      if (stopped || terminalRef.current) return;
      const response = await iGM_Launcher_BridgeCall("thirdParty:download-status", { taskId });
      if (stopped) return;
      if (!response.success) {
        setActionError(response.message);
        return;
      }
      applyTask(response.data?.task ?? null);
    };
    const timer = window.setInterval(() => {
      void tick();
    }, IGM_LAUNCHER_PROGRESS_POLL_MS);
    void tick();
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [taskId, isGameDownload, applyTask]);

  /* ---------- 操作 ---------- */

  const handleCancel = async () => {
    if (!taskId || canceling) return;
    setCanceling(true);
    setActionError("");
    // 游戏本体下载走 minecraft:download-cancel，终态由主进程进度推送回填，不伪造快照
    if (isGameDownload) {
      const response = await iGM_Launcher_BridgeCall("minecraft:download-cancel", { taskId });
      setCanceling(false);
      if (!response.success) setActionError(response.message);
      return;
    }
    const response = await iGM_Launcher_BridgeCall("thirdParty:download-cancel", { taskId });
    setCanceling(false);
    if (!response.success) {
      setActionError(response.message);
      return;
    }
    applyTask(response.data?.task ?? null);
  };

  const handleOpenFolder = async () => {
    const path = task?.filePath || task?.targetDir || meta?.targetDir || "";
    if (!path) return;
    const response = await iGM_Launcher_BridgeCall("shell:open-path", { openPath: path });
    if (!response.success) setActionError(response.message);
  };

  const handleMinimize = () => {
    iGM_Launcher_SendHostMessage({ type: "window:minimize" });
  };

  const handleClose = () => {
    iGM_Launcher_SendHostMessage({ type: "window:close" });
  };

  /* ---------- 派生展示状态 ---------- */

  const status = task?.status ?? "pending";
  const percent = iGM_Launcher_ProgressPercent(task);
  const isDone = status === "completed";
  const isTerminal = task ? iGM_Launcher_ProgressTaskTerminal(task) : false;
  const isActive = Boolean(taskId) && !isTerminal;

  /** 状态文字：进行中显示引擎文案，终态显示任务状态文案 */
  const statusText = useMemo(() => {
    if (isDone) return tThird("status_completed");
    if (status === "failed") return tThird("status_failed");
    if (status === "canceled") return tThird("status_canceled");
    if (status === "paused") return tThird("status_paused");
    if (!meta) return t("waiting");
    if (meta.engine === "sdk") return t("engineSdk");
    return t("engineHttp");
  }, [isDone, status, meta, t, tThird]);

  /** 已下载 / 总大小与速度文案 */
  const sizeText = task
    ? `${iGM_Launcher_FormatSize(task.downloaded) || "0 B"} / ${
        task.size > 0 ? iGM_Launcher_FormatSize(task.size) : tThird("taskSizeUnknown")
      }`
    : "";
  const speedText = task && task.speed > 0 ? `${iGM_Launcher_FormatSize(task.speed)}/s` : "—";

  /** 错误行优先级：熔断 > 引擎提示 > 任务失败原因 > 操作错误 */
  const errorText = useMemo(() => {
    if (noResponse) return t("engineNoResponse");
    if (notice) return notice.text;
    if (status === "failed") return task?.error || t("failedHint");
    return actionError;
  }, [noResponse, notice, status, task, actionError, t]);

  const errorTone: "danger" | "warning" =
    !noResponse && notice && notice.tone === "warning" ? "warning" : "danger";

  return (
    <div className={styles.root}>
      {/* 标题栏：整条为窗口拖动区，按钮区禁用拖动 */}
      <div className={styles.titleBar}>
        <span className={styles.title}>{meta?.resourceName || t("title")}</span>
        <div className={styles.windowControls}>
          <button
            type="button"
            className={styles.controlButton}
            aria-label={t("minimize")}
            onClick={handleMinimize}
          >
            <Minus size={14} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className={styles.controlButton}
            aria-label={t("close")}
            onClick={handleClose}
          >
            <X size={14} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      <div className={styles.body}>
        {/* 资源与版本 */}
        <div className={styles.metaRow}>
          <span className={styles.resourceName}>{meta?.resourceName || t("title")}</span>
          {meta?.version ? (
            <span className={styles.version}>{t("resourceVersion", { version: meta.version })}</span>
          ) : null}
        </div>

        {/* 状态行：进行中带转圈图标，完成带对勾 */}
        <div className={styles.statusRow}>
          {isDone ? (
            <CheckCircle2 size={15} strokeWidth={1.8} className={styles.statusDoneIcon} />
          ) : isTerminal ? (
            <AlertTriangle size={15} strokeWidth={1.8} className={styles.statusFailIcon} />
          ) : (
            <Loader2 size={15} strokeWidth={1.8} className={styles.spinner} />
          )}
          <span className={styles.statusText}>{statusText}</span>
          <span className={styles.engineTag}>
            {meta
              ? `${t("engineLabel")}: ${
                  meta.engine === "sdk" ? t("engineSdkName") : t("engineHttpName")
                }`
              : ""}
          </span>
        </div>

        {/* 进度条 */}
        <div className={styles.progressTrack}>
          <div
            className={`${styles.progressFill} ${isDone ? styles.progressFillDone : ""}`}
            style={{ width: `${percent}%` }}
          />
        </div>

        <div className={styles.metricsRow}>
          <span className={styles.percent}>{percent}%</span>
          <span className={styles.sizeText}>{sizeText}</span>
          <span className={styles.speedText}>
            {t("speedLabel")} {speedText}
          </span>
        </div>

        {/* 错误 / 降级提示行 */}
        {errorText ? (
          <p
            className={`${styles.noticeText} ${
              errorTone === "warning" ? styles.noticeWarning : styles.noticeDanger
            }`}
            role="alert"
          >
            {errorText}
          </p>
        ) : (
          <p className={styles.targetText}>
            {t("targetLabel")} {task?.targetDir || meta?.targetDir || "—"}
          </p>
        )}
      </div>

      {/* 底部操作：完成后可打开所在文件夹，否则可取消下载 */}
      <div className={styles.footer}>
        {isDone ? (
          <button type="button" className={styles.primaryButton} onClick={() => void handleOpenFolder()}>
            <FolderOpen size={15} strokeWidth={1.8} />
            {t("openFolder")}
          </button>
        ) : (
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={!isActive || canceling}
            onClick={() => void handleCancel()}
          >
            {canceling ? t("canceling") : t("cancel")}
          </button>
        )}
        <span className={styles.footerHint}>
          {isDone ? t("doneHint") : status === "failed" || status === "canceled" ? t("failedHint") : ""}
        </span>
      </div>
    </div>
  );
}

// 导出 //
export default iGM_Launcher_DownloadProgressWindow;