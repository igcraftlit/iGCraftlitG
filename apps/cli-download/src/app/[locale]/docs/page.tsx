/**
 * 文件路径：apps/cli-download/src/app/[locale]/docs/page.tsx
 * 所属层：前端 / 页面层
 * 路由：/{locale}/docs
 * 模块：iGM_CLI_Downloader
 * 作用：文档中心页——文档分区卡片导航（完整指南/安装/命令/配置/FAQ）
 * 内容：构建期五语言静态生成，正文由 iGM_CLI_DocsHome 客户端组件渲染
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_CLI_DocsHome as IGM_CLI_DocsHome } from "../../../components/iGM_CLI_DocsHome/iGM_CLI_DocsHome";
import { iGM_CLI_GetMessages } from "../../../i18n/iGM_CLI_Messages";
import { iGM_CLI_IsLocale } from "../../../i18n/iGM_CLI_Locales";

// 类型定义 //
interface iGM_CLI_DocsHomePageProps {
  params: Promise<{ locale: string }>;
}

// 核心逻辑 //
/** 每语言页面元数据 */
export async function generateMetadata({
  params,
}: iGM_CLI_DocsHomePageProps): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = iGM_CLI_IsLocale(raw) ? raw : "zh-CN";
  const messages = iGM_CLI_GetMessages(locale);
  return {
    title: messages.pages.docs.title,
    description: messages.docs.index.description,
  };
}

/** 文档中心页 */
export default async function iGM_CLI_DocsHomePage({
  params,
}: iGM_CLI_DocsHomePageProps) {
  await params;
  return <IGM_CLI_DocsHome />;
}
