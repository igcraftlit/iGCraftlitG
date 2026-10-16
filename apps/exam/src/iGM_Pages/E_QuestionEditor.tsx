/**
 * 文件路径：apps/exam/src/iGM_Pages/E_QuestionEditor.tsx
 * 所属层：前端 / 页面层
 * 路由：E_QuestionEditor（/editor）
 * 模块：iGM_QuestionEditor
 * 作用：命题管理页，编写题目、管理已提交题目（发布 / 删除）
 * 内容：准入闸门、命题表单（题干 / 题型 / 选项 / 答案 / 解析 / 难度 / 标签 / 所属教材）、
 *       必填教材校验（未选教材禁止提交）、我的题目清单、部署提示
 * 说明：准入闸门简化——仅校验 gate === "approved"；文案取自当前语言包
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import {
  iGM_Question_Create,
  iGM_Question_Delete,
  iGM_Question_FetchMine,
  iGM_Question_Publish,
  type iGM_QuestionDto,
  type iGM_QuestionOption,
  type iGM_QuestionStatus,
  type iGM_QuestionType,
} from "../iGM_Services/iGM_QuestionClient";
import {
  iGM_QuestionTextbooks,
  iGM_QuestionTextbookName,
} from "../iGM_Services/iGM_QuestionTextbooks";
import {
  iGM_Examiner_FetchMe,
  iGM_Examiner_FetchStatus,
  type iGM_ExaminerGate,
} from "../iGM_Services/iGM_ExaminerClient";
import { iGM_ExamRequestError } from "../iGM_Services/iGM_ExamClient";
import { useI18n } from "../iGM_i18n/iGM_I18nContext";
import type { iGM_I18nKey } from "../iGM_i18n/iGM_I18nTypes";
import styles from "./E_QuestionEditor.module.css";

// 类型定义 //
type iGM_Question_ListState = "loading" | "ready" | "error";

/** 方案表单草稿（数值与标签以字符串承载，提交时转换） */
interface iGM_Question_Form {
  stem: string;
  type: iGM_QuestionType;
  options: iGM_QuestionOption[];
  answer: string;
  analysis: string;
  difficultyCoefficient: string;
  difficultyLevel: string;
  tags: string;
  textbookCode: string;
}

/** 题型选项（值 / 文案键） */
const iGM_Question_TypeOptions: { value: iGM_QuestionType; labelKey: iGM_I18nKey }[] = [
  { value: "single_choice", labelKey: "questionTypeSingleChoice" },
  { value: "multiple_choice", labelKey: "questionTypeMultipleChoice" },
  { value: "true_false", labelKey: "questionTypeTrueFalse" },
  { value: "fill_blank", labelKey: "questionTypeFillBlank" },
  { value: "short_answer", labelKey: "questionTypeShortAnswer" },
];

/** 难度等级选项 */
const iGM_Question_LevelOptions: { value: string; labelKey: iGM_I18nKey }[] = [
  { value: "easy", labelKey: "difficultyEasy" },
  { value: "medium", labelKey: "difficultyMedium" },
  { value: "hard", labelKey: "difficultyHard" },
];

/** 题目状态 → 文案键 */
const iGM_Question_StatusKeys: Record<iGM_QuestionStatus, iGM_I18nKey> = {
  draft: "editorStatusDraft",
  published: "editorStatusPublished",
};

/** 空白表单 */
const iGM_Question_EmptyForm: iGM_Question_Form = {
  stem: "",
  type: "single_choice",
  options: [{ key: "A", text: "" }],
  answer: "",
  analysis: "",
  difficultyCoefficient: "",
  difficultyLevel: "medium",
  tags: "",
  textbookCode: "",
};

// 核心逻辑 //
/** 下一个选项编号（按当前数量生成 A / B / C …） */
function iGM_Question_NextKey(count: number): string {
  return String.fromCharCode(65 + count);
}

/** 标签文本 → 数组（支持中英文逗号与顿号分隔） */
function iGM_Question_SplitTags(text: string): string[] {
  return text
    .split(/[,，、]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/** 命题管理页 */
export function E_QuestionEditor() {
  const { t } = useI18n();

  const [gate, setGate] = useState<iGM_ExaminerGate | null>(null);

  const [form, setForm] = useState<iGM_Question_Form>(iGM_Question_EmptyForm);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [formDone, setFormDone] = useState(false);

  const [questions, setQuestions] = useState<iGM_QuestionDto[]>([]);
  const [listState, setListState] = useState<iGM_Question_ListState>("loading");
  const [listMessage, setListMessage] = useState("");
  /** 正在执行发布 / 删除的题目 id */
  const [busyId, setBusyId] = useState("");
  /** 是否显示"正在部署"提示 */
  const [deploying, setDeploying] = useState(false);

  /** 读取准入状态；未登录（401）或读取失败时按未准入处理 */
  const refreshGate = useCallback(async (): Promise<void> => {
    try {
      await iGM_Examiner_FetchMe();
    } catch {
      setGate("none");
      return;
    }
    try {
      const status = await iGM_Examiner_FetchStatus();
      setGate(status.gate);
    } catch {
      setGate("none");
    }
  }, []);

  useEffect(() => {
    void refreshGate();
  }, [refreshGate]);

  /** 加载我的题目 */
  const loadMine = useCallback(async (): Promise<void> => {
    setListState("loading");
    setListMessage("");
    try {
      const page = await iGM_Question_FetchMine();
      setQuestions(Array.isArray(page.items) ? page.items : []);
      setListState("ready");
    } catch (err) {
      setListMessage(err instanceof iGM_ExamRequestError ? err.message : "");
      setListState("error");
    }
  }, []);

  // 仅准入通过后加载我的题目
  useEffect(() => {
    if (gate !== "approved") return;
    void loadMine();
  }, [gate, loadMine]);

  const isChoiceType =
    form.type === "single_choice" || form.type === "multiple_choice";

  /** 更新表单某个文本字段 */
  function patch(partial: Partial<iGM_Question_Form>): void {
    setForm((prev) => ({ ...prev, ...partial }));
  }

  /** 新增一个空选项 */
  function addOption(): void {
    setForm((prev) => ({
      ...prev,
      options: [
        ...prev.options,
        { key: iGM_Question_NextKey(prev.options.length), text: "" },
      ],
    }));
  }

  /** 删除指定序号的选项 */
  function removeOption(index: number): void {
    setForm((prev) => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index),
    }));
  }

  /** 修改选项字段 */
  function updateOption(index: number, partial: Partial<iGM_QuestionOption>): void {
    setForm((prev) => ({
      ...prev,
      options: prev.options.map((item, i) =>
        i === index ? { ...item, ...partial } : item,
      ),
    }));
  }

  // 提交校验：题干非空且已选择所属教材（未选教材禁止提交）
  const textbookMissing = form.textbookCode.trim().length === 0;
  const canSubmit = !textbookMissing && form.stem.trim().length > 0 && !submitting;

  /** 提交题目（创建） */
  async function submit(): Promise<void> {
    if (!canSubmit) return;
    setSubmitting(true);
    setFormError("");
    setFormDone(false);
    try {
      const coefficient = Number.parseFloat(form.difficultyCoefficient);
      await iGM_Question_Create({
        stem: form.stem.trim(),
        type: form.type,
        options: isChoiceType ? form.options : undefined,
        answer: form.answer.trim() || undefined,
        analysis: form.analysis.trim() || undefined,
        textbookCode: form.textbookCode,
        difficultyCoefficient: Number.isFinite(coefficient) ? coefficient : undefined,
        difficultyLevel: form.difficultyLevel,
        tags: iGM_Question_SplitTags(form.tags),
      });
      setForm(iGM_Question_EmptyForm);
      setFormDone(true);
      await loadMine();
    } catch (err) {
      setFormError(
        err instanceof iGM_ExamRequestError ? err.message : t("editorFailed"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  /** 发布题目 */
  async function publish(questionId: string): Promise<void> {
    if (busyId) return;
    setBusyId(questionId);
    setListMessage("");
    try {
      await iGM_Question_Publish(questionId);
      setDeploying(true);
      await loadMine();
    } catch (err) {
      setListMessage(
        err instanceof iGM_ExamRequestError ? err.message : t("editorFailed"),
      );
    } finally {
      setBusyId("");
    }
  }

  /** 删除题目（需确认） */
  async function remove(questionId: string): Promise<void> {
    if (busyId) return;
    if (!window.confirm(t("editorDeleteConfirm"))) return;
    setBusyId(questionId);
    setListMessage("");
    try {
      await iGM_Question_Delete(questionId);
      await loadMine();
    } catch (err) {
      setListMessage(
        err instanceof iGM_ExamRequestError ? err.message : t("editorFailed"),
      );
    } finally {
      setBusyId("");
    }
  }

  // 未通过准入：简单的"无访问权限"提示
  if (gate !== "approved") {
    return (
      <main className={styles.page}>
        <header className={styles.head}>
          <p className={`igm-eyebrow ${styles.headEyebrow}`}>
            {t("editorEyebrow")}
          </p>
          <h1 className={`igm-serif ${styles.headTitle}`}>{t("editorTitle")}</h1>
          <p className={styles.headLead}>{t("editorLead")}</p>
        </header>

        <section
          className={`igm-double-rule ${styles.gateSection}`}
          aria-label={t("editorGateTitle")}
        >
          <h2 className={`igm-serif ${styles.gateTitle}`}>
            {t("editorGateTitle")}
          </h2>
          <p className={styles.gateLead}>{t("editorGateLead")}</p>
          <p className={`igm-mono ${styles.state}`}>{t("examinerNoAccess")}</p>
          <Link href="/" className={styles.gateLink}>
            <span className="igm-mono">{t("navExaminations")}</span>
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      {/* 页头 */}
      <header className={styles.head}>
        <p className={`igm-eyebrow ${styles.headEyebrow}`}>{t("editorEyebrow")}</p>
        <h1 className={`igm-serif ${styles.headTitle}`}>{t("editorTitle")}</h1>
        <p className={styles.headLead}>{t("editorLead")}</p>
      </header>

      {/* 部署提示条 */}
      {deploying && (
        <div className={`igm-mono ${styles.deployBanner}`}>
          <Loader2 size={14} strokeWidth={1.8} className={styles.spin} />
          {t("editorDeploying")}
        </div>
      )}

      {/* 命题表单 */}
      <section className={styles.section} aria-label={t("editorFormTitle")}>
        <div className={styles.sectionHead}>
          <span className={`igm-mono ${styles.sectionNum}`}>§ 1</span>
          <h2 className={`igm-serif ${styles.sectionTitle}`}>
            {t("editorFormTitle")}
          </h2>
        </div>

        {/* 所属教材（必选） */}
        <label className={styles.field}>
          <span className={`igm-mono ${styles.fieldLabel}`}>
            {t("editorFieldTextbook")}
          </span>
          <select
            className={styles.input}
            value={form.textbookCode}
            onChange={(event) => patch({ textbookCode: event.target.value })}
            aria-label={t("editorFieldTextbook")}
          >
            <option value="">{t("editorSelectTextbook")}</option>
            {iGM_QuestionTextbooks.map((book) => (
              <option key={book.code} value={book.code}>
                {book.name}
              </option>
            ))}
          </select>
        </label>

        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className={styles.field}>
            <span className={`igm-mono ${styles.fieldLabel}`}>
              {t("editorFieldStem")}
            </span>
            <textarea
              className={styles.textarea}
              rows={3}
              value={form.stem}
              onChange={(event) => patch({ stem: event.target.value })}
            />
          </label>

          <div className={styles.fieldRow}>
            <label className={styles.field}>
              <span className={`igm-mono ${styles.fieldLabel}`}>
                {t("editorFieldType")}
              </span>
              <select
                className={styles.input}
                value={form.type}
                onChange={(event) =>
                  patch({ type: event.target.value as iGM_QuestionType })
                }
              >
                {iGM_Question_TypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </option>
                ))}
              </select>
            </label>

            <div className={styles.field}>
              <span className={`igm-mono ${styles.fieldLabel}`}>
                {t("editorFieldDifficulty")}
              </span>
              <div className={styles.difficultyRow}>
                <input
                  className={styles.input}
                  value={form.difficultyCoefficient}
                  readOnly
                  placeholder="--"
                  aria-label={t("editorFieldDifficulty")}
                />
                <select
                  className={styles.input}
                  value={form.difficultyLevel}
                  onChange={(event) => patch({ difficultyLevel: event.target.value })}
                  aria-label={t("bankFieldDifficulty")}
                >
                  {iGM_Question_LevelOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.labelKey)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 选项（仅选择题） */}
          {isChoiceType && (
            <div className={styles.field}>
              <span className={`igm-mono ${styles.fieldLabel}`}>
                {t("editorFieldOptions")}
              </span>
              <div className={styles.optionList}>
                {form.options.map((option, index) => (
                  <div key={index} className={styles.optionRow}>
                    <input
                      className={styles.optionKeyInput}
                      value={option.key}
                      onChange={(event) =>
                        updateOption(index, { key: event.target.value })
                      }
                      placeholder={t("editorOptionKey")}
                      aria-label={t("editorOptionKey")}
                    />
                    <input
                      className={styles.input}
                      value={option.text}
                      onChange={(event) =>
                        updateOption(index, { text: event.target.value })
                      }
                      placeholder={t("editorOptionText")}
                      aria-label={t("editorOptionText")}
                    />
                    <button
                      type="button"
                      className={styles.removeBtn}
                      onClick={() => removeOption(index)}
                      aria-label={t("editorRemoveOption")}
                      title={t("editorRemoveOption")}
                    >
                      <Trash2 size={14} strokeWidth={1.8} />
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" className={styles.addBtn} onClick={addOption}>
                <Plus size={14} strokeWidth={1.8} />
                <span className={`igm-mono ${styles.addLabel}`}>
                  {t("editorAddOption")}
                </span>
              </button>
            </div>
          )}

          <label className={styles.field}>
            <span className={`igm-mono ${styles.fieldLabel}`}>
              {t("editorFieldAnswer")}
            </span>
            <input
              className={styles.input}
              value={form.answer}
              onChange={(event) => patch({ answer: event.target.value })}
            />
          </label>

          <label className={styles.field}>
            <span className={`igm-mono ${styles.fieldLabel}`}>
              {t("editorFieldAnalysis")}
            </span>
            <textarea
              className={styles.textarea}
              rows={3}
              value={form.analysis}
              onChange={(event) => patch({ analysis: event.target.value })}
            />
          </label>

          <label className={styles.field}>
            <span className={`igm-mono ${styles.fieldLabel}`}>
              {t("editorFieldTags")}
            </span>
            <input
              className={styles.input}
              value={form.tags}
              onChange={(event) => patch({ tags: event.target.value })}
            />
          </label>
        </form>
      </section>

      {/* 提示与提交 */}
      {formError && (
        <p className={`igm-mono ${styles.alertError}`}>
          <AlertCircle size={14} strokeWidth={1.8} />
          {formError}
        </p>
      )}
      {formDone && !formError && (
        <p className={`igm-mono ${styles.alertOk}`}>
          <CheckCircle2 size={14} strokeWidth={1.8} />
          {t("editorCreated")}
        </p>
      )}

      <div className={styles.submitRow}>
        <button
          type="button"
          className={styles.submitBtn}
          onClick={() => void submit()}
          disabled={!canSubmit}
        >
          {submitting ? (
            <Loader2 size={15} strokeWidth={1.8} className={styles.spin} />
          ) : (
            <Send size={15} strokeWidth={1.8} />
          )}
          <span className={`igm-mono ${styles.submitLabel}`}>
            {submitting ? t("editorSubmitting") : t("editorSubmit")}
          </span>
        </button>
        {textbookMissing && (
          <p className={`igm-mono ${styles.hint}`}>{t("editorNeedTextbook")}</p>
        )}
      </div>

      {/* 我的题目 */}
      <section className={styles.section} aria-label={t("editorListTitle")}>
        <div className={styles.sectionHead}>
          <span className={`igm-mono ${styles.sectionNum}`}>§ 2</span>
          <h2 className={`igm-serif ${styles.sectionTitle}`}>
            {t("editorListTitle")}
          </h2>
        </div>

        {listState === "loading" && (
          <p className={`igm-mono ${styles.state}`}>{t("editorLoading")}</p>
        )}

        {listState === "error" && (
          <p className={`igm-mono ${styles.alertError}`}>
            <AlertCircle size={14} strokeWidth={1.8} />
            {listMessage || t("editorFailed")}
          </p>
        )}

        {listState === "ready" && questions.length === 0 && (
          <p className={`igm-mono ${styles.state}`}>{t("editorEmpty")}</p>
        )}

        {listState === "ready" && questions.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className="igm-mono">{t("editorColTextbook")}</th>
                  <th className="igm-mono">{t("editorColStem")}</th>
                  <th className="igm-mono">{t("editorColType")}</th>
                  <th className="igm-mono">{t("editorColStatus")}</th>
                  <th className="igm-mono">{t("editorColActions")}</th>
                </tr>
              </thead>
              <tbody>
                {questions.map((question) => {
                  const typeOption = iGM_Question_TypeOptions.find(
                    (item) => item.value === question.type,
                  );
                  const busy = busyId === question.id;
                  return (
                    <tr key={question.id}>
                      <td className="igm-mono">
                        {question.textbookName ||
                          iGM_QuestionTextbookName(question.textbookCode)}
                      </td>
                      <td className={styles.cellStem}>
                        {question.stem.length > 60
                          ? `${question.stem.slice(0, 60)}…`
                          : question.stem}
                      </td>
                      <td className="igm-mono">
                        {typeOption ? t(typeOption.labelKey) : question.type}
                      </td>
                      <td className="igm-mono">
                        {t(iGM_Question_StatusKeys[question.status])}
                      </td>
                      <td>
                        <div className={styles.actions}>
                          {question.status === "draft" && (
                            <button
                              type="button"
                              className={styles.actionBtn}
                              onClick={() => void publish(question.id)}
                              disabled={busy}
                            >
                              {busy ? (
                                <Loader2
                                  size={13}
                                  strokeWidth={1.8}
                                  className={styles.spin}
                                />
                              ) : (
                                <Send size={13} strokeWidth={1.8} />
                              )}
                              {t("editorPublish")}
                            </button>
                          )}
                          <button
                            type="button"
                            className={`${styles.actionBtn} ${styles.actionDanger}`}
                            onClick={() => void remove(question.id)}
                            disabled={busy}
                          >
                            <Trash2 size={13} strokeWidth={1.8} />
                            {t("editorDelete")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

// 导出 //
export default E_QuestionEditor;
