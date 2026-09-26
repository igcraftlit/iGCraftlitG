/**
 * 文件路径：apps/cli-download/src/app/[locale]/docs/cli/commands/page.tsx
 * 所属层：前端 / 页面层
 * 路由：/{locale}/docs/cli/commands
 * 模块：iGM_CLI_Downloader
 * 作用：iGM CLI 命令参考页——基础命令、资源检索、安装下载、项目管理
 * 内容：构建期五语言静态生成，正文由 iGM_CLI_CliGuide(commands) 客户端组件渲染
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_CLI_CliGuide as IGM_CLI_CliGuide } from "../../../../../components/iGM_CLI_CliGuide/iGM_CLI_CliGuide";
import { iGM_CLI_GetMessages } from "../../../../../i18n/iGM_CLI_Messages";
import { iGM_CLI_IsLocale } from "../../../../../i18n/iGM_CLI_Locales";

// 类型定义 //
interface iGM_CLI_DocsCommandsPageProps {
  params: Promise<{ locale: string }>;
}

// 核心逻辑 //
/** 每语言页面元数据 */
export async function generateMetadata({
  params,
}: iGM_CLI_DocsCommandsPageProps): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = iGM_CLI_IsLocale(raw) ? raw : "zh-CN";
  return { title: iGM_CLI_GetMessages(locale).pages.docsCommands.title };
}

/** iGM CLI 命令参考页 */
export default async function iGM_CLI_DocsCommandsPage({
  params,
}: iGM_CLI_DocsCommandsPageProps) {
  await params;
  return <IGM_CLI_CliGuide variant="commands" />;
}
