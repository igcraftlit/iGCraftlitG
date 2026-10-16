/**
 * 文件路径：apps/exam/src/iGM_Pages/E_ExamDetail.tsx
 * 所属层：前端 / 页面层
 * 路由：E_ExamDetail（/detail?id=xxx）
 * 模块：iGM_ExamDetail
 * 作用：试卷详情页，规格记录表 + 转换后 HTML 高保真预览（A4 版面 iframe + 缩放 / 全屏浏览）+ 实验计时器 + 盖章交卷
 * 内容：顶部信息栏（题数 / 限时 / 总分）、规格信息表、右上固定计时器、
 *       试卷预览（按真实页宽适配、默认适应宽度 / 手动缩放 / 全屏浏览覆盖层）、占用空间、交卷区、加载/失败/缺失状态
 * 说明：静态导出下通过 useSearchParams 读取 id；由路由壳提供 Suspense 边界；
 *       正文直接内嵌 pdf2htmlEX 生成的 HTML（自带分页与原始排版）；文案取自当前语言包；
 *       全屏浏览以 fixed 覆盖层复用同一 iframe 与 zoom 状态，进入时锁定 body 滚动、ESC / 按钮退出
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  Maximize2,
  Minimize2,
  RefreshCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
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

/** 「适应宽度」时预留的舞台左右内边距与边框（约 24px），避免版面贴边 */
const iGM_Exam_StageGutter = 24;

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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const fullscreenStageRef = useRef<HTMLDivElement | null>(null);

  // 版面基准尺寸：优先使用后端上报的真实 PDF 页尺寸，回退 A4
  const sheetWidth =
    exam?.pageWidth && exam.pageWidth > 0 ? exam.pageWidth : iGM_Exam_A4Width;
  const sheetHeight =
    exam?.pageHeight && exam.pageHeight > 0 ? exam.pageHeight : iGM_Exam_A4Height;

  /**
   * 按可用宽度计算「适应宽度」缩放
   * @param target 计算基准元素（普通视图取试卷舞台，全屏取覆盖层舞台）
   * @param allowScaleUp 是否允许放大超过 100%（全屏下按覆盖层宽度自适应）
   * 普通视图预留左右内边距并封顶 100%，保证版面不超出可视区、只保留纵向滚动；
   * 全屏视图按覆盖层可用宽度自适应，允许放大以填满宽度（仍受 MaxZoom 上限约束）。
   * 注意：「适应宽度」刻意不受手动最小缩放（MinZoom）约束——MinZoom 只限制手动按钮；
   * 窄屏上真实适配比例可能低于 MinZoom，若一并下钳会被抬高，版面因而宽于屏幕、右侧被裁切；
   * 此处仅保留 0.1 的安全下限，避免容器宽度退化（0 / NaN）导致缩放失效。
   */
  const iGM_Exam_FitZoom = useCallback(
    (target: HTMLElement | null, allowScaleUp: boolean): number => {
      const el = target ?? stageRef.current;
      const available = el ? el.clientWidth : iGM_Exam_MaxSheetWidth;
      const usable = available - iGM_Exam_StageGutter;
      const base = allowScaleUp ? usable : Math.min(usable, iGM_Exam_MaxSheetWidth);
      const raw = base / sheetWidth;
      const capped = allowScaleUp ? raw : Math.min(1, raw);
      return Number(Math.min(iGM_Exam_MaxZoom, Math.max(0.1, capped)).toFixed(3));
    },
    [sheetWidth],
  );

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

  // 试卷预览可用时：按当前激活容器（普通 / 全屏）默认适应宽度，窗口尺寸变化时重算
  const hasPreview = Boolean(exam?.htmlPath);
  useEffect(() => {
    if (!hasPreview) return;
    const fitActive = (): void => {
      setZoom(
        isFullscreen
          ? iGM_Exam_FitZoom(fullscreenStageRef.current, true)
          : iGM_Exam_FitZoom(stageRef.current, false),
      );
    };
    fitActive();
    window.addEventListener("resize", fitActive);
    return () => window.removeEventListener("resize", fitActive);
  }, [hasPreview, isFullscreen, iGM_Exam_FitZoom]);

  // 全屏浏览：锁定 body 滚动并监听 ESC 退出；退出时恢复原滚动状态与监听
  useEffect(() => {
    if (!isFullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isFullscreen]);

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

  // 答案附件展示用文件名（取静态地址最后一段）
  const answerFileName = exam.answerPdfUrl
    ? decodeURIComponent(exam.answerPdfUrl.split("/").pop() ?? "")
    : "";

  // 是否允许舞台横向拖动：仅当手动放大超过当前「适应宽度」比例时（含很小容差），
  // 适应宽度及以下锁定横向溢出，避免窄屏版面宽于屏幕、右侧被裁切
  const isPannable =
    zoom >
    iGM_Exam_FitZoom(
      isFullscreen ? fullscreenStageRef.current : stageRef.current,
      isFullscreen,
    ) +
      0.01;

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
                onClick={() => setZoom(iGM_Exam_FitZoom(stageRef.current, false))}
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
              <button
                type="button"
                className={styles.zoomBtn}
                onClick={() => setIsFullscreen((current) => !current)}
                aria-label={isFullscreen ? t("detailFullscreenExit") : t("detailFullscreen")}
                title={isFullscreen ? t("detailFullscreenExit") : t("detailFullscreen")}
              >
                {isFullscreen ? (
                  <Minimize2 size={14} strokeWidth={1.8} />
                ) : (
                  <Maximize2 size={14} strokeWidth={1.8} />
                )}
                <span className="igm-mono">
                  {isFullscreen ? t("detailFullscreenExit") : t("detailFullscreen")}
                </span>
              </button>
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
            <div
              className={
                isPannable
                  ? `${styles.paperStage} ${styles.isPannable}`
                  : styles.paperStage
              }
              ref={stageRef}
            >
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

      {/* 参考答案（仅在命题方上传后展示） */}
      {exam.answerPdfUrl && (
        <section className={styles.answerSection} aria-label={t("answerSectionTitle")}>
          <div className={styles.answerHead}>
            <span className={`igm-mono ${styles.answerNum}`}>§ 3</span>
            <h2 className={`igm-serif ${styles.answerTitle}`}>
              {t("answerSectionTitle")}
            </h2>
          </div>
          <div className={styles.answerBody}>
            <p className={`igm-mono ${styles.answerFile}`}>{answerFileName}</p>
            <p className={styles.answerLead}>{t("answerSectionLead")}</p>
            <a
              className={styles.answerBtn}
              href={exam.answerPdfUrl}
              target="_blank"
              rel="noreferrer"
            >
              <FileText size={14} strokeWidth={1.8} />
              <span className="igm-mono">{t("answerView")}</span>
            </a>
          </div>
        </section>
      )}

      {/* 交卷 */}
      <section className={styles.submitSection} aria-label={t("detailSubmitTitle")}>
        <div className={styles.submitHead}>
          <span className={`igm-mono ${styles.submitNum}`}>
            {exam.answerPdfUrl ? "§ 4" : "§ 3"}
          </span>
          <h2 className={`igm-serif ${styles.submitTitle}`}>{t("detailSubmitTitle")}</h2>
        </div>
        <p className={styles.submitLead}>{t("detailSubmitLead")}</p>
        <IGM_StampButton examId={exam.id} />
      </section>

      {/* 全屏浏览覆盖层：复用同一试卷 iframe 与 zoom 状态，仅当存在正文时可用 */}
      {exam.htmlPath && isFullscreen && (
        <div
          className={styles.fullscreenOverlay}
          role="dialog"
          aria-modal="true"
          aria-label={t("detailPaperTitle")}
        >
          <div className={styles.fullscreenBar}>
            <span className={`igm-mono ${styles.fullscreenTitle}`}>
              {t("detailPaperTitle")}
            </span>
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
                onClick={() =>
                  setZoom(iGM_Exam_FitZoom(fullscreenStageRef.current, true))
                }
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
              <button
                type="button"
                className={styles.zoomBtn}
                onClick={() => setIsFullscreen(false)}
                aria-label={t("detailFullscreenExit")}
                title={t("detailFullscreenExit")}
              >
                <Minimize2 size={14} strokeWidth={1.8} />
                <span className="igm-mono">{t("detailFullscreenExit")}</span>
              </button>
            </div>
          </div>
          <div
            className={
              isPannable
                ? `${styles.fullscreenStage} ${styles.isPannable}`
                : styles.fullscreenStage
            }
            ref={fullscreenStageRef}
          >
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
        </div>
      )}
    </main>
  );
}

// 导出 //
export default E_ExamDetail;
