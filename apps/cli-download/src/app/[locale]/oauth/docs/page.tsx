/**
 * 文件路径：apps/cli-download/src/app/[locale]/oauth/docs/page.tsx
 * 所属层：前端 / 页面层
 * 路由：/{locale}/oauth/docs
 * 模块：iGM_CLI_OAuthDocs
 * 作用：OAuth 接入文档页（构建期五语言静态生成，公开可收录）
 * 内容：页面元数据 + 渲染 iGM_CLI_OAuthDocs 客户端组件（章节正文与目录导航）
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_CLI_OAuthDocs as IGM_CLI_OAuthDocs } from "../../../../components/iGM_CLI_OAuthDocs/iGM_CLI_OAuthDocs";
import { iGM_CLI_GetMessages } from "../../../../i18n/iGM_CLI_Messages";
import { iGM_CLI_IsLocale } from "../../../../i18n/iGM_CLI_Locales";

// 类型定义 //
interface iGM_CLI_OAuthDocsPageProps {
  params: Promise<{ locale: string }>;
}

// 核心逻辑 //
/** 每语言页面元数据 */
export async function generateMetadata({
  params,
}: iGM_CLI_OAuthDocsPageProps): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = iGM_CLI_IsLocale(raw) ? raw : "zh-CN";
  const messages = iGM_CLI_GetMessages(locale);
  return {
    title: messages.pages.oauthDocs.title,
    description: messages.pages.oauthDocs.description,
  };
}

/** OAuth 接入文档页 */
export default async function iGM_CLI_OAuthDocsPage({
  params,
}: iGM_CLI_OAuthDocsPageProps) {
  await params;
  return <IGM_CLI_OAuthDocs />;
}
