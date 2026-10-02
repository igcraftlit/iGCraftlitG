/**
 * 文件路径：apps/launcher-download/src/app/layout.tsx
 * 所属层：前端 / 根布局（Next.js App Router 框架必需文件）
 * 路由：全局
 * 模块：iGM_LauncherDl_Downloader
 * 作用：HTML 根节点与全局样式注入
 * 内容：Provider、AppShell 已下沉至 app/[locale]/layout.tsx
 */

// 导入依赖 //
import type { Metadata, Viewport } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import { Cinzel } from "next/font/google";
import "./iGM_Globals.css";

// 类型定义 //
interface iGM_LauncherDl_RootLayoutProps {
  children: ReactNode;
}

// 核心逻辑 //
/** Cinzel 艺术字体：用于站点大标题，通过 CSS 变量 --font-cinzel 暴露 */
const iGM_LauncherDl_Cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-cinzel",
  display: "swap",
});

// 核心逻辑 //
export const metadata: Metadata = {
  title: "iGM CraftCeon Launcher",
  description: "iGCraftLit",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/** 防 FOUC 主题初始化脚本：在首屏绘制前根据 localStorage/系统偏好写入 data-theme */
const iGM_LauncherDl_ThemeInitScript = `
(function(){try{var s=localStorage.getItem('iGM_LauncherDl_THEME')||'system';var t=s==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):s;document.documentElement.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t}catch(e){}})();
`;

/** 根布局：仅输出 HTML 外壳，语言相关布局见 app/[locale]/layout.tsx */
export default function iGM_LauncherDl_RootLayout({
  children,
}: iGM_LauncherDl_RootLayoutProps) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={iGM_LauncherDl_Cinzel.variable}>
        <Script
          id="igm-launcherdl-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: iGM_LauncherDl_ThemeInitScript }}
        />
        {children}
      </body>
    </html>
  );
}