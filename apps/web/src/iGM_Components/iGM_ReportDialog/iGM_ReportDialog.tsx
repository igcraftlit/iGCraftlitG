/**
 * 文件路径：apps/web/src/iGM_Components/iGM_ReportDialog/iGM_ReportDialog.tsx
 * 所属层：前端 / 通用组件层
 * 路由：G_Post 帖子详情
 * 模块：iGM_ReportDialog
 * 作用：帖子举报弹窗——六类原因单选 + 5-500 字原因描述，提交至
 *       POST /G_Post/report；成功后关闭并由父级展示反馈
 * 内容：玻璃态遮罩卡片、ESC/遮罩关闭、基础焦点陷阱与滚动锁定、
 *       前端长度/必选校验、提交中防重复、错误经 iGM_ResolveErrorText 兜底
 * 说明：纯受控弹窗（open/onClose），权限边界在后端；未登录入口由父级隐藏
 */

// 导入依赖 //
"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Flag, LoaderCircle, X } from "lucide-react";
import {
  iGM_ApiReportPost,
  iGM_ReportReasons,
  type iGM_ReportReason,
} from "../../iGM_Services/iGM_PostClient";
import { iGM_ResolveErrorText } from "../iGM_AuthUI/iGM_AuthUI";
import styles from "./iGM_ReportDialog.module.css";

// 类型定义 //
/** 描述长度上下限（与后端 iGM_SubmitPostReportService 一致） */
const iGM_DetailMin = 5;
const iGM_DetailMax = 500;

export interface iGM_ReportDialogProps {
  /** 被举报帖子 ID */
  postId: string;
  /** 是否展开 */
  open: boolean;
  /** 请求关闭（ESC、遮罩、取消、提交成功后触发） */
  onClose: () => void;
  /** 提交成功回调（父级展示成功提示） */
  onSubmitted?: () => void;
}

// 核心逻辑 //
/** 帖子举报弹窗 */
export function iGM_ReportDialog({
  postId,
  open,
  onClose,
  onSubmitted,
}: iGM_ReportDialogProps) {
  const t = useTranslations();
  const cardRef = useRef<HTMLDivElement>(null);

  const [reason, setReason] = useState<iGM_ReportReason | null>(null);
  const [detail, setDetail] = useState("");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** 客户端挂载标记，避免 SSR 阶段创建 Portal */
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 每次打开时重置表单状态
  useEffect(() => {
    if (open) {
      setReason(null);
      setDetail("");
      setErrorText(null);
      setSubmitting(false);
    }
  }, [open, postId]);

  // ESC 关闭、焦点陷阱、背景滚动锁定
  useEffect(() => {
    if (!open) return;

    function iGM_HandleKey(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !cardRef.current) return;
      const focusables = Array.from(
        cardRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", iGM_HandleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // 打开后焦点落入首个原因单选项
    const focusTimer = window.setTimeout(() => {
      cardRef.current?.querySelector<HTMLElement>('input[type="radio"]')?.focus();
    }, 0);

    return () => {
      document.removeEventListener("keydown", iGM_HandleKey);
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focusTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** 提交举报：前端必选/长度校验 + 防重复提交 */
  async function iGM_HandleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    if (!reason) {
      setErrorText(t("report.errors.reasonInvalid"));
      return;
    }
    const trimmed = detail.trim();
    if (trimmed.length < iGM_DetailMin || trimmed.length > iGM_DetailMax) {
      setErrorText(t("report.errors.detailLength"));
      return;
    }

    setSubmitting(true);
    setErrorText(null);
    try {
      await iGM_ApiReportPost({ postId, reason, detail: trimmed });
      onSubmitted?.();
      onClose();
    } catch (error) {
      setErrorText(iGM_ResolveErrorText(t, error));
      setSubmitting(false);
    }
  }

  if (!open || !mounted) return null;

  const detailLength = detail.trim().length;
  const lengthInvalid = detailLength > iGM_DetailMax;

  return createPortal(
    <div
      className={styles.overlay}
      role="presentation"
      onMouseDown={(event) => {
        // 仅点击遮罩空白处关闭，避免选择文本误触
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <div
        ref={cardRef}
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="igm-report-dialog-title"
      >
        <div className={styles.header}>
          <h2 className={styles.title} id="igm-report-dialog-title">
            <Flag size={17} strokeWidth={1.9} />
            {t("report.dialog.title")}
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            aria-label={t("report.dialog.cancel")}
            onClick={onClose}
            disabled={submitting}
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>
        <p className={styles.description}>{t("report.dialog.description")}</p>

        <form onSubmit={iGM_HandleSubmit} noValidate>
          <span className={styles.fieldLabel}>{t("report.dialog.reasonLabel")}</span>
          <div className={styles.reasonList} role="radiogroup">
            {iGM_ReportReasons.map((item) => (
              <label
                key={item}
                className={`${styles.reasonCard} ${
                  reason === item ? styles.reasonCardActive : ""
                }`}
              >
                <input
                  className={styles.reasonInput}
                  type="radio"
                  name="igm-report-reason"
                  value={item}
                  checked={reason === item}
                  onChange={() => setReason(item)}
                />
                <span className={styles.reasonText}>
                  {t(`report.reasons.${item}`)}
                </span>
              </label>
            ))}
          </div>

          <label className={styles.fieldLabel} htmlFor="igm-report-detail">
            {t("report.dialog.detailLabel")}
          </label>
          <textarea
            id="igm-report-detail"
            className={styles.textarea}
            value={detail}
            maxLength={iGM_DetailMax}
            placeholder={t("report.dialog.detailPlaceholder")}
            onChange={(event) => setDetail(event.target.value)}
          />
          <div className={styles.textareaMeta}>
            <span>{t("report.dialog.detailHint")}</span>
            <span className={lengthInvalid ? styles.counterInvalid : undefined}>
              {detailLength}/{iGM_DetailMax}
            </span>
          </div>

          {errorText && <div className={styles.errorBox}>{errorText}</div>}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={onClose}
              disabled={submitting}
            >
              {t("report.dialog.cancel")}
            </button>
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={submitting}
            >
              {submitting && <LoaderCircle size={14} className="igm-spin" />}
              {submitting
                ? t("report.dialog.submitting")
                : t("report.dialog.submit")}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

// 导出 //
export default iGM_ReportDialog;
