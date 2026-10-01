/**
 * 文件路径：apps/launcher-download/src/app/not-found.tsx
 * 所属层：前端 / 全局 404 页面（Next.js App Router 框架必需文件）
 * 路由：任意未知路径
 * 模块：iGM_LauncherDl_Downloader
 * 作用：纯静态导出的 404 落地页——提示未找到并提供返回默认语言首页入口
 * 内容：静态文案与 lucide-react 图标，无语言前缀（静态导出 404 为全局单页）
 */

// 导入依赖 //
import Link from "next/link";
import { ArrowLeft, FileQuestionMark } from "lucide-react";

// 类型定义 //
// （本页面无属性）

// 核心逻辑 //
/** 全局 404 页面 */
export default function iGM_LauncherDl_NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        textAlign: "center",
        padding: "0 20px",
        backgroundColor: "var(--igm-bg)",
        color: "var(--igm-text)",
      }}
    >
      <span
        style={{
          color: "var(--igm-accent)",
          display: "flex",
          padding: 14,
          border: "1px solid var(--igm-border)",
          borderRadius: "var(--igm-radius-lg)",
          background: "var(--igm-surface)",
        }}
      >
        <FileQuestionMark size={28} aria-hidden />
      </span>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>404</h1>
      <p style={{ color: "var(--igm-text-muted)", fontSize: 14 }}>
        iGM CraftCeon Launcher
      </p>
      <Link
        href="/zh-CN"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          marginTop: 4,
          padding: "8px 16px",
          border: "1px solid var(--igm-border)",
          borderRadius: "var(--igm-radius)",
          background: "var(--igm-surface)",
          color: "var(--igm-text)",
          fontSize: 14,
        }}
      >
        <ArrowLeft size={16} aria-hidden />
        iGM CraftCeon Launcher
      </Link>
    </main>
  );
}