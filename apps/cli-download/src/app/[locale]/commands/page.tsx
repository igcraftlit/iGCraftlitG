/**
 * 文件路径：apps/cli-download/src/app/[locale]/commands/page.tsx
 * 所属层：前端 / 页面层
 * 路由：/{locale}/commands
 * 模块：iGM_CLI_Downloader
 * 作用：命令占位页——仅保留标题与返回链接，本阶段不填充具体内容
 */

// 导入依赖 //
import type { Metadata } from "next";
import { ListOrdered } from "lucide-react";
import { iGM_CLI_PlaceholderPage as IGM_CLI_PlaceholderPage } from "../../../components/iGM_CLI_PlaceholderSection/iGM_CLI_PlaceholderPage";
import { iGM_CLI_GetMessages } from "../../../i18n/iGM_CLI_Messages";
import { iGM_CLI_IsLocale } from "../../../i18n/iGM_CLI_Locales";

// 类型定义 //
interface iGM_CLI_CommandsPageProps {
  params: Promise<{ locale: string }>;
}

// 核心逻辑 //
/** 每语言页面元数据 */
export async function generateMetadata({
  params,
}: iGM_CLI_CommandsPageProps): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = iGM_CLI_IsLocale(raw) ? raw : "zh-CN";
  const messages = iGM_CLI_GetMessages(locale);
  return { title: messages.pages.commands.title };
}

/** 命令占位页 */
export default async function iGM_CLI_CommandsPage({ params }: iGM_CLI_CommandsPageProps) {
  const { locale: raw } = await params;
  const locale = iGM_CLI_IsLocale(raw) ? raw : "zh-CN";
  const messages = iGM_CLI_GetMessages(locale);

  return (
    <IGM_CLI_PlaceholderPage
      title={messages.pages.commands.title}
      icon={<ListOrdered size={28} aria-hidden />}
    />
  );
}
