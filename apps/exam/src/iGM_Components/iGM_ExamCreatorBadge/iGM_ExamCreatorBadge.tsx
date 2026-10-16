/**
 * 文件路径：apps/exam/src/iGM_Components/iGM_ExamCreatorBadge/iGM_ExamCreatorBadge.tsx
 * 所属层：前端 / 通用组件层
 * 路由：全局（刊头右上角控件组内）
 * 模块：iGM_ExamCreatorBadge
 * 作用：展示当前登录命题创作者专属 GUID（主站 UID）+ 认证徽章
 * 内容：从 ExamAuthContext 取 user.isExaminer + user.uid；
 *       徽章渲染（CheckCircle icon）、悬停提示"已认证命题创作者"、
 *       窄屏仅图标降级
 * 说明：仅对已通过审核的命题创作者渲染；访客与非命题创作者一律返回 null 不渲染；
 *       不再 FetchCreatorProfile —— 统一走 ExamAuthContext 已拉好的 /oauth/me 数据
 */

// 导入依赖 //
"use client";

import { useRef, useState } from "react";
import { CheckCircle, Check, Copy } from "lucide-react";
import { useI18n } from "../../iGM_i18n/iGM_I18nContext";
import { iGM_ExamUseAuth } from "../../iGM_AuthContext";
import styles from "./iGM_ExamCreatorBadge.module.css";

// 类型定义 //

// 核心逻辑 //
/** 命题创作者 GUID 徽章 */
export function iGM_ExamCreatorBadge() {
  const { t } = useI18n();
  const { user } = iGM_ExamUseAuth();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 非在册命题创作者：不渲染任何内容
  if (!user || !user.isExaminer || !user.uid) return null;

  const guid = user.uid;
  const copyLabel = `GUID: ${guid}`;

  const copyNumber = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(copyLabel);
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
        title={copyLabel}
      >
        <CheckCircle size={14} strokeWidth={1.8} className={styles.icon} />
        <span className={`igm-mono ${styles.number}`}>{copyLabel}</span>
      </button>

      <div
        className={styles.popover}
        role="dialog"
        aria-label={t("creatorBadgeLabel")}
      >
        <span className={`igm-mono ${styles.popoverNumber}`}>{copyLabel}</span>
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
