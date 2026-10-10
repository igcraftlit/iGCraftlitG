/**
 * 文件路径：apps/exam/src/iGM_Pages/E_ExamDetail.tsx
 * 所属层：前端 / 页面层
 * 路由：E_ExamDetail（/detail?id=xxx）
 * 模块：iGM_ExamDetail
 * 作用：试卷详情页，规格记录表 + 转换后 HTML 高保真预览（A4 版面 iframe + 缩放）+ 实验计时器 + 盖章交卷
 * 内容：顶部信息栏（题数 / 限时 / 总分）、规格信息表、右上固定计时器、
 *       试卷预览（按真实页宽适配、默认适应宽度 / 手动缩放）、占用空间、交卷区、加载/失败/缺失状态
 * 说明：静态导出下通过 useSearchParams 读取 id；由路由壳提供 Suspense 边界；
 *       正文直接内嵌 pdf2htmlEX 生成的 HTML（自带分页与原始排版）；文案取自当前语言包
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Maximize2, RefreshCw, ZoomIn, ZoomOut } from "lucide-react";
import {
  iGM_Exam_FormatSizeMb,
  iGM_ExamRequestError,
} from "../iGM_Services/iGM_ExamClient";
import {
  iGM_Exam_FetchStaticDetail,
  type iGM_ExamStaticDetail,
} from "../iGM_Services/iGM_ExamStaticClient";
import { iGM_ExamTimer as IGM_ExamTimer } from "../iGM_Components/iGM_ExamTimer/iGM_ExamTimer";
import { iGM_StampButton as IGM_StampButton } from "../iGM_Components/iGM_StampButton/iGM_StampButton";
import { useI18n } from "../iGM_i18n/iGM_I18nContext";
import styles from "./E_ExamDetail.module.css";

// 类型定义 //
type iGM_Exam_DetailState = "loading" | "ready" | "error" | "missing";

/** 规格记录表字段 */
interface iGM_Exam_RecordField {
  label: string;
  value: string;
}

/** A4 版面回退尺寸（210 × 297 mm，按 96 DPI 折算为像素），后端未上报页尺寸时使用 */
const iGM_Exam_A4Width = 794;
const iGM_Exam_A4Height = 1123;

/** 试卷预览版面最大宽度（居中显示，避免两侧留白过大） */
const iGM_Exam_MaxSheetWidth = 900;

/** 缩放区间与步长 */
const iGM_Exam_MinZoom = 0.35;
const iGM_Exam_MaxZoom = 2;
const iGM_Exam_ZoomStep = 0.1;

/** 空值占位符 */
const iGM_Exam_Empty = "--";

// 核心逻辑 //
/** 数值统计文本：空值显示占位符，否则数值 + 单位 */
function iGM_Exam_StatValue(value: number | null, suffix = ""): string {
  if (value === null || !Number.isFinite(value)) return iGM_Exam_Empty;
  return `${value}${suffix}`;
}

/** 试卷详情页 */
export function E_ExamDetail() {
  const params = useSearchParams();
  const { t } = useI18n();
  const examId = params.get("id") ?? "";

  const [exam, setExam] = useState<iGM_ExamStaticDetail | null>(null);
  const [state, setState] = useState<iGM_Exam_DetailState>("loading");
  const [message, setMessage] = useState("");
  const [zoom, setZoom] = useState(1);
  const stageRef = useRef<HTMLDivElement | null>(null);

  // 版面基准尺寸：优先使用后端上报的真实 PDF 页尺寸，回退 A4
  const sheetWidth =
    exam?.pageWidth && exam.pageWidth > 0 ? exam.pageWidth : iGM_Exam_A4Width;
  const sheetHeight =
    exam?.pageHeight && exam.pageHeight > 0 ? exam.pageHeight : iGM_Exam_A4Height;

  /**
   * 按可用宽度计算「适应宽度」缩放
   * 预留 stage 左右内边距与边框（约 24px），并封顶 100%（不放大），
   * 确保默认视图下版面宽度不超过可视区，只保留纵向滚动
   */
  const iGM_Exam_FitZoom = useCallback((): number => {
    const el = stageRef.current;
    const available = el ? el.clientWidth : iGM_Exam_MaxSheetWidth;
    const target = Math.min(available - 24, iGM_Exam_MaxSheetWidth);
    const raw = target / sheetWidth;
    return Math.min(1, Math.max(iGM_Exam_MinZoom, raw));
  }, [sheetWidth]);

  const load = useCallback(async () => {
    if (!examId) {
      setState("missing");
      return;
    }
    setState("loading");
    setMessage("");
    try {
      const detail = await iGM_Exam_FetchStaticDetail(examId);
      setExam(detail);
      setState("ready");
    } catch (err) {
      // 静态数据缺失（404）视为试卷不存在；其余保留具体提示，无提示时回落语言包文案
      if (err instanceof iGM_ExamRequestError && err.code === 404) {
        setState("missing");
        return;
      }
      setMessage(err instanceof iGM_ExamRequestError ? err.message : "");
      setState("error");
    }
  }, [examId]);

  useEffect(() => {
    void load();
  }, [load]);

  // 试卷预览可用时：默认适应屏幕宽度，并在窗口尺寸变化时重新适配
  const hasPreview = Boolean(exam?.htmlPath);
  useEffect(() => {
    if (!hasPreview) return;
    setZoom(iGM_Exam_FitZoom());
    const onResize = (): void => setZoom(iGM_Exam_FitZoom());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [hasPreview, iGM_Exam_FitZoom]);

  /** 手动缩放（限制在缩放区间内） */
  function iGM_Exam_ZoomBy(delta: number): void {
    setZoom((current) =>
      Math.min(
        iGM_Exam_MaxZoom,
        Math.max(iGM_Exam_MinZoom, Number((current + delta).toFixed(2))),
      ),
    );
  }

  if (state === "loading") {
    return (
      <main className={styles.page}>
        <p className={`igm-mono ${styles.state}`}>{t("detailRetrieving")}</p>
      </main>
    );
  }

  if (state === "missing" || state === "error" || !exam) {
    return (
      <main className={styles.page}>
        <div className={styles.errorBox}>
          <p className={`igm-mono ${styles.errorText}`}>
            {state === "missing" ? t("detailMissing") : message || t("detailError")}
          </p>
          <div className={styles.errorActions}>
            {state === "error" && (
              <button type="button" className={styles.action} onClick={() => void load()}>
                <RefreshCw size={13} strokeWidth={1.8} />
                {t("actionRetry")}
              </button>
            )}
            <Link href="/" className={styles.action}>
              <ArrowLeft size={13} strokeWidth={1.8} />
              {t("detailBack")}
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // 顶部信息栏：题数 / 限时 / 总分（空值显示占位符）
  const stats: iGM_Exam_RecordField[] = [
    { label: t("cardItems"), value: iGM_Exam_StatValue(exam.questionCount, t("unitQuestions")) },
    { label: t("statDuration"), value: iGM_Exam_StatValue(exam.duration, t("unitMinutes")) },
    { label: t("cardTotal"), value: iGM_Exam_StatValue(exam.totalScore, t("unitPoints")) },
  ];

  const fields: iGM_Exam_RecordField[] = [
    { label: t("fieldSubject"), value: exam.subject || iGM_Exam_Empty },
    { label: t("fieldIssuer"), value: exam.issuer || iGM_Exam_Empty },
    { label: t("fieldReviewer"), value: exam.reviewer || iGM_Exam_Empty },
    { label: t("fieldDuration"), value: iGM_Exam_StatValue(exam.duration, t("unitMinutes")) },
    { label: t("fieldTotalMarks"), value: iGM_Exam_StatValue(exam.totalScore, t("unitPoints")) },
    { label: t("fieldItemCount"), value: iGM_Exam_StatValue(exam.questionCount, t("unitQuestions")) },
  ];

  // 转换产物占用空间（MB，保留一位小数）
  const sizeText = iGM_Exam_FormatSizeMb(exam.fileSize);

  return (
    <main className={styles.page}>
      {/* 返回 + 编号 */}
      <div className={styles.backRow}>
        <Link href="/" className={styles.back}>
          <ArrowLeft size={14} strokeWidth={1.8} />
          <span className={`igm-mono ${styles.backLabel}`}>{t("detailCatalogue")}</span>
        </Link>
        <span className={`igm-mono ${styles.recordCode}`}>{exam.code}</span>
      </div>

      {/* 标题 */}
      <header className={styles.titleBlock}>
        <p className={`igm-eyebrow ${styles.titleEyebrow}`}>{t("detailEyebrow")}</p>
        <h1 className={`igm-serif ${styles.title}`}>{exam.title}</h1>
      </header>

      {/* 顶部信息栏：题数 / 限时 / 总分 */}
      <div className={styles.statStrip}>
        {stats.map((stat) => (
          <div key={stat.label} className={styles.statItem}>
            <span className={`igm-mono ${styles.statLabel}`}>{stat.label}</span>
            <span className={`igm-serif ${styles.statValue}`}>{stat.value}</span>
          </div>
        ))}
      </div>

      {/* 规格记录表 + 计时器 */}
      <div className={styles.metaLayout}>
        <section
          className={`igm-double-rule ${styles.recordTable}`}
          aria-label={t("detailSpecTitle")}
        >
          <div className={styles.recordHead}>
            <span className={`igm-mono ${styles.recordHeadNum}`}>§ 1</span>
            <h2 className={`igm-serif ${styles.recordHeadTitle}`}>
              {t("detailSpecTitle")}
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
              <span className={`igm-mono ${styles.noticeTag}`}>{t("noticeTag")}</span>
              {exam.notice}
            </p>
          )}
        </section>

        <aside className={styles.timerAside}>
          <IGM_ExamTimer durationMinutes={exam.duration} />
        </aside>
      </div>

      {/* 试卷正文（pdf2htmlEX 转换后的高保真 HTML，A4 版面） */}
      <section className={styles.paperSection} aria-label={t("detailPaperTitle")}>
        <div className={styles.paperHead}>
          <span className={`igm-mono ${styles.paperNum}`}>§ 2</span>
          <h2 className={`igm-serif ${styles.paperTitle}`}>{t("detailPaperTitle")}</h2>
          {exam.htmlPath && (
            <div className={styles.zoomBar}>
              <button
                type="button"
                className={styles.zoomBtn}
                onClick={() => iGM_Exam_ZoomBy(-iGM_Exam_ZoomStep)}
                aria-label={t("paperZoomOut")}
                title={t("paperZoomOut")}
              >
                <ZoomOut size={14} strokeWidth={1.8} />
              </button>
              <button
                type="button"
                className={styles.zoomBtn}
                onClick={() => setZoom(iGM_Exam_FitZoom())}
                aria-label={t("paperZoomFit")}
                title={t("paperZoomFit")}
              >
                <Maximize2 size={14} strokeWidth={1.8} />
                <span className="igm-mono">{t("paperZoomFit")}</span>
              </button>
              <button
                type="button"
                className={styles.zoomBtn}
                onClick={() => iGM_Exam_ZoomBy(iGM_Exam_ZoomStep)}
                aria-label={t("paperZoomIn")}
                title={t("paperZoomIn")}
              >
                <ZoomIn size={14} strokeWidth={1.8} />
              </button>
              <span className={`igm-mono ${styles.zoomValue}`}>
                {Math.round(zoom * 100)}%
              </span>
            </div>
          )}
        </div>
        {exam.htmlPath ? (
          <>
            <div className={styles.paperMeta}>
              <p className={`igm-mono ${styles.paperHint}`}>{t("detailPreviewHint")}</p>
              {sizeText && (
                <span className={`igm-mono ${styles.paperSize}`}>
                  {t("fileSizeValue", { size: sizeText })}
                </span>
              )}
            </div>
            <div className={styles.paperStage} ref={stageRef}>
              <div
                className={styles.paperSheet}
                style={
                  {
                    "--igm-zoom": zoom,
                    "--igm-page-w": `${sheetWidth}px`,
                    "--igm-page-h": `${sheetHeight}px`,
                  } as CSSProperties
                }
              >
                <iframe
                  key={exam.htmlPath}
                  className={styles.htmlFrame}
                  src={exam.htmlPath}
                  title={exam.title || exam.fileName}
                />
              </div>
            </div>
          </>
        ) : (
          <p className={`igm-mono ${styles.paperEmpty}`}>{t("detailNoContent")}</p>
        )}
      </section>

      {/* 交卷 */}
      <section className={styles.submitSection} aria-label={t("detailSubmitTitle")}>
        <div className={styles.submitHead}>
          <span className={`igm-mono ${styles.submitNum}`}>§ 3</span>
          <h2 className={`igm-serif ${styles.submitTitle}`}>{t("detailSubmitTitle")}</h2>
        </div>
        <p className={styles.submitLead}>{t("detailSubmitLead")}</p>
        <IGM_StampButton examId={exam.id} />
      </section>
    </main>
  );
}

// 导出 //
export default E_ExamDetail;
