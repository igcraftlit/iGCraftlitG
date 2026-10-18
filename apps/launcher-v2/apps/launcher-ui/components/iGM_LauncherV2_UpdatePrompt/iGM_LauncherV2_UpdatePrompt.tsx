/**
 * 文件路径：apps/launcher-ui/components/iGM_LauncherV2_UpdatePrompt/iGM_LauncherV2_UpdatePrompt.tsx
 * 所属层：前端 / 全局浮层组件
 * 路由：G_Main（全局挂载，不进入导航栏）
 * 模块：iGM_LauncherV2_UpdatePrompt
 * 作用：右下角极简自动更新提示：发现新版本 → 后台下载 → 立即重启并更新
 * 内容：外壳启动时静默检查并回推 update:state；检测到新版本时于右下角弹出提示，
 *       点击「下载」由外壳后台静默下载并实时回推进度；下载完成后提示「立即重启并更新」；
 *       用户可忽略当前版本（出现更高版本号时自动恢复提示）；
 *       提示文案已接入多语言（next-intl，键为 update 与 common）
 * 说明：不使用花哨动画；仅在 available / downloading / downloaded 三态下可见
 */

// 导入依赖 //
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowUpCircle, X } from "lucide-react";
import {
  iGM_LauncherV2_UseUpdate as IGM_LauncherV2_UseUpdate,
} from "@/components/iGM_LauncherV2_HostBridge/iGM_LauncherV2_HostBridge";
import styles from "./iGM_LauncherV2_UpdatePrompt.module.css";

// 核心逻辑 //

export function iGM_LauncherV2_UpdatePrompt() {
  const t = useTranslations();
  const update = IGM_LauncherV2_UseUpdate();
  const state = update.state;
  /** 被用户忽略的版本号；出现更新的版本时自动恢复提示 */
  const [ignored, setIgnored] = useState("");

  // 非提示态（空闲 / 检查中 / 已最新 / 出错）不渲染
  if (
    state.status === "idle" ||
    state.status === "checking" ||
    state.status === "latest" ||
    state.status === "error"
  ) {
    return null;
  }
  // 用户已忽略该版本则不再打扰，直到出现更高版本号
  if (state.status === "available" && ignored === state.latestVersion) return null;

  const available = state.status === "available";
  const downloading = state.status === "downloading";
  const title = available
    ? t("update.availableTitle", { version: state.latestVersion })
    : downloading
      ? t("update.downloadingTitle")
      : t("update.readyTitle");
  const desc = available
    ? t("update.availableDesc")
    : downloading
      ? t("update.downloadingDesc", { progress: state.progress.toFixed(0) })
      : t("update.readyDesc");

  return (
    <div className={styles.prompt} role="status">
      <span className={styles.icon} aria-hidden>
        <ArrowUpCircle size={18} strokeWidth={2.2} />
      </span>
      <div className={styles.text}>
        <span className={styles.title}>{title}</span>
        <span className={styles.desc}>{desc}</span>
        {downloading ? (
          <span className={styles.track}>
            <span
              className={styles.fill}
              style={{ width: `${Math.min(100, Math.max(0, state.progress))}%` }}
            />
          </span>
        ) : null}
      </div>
      <div className={styles.actions}>
        {available ? (
          <button type="button" className={styles.primary} onClick={() => update.download()}>
            <span>{t("common.download")}</span>
          </button>
        ) : null}
        {state.status === "downloaded" ? (
          <button type="button" className={styles.primary} onClick={() => update.install()}>
            <span>{t("update.restartNow")}</span>
          </button>
        ) : null}
        <button
          type="button"
          className={styles.dismiss}
          aria-label={t("update.dismissAria")}
          title={t("update.dismiss")}
          onClick={() => setIgnored(state.latestVersion)}
        >
          <X size={13} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}

// 导出 //
export default iGM_LauncherV2_UpdatePrompt;
