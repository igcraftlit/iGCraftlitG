/**
 * 文件路径：apps/web/src/iGM_Components/iGM_Highlight/iGM_Highlight.tsx
 * 所属层：前端 / 通用组件层
 * 路由：G_Search
 * 模块：iGM_Highlight
 * 作用：在文本中高亮检索关键词（大小写不敏感，支持多次命中）
 * 内容：按关键词切分文本，命中片段以 <mark> 包裹，其余原样输出
 * 说明：以纯文本渲染，非 HTML 注入；关键词为空时原样返回文本
 */

// 导入依赖 //
"use client";

import { Fragment } from "react";
import styles from "./iGM_Highlight.module.css";

// 类型定义 //
export interface iGM_HighlightProps {
  /** 原始文本 */
  text: string;
  /** 需高亮的关键词 */
  keyword: string;
}

// 核心逻辑 //
/** 转义正则元字符，避免关键词被当作正则表达式解析 */
function iGM_EscapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 关键词高亮文本 */
export function iGM_Highlight({ text, keyword }: iGM_HighlightProps) {
  const trimmed = keyword.trim();
  if (!trimmed || !text) return <>{text}</>;

  // 使用捕获组分割，奇数下标即为命中片段（保留原始大小写）
  const parts = text.split(
    new RegExp(`(${iGM_EscapeRegExp(trimmed)})`, "gi"),
  );

  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === trimmed.toLowerCase() ? (
          <mark key={index} className={styles.mark}>
            {part}
          </mark>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

// 导出 //
export default iGM_Highlight;
