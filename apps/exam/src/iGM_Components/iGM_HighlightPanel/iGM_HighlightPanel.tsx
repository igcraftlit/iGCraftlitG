/**
 * 文件路径：apps/exam/src/iGM_Components/iGM_HighlightPanel/iGM_HighlightPanel.tsx
 * 所属层：前端 / 通用组件层
 * 路由：E_Admin_Exam（/admin）
 * 模块：iGM_HighlightPanel
 * 作用：展示 AI 检索出的亮点题目，支持勾选、送往命题管理与忽略，并在送往成功后提示前往审核
 * 内容：题目卡片列表（题干摘要 / 质量分 / 难度系数 / 知识点 / 推荐教材 / AI 理由）、
 *       全选与单题勾选、送往命题管理（调用 send-to-editor）、忽略（本地移除）、
 *       送往成功提示弹窗（立即前往 /editor?tab=pending 或稍后关闭）
 * 说明：纯客户端组件，所有请求经 iGM_QuestionAiClient；忽略仅本地移除，不调用后端；文案取自当前语言包
 */

// 导入依赖 //
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  CheckCheck,
  EyeOff,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import {
  iGM_QuestionAi_SendToEditor,
  iGM_QuestionAi_NormalizeOptions,
  type iGM_AiSelectResult,
  type iGM_AiSelectedQuestion,
} from "../../iGM_Services/iGM_QuestionAiClient";
import { iGM_ExamRequestError } from "../../iGM_Services/iGM_ExamClient";
import type { iGM_QuestionType } from "../../iGM_Services/iGM_QuestionClient";
import { useI18n } from "../../iGM_i18n/iGM_I18nContext";
import type { iGM_I18nKey } from "../../iGM_i18n/iGM_I18nTypes";
import styles from "./iGM_HighlightPanel.module.css";

// 类型定义 //
interface iGM_HighlightPanelProps {
  /** AI 选题结果（含题目列表、模型与来源） */
  result: iGM_AiSelectResult;
  /** 忽略单题（父组件本地移除） */
  onIgnore: (selectionId: string) => void;
  /** 关闭面板 */
  onClose: () => void;
}

/** 题型 → 文案键 */
const iGM_Highlight_TypeKeys: Record<iGM_QuestionType, iGM_I18nKey> = {
  single_choice: "questionTypeSingleChoice",
  multiple_choice: "questionTypeMultipleChoice",
  true_false: "questionTypeTrueFalse",
  fill_blank: "questionTypeFillBlank",
  short_answer: "questionTypeShortAnswer",
};

/** 题目摘要截断长度 */
const iGM_Highlight_StemLimit = 140;

// 核心逻辑 //
/** 难度等级归一化为文案键；未识别时返回空串 */
function iGM_Highlight_LevelKey(level: string): iGM_I18nKey | null {
  const lower = level.trim().toLowerCase();
  if (lower.includes("easy") || lower.includes("简单")) return "difficultyEasy";
  if (lower.includes("hard") || lower.includes("困难") || lower.includes("难"))
    return "difficultyHard";
  if (lower.includes("medium") || lower.includes("中等")) return "difficultyMedium";
  return null;
}

/** 亮点题目面板 */
export function iGM_HighlightPanel({
  result,
  onIgnore,
  onClose,
}: iGM_HighlightPanelProps) {
  const { t } = useI18n();
  const router = useRouter();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [promptOpen, setPromptOpen] = useState(false);

  const count = result.questions.length;
  const allSelected = count > 0 && selectedIds.size === count;

  /** 勾选 / 取消勾选单题 */
  function toggleOne(selectionId: string): void {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(selectionId)) next.delete(selectionId);
      else next.add(selectionId);
      return next;
    });
  }

  /** 全选 / 取消全选 */
  function toggleAll(): void {
    setSelectedIds((current) => {
      if (current.size === count) return new Set();
      return new Set(result.questions.map((item) => item.selectionId));
    });
  }

  /** 展开 / 收起题干摘要 */
  function toggleExpand(selectionId: string): void {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(selectionId)) next.delete(selectionId);
      else next.add(selectionId);
      return next;
    });
  }

  /**
   * 送往命题管理：已勾选时提交全部勾选项，未勾选时提交该题；
   * 成功后本地移除已送题目并弹出「是否立即前往审核」提示
   */
  async function send(selectionId?: string): Promise<void> {
    if (sending) return;
    const ids =
      selectedIds.size > 0
        ? Array.from(selectedIds)
        : selectionId
          ? [selectionId]
          : [];
    if (ids.length === 0) return;
    setSending(true);
    setError("");
    try {
      await iGM_QuestionAi_SendToEditor(ids);
      for (const id of ids) onIgnore(id);
      setSelectedIds(new Set());
      setPromptOpen(true);
    } catch (err) {
      setError(
        err instanceof iGM_ExamRequestError ? err.message : t("aiSelectFailed"),
      );
    } finally {
      setSending(false);
    }
  }

  /** 立即前往命题管理待审核标签页 */
  function goNow(): void {
    setPromptOpen(false);
    router.push("/editor?tab=pending");
  }

  return (
    <section
      className={`igm-double-rule ${styles.panel}`}
      aria-label={t("aiHighlightTitle")}
    >
      {/* 面板头 */}
      <div className={styles.head}>
        <Sparkles size={16} strokeWidth={1.8} className={styles.headIcon} />
        <h2 className={`igm-serif ${styles.title}`}>{t("aiHighlightTitle")}</h2>
        <span className={`igm-mono ${styles.count}`}>{count}</span>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label={t("aiSendLater")}
        >
          <X size={15} strokeWidth={1.8} />
        </button>
      </div>

      <p className={`igm-mono ${styles.meta}`}>
        {result.model}
        {result.source === "keyword" ? ` ${t("aiSelectKeywordHint")}` : ""}
      </p>

      {error && (
        <p className={`igm-mono ${styles.alertError}`}>
          <AlertCircle size={14} strokeWidth={1.8} />
          {error}
        </p>
      )}

      {count === 0 ? (
        <p className={`igm-mono ${styles.empty}`}>{t("aiSelectEmpty")}</p>
      ) : (
        <>
          {/* 全选行 */}
          <label className={styles.selectAllRow}>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              aria-label={t("aiSelectAll")}
            />
            <span className={`igm-mono ${styles.checkLabel}`}>
              {t("aiSelectAll")}
            </span>
          </label>

          {/* 题目卡片 */}
          <div className={styles.list}>
            {result.questions.map((item) => {
              const expanded = expandedIds.has(item.selectionId);
              const stemLong = item.stem.length > iGM_Highlight_StemLimit;
              const stemText =
                expanded || !stemLong
                  ? item.stem
                  : `${item.stem.slice(0, iGM_Highlight_StemLimit)}…`;
              const levelKey = iGM_Highlight_LevelKey(item.difficultyLevel);
              const options = iGM_QuestionAi_NormalizeOptions(item.options);
              return (
                <article key={item.selectionId} className={styles.card}>
                  <div className={styles.cardTop}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.selectionId)}
                      onChange={() => toggleOne(item.selectionId)}
                      aria-label={t("aiSelectAll")}
                    />
                    <span className={`igm-mono ${styles.cardIndex}`}>
                      #{String(item.questionIndex).padStart(2, "0")}
                    </span>
                    <span className={`igm-mono ${styles.typeTag}`}>
                      {t(iGM_Highlight_TypeKeys[item.type] ?? "questionTypeSingleChoice")}
                    </span>
                  </div>

                  <p className={styles.stem}>{stemText}</p>
                  {stemLong && (
                    <button
                      type="button"
                      className={styles.expandBtn}
                      onClick={() => toggleExpand(item.selectionId)}
                    >
                      <span className="igm-mono">
                        {expanded ? t("aiCollapse") : t("aiExpand")}
                      </span>
                    </button>
                  )}

                  {options.length > 0 && (
                    <ul className={styles.options}>
                      {options.map((option) => (
                        <li key={option.key} className={styles.option}>
                          <span className={`igm-mono ${styles.optionKey}`}>
                            {option.key}
                          </span>
                          <span className={styles.optionText}>{option.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* 评估指标 */}
                  <dl className={styles.facts}>
                    <div className={styles.fact}>
                      <dt className={`igm-mono ${styles.factKey}`}>
                        {t("aiQualityScore")}
                      </dt>
                      <dd className={`igm-mono ${styles.factValue}`}>
                        {item.qualityScore}
                      </dd>
                    </div>
                    <div className={styles.fact}>
                      <dt className={`igm-mono ${styles.factKey}`}>
                        {t("aiDifficultyCoefficient")}
                      </dt>
                      <dd className={`igm-mono ${styles.factValue}`}>
                        {item.difficultyCoefficient === null
                          ? "—"
                          : `${item.difficultyCoefficient}${
                              levelKey ? ` · ${t(levelKey)}` : ""
                            }`}
                      </dd>
                    </div>
                    <div className={styles.fact}>
                      <dt className={`igm-mono ${styles.factKey}`}>
                        {t("aiTextbook")}
                      </dt>
                      <dd className={styles.factValue}>
                        {item.textbookName || item.textbookCode || "—"}
                      </dd>
                    </div>
                  </dl>

                  {Array.isArray(item.tags) && item.tags.length > 0 && (
                    <div className={styles.tagsRow}>
                      <span className={`igm-mono ${styles.factKey}`}>
                        {t("aiKnowledgeTags")}
                      </span>
                      <div className={styles.tags}>
                        {item.tags.map((tag) => (
                          <span key={tag} className={`igm-mono ${styles.tag}`}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {item.reason && (
                    <p className={styles.reason}>
                      <span className={`igm-mono ${styles.reasonKey}`}>
                        {t("aiReason")}
                      </span>
                      {item.reason}
                    </p>
                  )}

                  {/* 单题操作 */}
                  <div className={styles.cardActions}>
                    <button
                      type="button"
                      className={styles.sendBtn}
                      onClick={() => void send(item.selectionId)}
                      disabled={sending}
                    >
                      {sending ? (
                        <Loader2 size={13} strokeWidth={1.8} className={styles.spin} />
                      ) : (
                        <CheckCheck size={13} strokeWidth={1.8} />
                      )}
                      <span className="igm-mono">{t("aiSendToEditor")}</span>
                    </button>
                    <button
                      type="button"
                      className={styles.ignoreBtn}
                      onClick={() => onIgnore(item.selectionId)}
                      disabled={sending}
                    >
                      <EyeOff size={13} strokeWidth={1.8} />
                      <span className="igm-mono">{t("aiIgnore")}</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      {/* 送往成功提示 */}
      {promptOpen && (
        <div className={styles.modalOverlay} role="presentation">
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-label={t("aiSendSuccess")}
          >
            <h3 className={`igm-serif ${styles.modalTitle}`}>
              {t("aiSendSuccess")}
            </h3>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancel}
                onClick={() => setPromptOpen(false)}
              >
                <span className="igm-mono">{t("aiSendLater")}</span>
              </button>
              <button
                type="button"
                className={styles.modalConfirm}
                onClick={goNow}
              >
                <Check size={14} strokeWidth={1.8} />
                <span className="igm-mono">{t("aiSendGoNow")}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// 导出 //
export default iGM_HighlightPanel;
