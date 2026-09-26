/**
 * 文件路径：apps/cli-download/src/app/page.tsx
 * 所属层：前端 / 根路由（Next.js App Router 框架必需文件）
 * 路由：/
 * 模块：iGM_CLI_Downloader
 * 作用：根路径入口——按 Cookie 与浏览器语言检测目标语言并跳转到 /{locale}
 * 内容：纯静态导出仅生成一份根页面，挂载后客户端检测并 replace 跳转
 */

// 导入依赖 //
"use client";

import { useEffect, useState } from "react";
import { iGM_CLI_DetectRootLocale } from "../i18n/iGM_CLI_LocalePath";
import { iGM_CLI_LocalePath } from "../i18n/iGM_CLI_LocalePath";

// 类型定义 //
// （本页面无复杂状态）

// 核心逻辑 //
/** 根路径跳转页：检测语言后整页替换到对应语言前缀 */
export default function iGM_CLI_RootPage() {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    const locale = iGM_CLI_DetectRootLocale();
    setTarget(iGM_CLI_LocalePath("/", locale));
    window.location.replace(iGM_CLI_LocalePath("/", locale));
  }, []);

  // 导出 //
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        backgroundColor: "var(--igm-bg)",
        color: "var(--igm-text)",
      }}
    >
      <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: 2 }}>
        iGM CLI Download API
      </span>
      <noscript>
        <a href="/zh-CN">iGM CLI Download API</a>
      </noscript>
      <span aria-hidden style={{ opacity: 0.6, fontSize: 13 }}>
        {target ?? "/"}
      </span>
    </main>
  );
}
