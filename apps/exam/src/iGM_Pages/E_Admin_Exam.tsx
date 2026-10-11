/**
 * 文件路径：apps/exam/src/iGM_Pages/E_Admin_Exam.tsx
 * 所属层：前端 / 页面层
 * 路由：E_Admin_Exam（/admin）
 * 模块：iGM_ExamAdmin
 * 作用：试卷管理端，台账列出全部试卷并显示转换 / 部署状态；预览区左侧内嵌转换后 HTML、
 *       右侧展示规格信息，支持编辑试卷信息、上传答案附件、重新转换与删除
 * 内容：上传入口、转换进度条、预览区（HTML 预览 + 规格 / 编辑表单 + 答案附件）、删除确认弹窗、试卷台账
 * 说明：发布在「上传试卷」页完成，本页提供信息修改与答案附件维护；
 *       信息修改与答案上传后会重新导出静态数据并推送，触发 Pages 重建；
 *       转换在后台执行，前端轮询进度接口；原始 PDF 转换成功时已自动删除，
 *       仅转换失败时保留供重新转换；支持通过 ?examId= 直接打开某试卷预览；文案取自当前语言包
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileText,
  FileUp,
  Loader2,
  Pencil,
  RotateCcw,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import {
  iGM_Exam_AbsoluteUrl,
  iGM_Exam_Delete,
  iGM_Exam_FetchAdminDetail,
  iGM_Exam_FetchAdminList,
  iGM_Exam_FetchProgress,
  iGM_Exam_Reparse,
  iGM_Exam_UpdateMeta,
  iGM_Exam_UploadAnswer,
  iGM_ExamRequestError,
  type iGM_ExamAdminListItem,
  type iGM_ExamConvertProgress,
  type iGM_ExamConvertStatus,
  type iGM_ExamDetail,
  type iGM_ExamPublishMeta,
  type iGM_ExamStatus,
} from "../iGM_Services/iGM_ExamClient";
import { iGM_Exam_FetchOnlineIndexIds } from "../iGM_Services/iGM_ExamStaticClient";
import { useI18n } from "../iGM_i18n/iGM_I18nContext";
import type { iGM_I18nKey } from "../iGM_i18n/iGM_I18nTypes";
import styles from "./E_Admin_Exam.module.css";

// 类型定义 //
type iGM_Exam_AdminState = "loading" | "ready" | "error";

/** 预览草稿（含全部只读规格与转换信息） */
interface iGM_Exam_EditorDraft {
  examId: string;
  code: string;
  title: string;
  subject: string;
  issuer: string;
  reviewer: string;
  duration: string;
  totalScore: string;
  questionCount: string;
  notice: string;
  convertProgress: iGM_ExamConvertProgress;
  status: iGM_ExamStatus;
  convertStatus: iGM_ExamConvertStatus;
  htmlApiPath: string;
  hasOriginalFile: boolean;
  fileApiPath: string;
  fileName: string;
  answerApiPath: string;
  answerFileName: string;
}

/** 信息编辑表单（数值以字符串保存，提交前校验） */
interface iGM_Exam_EditForm {
  title: string;
  subject: string;
  issuer: string;
  reviewer: string;
  duration: string;
  totalScore: string;
  questionCount: string;
  notice: string;
}

// 核心逻辑 //
/** 试卷状态 → 语言包键 */
const iGM_Exam_StatusKeys: Record<iGM_ExamStatus, iGM_I18nKey> = {
  draft: "statusDraft",
  published: "statusPublished",
  closed: "statusClosed",
};

/** 转换状态 → 语言包键 */
const iGM_Exam_ConvertKeys: Record<iGM_ExamConvertStatus, iGM_I18nKey> = {
  pending: "convertStatusPending",
  converting: "convertStatusConverting",
  completed: "convertStatusCompleted",
  failed: "convertStatusFailed",
};

/** 轮询间隔（毫秒） */
const iGM_ExamPollIntervalMs = 1000;

/** 详情 DTO → 预览草稿 */
function iGM_Exam_ToDraft(exam: iGM_ExamDetail): iGM_Exam_EditorDraft {
  return {
    examId: exam.id,
    code: exam.code,
    title: exam.title,
    subject: exam.subject,
    issuer: exam.issuer,
    reviewer: exam.reviewer,
    duration: exam.duration === null ? "" : String(exam.duration),
    totalScore: exam.totalScore === null ? "" : String(exam.totalScore),
    questionCount: exam.questionCount === null ? "" : String(exam.questionCount),
    notice: exam.notice,
    convertProgress: exam.convertProgress,
    status: exam.status,
    convertStatus: exam.convertStatus,
    htmlApiPath: exam.htmlApiPath,
    hasOriginalFile: exam.hasOriginalFile,
    fileApiPath: exam.fileApiPath,
    fileName: exam.fileName,
    answerApiPath: exam.answerApiPath,
    answerFileName: exam.answerFileName,
  };
}

/** 预览草稿 → 信息编辑表单 */
function iGM_Exam_ToEditForm(draft: iGM_Exam_EditorDraft): iGM_Exam_EditForm {
  return {
    title: draft.title,
    subject: draft.subject,
    issuer: draft.issuer,
    reviewer: draft.reviewer,
    duration: draft.duration,
    totalScore: draft.totalScore,
    questionCount: draft.questionCount,
    notice: draft.notice,
  };
}

/** 编辑表单字段定义（键 / 文案键，数值字段做正整数校验） */
const iGM_Exam_EditFields: {
  key: keyof iGM_Exam_EditForm;
  label: iGM_I18nKey;
  placeholder: iGM_I18nKey;
  numeric: boolean;
}[] = [
  { key: "title", label: "adminFieldTitle", placeholder: "adminPlaceholderTitle", numeric: false },
  { key: "subject", label: "fieldSubject", placeholder: "adminPlaceholderSubject", numeric: false },
  { key: "issuer", label: "fieldIssuer", placeholder: "adminPlaceholderIssuer", numeric: false },
  { key: "reviewer", label: "fieldReviewer", placeholder: "adminPlaceholderReviewer", numeric: false },
  { key: "duration", label: "adminFieldDuration", placeholder: "adminFieldDuration", numeric: true },
  { key: "totalScore", label: "adminFieldTotal", placeholder: "adminFieldTotal", numeric: true },
  { key: "questionCount", label: "adminFieldItems", placeholder: "adminFieldItems", numeric: true },
  { key: "notice", label: "adminFieldNotice", placeholder: "adminPlaceholderNotice", numeric: false },
];

/** 答案附件大小上限（与后端一致，20MB） */
const iGM_Exam_MaxAnswerBytes = 20 * 1024 * 1024;

/**
 * 编辑表单 → 元数据入参；任一必填项缺失或数值非正整数时返回 null
 * 文本字段（标题 / 科目 / 命题方 / 审题方）必填，须知可选
 */
function iGM_Exam_ToMeta(form: iGM_Exam_EditForm): iGM_ExamPublishMeta | null {
  const texts = [form.title, form.subject, form.issuer, form.reviewer];
  if (texts.some((value) => value.trim().length === 0)) return null;
  const duration = Number(form.duration);
  const totalScore = Number(form.totalScore);
  const questionCount = Number(form.questionCount);
  const numbers = [duration, totalScore, questionCount];
  if (numbers.some((value) => !Number.isInteger(value) || value <= 0)) return null;
  return {
    title: form.title.trim(),
    subject: form.subject.trim(),
    issuer: form.issuer.trim(),
    reviewer: form.reviewer.trim(),
    duration,
    totalScore,
    questionCount,
    notice: form.notice.trim(),
  };
}

/** 转换进度条（上传 / 重新转换后实时更新） */
function iGM_Exam_ProgressBox({
  progress,
}: {
  progress: iGM_ExamConvertProgress;
}) {
  const { t } = useI18n();
  const percent = Math.min(100, Math.max(0, progress.percent));
  const failed = progress.status === "failed";
  const done = progress.status === "completed";
  const width = done ? 100 : percent;

  return (
    <div className={`igm-double-rule ${styles.progressBox}`}>
      <div className={styles.progressHead}>
        <span className={`igm-mono ${styles.progressLabel}`}>
          {t("adminProgressTitle")}
        </span>
        <span className={`igm-mono ${styles.progressValue}`}>{width}%</span>
      </div>
      <div className={styles.progressTrack}>
        <div
          className={`${styles.progressFill} ${failed ? styles.progressFillFailed : ""}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <p className={`igm-mono ${failed ? styles.progressNoteError : styles.progressNote}`}>
        {failed
          ? `${t("adminProgressFailed")}${progress.error ? `：${progress.error}` : ""}`
          : done
            ? t("adminProgressDone")
            : t("adminProgressConverting")}
      </p>
    </div>
  );
}

// JSX 组件标识要求首字母大写，此处按既有约定提供别名
const IGM_Exam_ProgressBox = iGM_Exam_ProgressBox;

/** 管理端 */
export function iGM_ExamAdmin() {
  const { t } = useI18n();
  const initialExamIdRef = useRef<string>("");

  const [exams, setExams] = useState<iGM_ExamAdminListItem[]>([]);
  const [state, setState] = useState<iGM_Exam_AdminState>("loading");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<iGM_Exam_EditorDraft | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [discardOpen, setDiscardOpen] = useState(false);
  /** 线上已部署试卷 id 集合；null 表示尚未取得（取得失败时降级为不判定"部署中"） */
  const [onlineIds, setOnlineIds] = useState<Set<string> | null>(null);
  /** 是否处于信息编辑态 */
  const [editing, setEditing] = useState(false);
  /** 信息编辑表单；非编辑态为 null */
  const [editForm, setEditForm] = useState<iGM_Exam_EditForm | null>(null);
  /** 答案附件上传进度（0-100；null 表示未在上传） */
  const [answerProgress, setAnswerProgress] = useState<number | null>(null);
  const answerInputRef = useRef<HTMLInputElement | null>(null);

  /** 已发布但尚未出现在线上索引中的试卷：状态显示为"部署中" */
  const deployingIds = useMemo(() => {
    const set = new Set<string>();
    if (!onlineIds) return set;
    for (const exam of exams) {
      if (exam.status === "published" && !onlineIds.has(exam.id)) set.add(exam.id);
    }
    return set;
  }, [exams, onlineIds]);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const list = await iGM_Exam_FetchAdminList();
      setExams(list);
      setState("ready");
    } catch (err) {
      // 保留后端的具体提示；无具体提示时在渲染层回落语言包文案
      setMessage(err instanceof iGM_ExamRequestError ? err.message : "");
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 拉取线上索引：判断哪些已发布试卷仍在部署中（失败时降级，不影响台账）
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const ids = await iGM_Exam_FetchOnlineIndexIds();
        if (!cancelled) setOnlineIds(ids);
      } catch {
        // 线上索引不可用（如跨域 / 未部署）：保持 null，不显示"部署中"
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** 统一错误信息提取 */
  function iGM_Exam_ReadError(err: unknown, fallback: string): string {
    return err instanceof iGM_ExamRequestError ? err.message : fallback;
  }

  /** 拉取管理端详情并覆盖当前草稿 */
  const refreshDraft = useCallback(async (examId: string): Promise<void> => {
    const exam = await iGM_Exam_FetchAdminDetail(examId);
    setDraft(iGM_Exam_ToDraft(exam));
    setPreviewKey((k) => k + 1);
  }, []);

  // 支持通过 ?examId= 直接打开某试卷预览
  useEffect(() => {
    if (initialExamIdRef.current) return;
    const examId = new URLSearchParams(window.location.search).get("examId") ?? "";
    if (!examId) return;
    initialExamIdRef.current = examId;
    void refreshDraft(examId).catch(() => undefined);
  }, [refreshDraft]);

  // 转换中：轮询进度接口，完成后回填并刷新台账
  const convertingExamId =
    draft?.convertStatus === "converting" || draft?.convertStatus === "pending"
      ? draft.examId
      : null;
  useEffect(() => {
    if (!convertingExamId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async (): Promise<void> => {
      try {
        const progress = await iGM_Exam_FetchProgress(convertingExamId);
        if (cancelled) return;
        setDraft((d) =>
          d ? { ...d, convertStatus: progress.status, convertProgress: progress } : d,
        );
        if (progress.status !== "converting" && progress.status !== "pending") {
          // 转换结束：回填 HTML 地址与占用空间
          await refreshDraft(convertingExamId);
          if (cancelled) return;
          await load();
          return;
        }
      } catch {
        // 单次轮询失败不中断，继续下一轮
      }
      if (!cancelled) timer = setTimeout(() => void tick(), iGM_ExamPollIntervalMs);
    };

    timer = setTimeout(() => void tick(), iGM_ExamPollIntervalMs);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [convertingExamId, refreshDraft, load]);

  /** 从台账打开某试卷预览 */
  async function openEditor(item: iGM_ExamAdminListItem): Promise<void> {
    setBusy(true);
    setNotice("");
    setMessage("");
    try {
      await refreshDraft(item.id);
    } catch (err) {
      setMessage(iGM_Exam_ReadError(err, t("adminLedgerError")));
    } finally {
      setBusy(false);
    }
  }

  /** 使用保留期内的原始 PDF 重新转换 */
  async function reparse(): Promise<void> {
    if (!draft) return;
    setBusy(true);
    setNotice("");
    setMessage("");
    try {
      await iGM_Exam_Reparse(draft.examId);
      const progress = await iGM_Exam_FetchProgress(draft.examId);
      setDraft((d) =>
        d ? { ...d, convertStatus: progress.status, convertProgress: progress } : d,
      );
      setPreviewKey((k) => k + 1);
      setNotice(t("adminReparsed"));
      await load();
    } catch (err) {
      setMessage(iGM_Exam_ReadError(err, t("adminReparseFailed")));
    } finally {
      setBusy(false);
    }
  }

  /** 二次确认后：删除试卷，移除原始文件与 HTML 目录 */
  async function discard(): Promise<void> {
    if (!draft) return;
    const examId = draft.examId;
    setBusy(true);
    setNotice("");
    setMessage("");
    try {
      await iGM_Exam_Delete(examId);
      setDraft(null);
      setDiscardOpen(false);
      setNotice(t("adminDiscarded"));
      await load();
    } catch (err) {
      setMessage(iGM_Exam_ReadError(err, t("adminDeleteFailed")));
    } finally {
      setBusy(false);
    }
  }

  /** 进入信息编辑态，用当前草稿初始化表单 */
  function startEdit(): void {
    if (!draft) return;
    setEditForm(iGM_Exam_ToEditForm(draft));
    setNotice("");
    setMessage("");
    setEditing(true);
  }

  /** 退出信息编辑态 */
  function cancelEdit(): void {
    setEditing(false);
    setEditForm(null);
  }

  /** 编辑表单字段变更 */
  function iGM_Exam_OnEditChange(
    key: keyof iGM_Exam_EditForm,
    value: string,
  ): void {
    setEditForm((form) => (form ? { ...form, [key]: value } : form));
  }

  /** 保存信息修改：校验 → 提交 → 重新拉取详情 → 提示部署中 */
  async function saveMeta(): Promise<void> {
    if (!draft || !editForm) return;
    const meta = iGM_Exam_ToMeta(editForm);
    if (!meta) {
      setMessage(t("adminSaveMetaRequired"));
      setNotice("");
      return;
    }
    setBusy(true);
    setNotice("");
    setMessage("");
    try {
      await iGM_Exam_UpdateMeta(draft.examId, meta);
      await refreshDraft(draft.examId);
      setEditing(false);
      setEditForm(null);
      setNotice(t("adminSaveMetaDone"));
      await load();
    } catch (err) {
      setMessage(iGM_Exam_ReadError(err, t("adminSaveMetaFailed")));
    } finally {
      setBusy(false);
    }
  }

  /** 选择答案附件：校验 PDF 与体积后带进度上传 */
  async function onAnswerSelected(
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const input = event.target;
    const file = input.files?.[0] ?? null;
    input.value = "";
    if (!draft || !file) return;
    if (!/\.pdf$/i.test(file.name)) {
      setMessage(t("adminAnswerOnlyPdf"));
      setNotice("");
      return;
    }
    if (file.size > iGM_Exam_MaxAnswerBytes) {
      setMessage(t("adminAnswerTooLarge"));
      setNotice("");
      return;
    }
    setBusy(true);
    setNotice("");
    setMessage("");
    setAnswerProgress(0);
    try {
      await iGM_Exam_UploadAnswer(draft.examId, file, (percent) =>
        setAnswerProgress(percent),
      );
      await refreshDraft(draft.examId);
      setNotice(t("adminAnswerUploaded"));
    } catch (err) {
      setMessage(iGM_Exam_ReadError(err, t("adminAnswerFailed")));
    } finally {
      setBusy(false);
      setAnswerProgress(null);
    }
  }

  const isConverting =
    draft?.convertStatus === "converting" || draft?.convertStatus === "pending";

  /** 台账状态列：转换未完成显示转换状态，否则显示发布状态（部署中 / 已发布 / 草稿 / 已关闭） */
  function iGM_Exam_LedgerStatus(item: iGM_ExamAdminListItem): {
    key: iGM_I18nKey;
    cls: string;
  } {
    if (item.convertStatus !== "completed") {
      return {
        key: iGM_Exam_ConvertKeys[item.convertStatus],
        cls: `cv_${item.convertStatus}`,
      };
    }
    if (item.status === "published" && deployingIds.has(item.id)) {
      return { key: "statusDeploying", cls: "st_deploying" };
    }
    return { key: iGM_Exam_StatusKeys[item.status], cls: `st_${item.status}` };
  }

  return (
    <main className={styles.page}>
      {/* 页头 */}
      <header className={styles.head}>
        <p className={`igm-eyebrow ${styles.headEyebrow}`}>{t("adminEyebrow")}</p>
        <h1 className={`igm-serif ${styles.headTitle}`}>{t("adminTitle")}</h1>
        <p className={styles.headLead}>{t("adminLead")}</p>
      </header>

      {/* 发布入口 */}
      <section
        className={`igm-double-rule ${styles.uploadSection}`}
        aria-label={t("adminIngestTitle")}
      >
        <div className={styles.uploadText}>
          <span className={`igm-mono ${styles.sectionNum}`}>§ 1</span>
          <div>
            <h2 className={`igm-serif ${styles.sectionTitle}`}>
              {t("adminIngestTitle")}
            </h2>
            <p className={styles.sectionLead}>{t("adminIngestLead")}</p>
          </div>
        </div>
        <Link href="/admin/upload" className={styles.uploadBtn}>
          <FileUp size={15} strokeWidth={1.8} />
          <span className={`igm-mono ${styles.uploadLabel}`}>{t("adminUpload")}</span>
        </Link>
      </section>

      {/* 全局提示 */}
      {message && (
        <p className={`igm-mono ${styles.alertError}`}>
          <AlertCircle size={14} strokeWidth={1.8} />
          {message}
        </p>
      )}
      {notice && !message && (
        <p className={`igm-mono ${styles.alertOk}`}>
          <CheckCircle2 size={14} strokeWidth={1.8} />
          {notice}
        </p>
      )}

      {/* 预览区 */}
      {draft && (
        <section className={styles.reviewSection} aria-label={t("adminPreviewTitle")}>
          <div className={styles.reviewHead}>
            <span className={`igm-mono ${styles.sectionNum}`}>§ 2</span>
            <h2 className={`igm-serif ${styles.sectionTitle}`}>
              {t("adminPreviewTitle")}
            </h2>
            <span className={`igm-mono ${styles.recordCode}`}>{draft.code}</span>
            <span className={`igm-mono ${styles.statusTag} ${styles[`st_${draft.status}`]}`}>
              {t(iGM_Exam_StatusKeys[draft.status])}
            </span>
            <span
              className={`igm-mono ${styles.statusTag} ${styles[`cv_${draft.convertStatus}`]}`}
            >
              {t(iGM_Exam_ConvertKeys[draft.convertStatus])}
            </span>
          </div>

          <div className={styles.reviewLayout}>
            {/* 左：转换后 HTML 预览 */}
            <div className={styles.pdfPane}>
              <p className={`igm-mono ${styles.paneLabel}`}>{t("adminPreviewLabel")}</p>
              {draft.htmlApiPath ? (
                <iframe
                  key={previewKey}
                  className={styles.pdfFrame}
                  src={iGM_Exam_AbsoluteUrl(draft.htmlApiPath)}
                  title={draft.title || draft.fileName}
                />
              ) : draft.hasOriginalFile ? (
                <div className={styles.fileBox}>
                  <p className={`igm-mono ${styles.fileName}`} title={draft.fileName}>
                    {draft.fileName}
                  </p>
                  <a
                    className={styles.downloadBtn}
                    href={iGM_Exam_AbsoluteUrl(draft.fileApiPath)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Download size={13} strokeWidth={1.8} />
                    <span className="igm-mono">{t("adminDownloadOriginal")}</span>
                  </a>
                </div>
              ) : (
                <p className={`igm-mono ${styles.previewDeleted}`}>
                  {t("adminPreviewDeleted")}
                </p>
              )}
            </div>

            {/* 右：转换进度 + 只读规格 + 单元操作 */}
            <div className={styles.formPane}>
              {(isConverting || draft.convertStatus === "failed") && (
                <IGM_Exam_ProgressBox progress={draft.convertProgress} />
              )}
              {isConverting && (
                <p className={`igm-mono ${styles.progressNote}`}>
                  {t("adminConvertingBanner")}
                </p>
              )}

              <p className={`igm-mono ${styles.paneLabel}`}>
                {editing ? t("adminEditSpec") : t("adminSpecLabel")}
              </p>

              {editing && editForm ? (
                <div className={styles.editForm}>
                  {iGM_Exam_EditFields.map((field) => (
                    <label key={field.key} className={styles.editRow}>
                      <span className={`igm-mono ${styles.editLabel}`}>
                        {t(field.label)}
                      </span>
                      <input
                        className={styles.editInput}
                        type={field.numeric ? "number" : "text"}
                        inputMode={field.numeric ? "numeric" : undefined}
                        min={field.numeric ? 1 : undefined}
                        value={editForm[field.key]}
                        placeholder={t(field.placeholder)}
                        onChange={(event) =>
                          iGM_Exam_OnEditChange(field.key, event.target.value)
                        }
                      />
                    </label>
                  ))}
                </div>
              ) : (
                <dl className={styles.specList}>
                  <div className={styles.specRow}>
                    <dt className={`igm-mono ${styles.specKey}`}>
                      {t("adminFieldTitle")}
                    </dt>
                    <dd className={styles.specValue}>{draft.title || "—"}</dd>
                  </div>
                  <div className={styles.specRow}>
                    <dt className={`igm-mono ${styles.specKey}`}>
                      {t("fieldSubject")}
                    </dt>
                    <dd className={styles.specValue}>{draft.subject || "—"}</dd>
                  </div>
                  <div className={styles.specRow}>
                    <dt className={`igm-mono ${styles.specKey}`}>
                      {t("fieldIssuer")}
                    </dt>
                    <dd className={styles.specValue}>{draft.issuer || "—"}</dd>
                  </div>
                  <div className={styles.specRow}>
                    <dt className={`igm-mono ${styles.specKey}`}>
                      {t("fieldReviewer")}
                    </dt>
                    <dd className={styles.specValue}>{draft.reviewer || "—"}</dd>
                  </div>
                  <div className={styles.specRow}>
                    <dt className={`igm-mono ${styles.specKey}`}>
                      {t("adminFieldDuration")}
                    </dt>
                    <dd className={styles.specValue}>{draft.duration || "—"}</dd>
                  </div>
                  <div className={styles.specRow}>
                    <dt className={`igm-mono ${styles.specKey}`}>
                      {t("adminFieldTotal")}
                    </dt>
                    <dd className={styles.specValue}>{draft.totalScore || "—"}</dd>
                  </div>
                  <div className={styles.specRow}>
                    <dt className={`igm-mono ${styles.specKey}`}>
                      {t("adminFieldItems")}
                    </dt>
                    <dd className={styles.specValue}>{draft.questionCount || "—"}</dd>
                  </div>
                  <div className={styles.specRow}>
                    <dt className={`igm-mono ${styles.specKey}`}>
                      {t("adminFieldNotice")}
                    </dt>
                    <dd className={styles.specValue}>{draft.notice || "—"}</dd>
                  </div>
                </dl>
              )}

              {/* 答案附件 */}
              <div className={styles.answerBlock}>
                <span className={`igm-mono ${styles.answerLabel}`}>
                  {t("adminAnswerLabel")}
                </span>
                <div className={styles.answerRow}>
                  {draft.answerFileName ? (
                    <a
                      className={styles.answerLink}
                      href={iGM_Exam_AbsoluteUrl(draft.answerApiPath)}
                      target="_blank"
                      rel="noreferrer"
                      title={draft.answerFileName}
                    >
                      <FileText size={13} strokeWidth={1.8} />
                      <span className="igm-mono">{t("adminAnswerView")}</span>
                    </a>
                  ) : (
                    <span className={`igm-mono ${styles.answerEmpty}`}>
                      {t("adminAnswerNone")}
                    </span>
                  )}
                  <button
                    type="button"
                    className={styles.answerUploadBtn}
                    onClick={() => answerInputRef.current?.click()}
                    disabled={busy || isConverting}
                  >
                    <Upload size={13} strokeWidth={1.8} />
                    <span className="igm-mono">
                      {draft.answerFileName
                        ? t("adminAnswerReplace")
                        : t("adminAnswerUpload")}
                    </span>
                  </button>
                  <input
                    ref={answerInputRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    className={styles.hiddenInput}
                    onChange={(event) => void onAnswerSelected(event)}
                  />
                </div>
                {draft.answerFileName && (
                  <p
                    className={`igm-mono ${styles.answerName}`}
                    title={draft.answerFileName}
                  >
                    {draft.answerFileName}
                  </p>
                )}
                {answerProgress !== null && (
                  <div className={styles.answerProgress}>
                    <div className={styles.progressHead}>
                      <span className={`igm-mono ${styles.progressLabel}`}>
                        {t("adminAnswerUploading")}
                      </span>
                      <span className={`igm-mono ${styles.progressValue}`}>
                        {answerProgress}%
                      </span>
                    </div>
                    <div className={styles.progressTrack}>
                      <div
                        className={styles.progressFill}
                        style={{ width: `${answerProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 操作组 */}
              <div className={styles.actions}>
                {editing ? (
                  <>
                    <button
                      type="button"
                      className={styles.reparse}
                      onClick={() => void saveMeta()}
                      disabled={busy}
                    >
                      {busy ? (
                        <Loader2 size={14} strokeWidth={1.8} className={styles.spin} />
                      ) : (
                        <Save size={14} strokeWidth={1.8} />
                      )}
                      <span className="igm-mono">{t("adminSaveMeta")}</span>
                    </button>
                    <button
                      type="button"
                      className={styles.modalCancel}
                      onClick={cancelEdit}
                      disabled={busy}
                    >
                      <span className="igm-mono">{t("adminCancel")}</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className={styles.reparse}
                      onClick={startEdit}
                      disabled={busy || isConverting}
                    >
                      <Pencil size={14} strokeWidth={1.8} />
                      <span className="igm-mono">{t("adminEditInfo")}</span>
                    </button>
                    <button
                      type="button"
                      className={styles.reparse}
                      onClick={() => void reparse()}
                      disabled={busy || !draft.hasOriginalFile}
                    >
                      <RotateCcw size={14} strokeWidth={1.8} />
                      <span className="igm-mono">{t("adminReparse")}</span>
                    </button>
                    <button
                      type="button"
                      className={styles.delete}
                      onClick={() => setDiscardOpen(true)}
                      disabled={busy}
                    >
                      <Trash2 size={14} strokeWidth={1.8} />
                      <span className="igm-mono">{t("adminDelete")}</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 台账 */}
      <section className={styles.ledgerSection} aria-label={t("adminLedgerTitle")}>
        <div className={styles.ledgerHead}>
          <span className={`igm-mono ${styles.sectionNum}`}>§ 3</span>
          <h2 className={`igm-serif ${styles.sectionTitle}`}>
            {t("adminLedgerTitle")}
          </h2>
          <span className={`igm-mono ${styles.ledgerCount}`}>
            {String(exams.length).padStart(3, "0")} {t("adminLedgerEntries")}
          </span>
        </div>

        {state === "loading" && (
          <p className={`igm-mono ${styles.state}`}>{t("adminLedgerLoading")}</p>
        )}
        {state === "error" && (
          <p className={`igm-mono ${styles.stateError}`}>
            {message || t("adminLedgerError")}
          </p>
        )}
        {state === "ready" && exams.length === 0 && (
          <p className={`igm-mono ${styles.state}`}>{t("adminLedgerEmpty")}</p>
        )}

        {state === "ready" && exams.length > 0 && (
          <div className={styles.table}>
            <div className={`igm-mono ${styles.tableHeadRow}`}>
              <span>{t("adminColCode")}</span>
              <span>{t("adminColTitle")}</span>
              <span>{t("adminColSubject")}</span>
              <span>{t("adminColTotal")}</span>
              <span>{t("adminColSubmissions")}</span>
              <span>{t("adminColStatus")}</span>
              <span />
            </div>
            {exams.map((item) => {
              const status = iGM_Exam_LedgerStatus(item);
              return (
                <div key={item.id} className={styles.tableRow}>
                  <span className={`igm-mono ${styles.cellCode}`}>{item.code}</span>
                  <span className={styles.cellTitle} title={item.title}>
                    {item.title || "—"}
                  </span>
                  <span className={styles.cellSoft}>{item.subject || "—"}</span>
                  <span className={`igm-mono ${styles.cellSoft}`}>
                    {item.totalScore === null ? "—" : `${item.totalScore}`}
                  </span>
                  <span className={`igm-mono ${styles.cellSoft}`}>
                    {String(item.submissionCount).padStart(3, "0")}
                  </span>
                  <span
                    className={`igm-mono ${styles.statusTag} ${styles[status.cls]}`}
                  >
                    {t(status.key)}
                  </span>
                  <button
                    type="button"
                    className={styles.editBtn}
                    onClick={() => void openEditor(item)}
                    disabled={busy}
                  >
                    {t("adminReview")}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 删除确认弹窗 */}
      {discardOpen && draft && (
        <div className={styles.modalOverlay} role="presentation">
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-label={t("adminDiscardTitle")}
          >
            <h3 className={`igm-serif ${styles.modalTitle}`}>
              {t("adminDiscardTitle")}
            </h3>
            <p className={styles.modalBody}>{t("adminDiscardBody")}</p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancel}
                onClick={() => setDiscardOpen(false)}
                disabled={busy}
              >
                <span className="igm-mono">{t("adminCancel")}</span>
              </button>
              <button
                type="button"
                className={styles.modalConfirm}
                onClick={() => void discard()}
                disabled={busy}
              >
                {busy ? (
                  <Loader2 size={14} strokeWidth={1.8} className={styles.spin} />
                ) : (
                  <Trash2 size={14} strokeWidth={1.8} />
                )}
                <span className="igm-mono">{t("adminDelete")}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// 导出 //
export default iGM_ExamAdmin;
