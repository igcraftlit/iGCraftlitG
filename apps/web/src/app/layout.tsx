/**
 * 文件路径：apps/web/src/app/layout.tsx
 * 所属层：前端 / 根布局（Next.js App Router 框架必需文件）
 * 路由：全局
 * 模块：iGM_RootLayout
 * 作用：HTML 根节点、Cinzel 艺术字体注入与全局样式（模块五多语言改造后仅保留外壳）
 * 内容：Provider、AppShell 与转场幕布已下沉至 app/[locale]/layout.tsx，
 *       由语言路由段按 locale 注入 initialLocale 并挂载控制台外壳；
 *       html[data-theme] 由防 FOUC 脚本与 iGM_ThemeProvider 同步写入，
 *       lang 由 iGM_LocaleProvider 同步
 * 说明：本文件为 Next.js 强制命名的框架入口，实际组件逻辑均在 iGM_ 前缀模块中
 */

// 导入依赖 //
import type { Metadata, Viewport } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import { Cinzel } from "next/font/google";
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

/** 防 FOUC 主题初始化脚本：在首屏绘制前根据 localStorage/系统偏好写入 data-theme */
const iGM_ThemeInitScript = `
(function(){try{var s=localStorage.getItem('iGM_THEME')||'system';var t=s==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):s;document.documentElement.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t}catch(e){}})();
`;

/** 根布局：仅输出 HTML 外壳，语言相关布局见 app/[locale]/layout.tsx */
export default function iGM_RootLayout({ children }: iGM_RootLayoutProps) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={iGM_Cinzel.variable}>
        <Script
          id="igm-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: iGM_ThemeInitScript }}
        />
        {children}
      </body>
    </html>
  );
}
