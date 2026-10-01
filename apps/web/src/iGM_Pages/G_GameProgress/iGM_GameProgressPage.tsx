/**
 * 文件路径：apps/web/src/iGM_Pages/G_GameProgress/iGM_GameProgressPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_GameProgress?taskId=xxx（静态壳，查询参数驱动加载）
 * 模块：G_GameProgress
 * 作用：Minecraft 本体安装进度页——展示当前阶段、总进度、速度与剩余时间
 * 内容：WebSocket 订阅进度事件（降级为轮询）、阶段名与百分比、速度与剩余时间、
 *       已下载文件数、取消按钮、完成提示与已安装管理入口
 * 说明：
 *   - 页面只渲染阶段与总进度，不展示单个文件细节
 *   - 完成后提示“已安装，可直接启动”；本模块不提供启动能力（由启动器承担）
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  LoaderCircle,
  Settings,
  Timer,
  Trash2,
  XCircle,
  Zap,
} from "lucide-react";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import {
  iGM_ApiCancelGameInstall,
  iGM_ApiGetGameInstall,
  iGM_GetGameWsUrl,
  type iGM_GameInstall,
  type iGM_GameProgressEvent,
  type iGM_GameStage,
  type iGM_GameWsMessage,
} from "../../iGM_Services/iGM_GameClient";
import { iGM_FormatFileSize } from "../../iGM_Services/iGM_FileClient";
import { iGM_ResolveErrorText } from "../../iGM_Components/iGM_AuthUI/iGM_AuthUI";
import { iGM_UseLocaleRouter } from "../../iGM_i18n/iGM_UseLocaleRouter";
import { iGM_EmptyState as IGM_EmptyState } from "../../iGM_Components/iGM_EmptyState/iGM_EmptyState";
import pageStyles from "../iGM_Page.module.css";
import m10 from "../iGM_Module10.module.css";
import m15 from "../iGM_Module15.module.css";
import styles from "../iGM_Game.module.css";

// 类型定义 //
/** 前端进度快照（由 WS 事件累积） */
interface iGM_ProgressSnapshot {
  percent: number;
  speed: number;
  remainingSeconds: number | null;
  doneFiles: number;
  totalFiles: number;
}

const iGM_InitialProgress: iGM_ProgressSnapshot = {
  percent: 0,
  speed: 0,
  remainingSeconds: null,
  doneFiles: 0,
  totalFiles: 0,
};

/** 轮询兜底间隔（毫秒） */
const iGM_PollIntervalMs = 4000;

// 核心逻辑 //
/** 把后端下发的 i18n 文案键解析为当前语言文本 */
function iGM_ResolveKey(
  t: ReturnType<typeof useTranslations>,
  key: string,
): string {
  return key.includes(".") && t.has(key) ? t(key) : key;
}

/** 剩余时间本地化文本 */
function iGM_FormatRemaining(
  t: ReturnType<typeof useTranslations>,
  seconds: number,
): string {
  if (seconds < 60) {
    return t("game.remainingSeconds", { seconds: Math.max(0, Math.round(seconds)) });
  }
  const minutes = Math.floor(seconds / 60);
  return t("game.remainingMinutes", {
    minutes,
    seconds: Math.round(seconds % 60),
  });
}

/** 本体安装进度页主体（在 Suspense 内使用 useSearchParams） */
export function iGM_GameProgressPage() {
  const t = useTranslations();
  const router = iGM_UseLocaleRouter();
  const searchParams = useSearchParams();
  const taskId = searchParams.get("taskId") ?? "";

  const [install, setInstall] = useState<iGM_GameInstall | null>(null);
  const [stage, setStage] = useState<iGM_GameStage>("manifest");
  const [progress, setProgress] = useState<iGM_ProgressSnapshot>(iGM_InitialProgress);
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const [purged, setPurged] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  /** 任务终态：完成 / 失败 / 取消后停止轮询与 WS 重连 */
  const settledRef = useRef(false);

  /** 应用一条进度事件 */
  const iGM_ApplyEvent = useCallback(
    (event: iGM_GameProgressEvent) => {
      if (event.type === "stage") {
        setStage(event.stage);
        return;
      }
      if (event.type === "progress") {
        setProgress({
          percent: event.percent,
          speed: event.speed,
          remainingSeconds: event.remainingSeconds,
          doneFiles: event.doneFiles,
          totalFiles: event.totalFiles,
        });
        return;
      }
      if (event.type === "complete") {
        settledRef.current = true;
        setStage("done");
        setProgress((prev) => ({ ...prev, percent: 100, speed: 0, remainingSeconds: 0 }));
        setInstall((prev) =>
          prev
            ? { ...prev, status: "completed", progress: 100 }
            : prev,
        );
        return;
      }
      if (event.type === "canceled") {
        settledRef.current = true;
        setInstall((prev) => (prev ? { ...prev, status: "canceled" } : prev));
        return;
      }
      if (event.type === "error") {
        settledRef.current = true;
        setErrorText(iGM_ResolveKey(t, event.message));
        setInstall((prev) => (prev ? { ...prev, status: "failed" } : prev));
        return;
      }
    },
    [t],
  );

  /** 拉取任务快照（首屏与轮询兜底共用） */
  const iGM_LoadInstall = useCallback(async () => {
    if (!taskId) {
      setLoading(false);
      return;
    }
    try {
      const response = await iGM_ApiGetGameInstall(taskId);
      const current = response.data?.install ?? null;
      setInstall(current);
      if (current) {
        setProgress((prev) => ({ ...prev, percent: current.progress }));
        if (
          current.status === "completed" ||
          current.status === "failed" ||
          current.status === "canceled"
        ) {
          settledRef.current = true;
          if (current.status === "completed") setStage("done");
          if (current.status === "failed" && current.error) {
            setErrorText(iGM_ResolveKey(t, current.error));
          }
        }
      }
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setLoading(false);
    }
  }, [taskId, t]);

  useEffect(() => {
    void iGM_LoadInstall();
  }, [iGM_LoadInstall]);

  /** WebSocket 订阅：实时进度 */
  useEffect(() => {
    if (!taskId) return;
    let socket: WebSocket | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    try {
      socket = new WebSocket(iGM_GetGameWsUrl(taskId));
      socket.onopen = () => {
        heartbeat = setInterval(() => {
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "ping" }));
          }
        }, 25000);
      };
      socket.onmessage = (message) => {
        try {
          const payload = JSON.parse(String(message.data)) as iGM_GameWsMessage;
          if (payload.type === "snapshot") {
            setInstall(payload.install);
            return;
          }
          if (payload.type === "event") {
            iGM_ApplyEvent(payload.event);
          }
        } catch {
          // 非法消息忽略，不影响轮询兜底
        }
      };
    } catch {
      // 构造失败时直接依赖轮询兜底
    }

    return () => {
      if (heartbeat) clearInterval(heartbeat);
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.close();
      }
    };
  }, [taskId, iGM_ApplyEvent]);

  /** 轮询兜底：WS 不可用时仍能看到进度 */
  useEffect(() => {
    if (!taskId) return;
    const timer = setInterval(() => {
      if (settledRef.current) return;
      void iGM_LoadInstall();
    }, iGM_PollIntervalMs);
    return () => clearInterval(timer);
  }, [taskId, iGM_LoadInstall]);

  /**
   * 取消安装任务
   * purge 为 true 时一并清除已下载的残余文件（含版本目录与已下载的依赖库、资源）
   */
  async function iGM_HandleCancel(purge = false): Promise<void> {
    if (!install || canceling) return;
    const confirmKey = purge
      ? "game.cancelAndPurgeConfirm"
      : "game.cancelConfirm";
    if (!window.confirm(t(confirmKey))) return;
    setCanceling(true);
    setErrorText(null);
    try {
      await iGM_ApiCancelGameInstall(install.id, purge);
      settledRef.current = true;
      setPurged(purge);
      setInstall((prev) => (prev ? { ...prev, status: "canceled" } : prev));
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
    } finally {
      setCanceling(false);
    }
  }

  if (loading) {
    return (
      <div className={m10.stateBox}>
        <LoaderCircle size={16} className="igm-spin" />
        {t("game.stateLoading")}
      </div>
    );
  }

  if (!install) {
    return (
      <div className={pageStyles.page}>
        <IGM_EmptyState
          icon={Download}
          title={t("game.taskNotFound")}
          description={errorText ?? undefined}
          action={
            <Link href="/G_MinecraftVersions" className={m10.primaryButton}>
              <ArrowLeft size={15} strokeWidth={1.8} />
              {t("game.backToVersions")}
            </Link>
          }
        />
      </div>
    );
  }

  const isDone = install.status === "completed";
  const isTerminal =
    isDone || install.status === "failed" || install.status === "canceled";
  const percent = isDone ? 100 : Math.min(100, Math.max(0, progress.percent));

  return (
    <div className={pageStyles.page}>
      <Link href="/G_MinecraftVersions" className={m10.backLink}>
        <ArrowLeft size={14} strokeWidth={2} />
        {t("game.backToVersions")}
      </Link>

      <section className={`${m15.progressCard} ${styles.versionCard}`}>
        <div className={m15.progressHead}>
          <span className={m15.progressTitle}>
            {t("game.progressTitle", { version: install.version })}
          </span>
          <span className={styles.progressStage}>
            {isDone
              ? t("game.stage.done")
              : t(`game.stage.${stage}`)}
          </span>
        </div>

        {/* 总进度 */}
        <div className={styles.progressHero}>
          <span className={styles.progressPercent}>{percent.toFixed(1)}%</span>
        </div>
        <div className={m15.progressTrack}>
          <div
            className={m15.progressFill}
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* 速度 / 剩余时间 / 文件数 */}
        <div className={styles.progressStats}>
          <span className={styles.progressStat}>
            <Zap size={13} strokeWidth={1.8} />
            {t("game.speedLabel", { speed: iGM_FormatFileSize(progress.speed) })}
          </span>
          <span className={styles.progressStat}>
            <Timer size={13} strokeWidth={1.8} />
            {progress.remainingSeconds === null || isTerminal
              ? t("game.remainingUnknown")
              : iGM_FormatRemaining(t, progress.remainingSeconds)}
          </span>
          <span className={styles.progressStat}>
            <Download size={13} strokeWidth={1.8} />
            {t("game.progressFiles", {
              done: progress.doneFiles,
              total: progress.totalFiles,
            })}
          </span>
        </div>

        <div className={styles.kvList}>
          <div className={styles.kvRow}>
            <span className={styles.kvKey}>{t("game.versionDirLabel")}</span>
            <span className={styles.kvValue}>{install.versionDir}</span>
          </div>
          <div className={styles.kvRow}>
            <span className={styles.kvKey}>{t("game.installDirLabel")}</span>
            <span className={styles.kvValue}>{install.installDir}</span>
          </div>
        </div>

        {errorText && (
          <div className={`${m10.alert} ${m10.alertError}`}>{errorText}</div>
        )}

        {isDone && (
          <div className={`${m10.alert} ${m10.alertSuccess}`}>
            <CheckCircle2 size={15} strokeWidth={1.8} style={{ verticalAlign: "-2px", marginRight: 6 }} />
            {t("game.completedDescription")}
          </div>
        )}
        {install.status === "canceled" && (
          <div className={m10.hint}>
            {purged ? t("game.canceledPurgedHint") : t("game.canceledHint")}
          </div>
        )}

        <div className={m15.progressActions}>
          {isDone ? (
            <Link href="/G_GameInstalled" className={m15.primaryButton}>
              <Settings size={15} strokeWidth={1.8} />
              {t("game.manageInstalled")}
            </Link>
          ) : (
            <>
              <button
                type="button"
                className={m10.dangerButton}
                disabled={canceling || isTerminal}
                onClick={() => void iGM_HandleCancel(false)}
              >
                {canceling ? (
                  <LoaderCircle size={15} className="igm-spin" />
                ) : (
                  <XCircle size={15} strokeWidth={1.8} />
                )}
                {t("game.cancelInstall")}
              </button>
              <button
                type="button"
                className={m10.ghostButton}
                disabled={canceling || isTerminal}
                onClick={() => void iGM_HandleCancel(true)}
              >
                <Trash2 size={15} strokeWidth={1.8} />
                {t("game.cancelAndPurge")}
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

// 导出 //
export default iGM_GameProgressPage;