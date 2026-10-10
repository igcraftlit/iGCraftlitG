/**
 * 文件路径：apps/exam/src/app/layout.tsx
 * 所属层：前端 / 根布局（Next.js App Router 框架必需文件）
 * 路由：全局
 * 模块：iGM_Exam_RootLayout
 * 作用：iG&M 教育考试系统子站点 HTML 根节点、字体变量与全局样式注入
 * 内容：衬线（Source Serif 4）/ 无衬线（Inter）/ 等宽（JetBrains Mono）
 *       三套字体变量、防 FOUC 主题初始化脚本、站点元数据
 */

// 导入依赖 //
import type { Metadata, Viewport } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import { iGM_ExamMasthead as IGM_ExamMasthead } from "../iGM_Components/iGM_ExamMasthead/iGM_ExamMasthead";
import { iGM_ExamFooter as IGM_ExamFooter } from "../iGM_Components/iGM_ExamFooter/iGM_ExamFooter";
import "./globals.css";

// 类型定义 //
interface iGM_Exam_RootLayoutProps {
  children: ReactNode;
}

// 核心逻辑 //
/** 衬线标题字：通过 CSS 变量 --igm-font-serif 暴露 */
const iGM_Exam_Serif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--igm-font-serif",
  display: "swap",
});

/** 无衬线正文字 */
const iGM_Exam_Sans = Inter({
  subsets: ["latin"],
  variable: "--igm-font-sans",
  display: "swap",
});

/** 等宽数字字 */
const iGM_Exam_Mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--igm-font-mono",
  display: "swap",
});

// 核心逻辑 //
export const metadata: Metadata = {
  title: "iG&M Educational Examination Institute",
  description:
    "iG&M Educational Examination Institute — Academic Assessment Platform",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/** 防 FOUC 主题初始化脚本：首屏绘制前根据 localStorage/系统偏好写入 data-theme */
const iGM_Exam_ThemeInitScript = `
(function(){try{var s=localStorage.getItem('iGM_Exam_Theme')||'system';var t=s==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):s;document.documentElement.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t}catch(e){}})();
`;

/** 根布局 */
export default function iGM_Exam_RootLayout({
  children,
}: iGM_Exam_RootLayoutProps) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${iGM_Exam_Serif.variable} ${iGM_Exam_Sans.variable} ${iGM_Exam_Mono.variable}`}
    >
      <body>
        <Script
          id="igm-exam-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: iGM_Exam_ThemeInitScript }}
        />
        <IGM_ExamMasthead />
        {children}
        <IGM_ExamFooter />
      </body>
    </html>
  );
}
