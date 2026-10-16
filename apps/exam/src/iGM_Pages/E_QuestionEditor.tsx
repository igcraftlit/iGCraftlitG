/**
 * 文件路径：apps/exam/src/iGM_Pages/E_QuestionEditor.tsx
 * 所属层：前端 / 页面层
 * 路由：E_QuestionEditor（/editor）
 * 模块：iGM_QuestionEditor
 * 作用：命题管理页，编写题目、AI 辅助判断难度与教材、管理已提交题目（发布 / 删除）
 * 内容：准入闸门、命题表单（题干 / 题型 / 选项 / 答案 / 解析 / 难度 / 标签 / 所属教材）、
 *       AI 辅助判断、必填教材校验（未选教材禁止提交）、我的题目清单、部署提示
 * 说明：准入闸门与 E_Admin_Upload 一致（iGM_Examiner_FetchMe + FetchStatus）；
 *       记录 AI 建议教材（aiTextbookCode / aiSource）随创建请求提交；文案取自当前语言包
 *       权限互斥：准入通过仅渲染命题面板、绝不渲染申请表单；未通过按状态渲染申请表单或状态提示
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  iGM_Question_Analyze,
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
  iGM_QuestionAi_FetchPending,
  iGM_QuestionAi_NormalizeOptions,
  iGM_QuestionAi_Review,
  type iGM_PendingQuestion,
} from "../iGM_Services/iGM_QuestionAiClient";
import {
  iGM_QuestionTextbooks,
  iGM_QuestionTextbookName,
} from "../iGM_Services/iGM_QuestionTextbooks";
import {
  iGM_Examiner_FetchMe,
  iGM_Examiner_FetchStatus,
  type iGM_ExaminerGate,
  type iGM_ExaminerStatus,
} from "../iGM_Services/iGM_ExaminerClient";
import { iGM_ExamRequestError } from "../iGM_Services/iGM_ExamClient";
import { iGM_ExaminerApplyForm as IGM_ExaminerApplyForm } from "../iGM_Components/iGM_ExaminerApplyForm/iGM_ExaminerApplyForm";
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

/** 准入状态 → 文案键 */
const iGM_Examiner_GateKeys: Record<iGM_ExaminerGate, iGM_I18nKey> = {
  none: "examinerStatusNone",
  pending: "examinerStatusPending",
  approved: "examinerStatusApproved",
  rejected: "examinerStatusRejected",
  suspended: "examinerStatusSuspended",
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

/** 命题管理标签页：我的题目 / 待审核题目 */
type iGM_Editor_Tab = "mine" | "pending";

/** 待审核题目「编辑后通过」表单（数值与标签以字符串承载） */
interface iGM_Review_EditForm {
  stem: string;
  type: iGM_QuestionType;
  options: iGM_QuestionOption[];
  answer: string;
  analysis: string;
  textbookCode: string;
  tags: string;
  difficultyCoefficient: string;
  difficultyLevel: string;
}

/** 待审核题目编辑弹窗状态 */
interface iGM_Review_EditState {
  questionId: string;
  form: iGM_Review_EditForm;
}

// 核心逻辑 //
/** 难度等级归一化：简单 / 中等 / 困难三档，未识别时回落中等 */
function iGM_Question_NormalizeLevel(value: string): string {
  const lower = value.trim().toLowerCase();
  if (lower.includes("easy") || lower.includes("简单")) return "easy";
  if (lower.includes("hard") || lower.includes("困难") || lower.includes("难"))
    return "hard";
  return "medium";
}

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
  const searchParams = useSearchParams();

  /** 当前标签页：支持 ?tab=pending 直达待审核题目 */
  const [activeTab, setActiveTab] = useState<iGM_Editor_Tab>(() =>
    searchParams.get("tab") === "pending" ? "pending" : "mine",
  );

  const [gate, setGate] = useState<iGM_ExaminerGate | null>(null);
  const [gateStatus, setGateStatus] = useState<iGM_ExaminerStatus | null>(null);
  /** 被拒绝后是否展开重新申请表单 */
  const [reapplyOpen, setReapplyOpen] = useState(false);

  const [form, setForm] = useState<iGM_Question_Form>(iGM_Question_EmptyForm);
  /** 最近一次 AI 建议的教材代码（可为空） */
  const [aiTextbookCode, setAiTextbookCode] = useState("");
  /** 最近一次 AI 判断来源（ollama / keyword） */
  const [aiSource, setAiSource] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  /** AI 判断结果提示：done / failed /（空为不提示） */
  const [analyzeNote, setAnalyzeNote] = useState<"" | "done" | "failed">("");

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

  /** 待审核题目列表 */
  const [pending, setPending] = useState<iGM_PendingQuestion[]>([]);
  const [pendingState, setPendingState] = useState<iGM_Question_ListState>("loading");
  const [pendingMessage, setPendingMessage] = useState("");
  /** 待审核题目操作成功提示 */
  const [reviewNotice, setReviewNotice] = useState("");
  /** 正在通过 / 拒绝的题目 id */
  const [reviewBusyId, setReviewBusyId] = useState("");
  /** 编辑后通过弹窗；null 表示未打开 */
  const [reviewEdit, setReviewEdit] = useState<iGM_Review_EditState | null>(null);

  /** 读取准入状态；未登录（401）或读取失败时按未准入处理 */
  const refreshGate = useCallback(async (): Promise<void> => {
    try {
      await iGM_Examiner_FetchMe();
    } catch {
      setGateStatus(null);
      setGate("none");
      return;
    }
    try {
      const status = await iGM_Examiner_FetchStatus();
      setGateStatus(status);
      setGate(status.gate);
    } catch {
      setGateStatus(null);
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

  /** 加载待审核题目 */
  const loadPending = useCallback(async (): Promise<void> => {
    setPendingState("loading");
    setPendingMessage("");
    try {
      const list = await iGM_QuestionAi_FetchPending();
      setPending(list);
      setPendingState("ready");
    } catch (err) {
      setPendingMessage(err instanceof iGM_ExamRequestError ? err.message : "");
      setPendingState("error");
    }
  }, []);

  // 准入通过且切到「待审核题目」标签时加载
  useEffect(() => {
    if (gate !== "approved") return;
    if (activeTab !== "pending") return;
    void loadPending();
  }, [gate, activeTab, loadPending]);

  /** 通过题目 */
  async function approve(questionId: string): Promise<void> {
    if (reviewBusyId) return;
    setReviewBusyId(questionId);
    setPendingMessage("");
    setReviewNotice("");
    try {
      await iGM_QuestionAi_Review({ questionId, action: "approve" });
      setPending((list) => list.filter((item) => item.id !== questionId));
      setReviewNotice(t("reviewApproved"));
    } catch (err) {
      setPendingMessage(
        err instanceof iGM_ExamRequestError ? err.message : t("editorFailed"),
      );
    } finally {
      setReviewBusyId("");
    }
  }

  /** 拒绝题目 */
  async function reject(questionId: string): Promise<void> {
    if (reviewBusyId) return;
    if (!window.confirm(t("editorDeleteConfirm"))) return;
    setReviewBusyId(questionId);
    setPendingMessage("");
    setReviewNotice("");
    try {
      await iGM_QuestionAi_Review({ questionId, action: "reject" });
      setPending((list) => list.filter((item) => item.id !== questionId));
      setReviewNotice(t("reviewRejected"));
    } catch (err) {
      setPendingMessage(
        err instanceof iGM_ExamRequestError ? err.message : t("editorFailed"),
      );
    } finally {
      setReviewBusyId("");
    }
  }

  /** 打开「编辑后通过」弹窗，用题目当前内容预填表单 */
  function openReviewEdit(item: iGM_PendingQuestion): void {
    setReviewNotice("");
    setPendingMessage("");
    setReviewEdit({
      questionId: item.id,
      form: {
        stem: item.stem,
        type: item.type,
        options: iGM_QuestionAi_NormalizeOptions(item.options),
        answer: item.answer,
        analysis: item.analysis,
        textbookCode: item.textbookCode,
        tags: Array.isArray(item.tags) ? item.tags.join(", ") : "",
        difficultyCoefficient:
          item.difficultyCoefficient === null
            ? ""
            : String(item.difficultyCoefficient),
        difficultyLevel: iGM_Question_NormalizeLevel(item.difficultyLevel),
      },
    });
  }

  /** 更新编辑弹窗表单某个字段 */
  function patchReview(partial: Partial<iGM_Review_EditForm>): void {
    setReviewEdit((current) =>
      current ? { ...current, form: { ...current.form, ...partial } } : current,
    );
  }

  /** 编辑弹窗新增选项 */
  function reviewAddOption(): void {
    setReviewEdit((current) =>
      current
        ? {
            ...current,
            form: {
              ...current.form,
              options: [
                ...current.form.options,
                { key: iGM_Question_NextKey(current.form.options.length), text: "" },
              ],
            },
          }
        : current,
    );
  }

  /** 编辑弹窗删除选项 */
  function reviewRemoveOption(index: number): void {
    setReviewEdit((current) =>
      current
        ? {
            ...current,
            form: {
              ...current.form,
              options: current.form.options.filter((_, i) => i !== index),
            },
          }
        : current,
    );
  }

  /** 编辑弹窗修改选项 */
  function reviewUpdateOption(
    index: number,
    partial: Partial<iGM_QuestionOption>,
  ): void {
    setReviewEdit((current) =>
      current
        ? {
            ...current,
            form: {
              ...current.form,
              options: current.form.options.map((item, i) =>
                i === index ? { ...item, ...partial } : item,
              ),
            },
          }
        : current,
    );
  }

  /** 保存并入库：以 approve 携带 edits 提交，成功后从列表移除 */
  async function saveReviewEdit(): Promise<void> {
    if (!reviewEdit || reviewBusyId) return;
    const { questionId, form } = reviewEdit;
    const coefficient = Number.parseFloat(form.difficultyCoefficient);
    const isChoice =
      form.type === "single_choice" || form.type === "multiple_choice";
    setReviewBusyId(questionId);
    setPendingMessage("");
    setReviewNotice("");
    try {
      await iGM_QuestionAi_Review({
        questionId,
        action: "approve",
        edits: {
          stem: form.stem.trim(),
          options: isChoice ? form.options : [],
          answer: form.answer.trim(),
          analysis: form.analysis.trim(),
          textbookCode: form.textbookCode,
          tags: iGM_Question_SplitTags(form.tags),
          difficultyCoefficient: Number.isFinite(coefficient)
            ? coefficient
            : undefined,
          difficultyLevel: form.difficultyLevel,
        },
      });
      setPending((list) => list.filter((item) => item.id !== questionId));
      setReviewEdit(null);
      setReviewNotice(t("reviewApproved"));
    } catch (err) {
      setPendingMessage(
        err instanceof iGM_ExamRequestError ? err.message : t("editorFailed"),
      );
    } finally {
      setReviewBusyId("");
    }
  }

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

  /** AI 辅助判断：依据当前题干 / 选项 / 答案 / 解析推断并回填 */
  async function analyze(): Promise<void> {
    if (analyzing) return;
    setAnalyzing(true);
    setAnalyzeNote("");
    try {
      const result = await iGM_Question_Analyze({
        stem: form.stem.trim(),
        options: isChoiceType ? form.options : undefined,
        answer: form.answer.trim() || undefined,
        analysis: form.analysis.trim() || undefined,
      });
      setForm((prev) => ({
        ...prev,
        type: result.type || prev.type,
        difficultyCoefficient: Number.isFinite(result.difficultyCoefficient)
          ? String(result.difficultyCoefficient)
          : prev.difficultyCoefficient,
        difficultyLevel: iGM_Question_NormalizeLevel(result.difficultyLevel),
        tags: Array.isArray(result.tags) ? result.tags.join(", ") : prev.tags,
        textbookCode: result.textbookCode || prev.textbookCode,
      }));
      setAiTextbookCode(result.textbookCode || "");
      setAiSource(result.source || "");
      setAnalyzeNote("done");
    } catch {
      setAnalyzeNote("failed");
    } finally {
      setAnalyzing(false);
    }
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
        aiTextbookCode: aiTextbookCode || undefined,
        aiSource: aiSource || undefined,
      });
      setForm(iGM_Question_EmptyForm);
      setAiTextbookCode("");
      setAiSource("");
      setAnalyzeNote("");
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

  // 未通过准入（含未登录）：仅展示准入提示与命题创作者申请表单
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

        {gate === null ? (
          <p className={`igm-mono ${styles.state}`}>
            {t("examinerStatusLoading")}
          </p>
        ) : (
          <>
            <section
              className={`igm-double-rule ${styles.gateSection}`}
              aria-label={t("editorGateTitle")}
            >
              <h2 className={`igm-serif ${styles.gateTitle}`}>
                {t("editorGateTitle")}
              </h2>
              <p className={styles.gateLead}>{t("editorGateLead")}</p>
              {gateStatus && gateStatus.gate !== "none" && (
                <div className={styles.gateStatus}>
                  <span
                    className={`igm-mono ${styles.gateTag} ${
                      styles[`gate_${gateStatus.gate}`]
                    }`}
                  >
                    {t(iGM_Examiner_GateKeys[gateStatus.gate])}
                  </span>
                  {gateStatus.application?.reviewComment && (
                    <p className={`igm-mono ${styles.gateComment}`}>
                      {t("examinerStatusReviewComment")}：
                      {gateStatus.application.reviewComment}
                    </p>
                  )}
                  <Link href="/status" className={styles.gateLink}>
                    <span className="igm-mono">{t("examinerStatusTitle")}</span>
                  </Link>
                </div>
              )}
            </section>

            {/* 权限互斥：未申请展示申请表单；待审核 / 已撤销仅展示状态；
                已拒绝展示原因与「重新申请」按钮（点击后展开表单）；已通过绝不渲染申请组件 */}
            {gate === "none" && (
              <IGM_ExaminerApplyForm onSubmitted={() => void refreshGate()} />
            )}
            {gate === "pending" && (
              <p className={`igm-mono ${styles.gateLead}`}>
                {t("examinerGatePendingLead")}
              </p>
            )}
            {gate === "suspended" && (
              <p className={`igm-mono ${styles.gateLead}`}>
                {t("examinerGateSuspendedLead")}
              </p>
            )}
            {gate === "rejected" &&
              (reapplyOpen ? (
                <IGM_ExaminerApplyForm onSubmitted={() => void refreshGate()} />
              ) : (
                <>
                  <p className={`igm-mono ${styles.gateLead}`}>
                    {t("examinerGateRejectedLead")}
                  </p>
                  <button
                    type="button"
                    className={styles.reapplyBtn}
                    onClick={() => setReapplyOpen(true)}
                  >
                    <RotateCcw size={14} strokeWidth={1.8} />
                    <span className="igm-mono">{t("examinerReapply")}</span>
                  </button>
                </>
              ))}
          </>
        )}
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

      {/* 标签切换：我的题目 / 待审核题目 */}
      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "mine"}
          className={`${styles.tab} ${activeTab === "mine" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("mine")}
        >
          <span className="igm-mono">{t("editorTabMine")}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "pending"}
          className={`${styles.tab} ${activeTab === "pending" ? styles.tabActive : ""}`}
          onClick={() => setActiveTab("pending")}
        >
          <span className="igm-mono">{t("editorTabPending")}</span>
        </button>
      </div>

      {activeTab === "mine" ? (
        <>
          {/* 命题表单 */}
          <section className={styles.section} aria-label={t("editorFormTitle")}>
        <div className={styles.sectionHead}>
          <span className={`igm-mono ${styles.sectionNum}`}>§ 1</span>
          <h2 className={`igm-serif ${styles.sectionTitle}`}>
            {t("editorFormTitle")}
          </h2>
          <button
            type="button"
            className={styles.analyzeBtn}
            onClick={() => void analyze()}
            disabled={analyzing}
          >
            {analyzing ? (
              <Loader2 size={14} strokeWidth={1.8} className={styles.spin} />
            ) : (
              <Sparkles size={14} strokeWidth={1.8} />
            )}
            <span className={`igm-mono ${styles.analyzeLabel}`}>
              {analyzing ? t("editorAnalyzing") : t("editorAnalyze")}
            </span>
          </button>
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

          {analyzeNote === "done" && (
            <p className={`igm-mono ${styles.alertOk}`}>
              <CheckCircle2 size={14} strokeWidth={1.8} />
              {t("editorAnalyzeDone")}
              {aiSource && ` (${aiSource})`}
            </p>
          )}
          {analyzeNote === "failed" && (
            <p className={`igm-mono ${styles.alertError}`}>
              <AlertCircle size={14} strokeWidth={1.8} />
              {t("editorAnalyzeFailed")}
            </p>
          )}
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
        </>
      ) : (
        <section className={styles.section} aria-label={t("editorTabPending")}>
          <div className={styles.sectionHead}>
            <span className={`igm-mono ${styles.sectionNum}`}>§ 2</span>
            <h2 className={`igm-serif ${styles.sectionTitle}`}>
              {t("editorTabPending")}
            </h2>
          </div>

          {reviewNotice && !pendingMessage && (
            <p className={`igm-mono ${styles.alertOk}`}>
              <CheckCircle2 size={14} strokeWidth={1.8} />
              {reviewNotice}
            </p>
          )}
          {pendingMessage && (
            <p className={`igm-mono ${styles.alertError}`}>
              <AlertCircle size={14} strokeWidth={1.8} />
              {pendingMessage}
            </p>
          )}

          {pendingState === "loading" && (
            <p className={`igm-mono ${styles.state}`}>{t("editorLoading")}</p>
          )}
          {pendingState === "error" && (
            <p className={`igm-mono ${styles.alertError}`}>
              <AlertCircle size={14} strokeWidth={1.8} />
              {pendingMessage || t("editorFailed")}
            </p>
          )}
          {pendingState === "ready" && pending.length === 0 && (
            <p className={`igm-mono ${styles.state}`}>{t("reviewEmpty")}</p>
          )}

          {pendingState === "ready" && pending.length > 0 && (
            <div className={styles.reviewList}>
              {pending.map((item) => {
                const busy = reviewBusyId === item.id;
                const typeOption = iGM_Question_TypeOptions.find(
                  (option) => option.value === item.type,
                );
                const levelOption = iGM_Question_LevelOptions.find(
                  (option) =>
                    option.value ===
                    iGM_Question_NormalizeLevel(item.difficultyLevel),
                );
                const options = iGM_QuestionAi_NormalizeOptions(item.options);
                return (
                  <article key={item.id} className={styles.reviewCard}>
                    <div className={styles.reviewTop}>
                      <span className={`igm-mono ${styles.reviewType}`}>
                        {typeOption ? t(typeOption.labelKey) : item.type}
                      </span>
                      <span className={`igm-mono ${styles.reviewTextbook}`}>
                        {item.textbookName ||
                          iGM_QuestionTextbookName(item.textbookCode)}
                      </span>
                      {item.qualityScore !== null && (
                        <span className={`igm-mono ${styles.reviewScore}`}>
                          {t("aiQualityScore")} {item.qualityScore}
                        </span>
                      )}
                      <span className={`igm-mono ${styles.reviewScore}`}>
                        {t("aiDifficultyCoefficient")}{" "}
                        {item.difficultyCoefficient === null
                          ? "—"
                          : item.difficultyCoefficient}
                        {levelOption ? ` · ${t(levelOption.labelKey)}` : ""}
                      </span>
                    </div>

                    <p className={styles.reviewStem}>{item.stem}</p>

                    {options.length > 0 && (
                      <ul className={styles.reviewOptions}>
                        {options.map((option) => (
                          <li key={option.key} className={styles.reviewOption}>
                            <span className={`igm-mono ${styles.reviewOptionKey}`}>
                              {option.key}
                            </span>
                            <span>{option.text}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {item.answer && (
                      <p className={styles.reviewField}>
                        <span className={`igm-mono ${styles.reviewFieldKey}`}>
                          {t("bankFieldAnswer")}
                        </span>
                        {item.answer}
                      </p>
                    )}
                    {item.analysis && (
                      <p className={styles.reviewField}>
                        <span className={`igm-mono ${styles.reviewFieldKey}`}>
                          {t("bankFieldAnalysis")}
                        </span>
                        {item.analysis}
                      </p>
                    )}

                    {Array.isArray(item.tags) && item.tags.length > 0 && (
                      <div className={styles.reviewTags}>
                        {item.tags.map((tag) => (
                          <span key={tag} className={`igm-mono ${styles.reviewTag}`}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {item.aiReason && (
                      <p className={styles.reviewReason}>
                        <span className={`igm-mono ${styles.reviewReasonKey}`}>
                          {t("aiReason")}
                        </span>
                        {item.aiReason}
                      </p>
                    )}

                    <div className={styles.reviewActions}>
                      <button
                        type="button"
                        className={styles.approveBtn}
                        onClick={() => void approve(item.id)}
                        disabled={busy}
                      >
                        {busy ? (
                          <Loader2
                            size={13}
                            strokeWidth={1.8}
                            className={styles.spin}
                          />
                        ) : (
                          <Check size={13} strokeWidth={1.8} />
                        )}
                        <span className="igm-mono">{t("reviewApprove")}</span>
                      </button>
                      <button
                        type="button"
                        className={styles.editApproveBtn}
                        onClick={() => openReviewEdit(item)}
                        disabled={busy}
                      >
                        <Pencil size={13} strokeWidth={1.8} />
                        <span className="igm-mono">{t("reviewEditApprove")}</span>
                      </button>
                      <button
                        type="button"
                        className={styles.rejectBtn}
                        onClick={() => void reject(item.id)}
                        disabled={busy}
                      >
                        <X size={13} strokeWidth={1.8} />
                        <span className="igm-mono">{t("reviewReject")}</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* 编辑后通过弹窗 */}
      {reviewEdit && (
        <div className={styles.modalOverlay} role="presentation">
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-label={t("reviewEditTitle")}
          >
            <h3 className={`igm-serif ${styles.modalTitle}`}>
              {t("reviewEditTitle")}
            </h3>

            <div className={styles.modalForm}>
              <label className={styles.field}>
                <span className={`igm-mono ${styles.fieldLabel}`}>
                  {t("editorFieldStem")}
                </span>
                <textarea
                  className={styles.textarea}
                  rows={3}
                  value={reviewEdit.form.stem}
                  onChange={(event) => patchReview({ stem: event.target.value })}
                />
              </label>

              <div className={styles.fieldRow}>
                <label className={styles.field}>
                  <span className={`igm-mono ${styles.fieldLabel}`}>
                    {t("editorFieldType")}
                  </span>
                  <select
                    className={styles.input}
                    value={reviewEdit.form.type}
                    onChange={(event) =>
                      patchReview({ type: event.target.value as iGM_QuestionType })
                    }
                  >
                    {iGM_Question_TypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className={styles.field}>
                  <span className={`igm-mono ${styles.fieldLabel}`}>
                    {t("editorFieldTextbook")}
                  </span>
                  <select
                    className={styles.input}
                    value={reviewEdit.form.textbookCode}
                    onChange={(event) =>
                      patchReview({ textbookCode: event.target.value })
                    }
                  >
                    <option value="">{t("editorSelectTextbook")}</option>
                    {iGM_QuestionTextbooks.map((book) => (
                      <option key={book.code} value={book.code}>
                        {book.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {(reviewEdit.form.type === "single_choice" ||
                reviewEdit.form.type === "multiple_choice") && (
                <div className={styles.field}>
                  <span className={`igm-mono ${styles.fieldLabel}`}>
                    {t("editorFieldOptions")}
                  </span>
                  <div className={styles.optionList}>
                    {reviewEdit.form.options.map((option, index) => (
                      <div key={index} className={styles.optionRow}>
                        <input
                          className={styles.optionKeyInput}
                          value={option.key}
                          onChange={(event) =>
                            reviewUpdateOption(index, { key: event.target.value })
                          }
                          aria-label={t("editorOptionKey")}
                        />
                        <input
                          className={styles.input}
                          value={option.text}
                          onChange={(event) =>
                            reviewUpdateOption(index, { text: event.target.value })
                          }
                          aria-label={t("editorOptionText")}
                        />
                        <button
                          type="button"
                          className={styles.removeBtn}
                          onClick={() => reviewRemoveOption(index)}
                          aria-label={t("editorRemoveOption")}
                          title={t("editorRemoveOption")}
                        >
                          <Trash2 size={14} strokeWidth={1.8} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className={styles.addBtn}
                    onClick={reviewAddOption}
                  >
                    <Plus size={14} strokeWidth={1.8} />
                    <span className="igm-mono">{t("editorAddOption")}</span>
                  </button>
                </div>
              )}

              <label className={styles.field}>
                <span className={`igm-mono ${styles.fieldLabel}`}>
                  {t("editorFieldAnswer")}
                </span>
                <input
                  className={styles.input}
                  value={reviewEdit.form.answer}
                  onChange={(event) => patchReview({ answer: event.target.value })}
                />
              </label>

              <label className={styles.field}>
                <span className={`igm-mono ${styles.fieldLabel}`}>
                  {t("editorFieldAnalysis")}
                </span>
                <textarea
                  className={styles.textarea}
                  rows={3}
                  value={reviewEdit.form.analysis}
                  onChange={(event) =>
                    patchReview({ analysis: event.target.value })
                  }
                />
              </label>

              <div className={styles.fieldRow}>
                <label className={styles.field}>
                  <span className={`igm-mono ${styles.fieldLabel}`}>
                    {t("editorFieldDifficulty")}
                  </span>
                  <input
                    className={styles.input}
                    inputMode="decimal"
                    value={reviewEdit.form.difficultyCoefficient}
                    onChange={(event) =>
                      patchReview({ difficultyCoefficient: event.target.value })
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span className={`igm-mono ${styles.fieldLabel}`}>
                    {t("bankFieldDifficulty")}
                  </span>
                  <select
                    className={styles.input}
                    value={reviewEdit.form.difficultyLevel}
                    onChange={(event) =>
                      patchReview({ difficultyLevel: event.target.value })
                    }
                  >
                    {iGM_Question_LevelOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className={styles.field}>
                <span className={`igm-mono ${styles.fieldLabel}`}>
                  {t("editorFieldTags")}
                </span>
                <input
                  className={styles.input}
                  value={reviewEdit.form.tags}
                  onChange={(event) => patchReview({ tags: event.target.value })}
                />
              </label>
            </div>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancel}
                onClick={() => setReviewEdit(null)}
                disabled={reviewBusyId !== ""}
              >
                <span className="igm-mono">{t("adminCancel")}</span>
              </button>
              <button
                type="button"
                className={styles.modalConfirm}
                onClick={() => void saveReviewEdit()}
                disabled={reviewBusyId !== ""}
              >
                {reviewBusyId !== "" ? (
                  <Loader2 size={14} strokeWidth={1.8} className={styles.spin} />
                ) : (
                  <Check size={14} strokeWidth={1.8} />
                )}
                <span className="igm-mono">{t("reviewSaveApprove")}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// 导出 //
export default E_QuestionEditor;
