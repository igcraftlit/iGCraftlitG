/**
 * 文件路径：apps/exam/src/iGM_Pages/E_Admin_Exam.tsx
 * 所属层：前端 / 页面层
 * 路由：E_Admin_Exam（/admin）
 * 模块：iGM_ExamAdmin
 * 作用：试卷管理端，上传文档后后台解析（带实时进度条）、左右分栏校对（左原始文件预览、
 *       右结构化内容块编辑）、保存草稿 / 重新解析 / 确认并发布（删除原文件）/ 放弃
 * 内容：上传区、解析进度条、校对区（原始文件预览 + 规格表单 + 结构化块编辑器）、
 *       二次确认弹窗（发布 / 放弃）、试卷台账
 * 说明：本模块暂不做权限校验；解析在后台执行，前端轮询进度接口；
 *       原始文件先保留，确认发布或放弃时才删除；文案取自当前语言包
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
  iGM_Exam_Upload,
  iGM_ExamRequestError,
  type iGM_ExamAdminListItem,
  type iGM_ExamBlock,
  type iGM_ExamDetail,
  type iGM_ExamParseProgress,
  type iGM_ExamParseStatus,
  type iGM_ExamStatus,
  type iGM_ExamUpdateInput,
} from "../iGM_Services/iGM_ExamClient";
import { iGM_ExamBlockView as IGM_ExamBlockView } from "../iGM_Components/iGM_ExamBlockView/iGM_ExamBlockView";
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
  contentBlocks: iGM_ExamBlock[];
  imageApiBase: string;
  parseProgress: iGM_ExamParseProgress;
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
  parsing: "parseStatusParsing",
  parsed: "parseStatusParsed",
  confirmed: "parseStatusConfirmed",
  failed: "parseStatusFailed",
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
    contentBlocks: exam.contentBlocks,
    imageApiBase: exam.imageApiBase,
    parseProgress: exam.parseProgress,
    status: exam.status,
    parseStatus: exam.parseStatus,
    hasOriginalFile: exam.hasOriginalFile,
    fileApiPath: exam.fileApiPath,
    fileType: exam.fileType,
    fileName: exam.fileName,
  };
}

/** 解析进度条（上传 / 重新解析后实时更新） */
function iGM_Exam_ProgressBox({
  progress,
}: {
  progress: iGM_ExamParseProgress;
}) {
  const { t } = useI18n();
  const percent = Math.min(100, Math.max(0, progress.percent));
  const waiting = progress.totalPages === 0;
  const failed = progress.status === "failed";
  const done = progress.status === "parsed" || progress.status === "confirmed";

  return (
    <div className={`igm-double-rule ${styles.progressBox}`}>
      <div className={styles.progressHead}>
        <span className={`igm-mono ${styles.progressLabel}`}>
          {t("adminProgressTitle")}
        </span>
        <span className={`igm-mono ${styles.progressValue}`}>
          {done ? "100%" : `${percent}%`}
        </span>
      </div>
      <div className={styles.progressTrack}>
        <div
          className={`${styles.progressFill} ${failed ? styles.progressFillFailed : ""}`}
          style={{ width: `${done ? 100 : percent}%` }}
        />
      </div>
      <p className={`igm-mono ${failed ? styles.progressNoteError : styles.progressNote}`}>
        {failed
          ? `${t("adminProgressFailed")}${progress.error ? `：${progress.error}` : ""}`
          : done
            ? t("adminProgressDone", { blocks: progress.blockCount })
            : waiting
              ? t("adminProgressWaiting")
              : t("adminProgressPages", {
                  parsed: progress.parsedPages,
                  total: progress.totalPages,
                })}
      </p>
    </div>
  );
}

// JSX 组件标识要求首字母大写，此处按既有约定提供别名
const IGM_Exam_ProgressBox = iGM_Exam_ProgressBox;

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

  // 解析中：轮询进度接口，完成后回填内容块并刷新台账
  const parsingExamId = draft?.parseStatus === "parsing" ? draft.examId : null;
  useEffect(() => {
    if (!parsingExamId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async (): Promise<void> => {
      try {
        const progress = await iGM_Exam_FetchProgress(parsingExamId);
        if (cancelled) return;
        setDraft((d) =>
          d ? { ...d, parseStatus: progress.status, parseProgress: progress } : d,
        );
        if (progress.status !== "parsing" && progress.status !== "pending") {
          // 解析结束：回填内容块与识别字段
          await refreshDraft(parsingExamId);
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
  }, [parsingExamId, refreshDraft, load]);

  /** 上传文档：后台解析并进入校对 */
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
      await refreshDraft(item.id);
    } catch (err) {
      setMessage(iGM_Exam_ReadError(err, t("adminLedgerError")));
    } finally {
      setBusy(false);
    }
  }

  /** 保存草稿（元数据 + 结构化内容块，不删除原始文件） */
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
      contentBlocks: draft.contentBlocks,
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
        contentBlocks: draft.contentBlocks,
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

  /** 使用原始文件重新解析 */
  async function reparse(): Promise<void> {
    if (!draft) return;
    setBusy(true);
    setNotice("");
    setMessage("");
    try {
      await iGM_Exam_Reparse(draft.examId);
      const progress = await iGM_Exam_FetchProgress(draft.examId);
      setDraft((d) =>
        d ? { ...d, parseStatus: progress.status, parseProgress: progress } : d,
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

  /** 二次确认后：放弃本次试卷，删除原始文件与解析内容 */
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

  const isParsing = draft?.parseStatus === "parsing" || draft?.parseStatus === "pending";
  const canConfirm = Boolean(draft) && !isParsing && draft!.contentBlocks.length > 0;

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

            {/* 右：解析进度 + 规格表单 + 结构化内容块 */}
            <div className={styles.formPane}>
              {/* 解析进度条 */}
              {(isParsing || draft.parseStatus === "failed") && (
                <IGM_Exam_ProgressBox progress={draft.parseProgress} />
              )}
              {isParsing && (
                <p className={`igm-mono ${styles.progressNote}`}>
                  {t("adminParsingBanner")}
                </p>
              )}
              {draft.parseStatus === "parsed" && (
                <p className={`igm-mono ${styles.progressNote}`}>
                  {t("adminProgressDone", { blocks: draft.contentBlocks.length })}
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

                {/* 结构化内容块（可编辑、调整、删除） */}
                <p className={`igm-mono ${styles.paneLabel}`}>{t("adminFieldContent")}</p>
                <div className={styles.previewBox}>
                  <IGM_ExamBlockView
                    blocks={draft.contentBlocks}
                    imageBase={draft.imageApiBase}
                    editable
                    onChange={(blocks) => setDraft((d) => (d ? { ...d, contentBlocks: blocks } : d))}
                  />
                </div>

                {/* 操作组 */}
                <div className={styles.actions}>
                  <button type="submit" className={styles.primary} disabled={busy || isParsing}>
                    <Save size={14} strokeWidth={1.8} />
                    <span className="igm-mono">{t("adminSave")}</span>
                  </button>
                  <button
                    type="button"
                    className={styles.confirm}
                    onClick={() => setModal("confirm")}
                    disabled={busy || !canConfirm || !draft.hasOriginalFile}
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
                  className={`igm-mono ${styles.statusTag} ${styles[`ps_${item.parseStatus}`]}`}
                >
                  {t(iGM_Exam_ParseKeys[item.parseStatus])}
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

      {/* 二次确认弹窗：发布（删除原文件）/ 放弃 */}
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