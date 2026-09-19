/**
 * 文件路径：apps/web/src/app/page.tsx
 * 所属层：前端 / 根路由（Next.js App Router 框架必需文件）
 * 路由：/
 * 模块：G_Landing（根跳转）
 * 作用：根路径入口——按 Cookie 与浏览器语言检测目标语言并跳转到 /{locale}（模块五多语言改造）
 * 内容：纯静态导出仅生成一份根页面，语言偏好无法在构建期决定，
 *       因此渲染品牌门户式极简过渡画面，挂载后客户端检测并 replace 跳转
 * 说明：本文件为 Next.js 强制命名的框架入口；iGM_DetectRootLocale
 *       按 Cookie → navigator.languages → zh-CN 顺序解析
 */

// 导入依赖 //
"use client";

import { useEffect, useState } from "react";
import { iGM_DetectRootLocale } from "../iGM_i18n/iGM_LocalePath";
import { iGM_LocalePath } from "../iGM_i18n/iGM_LocalePath";

// 类型定义 //
// （本页面无复杂状态）

// 核心逻辑 //
/** 根路径跳转页：检测语言后整页替换到对应语言前缀 */
export default function iGM_RootPage() {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    const locale = iGM_DetectRootLocale();
    setTarget(iGM_LocalePath("/", locale));
    // replace 不留下历史记录，避免回退键停在跳转页
    window.location.replace(iGM_LocalePath("/", locale));
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
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-cinzel), serif",
          fontSize: 22,
          letterSpacing: 2,
        }}
      >
        iGCraftLit Community
      </span>
      <noscript>
        <a href="/zh-CN">iGCraftLit Community</a>
      </noscript>
      <span aria-hidden style={{ opacity: 0.6, fontSize: 13 }}>
        {target ?? "/"}
      </span>
    </main>
  );
}
