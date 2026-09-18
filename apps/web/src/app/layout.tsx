/**
 * 文件路径：apps/web/src/app/layout.tsx
 * 所属层：前端 / 根布局（Next.js App Router 框架必需文件）
 * 路由：全局
 * 模块：iGM_RootLayout
 * 作用：HTML 根节点、Cinzel 艺术字体注入、全局样式、Provider 与 AppShell 挂载
 * 内容：html[data-theme] 由 next-themes 写入，lang 由 iGM_LocaleProvider 同步
 * 说明：本文件为 Next.js 强制命名的框架入口，实际组件逻辑均在 iGM_ 前缀模块中
 */

// 导入依赖 //
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Cinzel } from "next/font/google";
import { iGM_Providers as IGM_Providers } from "../iGM_Providers/iGM_Providers";
import { iGM_AppShell as IGM_AppShell } from "../iGM_AppShell/iGM_AppShell";
import "./iGM_Globals.css";

// 类型定义 //
interface iGM_RootLayoutProps {
  children: ReactNode;
}

// 核心逻辑 //
/** Cinzel 艺术字体：仅用于网站名称，通过 CSS 变量 --font-cinzel 暴露 */
const iGM_Cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-cinzel",
  display: "swap",
});

export const metadata: Metadata = {
  title: "iGCraftLit Community",
  description: "iGCraftLit Community",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/** 根布局 */
export default function iGM_RootLayout({ children }: iGM_RootLayoutProps) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={iGM_Cinzel.variable}>
        <IGM_Providers>
          <IGM_AppShell>{children}</IGM_AppShell>
        </IGM_Providers>
      </body>
    </html>
  );
}
