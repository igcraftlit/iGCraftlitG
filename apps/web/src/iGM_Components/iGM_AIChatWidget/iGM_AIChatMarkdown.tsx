/**
 * 文件路径：apps/web/src/iGM_Components/iGM_AIChatWidget/iGM_AIChatMarkdown.tsx
 * 所属层：前端 / 通用组件层
 * 路由：全局（由 iGM_AIChatWidget 的 AI 回复气泡调用）
 * 模块：iGM_AIChatMarkdown
 * 作用：AI 回复的 Markdown 渲染（react-markdown + remark-gfm + rehype-highlight）：
 *       GFM 表格 / 列表 / 链接等基础排版、代码块顶部语言标签与右上角复制按钮、
 *       反引号行内代码小框、明暗主题自适应的高亮配色、代码区横向滚动
 * 内容：代码块组件（语言标签 + 复制按钮 + 高亮容器）、组件映射、Markdown 渲染组件
 * 说明：不使用 rehype-raw，不渲染任何原始 HTML，仅渲染 Markdown 安全节点；
 *       未注册语言由高亮插件自动降级为纯文本，不抛错
 */

// 导入依赖 //
"use client";

import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import styles from "./iGM_AIChatWidget.module.css";

// 类型定义 //
interface iGM_AIChatMarkdownProps {
  /** Markdown 原文（AI 回复累计文本） */
  content: string;
}

interface iGM_AIChatCodeBlockProps {
  /** 代码语言（来自 ```lang 标记；未标注为 null） */
  language: string | null;
  /** 原始代码 className（含 rehype-highlight 的 hljs 类，透传给内层 code 保留高亮） */
  codeClassName: string;
  children: ReactNode;
}

// 核心逻辑 //
/** 代码块：顶部语言标签 + 右上角复制按钮 + 可横向滚动的代码区 */
function iGM_AIChatCodeBlock({
  language,
  codeClassName,
  children,
}: iGM_AIChatCodeBlockProps) {
  const t = useTranslations();
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLElement | null>(null);

  /** 复制代码原文：从渲染结果读取文本（含高亮 span 时同样准确） */
  const iGM_Copy = useCallback(() => {
    const text = (codeRef.current?.innerText ?? "").replace(/\n$/, "");
    if (text.length === 0) return;
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        // 剪贴板不可用（权限受限等）时静默失败，不打断阅读
      });
  }, []);

  return (
    <div className={styles.codeBlock}>
      <div className={styles.codeHeader}>
        <span className={styles.codeLang}>{language ?? "text"}</span>
        <button type="button" className={styles.codeCopy} onClick={iGM_Copy}>
          {copied ? (
            <Check size={12} strokeWidth={2} aria-hidden />
          ) : (
            <Copy size={12} strokeWidth={2} aria-hidden />
          )}
          {copied ? t("ai.widget.copiedCode") : t("ai.widget.copyCode")}
        </button>
      </div>
      <pre className={styles.codePre}>
        <code
          ref={codeRef}
          className={`${styles.code} ${codeClassName}`.trim()}
        >
          {children}
        </code>
      </pre>
    </div>
  );
}

/** JSX 别名：组件名须大写开头才能被 JSX 识别（项目约定） */
const IGM_AIChatCodeBlock = iGM_AIChatCodeBlock;

/**
 * 组件映射：
 * - pre 解包为片段（代码块由 iGM_AIChatCodeBlock 自行包裹容器，避免嵌套 pre）；
 * - code 区分行内与代码块：带 language- 类或含换行的按块渲染，其余为行内小框
 */
const iGM_AIChatMarkdownComponents: Components = {
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    const match = /language-([\w+-]+)/.exec(className ?? "");
    const isBlock = match !== null || String(children).includes("\n");
    if (!isBlock) {
      return <code className={styles.inlineCode}>{children}</code>;
    }
    return (
      <IGM_AIChatCodeBlock
        language={match?.[1] ?? null}
        codeClassName={className ?? ""}
      >
        {children}
      </IGM_AIChatCodeBlock>
    );
  },
};

/** AI 回复 Markdown 渲染：GFM + 代码高亮（未注册语言自动降级为纯文本，不抛错） */
export function iGM_AIChatMarkdown({ content }: iGM_AIChatMarkdownProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[[rehypeHighlight, { detect: false }]]}
      components={iGM_AIChatMarkdownComponents}
    >
      {content}
    </ReactMarkdown>
  );
}

// 导出 //
export default iGM_AIChatMarkdown;