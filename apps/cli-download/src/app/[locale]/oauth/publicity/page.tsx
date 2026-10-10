/**
 * 文件路径：apps/cli-download/src/app/[locale]/oauth/publicity/page.tsx
 * 所属层：前端 / 页面层
 * 路由：/{locale}/oauth/publicity
 * 模块：iGM_CLI_OAuthPublicity
 * 作用：开发者公示页（构建期五语言静态生成，公开可浏览与收录）
 * 内容：页面元数据 + 渲染 iGM_CLI_OAuthPublicity 客户端组件（按批次展示公示名单）
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_CLI_OAuthPublicity as IGM_CLI_OAuthPublicity } from "../../../../components/iGM_CLI_OAuthPublicity/iGM_CLI_OAuthPublicity";
import { iGM_CLI_GetMessages } from "../../../../i18n/iGM_CLI_Messages";
import { iGM_CLI_IsLocale } from "../../../../i18n/iGM_CLI_Locales";

// 类型定义 //
interface iGM_CLI_OAuthPublicityPageProps {
  params: Promise<{ locale: string }>;
}

// 核心逻辑 //
/** 每语言页面元数据 */
export async function generateMetadata({
  params,
}: iGM_CLI_OAuthPublicityPageProps): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = iGM_CLI_IsLocale(raw) ? raw : "zh-CN";
  const messages = iGM_CLI_GetMessages(locale);
  return {
    title: messages.pages.oauthPublicity.title,
    description: messages.pages.oauthPublicity.description,
  };
}

/** 开发者公示页 */
export default async function iGM_CLI_OAuthPublicityPage({
  params,
}: iGM_CLI_OAuthPublicityPageProps) {
  await params;
  return <IGM_CLI_OAuthPublicity />;
}