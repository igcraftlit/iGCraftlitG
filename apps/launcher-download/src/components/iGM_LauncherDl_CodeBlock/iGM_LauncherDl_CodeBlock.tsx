/**
 * 文件路径：apps/launcher-download/src/components/iGM_LauncherDl_CodeBlock/iGM_LauncherDl_CodeBlock.tsx
 * 所属层：前端 / 组件层
 * 路由：/docs/install 文档页
 * 模块：iGM_LauncherDl_Downloader
 * 作用：极简代码块——等宽字体、语言标签、一键复制，配色随明暗主题变量切换
 * 内容：头部标签 + 复制按钮（lucide Copy / Check），正文 pre > code 横向滚动
 */

// 导入依赖 //
"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import styles from "./iGM_LauncherDl_CodeBlock.module.css";

// 类型定义 //
interface iGM_LauncherDl_CodeBlockProps {
  /** 代码内容（多行用 \n） */
  code: string;
  /** 语言标签：powershell、bash、json 等，小写展示在头部 */
  label?: string;
}

// 核心逻辑 //
/** 文档代码块：标签 + 复制 + 等宽正文 */
export function iGM_LauncherDl_CodeBlock({
  code,
  label,
}: iGM_LauncherDl_CodeBlockProps) {
  const t = useTranslations();
  const [copied, setCopied] = useState(false);

  /** 复制代码：优先 Clipboard API，失败时降级 textarea + execCommand */
  async function iGM_LauncherDl_CopyCode() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = code;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* 复制失败时静默：代码仍可手动选择 */
    }
  }

  return (
    <div className={styles.block}>
      <div className={styles.head}>
        <span className={styles.label}>{label ?? "code"}</span>
        <button
          type="button"
          className={styles.copyButton}
          onClick={iGM_LauncherDl_CopyCode}
          aria-label={t("common.copy")}
        >
          {copied ? (
            <Check size={13} strokeWidth={2} aria-hidden />
          ) : (
            <Copy size={13} strokeWidth={1.8} aria-hidden />
          )}
          <span>{copied ? t("common.copied") : t("common.copy")}</span>
        </button>
      </div>
      <pre className={styles.pre}>
        <code className={styles.code}>{code}</code>
      </pre>
    </div>
  );
}

// 导出 //
export default iGM_LauncherDl_CodeBlock;