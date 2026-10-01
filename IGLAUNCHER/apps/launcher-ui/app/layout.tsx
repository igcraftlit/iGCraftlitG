/**
 * 文件路径：apps/launcher-ui/app/layout.tsx
 * 所属层：前端 / 根布局
 * 路由：全局
 * 模块：iGM_Launcher_RootLayout
 * 作用：Next.js 根布局，挂载客户端 Provider，输出纯静态 HTML 骨架
 * 内容：html 由 next-themes 写入 data-theme，suppressHydrationWarning
 *       抑制服务端首帧与客户端主题属性差异；
 *       模块七把 AppShell 下移到首页路由：安装向导路由 G_Installer 与启动器
 *       共用语言 / 主题 Provider，但不套用启动器的侧边栏与顶栏骨架
 */

// 导入依赖 //
import type { Metadata, Viewport } from "next";
import { IGM_LAUNCHER_APP_NAME } from "@igm-launcher/shared";
import { iGM_Launcher_Providers as IGM_Launcher_Providers } from "@/components/iGM_Launcher_Providers/iGM_Launcher_Providers";
import "./iGM_Globals.css";

// 类型定义 //
/* （由 Next 约定） */

// 核心逻辑 //
export const metadata: Metadata = {
  title: IGM_LAUNCHER_APP_NAME,
  description: "iGCraftLit official Minecraft launcher",
  icons: {
    icon: "/iGM_Launcher_Logo.ico",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function iGM_Launcher_RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <IGM_Launcher_Providers>{children}</IGM_Launcher_Providers>
      </body>
    </html>
  );
}

// 导出 //
/* metadata / viewport / 默认导出均已在上方以 Next 约定形式声明 */
