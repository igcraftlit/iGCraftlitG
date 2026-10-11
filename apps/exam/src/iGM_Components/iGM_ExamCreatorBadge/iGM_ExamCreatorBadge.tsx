/**
 * 文件路径：apps/exam/src/iGM_Components/iGM_ExamCreatorBadge/iGM_ExamCreatorBadge.tsx
 * 所属层：前端 / 通用组件层
 * 路由：全局（刊头右上角控件组内）
 * 模块：iGM_ExamCreatorBadge
 * 作用：展示当前登录命题创作者专属编号（形如 #0000000001）的右上角徽标
 * 内容：挂载后拉取命题者编号档案、徽标渲染、悬停 / 点按弹出完整编号与复制按钮、
 *       复制态反馈、窄屏仅图标降级
 * 说明：仅对已通过审核且在册的命题创作者渲染；访客与非命题创作者一律返回 null 不渲染；
 *       数据在客户端拉取，保持纯静态导出与水合一致
 */

// 导入依赖 //
"use client";

import { useEffect, useRef, useState } from "react";
import { BadgeCheck, Check, Copy } from "lucide-react";
import { useI18n } from "../../iGM_i18n/iGM_I18nContext";
import {
  iGM_Examiner_FetchCreatorProfile,
  type iGM_CreatorProfile,
} from "../../iGM_Services/iGM_ExaminerClient";
import styles from "./iGM_ExamCreatorBadge.module.css";

// 类型定义 //
// （本组件无对外 props，展示状态全部内部管理）

// 核心逻辑 //
/** 命题创作者编号徽标 */
export function iGM_ExamCreatorBadge() {
  const { t } = useI18n();
  const [profile, setProfile] = useState<iGM_CreatorProfile | null>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 挂载后拉取编号档案：未登录 / 非命题创作者得到 null，保持不渲染
  useEffect(() => {
    let active = true;
    iGM_Examiner_FetchCreatorProfile().then((result) => {
      if (active) setProfile(result);
    });
    return () => {
      active = false;
    };
  }, []);

  // 弹出时监听外部点击与 Esc 关闭
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // 卸载时清理复制态计时器
  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  // 非在册命题创作者：不渲染任何内容
  if (!profile) return null;

  const fullNumber = `#${profile.creatorNumber}`;

  const copyNumber = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(fullNumber);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // 剪贴板不可用（非安全上下文）时静默忽略
    }
  };

  return (
    <div ref={rootRef} className={styles.wrap} data-open={open}>
      <button
        type="button"
        className={styles.badge}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={t("creatorBadgeHint")}
        title={fullNumber}
      >
        <BadgeCheck size={14} strokeWidth={1.8} className={styles.icon} />
        <span className={`igm-mono ${styles.number}`}>{fullNumber}</span>
      </button>

      <div
        className={styles.popover}
        role="dialog"
        aria-label={t("creatorBadgeLabel")}
      >
        <span className={`igm-mono ${styles.popoverNumber}`}>{fullNumber}</span>
        <span className={styles.popoverLabel}>{t("creatorBadgeLabel")}</span>
        <button
          type="button"
          className={styles.copy}
          onClick={() => void copyNumber()}
          aria-label={t("creatorBadgeCopy")}
        >
          {copied ? (
            <Check size={13} strokeWidth={2} />
          ) : (
            <Copy size={13} strokeWidth={1.8} />
          )}
          <span className={`igm-mono ${styles.copyText}`}>
            {copied ? t("creatorBadgeCopied") : t("creatorBadgeCopy")}
          </span>
        </button>
      </div>
    </div>
  );
}

// 导出 //
export default iGM_ExamCreatorBadge;
