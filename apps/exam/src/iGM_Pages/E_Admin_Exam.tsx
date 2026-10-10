/**
 * 文件路径：apps/exam/src/iGM_Pages/E_Admin_Exam.tsx
 * 所属层：前端 / 页面层
 * 路由：E_Admin_Exam（/admin）
 * 模块：iGM_ExamAdmin
 * 作用：试卷管理端，上传文档并解析建档、左右分栏校对、确认并删除原文件、重新解析、删除
 * 内容：上传区、左右分栏校对区（左原始文件预览、右规格表单 + 解析全文与预览）、
 *       二次确认弹窗、试卷台账
 * 说明：本模块暂不做权限校验；原始文件先保留，管理员二次确认后才删除；文案取自当前语言包
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileUp,
  Loader2,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  iGM_Exam_AbsoluteUrl,
  iGM_Exam_Confirm,
  iGM_Exam_Delete,
  iGM_Exam_FetchAdminDetail,
  iGM_Exam_FetchAdminList,
  iGM_Exam_Reparse,
  iGM_Exam_Update,
  iGM_Exam_Upload,
  iGM_ExamRequestError,
  type iGM_ExamAdminListItem,
  type iGM_ExamDetail,
  type iGM_ExamParseStatus,
  type iGM_ExamStatus,
  type iGM_ExamUpdateInput,
} from "../iGM_Services/iGM_ExamClient";
import { iGM_ExamPaperView as IGM_ExamPaperView } from "../iGM_Components/iGM_ExamPaperView/iGM_ExamPaperView";
import { useI18n } from "../iGM_i18n/iGM_I18nContext";
import type { iGM_I18nKey } from "../iGM_i18n/iGM_I18nTypes";
import styles from "./E_Admin_Exam.module.css";

// 类型定义 //
type iGM_Exam_AdminState = "loading" | "ready" | "error";

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
  contentMarkdown: string;
  status: iGM_ExamStatus;
  parseStatus: iGM_ExamParseStatus;
  hasOriginalFile: boolean;
  fileApiPath: string;
  fileType: string;
  fileName: string;
}

// 核心逻辑 //
/** 试卷状态 → 语言包键 */
const iGM_Exam_StatusKeys: Record<iGM_ExamStatus, iGM_I18nKey> = {
  draft: "statusDraft",
  published: "statusPublished",
  closed: "statusClosed",
};

/** 解析状态 → 语言包键 */
const iGM_Exam_ParseKeys: Record<iGM_ExamParseStatus, iGM_I18nKey> = {
  pending: "parseStatusPending",
  parsed: "parseStatusParsed",
  confirmed: "parseStatusConfirmed",
  failed: "parseStatusFailed",
};

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
    contentMarkdown: exam.contentMarkdown,
    status: exam.status,
    parseStatus: exam.parseStatus,
    hasOriginalFile: exam.hasOriginalFile,
    fileApiPath: exam.fileApiPath,
    fileType: exam.fileType,
    fileName: exam.fileName,
  };
}

/** 管理端 */
export function iGM_ExamAdmin() {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [exams, setExams] = useState<iGM_ExamAdminListItem[]>([]);
  const [state, setState] = useState<iGM_Exam_AdminState>("loading");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<iGM_Exam_EditorDraft | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);

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

  /** 上传文档：解析建档并进入校对 */
  async function handleUpload(file: File): Promise<void> {
    setBusy(true);
    setNotice("");
    setMessage("");
    try {
      const exam = await iGM_Exam_Upload(file);
      setDraft(iGM_Exam_ToDraft(exam));
      setPreviewKey((k) => k + 1);
      setNotice(t("adminIngested"));
      await load();
    } catch (err) {
      setMessage(iGM_Exam_ReadError(err, t("adminUploadFailed")));
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  /** 从台账打开某试卷进行校对 */
  async function openEditor(item: iGM_ExamAdminListItem): Promise<void> {
    setBusy(true);
    setNotice("");
    setMessage("");
    try {
      const exam = await iGM_Exam_FetchAdminDetail(item.id);
      setDraft(iGM_Exam_ToDraft(exam));
      setPreviewKey((k) => k + 1);
    } catch (err) {
      setMessage(iGM_Exam_ReadError(err, t("adminLedgerError")));
    } finally {
      setBusy(false);
    }
  }

  /** 保存校对字段（仅更新数据库，不删除原始文件） */
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
      contentMarkdown: draft.contentMarkdown,
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

  /** 二次确认后：删除原始文件并发布试卷 */
  async function confirmAndDelete(): Promise<void> {
    if (!draft) return;
    setBusy(true);
    setNotice("");
    setMessage("");
    try {
      await iGM_Exam_Confirm(draft.examId);
      const exam = await iGM_Exam_FetchAdminDetail(draft.examId);
      setDraft(iGM_Exam_ToDraft(exam));
      setConfirmOpen(false);
      setNotice(t("adminConfirmed"));
      await load();
    } catch (err) {
      setMessage(iGM_Exam_ReadError(err, t("adminConfirmFailed")));
    } finally {
      setBusy(false);
    }
  }

  /** 使用原始文件重新解析 */
  async function reparse(): Promise<void> {
    if (!draft) return;
    setBusy(true);
    setNotice("");
    setMessage("");
    try {
      await iGM_Exam_Reparse(draft.examId);
      const exam = await iGM_Exam_FetchAdminDetail(draft.examId);
      setDraft(iGM_Exam_ToDraft(exam));
      setPreviewKey((k) => k + 1);
      setNotice(t("adminReparsed"));
      await load();
    } catch (err) {
      setMessage(iGM_Exam_ReadError(err, t("adminReparseFailed")));
    } finally {
      setBusy(false);
    }
  }

  /** 删除试卷及关联文件 */
  async function remove(examId: string): Promise<void> {
    setBusy(true);
    setNotice("");
    setMessage("");
    try {
      await iGM_Exam_Delete(examId);
      setDraft((d) => (d && d.examId === examId ? null : d));
      setNotice(t("adminDeleted"));
      await load();
    } catch (err) {
      setMessage(iGM_Exam_ReadError(err, t("adminDeleteFailed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      {/* 页头 */}
      <header className={styles.head}>
        <p className={`igm-eyebrow ${styles.headEyebrow}`}>{t("adminEyebrow")}</p>
        <h1 className={`igm-serif ${styles.headTitle}`}>{t("adminTitle")}</h1>
        <p className={styles.headLead}>{t("adminLead")}</p>
      </header>

      {/* 上传区 */}
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
        <button
          type="button"
          className={styles.uploadBtn}
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
        >
          {busy ? (
            <Loader2 size={15} strokeWidth={1.8} className={styles.spin} />
          ) : (
            <FileUp size={15} strokeWidth={1.8} />
          )}
          <span className={`igm-mono ${styles.uploadLabel}`}>{t("adminUpload")}</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
          className={styles.hiddenInput}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleUpload(file);
          }}
        />
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
              className={`igm-mono ${styles.statusTag} ${styles[`ps_${draft.parseStatus}`]}`}
            >
              {t(iGM_Exam_ParseKeys[draft.parseStatus])}
            </span>
          </div>

          <div className={styles.reviewLayout}>
            {/* 左：原始文件预览 */}
            <div className={styles.pdfPane}>
              <p className={`igm-mono ${styles.paneLabel}`}>{t("adminPreviewLabel")}</p>
              {draft.hasOriginalFile ? (
                draft.fileType === "pdf" ? (
                  <iframe
                    key={previewKey}
                    className={styles.pdfFrame}
                    src={iGM_Exam_AbsoluteUrl(draft.fileApiPath)}
                    title={draft.fileName}
                  />
                ) : (
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
                )
              ) : (
                <p className={`igm-mono ${styles.previewDeleted}`}>
                  {t("adminPreviewDeleted")}
                </p>
              )}
            </div>

            {/* 右：规格表单 + 解析全文与预览 */}
            <div className={styles.formPane}>
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

                {/* 解析全文（可手动修订） */}
                <label className={styles.field}>
                  <span className={`igm-mono ${styles.fieldLabel}`}>
                    {t("adminFieldContent")}
                  </span>
                  <textarea
                    className={`${styles.textarea} ${styles.contentArea}`}
                    rows={12}
                    value={draft.contentMarkdown}
                    onChange={(e) =>
                      setDraft({ ...draft, contentMarkdown: e.target.value })
                    }
                    placeholder={t("adminPlaceholderContent")}
                    spellCheck={false}
                  />
                </label>

                <p className={`igm-mono ${styles.paneLabel}`}>{t("adminParseLabel")}</p>
                <div className={styles.previewBox}>
                  {draft.contentMarkdown.trim().length > 0 ? (
                    <IGM_ExamPaperView markdown={draft.contentMarkdown} showToc={false} />
                  ) : (
                    <p className={`igm-mono ${styles.previewEmpty}`}>
                      {t("detailNoContent")}
                    </p>
                  )}
                </div>

                {/* 操作组 */}
                <div className={styles.actions}>
                  <button type="submit" className={styles.primary} disabled={busy}>
                    <Save size={14} strokeWidth={1.8} />
                    <span className="igm-mono">{t("adminSave")}</span>
                  </button>
                  <button
                    type="button"
                    className={styles.confirm}
                    onClick={() => setConfirmOpen(true)}
                    disabled={busy || !draft.hasOriginalFile}
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
                    className={styles.delete}
                    onClick={() => void remove(draft.examId)}
                    disabled={busy}
                  >
                    <Trash2 size={14} strokeWidth={1.8} />
                    <span className="igm-mono">{t("adminDelete")}</span>
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
                  {item.title}
                </span>
                <span className={styles.cellSoft}>{item.subject || "—"}</span>
                <span className={`igm-mono ${styles.cellSoft}`}>
                  {item.totalScore === null ? "—" : `${item.totalScore}`}
                </span>
                <span className={`igm-mono ${styles.cellSoft}`}>
                  {String(item.submissionCount).padStart(3, "0")}
                </span>
                <span
                  className={`igm-mono ${styles.statusTag} ${styles[`st_${item.status}`]}`}
                >
                  {t(iGM_Exam_StatusKeys[item.status])}
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

      {/* 二次确认弹窗：删除原始文件不可恢复 */}
      {confirmOpen && draft && (
        <div className={styles.modalOverlay} role="presentation">
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-label={t("adminConfirmTitle")}
          >
            <h3 className={`igm-serif ${styles.modalTitle}`}>
              {t("adminConfirmTitle")}
            </h3>
            <p className={styles.modalBody}>{t("adminConfirmBody")}</p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancel}
                onClick={() => setConfirmOpen(false)}
                disabled={busy}
              >
                <span className="igm-mono">{t("adminConfirmNo")}</span>
              </button>
              <button
                type="button"
                className={styles.modalConfirm}
                onClick={() => void confirmAndDelete()}
                disabled={busy}
              >
                {busy ? (
                  <Loader2 size={14} strokeWidth={1.8} className={styles.spin} />
                ) : (
                  <ShieldCheck size={14} strokeWidth={1.8} />
                )}
                <span className="igm-mono">{t("adminConfirmYes")}</span>
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
