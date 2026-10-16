/**
 * 文件路径：apps/exam/src/app/layout.tsx
 * 所属层：前端 / 根布局（Next.js App Router 框架必需文件）
 * 路由：全局
 * 模块：iGM_Exam_RootLayout
 * 作用：iGC&M 教育考试系统子站点 HTML 根节点、字体变量与全局样式注入
 * 内容：衬线（Source Serif 4）/ 无衬线（Inter）/ 等宽（JetBrains Mono）
 *       三套字体变量、防 FOUC 主题初始化脚本、站点元数据
 * 说明：刊头/页脚改由 iGM_ExamChrome 按路由渲染，独立授权登录页（/login）
 *       不显示刊头与页脚；刊头日期在客户端挂载后按本地时间刷新
 */

// 导入依赖 //
import type { Metadata, Viewport } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import { iGM_ExamChrome as IGM_ExamChrome } from "../iGM_Components/iGM_ExamChrome/iGM_ExamChrome";
import { iGM_ExamI18nProvider as IGM_ExamI18nProvider } from "../iGM_i18n/iGM_I18nContext";
import { iGM_ExamAuthProvider as IGM_ExamAuthProvider } from "../iGM_AuthContext";
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

/** 构建期日期（环境变量注入），水合前后一致 */
const iGM_Exam_BuildDate = new Date(
  process.env.NEXT_PUBLIC_IGM_EXAM_BUILD_TIME || Date.now(),
);

export const metadata: Metadata = {
  title: "iGC&M Education Examinations Research Institute",
  description:
    "iGC&M Education Examinations Research Institute — Academic Assessment Platform",
  openGraph: {
    title: "iGC&M Education Examinations Research Institute",
    description:
      "iGC&M Education Examinations Research Institute — Academic Assessment Platform",
    siteName: "iGC&M Education Examinations Research Institute",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/** 防 FOUC 主题与语言初始化脚本：首屏绘制前写入 data-theme 与 lang */
const iGM_Exam_ThemeInitScript = `
(function(){try{var s=localStorage.getItem('iGM_Exam_Theme')||'system';var t=s==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):s;document.documentElement.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t}catch(e){}
try{var l=localStorage.getItem('iGM_Exam_Lang');if(l==='zh-CN'||l==='en'){document.documentElement.lang=l}}catch(e){}})();
`;

/** 根布局 */
export default function iGM_Exam_RootLayout({
  children,
}: iGM_Exam_RootLayoutProps) {
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className={`${iGM_Exam_Serif.variable} ${iGM_Exam_Sans.variable} ${iGM_Exam_Mono.variable}`}
    >
      <body>
        <Script
          id="igm-exam-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: iGM_Exam_ThemeInitScript }}
        />
        <IGM_ExamAuthProvider>
          <IGM_ExamI18nProvider>
            <IGM_ExamChrome>{children}</IGM_ExamChrome>
          </IGM_ExamI18nProvider>
        </IGM_ExamAuthProvider>
      </body>
    </html>
  );
}
