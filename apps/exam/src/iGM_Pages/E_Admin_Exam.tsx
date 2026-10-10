/**
 * 文件路径：apps/exam/src/iGM_Pages/E_Admin_Exam.tsx
 * 所属层：前端 / 页面层
 * 路由：E_Admin_Exam（/admin）
 * 模块：iGM_ExamAdmin
 * 作用：试卷管理端，台账列出全部试卷并显示转换状态；校对区左侧内嵌转换后 HTML 预览、
 *       右侧校对规格信息，支持保存草稿 / 重新转换 / 确认发布（切换状态）/ 放弃删除
 * 内容：上传入口、转换进度条、校对区（HTML 预览 + 规格表单）、二次确认弹窗（发布 / 放弃）、试卷台账
 * 说明：本模块暂不做权限校验；转换在后台执行，前端轮询进度接口；
 *       原始 PDF 在转换成功时已自动删除，仅转换失败时保留供重新转换；
 *       支持通过 ?examId= 直接打开某试卷校对；文案取自当前语言包
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileUp,
  Loader2,
  RotateCcw,
  Save,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import {
  iGM_Exam_AbsoluteUrl,
  iGM_Exam_Confirm,
  iGM_Exam_Delete,
  iGM_Exam_FetchAdminDetail,
  iGM_Exam_FetchAdminList,
  iGM_Exam_FetchProgress,
  iGM_Exam_Reparse,
  iGM_Exam_Update,
  iGM_ExamRequestError,
  type iGM_ExamAdminListItem,
  type iGM_ExamConvertProgress,
  type iGM_ExamConvertStatus,
  type iGM_ExamDetail,
  type iGM_ExamStatus,
  type iGM_ExamUpdateInput,
} from "../iGM_Services/iGM_ExamClient";
import { useI18n } from "../iGM_i18n/iGM_I18nContext";
import type { iGM_I18nKey } from "../iGM_i18n/iGM_I18nTypes";
import styles from "./E_Admin_Exam.module.css";

// 类型定义 //
type iGM_Exam_AdminState = "loading" | "ready" | "error";

/** 弹窗模式：none 关闭 / confirm 发布前确认 / discard 放弃确认 */
type iGM_Exam_ModalMode = "none" | "confirm" | "discard";

/** 校对表单草稿 */
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

/** 数字字符串 → 可空整数（空串或非数字返回 null） */
function iGM_Exam_ParseInt(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isNaN(n) ? null : n;
}

/** 详情 DTO → 表单草稿 */
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
  const [modal, setModal] = useState<iGM_Exam_ModalMode>("none");

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

  // 上传页转换完成后跳转回本页并携带 examId，自动打开对应试卷校对
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
          // 转换结束：回填识别字段与 HTML 地址
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

  /** 从台账打开某试卷进行校对 */
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

  /** 保存草稿（仅元数据，不改转换产物） */
  async function saveDraft(): Promise<void> {
    if (!draft) return;
    setBusy(true);
    setNotice("");
    setMessage("");
    const payload: iGM_ExamUpdateInput = {
      examId: draft.examId,
      title: draft.title.trim(),
      subject: draft.subject.trim(),
      issuer: draft.issuer.trim(),
      reviewer: draft.reviewer.trim(),
      duration: iGM_Exam_ParseInt(draft.duration),
      totalScore: iGM_Exam_ParseInt(draft.totalScore),
      questionCount: iGM_Exam_ParseInt(draft.questionCount),
      notice: draft.notice.trim(),
    };
    try {
      await iGM_Exam_Update(payload);
      setNotice(t("adminSaved"));
      await load();
    } catch (err) {
      setMessage(iGM_Exam_ReadError(err, t("adminSaveFailed")));
    } finally {
      setBusy(false);
    }
  }

  /** 二次确认后：保存元数据并发布试卷 */
  async function confirmAndPublish(): Promise<void> {
    if (!draft) return;
    setBusy(true);
    setNotice("");
    setMessage("");
    try {
      await iGM_Exam_Update({
        examId: draft.examId,
        title: draft.title.trim(),
        subject: draft.subject.trim(),
        issuer: draft.issuer.trim(),
        reviewer: draft.reviewer.trim(),
        duration: iGM_Exam_ParseInt(draft.duration),
        totalScore: iGM_Exam_ParseInt(draft.totalScore),
        questionCount: iGM_Exam_ParseInt(draft.questionCount),
        notice: draft.notice.trim(),
      });
      await iGM_Exam_Confirm(draft.examId);
      await refreshDraft(draft.examId);
      setModal("none");
      setNotice(t("adminConfirmed"));
      await load();
    } catch (err) {
      setMessage(iGM_Exam_ReadError(err, t("adminConfirmFailed")));
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

  /** 二次确认后：放弃本次试卷，删除原始文件与 HTML 目录 */
  async function discard(): Promise<void> {
    if (!draft) return;
    const examId = draft.examId;
    setBusy(true);
    setNotice("");
    setMessage("");
    try {
      await iGM_Exam_Delete(examId);
      setDraft(null);
      setModal("none");
      setNotice(t("adminDiscarded"));
      await load();
    } catch (err) {
      setMessage(iGM_Exam_ReadError(err, t("adminDeleteFailed")));
    } finally {
      setBusy(false);
    }
  }

  const isConverting =
    draft?.convertStatus === "converting" || draft?.convertStatus === "pending";
  const canConfirm = Boolean(draft) && draft!.convertStatus === "completed";

  return (
    <main className={styles.page}>
      {/* 页头 */}
      <header className={styles.head}>
        <p className={`igm-eyebrow ${styles.headEyebrow}`}>{t("adminEyebrow")}</p>
        <h1 className={`igm-serif ${styles.headTitle}`}>{t("adminTitle")}</h1>
        <p className={styles.headLead}>{t("adminLead")}</p>
      </header>

      {/* 上传入口 */}
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

      {/* 校对区 */}
      {draft && (
        <section className={styles.reviewSection} aria-label={t("adminProofTitle")}>
          <div className={styles.reviewHead}>
            <span className={`igm-mono ${styles.sectionNum}`}>§ 2</span>
            <h2 className={`igm-serif ${styles.sectionTitle}`}>{t("adminProofTitle")}</h2>
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

            {/* 右：转换进度 + 规格表单 */}
            <div className={styles.formPane}>
              {/* 转换进度条 */}
              {(isConverting || draft.convertStatus === "failed") && (
                <IGM_Exam_ProgressBox progress={draft.convertProgress} />
              )}
              {isConverting && (
                <p className={`igm-mono ${styles.progressNote}`}>
                  {t("adminConvertingBanner")}
                </p>
              )}

              <p className={`igm-mono ${styles.paneLabel}`}>{t("adminRecognizedLabel")}</p>
              <form
                className={styles.form}
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveDraft();
                }}
              >
                <label className={styles.field}>
                  <span className={`igm-mono ${styles.fieldLabel}`}>
                    {t("adminFieldTitle")}
                  </span>
                  <input
                    className={styles.input}
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    placeholder={t("adminPlaceholderTitle")}
                  />
                </label>

                <div className={styles.fieldRow}>
                  <label className={styles.field}>
                    <span className={`igm-mono ${styles.fieldLabel}`}>
                      {t("fieldSubject")}
                    </span>
                    <input
                      className={styles.input}
                      value={draft.subject}
                      onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                      placeholder={t("adminPlaceholderSubject")}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={`igm-mono ${styles.fieldLabel}`}>
                      {t("fieldIssuer")}
                    </span>
                    <input
                      className={styles.input}
                      value={draft.issuer}
                      onChange={(e) => setDraft({ ...draft, issuer: e.target.value })}
                      placeholder={t("adminPlaceholderIssuer")}
                    />
                  </label>
                </div>

                <label className={styles.field}>
                  <span className={`igm-mono ${styles.fieldLabel}`}>
                    {t("fieldReviewer")}
                  </span>
                  <input
                    className={styles.input}
                    value={draft.reviewer}
                    onChange={(e) => setDraft({ ...draft, reviewer: e.target.value })}
                    placeholder={t("adminPlaceholderReviewer")}
                  />
                </label>

                <div className={styles.fieldRowThree}>
                  <label className={styles.field}>
                    <span className={`igm-mono ${styles.fieldLabel}`}>
                      {t("adminFieldDuration")}
                    </span>
                    <input
                      className={styles.input}
                      inputMode="numeric"
                      value={draft.duration}
                      onChange={(e) => setDraft({ ...draft, duration: e.target.value })}
                      placeholder="120"
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={`igm-mono ${styles.fieldLabel}`}>
                      {t("adminFieldTotal")}
                    </span>
                    <input
                      className={styles.input}
                      inputMode="numeric"
                      value={draft.totalScore}
                      onChange={(e) => setDraft({ ...draft, totalScore: e.target.value })}
                      placeholder="150"
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={`igm-mono ${styles.fieldLabel}`}>
                      {t("adminFieldItems")}
                    </span>
                    <input
                      className={styles.input}
                      inputMode="numeric"
                      value={draft.questionCount}
                      onChange={(e) =>
                        setDraft({ ...draft, questionCount: e.target.value })
                      }
                      placeholder="30"
                    />
                  </label>
                </div>

                <label className={styles.field}>
                  <span className={`igm-mono ${styles.fieldLabel}`}>
                    {t("adminFieldNotice")}
                  </span>
                  <textarea
                    className={styles.textarea}
                    rows={2}
                    value={draft.notice}
                    onChange={(e) => setDraft({ ...draft, notice: e.target.value })}
                    placeholder={t("adminPlaceholderNotice")}
                  />
                </label>

                {/* 操作组 */}
                <div className={styles.actions}>
                  <button type="submit" className={styles.primary} disabled={busy || isConverting}>
                    <Save size={14} strokeWidth={1.8} />
                    <span className="igm-mono">{t("adminSave")}</span>
                  </button>
                  <button
                    type="button"
                    className={styles.confirm}
                    onClick={() => setModal("confirm")}
                    disabled={busy || !canConfirm}
                  >
                    <ShieldCheck size={14} strokeWidth={1.8} />
                    <span className="igm-mono">{t("adminConfirm")}</span>
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
                    className={styles.discard}
                    onClick={() => setModal("discard")}
                    disabled={busy}
                  >
                    <Undo2 size={14} strokeWidth={1.8} />
                    <span className="igm-mono">{t("adminDiscard")}</span>
                  </button>
                </div>
              </form>
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
            {exams.map((item) => (
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
                  className={`igm-mono ${styles.statusTag} ${styles[`cv_${item.convertStatus}`]}`}
                >
                  {t(iGM_Exam_ConvertKeys[item.convertStatus])}
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
            ))}
          </div>
        )}
      </section>

      {/* 二次确认弹窗：发布 / 放弃 */}
      {modal !== "none" && draft && (
        <div className={styles.modalOverlay} role="presentation">
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === "confirm" ? t("adminConfirmTitle") : t("adminDiscardTitle")
            }
          >
            <h3 className={`igm-serif ${styles.modalTitle}`}>
              {modal === "confirm" ? t("adminConfirmTitle") : t("adminDiscardTitle")}
            </h3>
            <p className={styles.modalBody}>
              {modal === "confirm" ? t("adminConfirmBody") : t("adminDiscardBody")}
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancel}
                onClick={() => setModal("none")}
                disabled={busy}
              >
                <span className="igm-mono">{t("adminConfirmNo")}</span>
              </button>
              <button
                type="button"
                className={styles.modalConfirm}
                onClick={() =>
                  void (modal === "confirm" ? confirmAndPublish() : discard())
                }
                disabled={busy}
              >
                {busy ? (
                  <Loader2 size={14} strokeWidth={1.8} className={styles.spin} />
                ) : modal === "confirm" ? (
                  <ShieldCheck size={14} strokeWidth={1.8} />
                ) : (
                  <Undo2 size={14} strokeWidth={1.8} />
                )}
                <span className="igm-mono">
                  {modal === "confirm" ? t("adminConfirmYes") : t("adminDiscard")}
                </span>
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