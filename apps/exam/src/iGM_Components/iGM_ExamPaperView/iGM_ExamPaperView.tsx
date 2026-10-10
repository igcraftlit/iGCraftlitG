/**
 * 文件路径：apps/exam/src/iGM_Components/iGM_ExamPaperView/iGM_ExamPaperView.tsx
 * 所属层：前端 / 通用组件层
 * 路由：E_ExamDetail（/detail）、E_Admin_Exam（/admin）
 * 模块：iGM_ExamPaperView
 * 作用：解析后试卷全文的 Markdown 渲染视图，附基于标题自动生成的目录导航
 * 内容：Markdown → 学术排版正文（react-markdown + GFM + 数学公式 KaTeX）、
 *       标题解析、目录锚点跳转、当前章节高亮、空内容占位
 * 说明：纯客户端组件；不使用 PDF.js；目录锚点按渲染顺序定位，避免 slug 冲突
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { useI18n } from "../../iGM_i18n/iGM_I18nContext";
import styles from "./iGM_ExamPaperView.module.css";

// 类型定义 //
interface iGM_ExamPaperViewProps {
  /** 解析后的试卷全文（Markdown） */
  markdown: string;
  /** 是否展示右侧目录导航，缺省展示 */
  showToc?: boolean;
}

/** 目录条目 */
interface iGM_Exam_TocEntry {
  level: number;
  text: string;
}

// 核心逻辑 //
/** 去除标题中的 Markdown 行内标记，得到纯文本 */
function iGM_Exam_StripInline(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .replace(/\$([^$]*)\$/g, "$1")
    .replace(/\s+#+\s*$/, "")
    .trim();
}

/** 从 Markdown 源文本解析标题序列（跳过代码块内的伪标题） */
function iGM_Exam_ParseHeadings(markdown: string): iGM_Exam_TocEntry[] {
  const entries: iGM_Exam_TocEntry[] = [];
  let inFence = false;
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const matched = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (!matched) continue;
    const text = iGM_Exam_StripInline(matched[2]);
    if (text.length === 0) continue;
    entries.push({ level: matched[1].length, text });
  }
  return entries;
}

/** 解析后试卷全文渲染视图 */
export function iGM_ExamPaperView({
  markdown,
  showToc = true,
}: iGM_ExamPaperViewProps) {
  const { t } = useI18n();
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const headings = useMemo(() => iGM_Exam_ParseHeadings(markdown), [markdown]);

  // 高亮当前章节：监听渲染容器内各标题的相对位置
  useEffect(() => {
    const container = contentRef.current;
    if (!container || headings.length === 0) return;
    const nodes = Array.from(
      container.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6"),
    );
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (records) => {
        for (const record of records) {
          if (!record.isIntersecting) continue;
          const index = nodes.indexOf(record.target as HTMLElement);
          if (index >= 0) setActiveIndex(index);
        }
      },
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [headings, markdown]);

  const scrollToHeading = useCallback((index: number) => {
    const container = contentRef.current;
    if (!container) return;
    const node = container.querySelectorAll<HTMLElement>(
      "h1,h2,h3,h4,h5,h6",
    )[index];
    node?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const showContents = showToc && headings.length > 0;

  return (
    <div className={`${styles.shell} ${showContents ? "" : styles.solo}`}>
      <article ref={contentRef} className={`igm-paper ${styles.paper}`}>
        <Markdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
        >
          {markdown}
        </Markdown>
      </article>

      {showContents && (
        <nav className={styles.toc} aria-label={t("detailTocTitle")}>
          <p className={`igm-mono ${styles.tocTitle}`}>{t("detailTocTitle")}</p>
          <ul className={styles.tocList}>
            {headings.map((entry, index) => (
              <li
                key={`${index}-${entry.text}`}
                className={styles[`lvl${Math.min(entry.level, 3)}`]}
              >
                <button
                  type="button"
                  className={`${styles.tocItem} ${
                    index === activeIndex ? styles.tocActive : ""
                  }`}
                  onClick={() => scrollToHeading(index)}
                >
                  {entry.text}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}

// 导出 //
export default iGM_ExamPaperView;
