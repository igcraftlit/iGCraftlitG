/**
 * 文件路径：apps/exam/src/iGM_Pages/E_ExamDetail.tsx
 * 所属层：前端 / 页面层
 * 路由：E_ExamDetail（/detail?id=xxx）
 * 模块：iGM_ExamDetail
 * 作用：试卷详情页，实验记录表式元数据 + 实验计时器 + PDF.js 阅读器 + 盖章交卷
 * 内容：元数据记录表、右上固定计时器、阅读器主体、交卷区、加载/失败/缺失状态
 * 说明：静态导出下通过 useSearchParams 读取 id；由路由壳提供 Suspense 边界
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, RefreshCw } from "lucide-react";
import {
  iGM_Exam_BuildFileUrl,
  iGM_Exam_FetchDetail,
  iGM_ExamRequestError,
  type iGM_ExamDetail,
} from "../iGM_Services/iGM_ExamClient";
import { iGM_ExamReader as IGM_ExamReader } from "../iGM_Components/iGM_ExamReader/iGM_ExamReader";
import { iGM_ExamTimer as IGM_ExamTimer } from "../iGM_Components/iGM_ExamTimer/iGM_ExamTimer";
import { iGM_StampButton as IGM_StampButton } from "../iGM_Components/iGM_StampButton/iGM_StampButton";
import styles from "./E_ExamDetail.module.css";

// 类型定义 //
type iGM_Exam_DetailState = "loading" | "ready" | "error" | "missing";

/** 实验记录表字段 */
interface iGM_Exam_RecordField {
  label: string;
  value: string;
}

// 核心逻辑 //
/** 数值缺省占位 */
function iGM_Exam_Dash(value: number | null, suffix = ""): string {
  if (value === null || Number.isNaN(value)) return "—";
  return `${value}${suffix}`;
}

/** 试卷详情页 */
export function E_ExamDetail() {
  const params = useSearchParams();
  const examId = params.get("id") ?? "";

  const [exam, setExam] = useState<iGM_ExamDetail | null>(null);
  const [state, setState] = useState<iGM_Exam_DetailState>("loading");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!examId) {
      setState("missing");
      return;
    }
    setState("loading");
    setMessage("");
    try {
      const detail = await iGM_Exam_FetchDetail(examId);
      setExam(detail);
      setState("ready");
    } catch (err) {
      setMessage(
        err instanceof iGM_ExamRequestError
          ? err.message
          : "Unable to load the examination paper.",
      );
      setState("error");
    }
  }, [examId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state === "loading") {
    return (
      <main className={styles.page}>
        <p className={`igm-mono ${styles.state}`}>RETRIEVING RECORD…</p>
      </main>
    );
  }

  if (state === "missing" || state === "error" || !exam) {
    return (
      <main className={styles.page}>
        <div className={styles.errorBox}>
          <p className={`igm-mono ${styles.errorText}`}>
            {state === "missing"
              ? "No examination identifier provided."
              : message}
          </p>
          <div className={styles.errorActions}>
            {state === "error" && (
              <button type="button" className={styles.action} onClick={() => void load()}>
                <RefreshCw size={13} strokeWidth={1.8} />
                Retry
              </button>
            )}
            <Link href="/" className={styles.action}>
              <ArrowLeft size={13} strokeWidth={1.8} />
              Back to catalogue
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const fields: iGM_Exam_RecordField[] = [
    { label: "SUBJECT", value: exam.subject || "—" },
    { label: "ISSUER", value: exam.issuer || "—" },
    { label: "REVIEWER", value: exam.reviewer || "—" },
    { label: "DURATION", value: iGM_Exam_Dash(exam.duration, " min") },
    { label: "TOTAL MARKS", value: iGM_Exam_Dash(exam.totalScore, " pts") },
    { label: "ITEM COUNT", value: iGM_Exam_Dash(exam.questionCount) },
  ];

  return (
    <main className={styles.page}>
      {/* 返回 + 编号 */}
      <div className={styles.backRow}>
        <Link href="/" className={styles.back}>
          <ArrowLeft size={14} strokeWidth={1.8} />
          <span className={`igm-mono ${styles.backLabel}`}>CATALOGUE</span>
        </Link>
        <span className={`igm-mono ${styles.recordCode}`}>{exam.code}</span>
      </div>

      {/* 标题 */}
      <header className={styles.titleBlock}>
        <p className={`igm-eyebrow ${styles.titleEyebrow}`}>EXAMINATION RECORD</p>
        <h1 className={`igm-serif ${styles.title}`}>{exam.title}</h1>
      </header>

      {/* 实验记录表 + 计时器 */}
      <div className={styles.metaLayout}>
        <section className={`igm-double-rule ${styles.recordTable}`} aria-label="Examination metadata">
          <div className={styles.recordHead}>
            <span className={`igm-mono ${styles.recordHeadNum}`}>§ 1</span>
            <h2 className={`igm-serif ${styles.recordHeadTitle}`}>
              Record of Specifications
            </h2>
          </div>
          <dl className={styles.recordGrid}>
            {fields.map((field) => (
              <div key={field.label} className={styles.recordCell}>
                <dt className={`igm-mono ${styles.recordLabel}`}>{field.label}</dt>
                <dd className={`igm-serif ${styles.recordValue}`}>{field.value}</dd>
              </div>
            ))}
          </dl>
          {exam.notice && (
            <p className={styles.notice}>
              <span className={`igm-mono ${styles.noticeTag}`}>NOTICE</span>
              {exam.notice}
            </p>
          )}
        </section>

        <aside className={styles.timerAside}>
          <IGM_ExamTimer durationMinutes={exam.duration} />
        </aside>
      </div>

      {/* 阅读器 */}
      <section className={styles.readerSection} aria-label="Examination paper">
        <div className={styles.readerHead}>
          <span className={`igm-mono ${styles.readerNum}`}>§ 2</span>
          <h2 className={`igm-serif ${styles.readerTitle}`}>Paper Viewer</h2>
          <span className={`igm-mono ${styles.readerFile}`} title={exam.fileName}>
            {exam.fileName || "paper.pdf"}
          </span>
        </div>
        <IGM_ExamReader fileUrl={iGM_Exam_BuildFileUrl(exam.id)} />
      </section>

      {/* 交卷 */}
      <section className={styles.submitSection} aria-label="Submission">
        <div className={styles.submitHead}>
          <span className={`igm-mono ${styles.submitNum}`}>§ 3</span>
          <h2 className={`igm-serif ${styles.submitTitle}`}>Declaration of Submission</h2>
        </div>
        <p className={styles.submitLead}>
          By submitting, you confirm that this session has been completed. The
          record is stored for institutional review.
        </p>
        <IGM_StampButton examId={exam.id} />
      </section>
    </main>
  );
}

// 导出 //
export default E_ExamDetail;
