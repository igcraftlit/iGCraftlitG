/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Notice/iGM_Launcher_NoticeBar.tsx
 * 所属层：前端 / 提示反馈层
 * 路由：全局（渲染于内容区顶部）
 * 模块：iGM_Launcher_NoticeBar
 * 作用：把状态中心的操作结果（notice）以极简提示条形式回馈界面
 * 内容：成功 / 失败两种色调、自动消失、手动关闭、随提示变化重置计时
 */

// 导入依赖 //
"use client";

import { useEffect } from "react";
import { Check, CircleAlert, X } from "lucide-react";
import { iGM_Launcher_UseStore } from "@/components/iGM_Launcher_Store/iGM_Launcher_StoreProvider";
import styles from "./iGM_Launcher_NoticeBar.module.css";

// 类型定义 //
/* （无额外类型） */

// 核心逻辑（常量） //
/** 提示自动消失时间（毫秒） */
const IGM_LAUNCHER_NOTICE_DURATION = 4000;

// 核心逻辑 //
export function iGM_Launcher_NoticeBar() {
  const { notice, clearNotice } = iGM_Launcher_UseStore();

  // 每次新提示出现时重新计时，避免连续操作时提示被提前清除
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => clearNotice(), IGM_LAUNCHER_NOTICE_DURATION);
    return () => window.clearTimeout(timer);
  }, [notice, clearNotice]);

  if (!notice) return null;

  const success = notice.tone === "success";

  return (
    <div
      className={`${styles.notice} ${success ? styles.noticeSuccess : styles.noticeError}`}
      role="status"
      aria-live="polite"
    >
      {success ? (
        <Check size={14} strokeWidth={2} className={styles.icon} />
      ) : (
        <CircleAlert size={14} strokeWidth={2} className={styles.icon} />
      )}
      <span className={styles.message}>{notice.message}</span>
      <button
        type="button"
        className={styles.close}
        onClick={clearNotice}
        aria-label="close"
        title="close"
      >
        <X size={13} strokeWidth={2} />
      </button>
    </div>
  );
}

// 导出 //
export default iGM_Launcher_NoticeBar;