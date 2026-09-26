/**
 * 文件路径：apps/cli-download/src/app/layout.tsx
 * 所属层：前端 / 根布局（Next.js App Router 框架必需文件）
 * 路由：全局
 * 模块：iGM_CLI_Downloader
 * 作用：HTML 根节点与全局样式注入
 * 内容：Provider、AppShell 已下沉至 app/[locale]/layout.tsx
 */

// 导入依赖 //
import type { Metadata, Viewport } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import "./iGM_Globals.css";

// 类型定义 //
interface iGM_CLI_RootLayoutProps {
  children: ReactNode;
}

// 核心逻辑 //
export const metadata: Metadata = {
  title: "iGM CLI Download API",
  description: "iGCraftLit × MuoCeon 联合构建",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/** 防 FOUC 主题初始化脚本：在首屏绘制前根据 localStorage/系统偏好写入 data-theme */
const iGM_CLI_ThemeInitScript = `
(function(){try{var s=localStorage.getItem('iGM_CLI_THEME')||'system';var t=s==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):s;document.documentElement.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t}catch(e){}})();
`;

/** 根布局：仅输出 HTML 外壳，语言相关布局见 app/[locale]/layout.tsx */
export default function iGM_CLI_RootLayout({ children }: iGM_CLI_RootLayoutProps) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <Script
          id="igm-cli-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: iGM_CLI_ThemeInitScript }}
        />
        {children}
      </body>
    </html>
  );
}
