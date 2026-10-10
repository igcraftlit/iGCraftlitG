/**
 * 文件路径：apps/exam/src/iGM_Pages/E_Admin_Upload.tsx
 * 所属层：前端 / 页面层
 * 路由：E_Admin_Upload（/admin/upload）
 * 模块：iGM_ExamUpload
 * 作用：试卷上传页，仅接受 PDF（最大 50 MB），上传后轮询转换进度，
 *       展示「上传中 → 转换中 → 完成」阶段，转换完成自动跳转至校对预览
 * 内容：拖拽 / 选择文件区、阶段指示、转换进度条、错误提示、完成跳转
 * 说明：纯静态导出，客户端直连后端；文件名与大小在本地先校验；文案取自当前语言包
 */

// 导入依赖 //
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileText,
  Loader2,
  UploadCloud,
} from "lucide-react";
import {
  iGM_Exam_FetchProgress,
  iGM_Exam_FormatSizeMb,
  iGM_Exam_Upload,
  iGM_ExamRequestError,
  type iGM_ExamConvertProgress,
} from "../iGM_Services/iGM_ExamClient";
import { useI18n } from "../iGM_i18n/iGM_I18nContext";
import styles from "./E_Admin_Upload.module.css";

// 类型定义 //
/** 上传流程阶段 */
type iGM_Exam_UploadStage =
  | "idle"
  | "uploading"
  | "converting"
  | "completed"
  | "failed";

/** 单文件上限（字节） */
const iGM_Exam_MaxUploadBytes = 50 * 1024 * 1024;

/** 轮询间隔（毫秒） */
const iGM_Exam_UploadPollMs = 1500;

// 核心逻辑 //
/** 判定文件是否为 PDF（扩展名或 MIME） */
function iGM_Exam_IsPdf(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/** 非阻塞等待 */
function iGM_Exam_Sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 试卷上传页 */
export function iGM_ExamUploadPage() {
  const { t } = useI18n();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const aliveRef = useRef(true);

  const [stage, setStage] = useState<iGM_Exam_UploadStage>("idle");
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState<iGM_ExamConvertProgress | null>(null);
  const [examId, setExamId] = useState("");

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // 转换完成：短暂展示完成后自动跳转到校对预览（管理端携带 examId）
  useEffect(() => {
    if (stage !== "completed" || !examId) return;
    const timer = setTimeout(() => {
      router.push(`/admin?examId=${encodeURIComponent(examId)}`);
    }, 2000);
    return () => clearTimeout(timer);
  }, [stage, examId, router]);

  /** 上传并轮询转换进度 */
  async function handleFile(file: File): Promise<void> {
    setMessage("");
    setProgress(null);
    setExamId("");

    if (!iGM_Exam_IsPdf(file)) {
      setStage("failed");
      setMessage(t("uploadOnlyPdf"));
      return;
    }
    if (file.size > iGM_Exam_MaxUploadBytes) {
      setStage("failed");
      setMessage(t("uploadTooLarge"));
      return;
    }

    setFileName(file.name);
    setStage("uploading");

    let id = "";
    try {
      const exam = await iGM_Exam_Upload(file);
      if (!aliveRef.current) return;
      id = exam.id;
      setProgress(exam.convertProgress);
    } catch (err) {
      if (!aliveRef.current) return;
      setStage("failed");
      setMessage(
        err instanceof iGM_ExamRequestError ? err.message : t("uploadFailed"),
      );
      return;
    }

    setExamId(id);
    setStage("converting");

    // 轮询转换进度直至完成 / 失败（最多 10 分钟）
    const deadline = Date.now() + 10 * 60 * 1000;
    while (aliveRef.current && Date.now() < deadline) {
      await iGM_Exam_Sleep(iGM_Exam_UploadPollMs);
      if (!aliveRef.current) return;
      try {
        const p = await iGM_Exam_FetchProgress(id);
        if (!aliveRef.current) return;
        setProgress(p);
        if (p.status === "completed") {
          setStage("completed");
          return;
        }
        if (p.status === "failed") {
          setStage("failed");
          setMessage(p.error || t("uploadStageFailed"));
          return;
        }
      } catch {
        // 单次轮询失败不中断，继续下一轮
      }
    }
    if (aliveRef.current) {
      setStage("failed");
      setMessage(t("uploadFailed"));
    }
  }

  /** 选择文件后重置输入，允许重复选择同一文件 */
  function onPick(file: File | undefined): void {
    if (!file) return;
    void handleFile(file);
    if (inputRef.current) inputRef.current.value = "";
  }

  const percent = progress ? Math.min(100, Math.max(0, progress.percent)) : 0;
  const busy = stage === "uploading" || stage === "converting";
  // 转换产物占用空间（MB，保留一位小数）
  const sizeText = iGM_Exam_FormatSizeMb(progress?.fileSize ?? null);

  /** 阶段指示高亮状态 */
  function stepState(target: iGM_Exam_UploadStage): string {
    if (stage === "failed") {
      return target === "uploading" ? styles.stepFailed : "";
    }
    if (stage === "completed") return styles.stepDone;
    if (stage === target) return styles.stepActive;
    if (target === "uploading" && stage === "converting") return styles.stepDone;
    return "";
  }

  return (
    <main className={styles.page}>
      {/* 页头 */}
      <header className={styles.head}>
        <p className={`igm-eyebrow ${styles.headEyebrow}`}>{t("uploadEyebrow")}</p>
        <h1 className={`igm-serif ${styles.headTitle}`}>{t("uploadTitle")}</h1>
        <p className={styles.headLead}>{t("uploadLead")}</p>
      </header>

      {/* 拖拽 / 选择区 */}
      <section
        className={`igm-double-rule ${styles.dropzone} ${
          dragging ? styles.dropzoneActive : ""
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (busy) return;
          onPick(e.dataTransfer.files?.[0]);
        }}
      >
        <UploadCloud size={34} strokeWidth={1.5} className={styles.dropIcon} />
        <p className={`igm-mono ${styles.dropHint}`}>{t("uploadDropHint")}</p>
        <button
          type="button"
          className={styles.pickBtn}
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          {busy ? (
            <Loader2 size={15} strokeWidth={1.8} className={styles.spin} />
          ) : (
            <FileText size={15} strokeWidth={1.8} />
          )}
          <span className={`igm-mono ${styles.pickLabel}`}>{t("uploadPick")}</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className={styles.hiddenInput}
          onChange={(e) => onPick(e.target.files?.[0])}
        />
      </section>

      {/* 阶段 + 进度 */}
      {(stage !== "idle" || fileName) && (
        <section className={styles.stageBox} aria-label={t("uploadStageConvert")}>
          <div className={styles.stageSteps}>
            <span className={`igm-mono ${styles.step} ${stepState("uploading")}`}>
              {t("uploadStageUpload")}
            </span>
            <ArrowRight size={13} strokeWidth={1.8} className={styles.stepArrow} />
            <span className={`igm-mono ${styles.step} ${stepState("converting")}`}>
              {t("uploadStageConvert")}
            </span>
            <ArrowRight size={13} strokeWidth={1.8} className={styles.stepArrow} />
            <span className={`igm-mono ${styles.step} ${stepState("completed")}`}>
              {t("uploadStageDone")}
            </span>
          </div>

          {fileName && (
            <p className={`igm-mono ${styles.fileName}`} title={fileName}>
              {fileName}
            </p>
          )}

          {busy && (
            <>
              <div className={styles.progressTrack}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${stage === "uploading" ? 10 : Math.max(percent, 40)}%` }}
                />
              </div>
              <p className={`igm-mono ${styles.note}`}>
                {stage === "uploading"
                  ? t("uploadStageUpload")
                  : t("adminProgressConverting")}
              </p>
            </>
          )}

          {stage === "completed" && (
            <p className={`igm-mono ${styles.noteOk}`}>
              <CheckCircle2 size={14} strokeWidth={1.8} />
              {t("adminProgressDone")}
            </p>
          )}

          {stage === "completed" && sizeText && (
            <p className={`igm-mono ${styles.sizeNote}`}>
              {t("fileSizeValue", { size: sizeText })}
            </p>
          )}

          {stage === "failed" && (
            <p className={`igm-mono ${styles.noteError}`}>
              <AlertCircle size={14} strokeWidth={1.8} />
              {message || t("uploadStageFailed")}
            </p>
          )}

          {stage === "failed" && (
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.retryBtn}
                onClick={() => {
                  setStage("idle");
                  setMessage("");
                  setProgress(null);
                  setFileName("");
                  inputRef.current?.click();
                }}
              >
                <UploadCloud size={14} strokeWidth={1.8} />
                <span className="igm-mono">{t("uploadRetry")}</span>
              </button>
            </div>
          )}

          {stage === "completed" && examId && (
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.openBtn}
                onClick={() => router.push(`/admin?examId=${encodeURIComponent(examId)}`)}
              >
                <ArrowRight size={14} strokeWidth={1.8} />
                <span className="igm-mono">{t("uploadOpenPreview")}</span>
              </button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

// 导出 //
export default iGM_ExamUploadPage;