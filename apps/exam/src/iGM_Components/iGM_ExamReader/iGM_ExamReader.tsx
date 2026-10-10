/**
 * 文件路径：apps/exam/src/iGM_Components/iGM_ExamReader/iGM_ExamReader.tsx
 * 所属层：前端 / 通用组件层
 * 路由：E_ExamDetail（/detail）、E_Admin_Exam（/admin）
 * 模块：iGM_ExamReader
 * 作用：PDF.js 试卷阅读器，模拟"放大镜 + 页码转盘"的仪器感浏览体验
 * 内容：canvas 渲染、翻页、缩放（放大镜刻度）、全屏、页码转盘导航、纸张质感底衬
 * 说明：纯客户端组件；禁止下载导出，仅站内展示；文案取自当前语言包
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useI18n } from "../../iGM_i18n/iGM_I18nContext";
import styles from "./iGM_ExamReader.module.css";

// 类型定义 //
interface iGM_ExamReaderProps {
  /** PDF 文件地址 */
  fileUrl: string;
  /** 阅读器高度（CSS 值），缺省使用视口自适应 */
  height?: string;
  /** 紧凑模式（管理端用小型预览） */
  compact?: boolean;
  /** 最多可浏览的页数（管理端校对仅预览前 3 页） */
  maxPages?: number;
}

// 核心逻辑 //
/** PDF 缩放档位 */
const iGM_Exam_ZoomSteps = [0.6, 0.75, 0.9, 1, 1.25, 1.5, 1.85, 2.25, 2.75];

/** 试卷 PDF 阅读器 */
export function iGM_ExamReader({
  fileUrl,
  height,
  compact = false,
  maxPages,
}: iGM_ExamReaderProps) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(1);
  const [zoomIndex, setZoomIndex] = useState(3);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const zoom = iGM_Exam_ZoomSteps[zoomIndex];

  // 加载文档
  useEffect(() => {
    let disposed = false;
    setLoading(true);
    setFailed(false);
    setPage(1);

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const task = pdfjs.getDocument({ url: fileUrl });
        const doc = await task.promise;
        if (disposed) {
          await doc.destroy();
          return;
        }
        docRef.current = doc;
        setPageCount(maxPages ? Math.min(maxPages, doc.numPages) : doc.numPages);
        setLoading(false);
      } catch {
        if (!disposed) {
          setFailed(true);
          setLoading(false);
        }
      }
    })();

    return () => {
      disposed = true;
      renderTaskRef.current?.cancel();
      docRef.current?.destroy();
      docRef.current = null;
    };
  }, [fileUrl, maxPages]);

  // 渲染当前页
  const renderPage = useCallback(async () => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas) return;

    const pdfPage = await doc.getPage(page);
    const viewport = pdfPage.getViewport({ scale: zoom });
    const context = canvas.getContext("2d");
    if (!context) return;

    renderTaskRef.current?.cancel();
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    const renderTask = pdfPage.render({
      canvas,
      canvasContext: context,
      viewport,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
    });
    renderTaskRef.current = renderTask;
    try {
      await renderTask.promise;
    } catch {
      // 取消渲染属正常流程，忽略
    }
  }, [page, zoom]);

  useEffect(() => {
    if (!loading && !failed) {
      void renderPage();
    }
  }, [loading, failed, renderPage]);

  // 全屏状态同步
  useEffect(() => {
    function onChange() {
      setFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const goPage = useCallback(
    (next: number) => {
      setPage((prev) => Math.min(Math.max(1, next), Math.max(1, pageCount)));
    },
    [pageCount],
  );

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void shellRef.current?.requestFullscreen();
    }
  }, []);

  return (
    <div
      ref={shellRef}
      className={`${styles.shell} ${compact ? styles.compact : ""} ${
        fullscreen ? styles.fs : ""
      }`}
      style={height && !fullscreen ? { height } : undefined}
    >
      {/* 工具条 */}
      <div className={styles.toolbar}>
        <span className={`igm-mono ${styles.toolLabel}`}>{t("readerLabel")}</span>
        <div className={styles.tools}>
          <button
            type="button"
            className={styles.tool}
            onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
            disabled={zoomIndex === 0 || loading}
            aria-label={t("readerZoomOut")}
            title={t("readerZoomOut")}
          >
            <ZoomOut size={14} strokeWidth={1.8} />
          </button>
          <span className={`igm-mono ${styles.zoomReadout}`}>
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            className={styles.tool}
            onClick={() =>
              setZoomIndex((i) => Math.min(iGM_Exam_ZoomSteps.length - 1, i + 1))
            }
            disabled={zoomIndex === iGM_Exam_ZoomSteps.length - 1 || loading}
            aria-label={t("readerZoomIn")}
            title={t("readerZoomIn")}
          >
            <ZoomIn size={14} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            className={styles.tool}
            onClick={toggleFullscreen}
            aria-label={fullscreen ? t("readerExitFullscreen") : t("readerFullscreen")}
            title={fullscreen ? t("readerExitFullscreen") : t("readerFullscreen")}
          >
            {fullscreen ? (
              <Minimize2 size={14} strokeWidth={1.8} />
            ) : (
              <Maximize2 size={14} strokeWidth={1.8} />
            )}
          </button>
        </div>
      </div>

      {/* 画布区 */}
      <div className={styles.stage}>
        {loading && <p className={`igm-mono ${styles.state}`}>{t("readerLoading")}</p>}
        {failed && <p className={`igm-mono ${styles.stateError}`}>{t("readerError")}</p>}
        {!loading && !failed && (
          <canvas ref={canvasRef} className={styles.canvas} />
        )}
      </div>

      {/* 页码转盘 */}
      {!loading && !failed && (
        <div className={styles.dial}>
          <button
            type="button"
            className={styles.dialBtn}
            onClick={() => goPage(page - 1)}
            disabled={page <= 1}
            aria-label={t("readerPrev")}
            title={t("readerPrev")}
          >
            <ChevronLeft size={16} strokeWidth={1.8} />
          </button>

          <div className={styles.dialReadout}>
            <span className={`igm-mono ${styles.dialCurrent}`}>
              {String(page).padStart(2, "0")}
            </span>
            <span className={`igm-mono ${styles.dialSlash}`}>/</span>
            <span className={`igm-mono ${styles.dialTotal}`}>
              {String(pageCount).padStart(2, "0")}
            </span>
          </div>

          <button
            type="button"
            className={styles.dialBtn}
            onClick={() => goPage(page + 1)}
            disabled={page >= pageCount}
            aria-label={t("readerNext")}
            title={t("readerNext")}
          >
            <ChevronRight size={16} strokeWidth={1.8} />
          </button>
        </div>
      )}
    </div>
  );
}

// 导出 //
export default iGM_ExamReader;
