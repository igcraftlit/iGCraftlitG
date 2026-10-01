/**
 * 文件路径：apps/cli-download/src/app/[locale]/docs/adapter/page.tsx
 * 所属层：前端 / 页面层
 * 路由：/{locale}/docs/adapter
 * 模块：iGM_CLI_Downloader
 * 作用：适配器完整指南页——八章正文 + 右侧 ON THIS PAGE 目录
 * 内容：构建期五语言静态生成，正文由 iGM_CLI_AdapterGuide(full) 客户端组件渲染
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_CLI_AdapterGuide as IGM_CLI_AdapterGuide } from "../../../../components/iGM_CLI_AdapterGuide/iGM_CLI_AdapterGuide";
import { iGM_CLI_GetMessages } from "../../../../i18n/iGM_CLI_Messages";
import { iGM_CLI_IsLocale } from "../../../../i18n/iGM_CLI_Locales";

// 类型定义 //
interface iGM_CLI_DocsAdapterPageProps {
  params: Promise<{ locale: string }>;
}

// 核心逻辑 //
/** 每语言页面元数据 */
export async function generateMetadata({
  params,
}: iGM_CLI_DocsAdapterPageProps): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = iGM_CLI_IsLocale(raw) ? raw : "zh-CN";
  return { title: iGM_CLI_GetMessages(locale).pages.docsAdapter.title };
}

/** 适配器完整指南页 */
export default async function iGM_CLI_DocsAdapterPage({
  params,
}: iGM_CLI_DocsAdapterPageProps) {
  await params;
  return <IGM_CLI_AdapterGuide variant="full" />;
}
