/**
 * 文件路径：apps/launcher-download/src/app/[locale]/docs/page.tsx
 * 所属层：前端 / 页面层
 * 路由：/{locale}/docs
 * 模块：iGM_LauncherDl_Downloader
 * 作用：文档首页——承载 iGM_LauncherDl_DocsHome 文档分区卡片
 * 内容：纯静态 SSG 服务端页面，正文组件为客户端组件（依赖语言上下文）
 */

// 导入依赖 //
import { notFound } from "next/navigation";
import { iGM_LauncherDl_IsLocale } from "../../../i18n/iGM_LauncherDl_Locales";
import { iGM_LauncherDl_DocsHome as IGM_LauncherDl_DocsHome } from "../../../components/iGM_LauncherDl_DocsHome/iGM_LauncherDl_DocsHome";

// 类型定义 //
interface iGM_LauncherDl_DocsPageProps {
  params: Promise<{ locale: string }>;
}

// 核心逻辑 //
/** 文档首页 */
export default async function iGM_LauncherDl_DocsPage({
  params,
}: iGM_LauncherDl_DocsPageProps) {
  const { locale } = await params;
  if (!iGM_LauncherDl_IsLocale(locale)) notFound();

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "48px 20px 72px" }}>
      <IGM_LauncherDl_DocsHome />
    </div>
  );
}