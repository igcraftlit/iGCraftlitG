/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Pages/iGM_Launcher_DownloadProgressPage.tsx
 * 所属层：前端 / 页面层
 * 路由：G_DownloadProgress（SPA 页 id：downloadProgress）
 * 模块：iGM_Launcher_DownloadProgressPage
 * 作用：下载进度独立页，由下载安装页点「开始下载」后跳转，展示真实下载进度条
 * 内容：按 taskId 轮询 minecraft:download-status 读取主进程内的任务快照，
 *       展示阶段、百分比、文件数、字节数、当前文件与安装目录；
 *       引擎为 sdk 时状态文案显示「SDK 调用下载中」，不暴露原始 i18n 键值；
 *       支持取消下载；完成后重新扫描共享根目录刷新已安装版本并引导前往实例管理；
 *       任务编号缺失时给出返回下载安装页的引导
 *
 * 说明：进度全部来自主进程下载引擎的真实统计，界面不伪造任何进度，
 *       失败与取消原因原样透传。
 */

// 导入依赖 //
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Boxes,
  CheckCircle2,
  Download,
  FolderOpen,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  iGM_Launcher_FormatSize,
  type iGM_Launcher_DownloadProgress,
  type iGM_Launcher_DownloadStage,
} from "@igm-launcher/shared";
import {
  iGM_Launcher_Badge as IGM_Launcher_Badge,
  iGM_Launcher_Button as IGM_Launcher_Button,
  iGM_Launcher_Card as IGM_Launcher_Card,
  iGM_Launcher_PageHeader as IGM_Launcher_PageHeader,
} from "@/components/iGM_Launcher_Primitives/iGM_Launcher_Primitives";
import { iGM_Launcher_BridgeCall } from "@/components/iGM_Launcher_Bridge/iGM_Launcher_BridgeClient";
import { iGM_Launcher_UseStore } from "@/components/iGM_Launcher_Store/iGM_Launcher_StoreProvider";
import { iGM_Launcher_UseShellLayout } from "@/components/iGM_Launcher_AppShell/iGM_Launcher_AppShell";
import type { iGM_Launcher_PageProps } from "./iGM_Launcher_PageRegistry";
import styles from "./iGM_Launcher_DownloadProgressPage.module.css";

// 类型定义 //
/** 下载终态：处于这些阶段时停止轮询 */
const IGM_LAUNCHER_DOWNLOAD_PROGRESS_TERMINAL: ReadonlySet<iGM_Launcher_DownloadStage> = new Set([
  "done",
  "failed",
  "cancelled",
]);

/** 进度轮询间隔（毫秒） */
const IGM_LAUNCHER_DOWNLOAD_PROGRESS_POLL_MS = 500;

// 核心逻辑 //
export function iGM_Launcher_DownloadProgressPage({ params }: iGM_Launcher_PageProps) {
  const t = useTranslations("downloadProgress");
  const tGame = useTranslations("gameInstall");
  const { navigate } = iGM_Launcher_UseShellLayout();
  const { scanInstalled } = iGM_Launcher_UseStore();

  const taskId = params?.taskId ?? "";

  const [progress, setProgress] = useState<iGM_Launcher_DownloadProgress | null>(null);
  const refreshedTaskRef = useRef("");

  const running = Boolean(progress) && !IGM_LAUNCHER_DOWNLOAD_PROGRESS_TERMINAL.has(
    progress?.stage ?? "idle",
  );
  // 未拿到快照时也先轮询一次，避免任务已存在却被界面判为结束
  const shouldPoll = Boolean(taskId) && (running || progress === null);

  useEffect(() => {
    if (!shouldPoll) return;
    let cancelled = false;
    void iGM_Launcher_BridgeCall("minecraft:download-status", { taskId }).then((response) => {
      if (!cancelled && response.success && response.data?.progress) {
        setProgress(response.data.progress);
      }
    });
    const timer = window.setInterval(() => {
      void iGM_Launcher_BridgeCall("minecraft:download-status", { taskId }).then((response) => {
        if (!cancelled && response.success && response.data?.progress) {
          setProgress(response.data.progress);
        }
      });
    }, IGM_LAUNCHER_DOWNLOAD_PROGRESS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [taskId, shouldPoll]);

  // 下载完成后重新扫描共享根目录，刷新已安装版本列表（每个任务只刷新一次）
  useEffect(() => {
    if (!progress || progress.stage !== "done") return;
    if (refreshedTaskRef.current === progress.taskId) return;
    refreshedTaskRef.current = progress.taskId;
    void scanInstalled(progress.rootDir);
  }, [progress, scanInstalled]);

  /** 取消下载：请求主进程终止当前任务 */
  const handleCancel = async () => {
    const response = await iGM_Launcher_BridgeCall("minecraft:download-cancel", { taskId });
    if (response.success && response.data?.progress) setProgress(response.data.progress);
  };

  // 进度百分比：优先按字节，未知大小（早期版本无体积信息）时回退按文件数
  const percent = useMemo(() => {
    if (!progress) return 0;
    if (progress.bytesTotal > 0) {
      return Math.min(100, Math.round((progress.bytesDone / progress.bytesTotal) * 100));
    }
    if (progress.filesTotal > 0) {
      return Math.min(100, Math.round((progress.filesDone / progress.filesTotal) * 100));
    }
    return 0;
  }, [progress]);

  // 任务编号缺失：通常是从其它入口误入，给出返回下载安装页的引导
  if (!taskId) {
    return (
      <div className={styles.page}>
        <IGM_Launcher_PageHeader title={t("title")} description={t("subtitle")} />
        <IGM_Launcher_Card className={styles.card}>
          <p className={styles.note}>{t("noTask")}</p>
          <div className={styles.actions}>
            <IGM_Launcher_Button variant="secondary" onClick={() => navigate("versions")}>
              <ArrowLeft size={15} strokeWidth={1.8} />
              {tGame("back")}
            </IGM_Launcher_Button>
          </div>
        </IGM_Launcher_Card>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <IGM_Launcher_PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <IGM_Launcher_Button variant="ghost" onClick={() => navigate("versions")}>
            <ArrowLeft size={15} strokeWidth={1.8} />
            {t("back")}
          </IGM_Launcher_Button>
        }
      />

      <IGM_Launcher_Card className={styles.card}>
        <div className={styles.headRow}>
          <span className={styles.headIcon}>
            <Download size={16} strokeWidth={1.8} />
          </span>
          <h2 className={styles.cardTitle}>
            {progress?.versionId ?? params?.version ?? t("unknownVersion")}
          </h2>
          {progress ? (
            <IGM_Launcher_Badge
              tone={
                progress.stage === "done"
                  ? "success"
                  : progress.stage === "failed" || progress.stage === "cancelled"
                    ? "muted"
                    : "neutral"
              }
            >
              {/* 引擎为 SDK 时状态文案改为引擎提示，避免与真实阶段混淆 */}
              {params?.engine === "sdk" &&
              !IGM_LAUNCHER_DOWNLOAD_PROGRESS_TERMINAL.has(progress.stage)
                ? t("engineSdk")
                : tGame(`stage_${progress.stage}`)}
            </IGM_Launcher_Badge>
          ) : null}
        </div>

        {/* 进度条：完全由主进程返回的字节/文件统计驱动 */}
        <div className={styles.progressTrack}>
          <div className={styles.progressBar} style={{ width: `${percent}%` }} />
        </div>

        <div className={styles.metaRow}>
          <span className={styles.metaText}>{tGame("progressPercent", { percent })}</span>
          {progress ? (
            <>
              <span className={styles.metaText}>
                {tGame("progressFiles", {
                  done: progress.filesDone,
                  total: progress.filesTotal,
                })}
              </span>
              <span className={styles.metaText}>
                {iGM_Launcher_FormatSize(progress.bytesDone)} /{" "}
                {iGM_Launcher_FormatSize(progress.bytesTotal) || tGame("sizeUnknown")}
              </span>
            </>
          ) : (
            <span className={styles.metaText}>{t("waiting")}</span>
          )}
        </div>

        {progress?.currentFile ? (
          <div className={styles.detailRow}>
            <span className={styles.metaLabel}>{tGame("currentFile")}</span>
            <span className={styles.pathText}>{progress.currentFile}</span>
          </div>
        ) : null}

        {progress ? (
          <div className={styles.detailRow}>
            <span className={styles.metaLabel}>
              <FolderOpen size={13} strokeWidth={1.8} />
              {tGame("currentRoot")}
            </span>
            <span className={styles.pathText}>{progress.rootDir}</span>
          </div>
        ) : null}

        {progress?.stage === "failed" ? (
          <p className={styles.errorText}>
            <AlertCircle size={13} strokeWidth={1.8} />
            {progress.error || tGame("taskFailed")}
          </p>
        ) : null}
        {progress?.stage === "done" ? (
          <p className={styles.okText}>
            <CheckCircle2 size={13} strokeWidth={1.8} />
            {tGame("doneNote")}
          </p>
        ) : null}
        {progress?.stage === "cancelled" ? (
          <p className={styles.note}>{tGame("cancelledNote")}</p>
        ) : null}

        <div className={styles.actions}>
          {running ? (
            <IGM_Launcher_Button variant="secondary" onClick={() => void handleCancel()}>
              <XCircle size={15} strokeWidth={1.8} />
              {tGame("cancelDownload")}
            </IGM_Launcher_Button>
          ) : null}
          {progress?.stage === "done" ? (
            <IGM_Launcher_Button variant="primary" onClick={() => navigate("instances")}>
              <Boxes size={15} strokeWidth={1.8} />
              {tGame("goInstances")}
            </IGM_Launcher_Button>
          ) : null}
          {!running && progress?.stage !== "done" ? (
            <IGM_Launcher_Button
              variant="secondary"
              onClick={() =>
                navigate("gameInstall", { version: progress?.version ?? params?.version })
              }
            >
              <Download size={15} strokeWidth={1.8} />
              {t("retryDownload")}
            </IGM_Launcher_Button>
          ) : null}
        </div>

        <p className={styles.note}>{t("note")}</p>
      </IGM_Launcher_Card>
    </div>
  );
}

// 导出 //
export default iGM_Launcher_DownloadProgressPage;