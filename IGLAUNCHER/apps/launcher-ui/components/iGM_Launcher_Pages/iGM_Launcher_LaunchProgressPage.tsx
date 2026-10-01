/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Pages/iGM_Launcher_LaunchProgressPage.tsx
 * 所属层：前端 / 页面层
 * 路由：G_LaunchProgress（SPA 页 id：launchProgress）
 * 模块：iGM_Launcher_LaunchProgressPage
 * 作用：启动进度独立页，由实例管理页选定登录方式后跳转，展示启动阶段与进度条
 * 内容：进入即按所选登录方式（正版 / 离线）发起启动，
 *       并并发轮询 instance:launch-status 读取主进程登记的真实阶段与进度；
 *       展示实例名、登录方式、玩家名、版本目录、Java、GameDir 与日志路径；
 *       失败时内联展示可照做的原因；运行中或已退出后停止轮询
 *
 * 说明：进度条完全由主进程返回的 stage / progress 驱动，界面不伪造任何进度；
 *       启动失败原因原样透传，绝不把「启动失败」显示成「已启动」。
 */

// 导入依赖 //
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Boxes,
  CheckCircle2,
  Coffee,
  HardDrive,
  ListChecks,
  Play,
  ShieldCheck,
  Smile,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { iGM_Launcher_LaunchStatus } from "@igm-launcher/shared";
import {
  iGM_Launcher_Badge as IGM_Launcher_Badge,
  iGM_Launcher_Button as IGM_Launcher_Button,
  iGM_Launcher_Card as IGM_Launcher_Card,
  iGM_Launcher_PageHeader as IGM_Launcher_PageHeader,
} from "@/components/iGM_Launcher_Primitives/iGM_Launcher_Primitives";
import { iGM_Launcher_UseStore } from "@/components/iGM_Launcher_Store/iGM_Launcher_StoreProvider";
import { iGM_Launcher_UseShellLayout } from "@/components/iGM_Launcher_AppShell/iGM_Launcher_AppShell";
import type { iGM_Launcher_PageProps } from "./iGM_Launcher_PageRegistry";
import styles from "./iGM_Launcher_LaunchProgressPage.module.css";

// 类型定义 //
/** 状态轮询间隔（毫秒）：启动阶段推进较快，用较短间隔保证进度条跟手 */
const IGM_LAUNCHER_LAUNCH_POLL_MS = 400;

// 核心逻辑 //
export function iGM_Launcher_LaunchProgressPage({ params }: iGM_Launcher_PageProps) {
  const t = useTranslations("launchProgress");
  const { navigate } = iGM_Launcher_UseShellLayout();
  const { instances, launchInstance, launchStatus, launchError, rootDir } =
    iGM_Launcher_UseStore();

  const instanceId = params?.instanceId ?? "";
  const mode = params?.mode === "official" ? "official" : "offline";
  const bindingId = params?.bindingId ?? "";

  const instance = useMemo(
    () => instances.find((item) => item.id === instanceId) ?? null,
    [instances, instanceId],
  );

  const [status, setStatus] = useState<iGM_Launcher_LaunchStatus | null>(null);
  const [starting, setStarting] = useState(true);
  const startedRef = useRef(false);

  // 启动阶段仍在推进（尚未进入运行 / 退出 / 失败）时持续轮询
  const stillStarting = starting || status?.state === "starting";

  useEffect(() => {
    if (!instanceId || !stillStarting) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void launchStatus(instanceId).then((next) => {
        if (!cancelled && next) setStatus(next);
      });
    }, IGM_LAUNCHER_LAUNCH_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [instanceId, stillStarting, launchStatus]);

  // 进入页面即发起一次启动：所选登录方式由实例管理页透传
  useEffect(() => {
    if (startedRef.current || !instanceId) return;
    startedRef.current = true;
    void launchInstance(instanceId, {
      mode,
      bindingId: bindingId || undefined,
      rootDir: rootDir?.path,
    })
      .then((result) => {
        setStarting(false);
        if (result) setStatus(result);
      })
      .finally(() => {
        // 结束后补一次终态查询，避免轮询与启动调用交错漏掉最后状态
        void launchStatus(instanceId).then((next) => {
          if (next) setStatus(next);
        });
      });
  }, [instanceId, mode, bindingId, launchInstance, launchStatus, rootDir?.path]);

  const percent = status?.progress ?? 0;
  const failed = status?.state === "failed";
  const running = status?.state === "running";
  const exited = status?.state === "exited";
  const errorText = failed ? status?.error ?? "" : !starting && !status ? launchError : "";

  return (
    <div className={styles.page}>
      <IGM_Launcher_PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <IGM_Launcher_Button variant="ghost" onClick={() => navigate("instances")}>
            <ArrowLeft size={15} strokeWidth={1.8} />
            {t("back")}
          </IGM_Launcher_Button>
        }
      />

      <IGM_Launcher_Card className={styles.card}>
        <div className={styles.headRow}>
          <span className={styles.headIcon}>
            <Play size={16} strokeWidth={1.8} />
          </span>
          <h2 className={styles.cardTitle}>
            {instance?.name ?? status?.instanceName ?? t("unknownInstance")}
          </h2>
          <IGM_Launcher_Badge tone={mode === "official" ? "accent" : "neutral"}>
            {mode === "official" ? (
              <ShieldCheck size={11} strokeWidth={1.8} />
            ) : (
              <HardDrive size={11} strokeWidth={1.8} />
            )}
            {mode === "official" ? t("modeOfficial") : t("modeOffline")}
          </IGM_Launcher_Badge>
          {status ? (
            <IGM_Launcher_Badge tone="neutral">{status.versionId}</IGM_Launcher_Badge>
          ) : null}
        </div>

        {/* 进度条：完全由主进程返回的 progress 驱动 */}
        <div className={styles.progressTrack}>
          <div className={styles.progressBar} style={{ width: `${percent}%` }} />
        </div>

        <div className={styles.metaRow}>
          <span className={styles.metaText}>{t("progressPercent", { percent })}</span>
          {status ? (
            <span className={styles.metaText}>{t(status.stageMessage)}</span>
          ) : (
            <span className={styles.metaText}>{t("stage_preparing")}</span>
          )}
          {running ? (
            <span className={styles.okText}>
              <CheckCircle2 size={13} strokeWidth={1.8} />
              {t("running")}
            </span>
          ) : null}
          {exited ? (
            <span className={styles.metaText}>
              {status?.exitCode === 0
                ? t("exitedOk")
                : t("exitedCode", { code: status?.exitCode ?? 0 })}
            </span>
          ) : null}
        </div>

        {/* 身份与路径明细 */}
        <dl className={styles.detailGrid}>
          <div className={styles.detailRow}>
            <dt>
              <Smile size={13} strokeWidth={1.8} />
              {t("playerLabel")}
            </dt>
            <dd>{status?.playerName || t("playerPending")}</dd>
          </div>
          <div className={styles.detailRow}>
            <dt>
              <Coffee size={13} strokeWidth={1.8} />
              {t("javaLabel")}
            </dt>
            <dd className={styles.pathText}>{status?.javaPath || t("javaPending")}</dd>
          </div>
          <div className={styles.detailRow}>
            <dt>
              <HardDrive size={13} strokeWidth={1.8} />
              {t("gameDirLabel")}
            </dt>
            <dd className={styles.pathText}>
              {status?.gameDir || instance?.directory || t("gameDirPending")}
            </dd>
          </div>
          <div className={styles.detailRow}>
            <dt>
              <ListChecks size={13} strokeWidth={1.8} />
              {t("logLabel")}
            </dt>
            <dd className={styles.pathText}>{status?.logPath || t("logPending")}</dd>
          </div>
        </dl>

        {errorText ? (
          <p className={styles.errorText}>
            <AlertCircle size={13} strokeWidth={1.8} />
            {errorText}
          </p>
        ) : null}

        <div className={styles.actions}>
          <IGM_Launcher_Button variant="secondary" onClick={() => navigate("instances")}>
            <Boxes size={15} strokeWidth={1.8} />
            {t("goInstances")}
          </IGM_Launcher_Button>
          <IGM_Launcher_Button
            variant="ghost"
            onClick={() => navigate("instancesEdit", { instanceId })}
          >
            {t("editInstance")}
          </IGM_Launcher_Button>
        </div>

        <p className={styles.note}>{t("note")}</p>
      </IGM_Launcher_Card>
    </div>
  );
}

// 导出 //
export default iGM_Launcher_LaunchProgressPage;