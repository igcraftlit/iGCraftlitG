/**
 * 文件路径：apps/launcher-ui/app/layout.tsx
 * 所属层：前端 / 根布局
 * 路由：全局
 * 模块：iGM_LauncherV2_RootLayout
 * 作用：Next.js 根布局，输出纯静态 HTML 骨架
 * 内容：固定深空底色与默认语言标记；挂载全局样式与本地自托管艺术字体
 *       （加载器名称、首页欢迎词中文艺术字体、用户名英文签名体）；
 *       外层包裹多语言 Provider（简体中文 / English，本地持久化 + 实时切换）；
 *       不引入任何服务端能力
 */

// 导入依赖 //
import type { Metadata, Viewport } from "next";
import {
  iGM_LauncherV2_GreetEnFont,
  iGM_LauncherV2_GreetZhFont,
  iGM_LauncherV2_LoaderFont,
} from "./iGM_LauncherV2_Fonts";
import { iGM_LauncherV2_LocaleProvider as IGM_LauncherV2_LocaleProvider } from "@/components/iGM_LauncherV2_Providers/iGM_LauncherV2_LocaleProvider";
import { IGM_LAUNCHERV2_APP_NAME } from "@/lib/iGM_LauncherV2_Constants";
import "./iGM_Globals.css";

// 类型定义 //
/* （由 Next 约定） */

// 核心逻辑 //
export const metadata: Metadata = {
  title: IGM_LAUNCHERV2_APP_NAME,
  description: "iGCraftLit official Minecraft launcher",
  icons: {
    icon: "/igml.jpg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function iGM_LauncherV2_RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="zh-CN"
      className={`${iGM_LauncherV2_LoaderFont.variable} ${iGM_LauncherV2_GreetZhFont.variable} ${iGM_LauncherV2_GreetEnFont.variable}`}
    >
      <body>
        <IGM_LauncherV2_LocaleProvider>{children}</IGM_LauncherV2_LocaleProvider>
      </body>
    </html>
  );
}

// 导出 //
/* metadata / viewport / 默认导出均已在上方以 Next 约定形式声明 */
