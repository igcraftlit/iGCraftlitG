/**
 * 文件路径：apps/cli-download/src/app/[locale]/oauth/apps/page.tsx
 * 所属层：前端 / 页面层
 * 路由：/{locale}/oauth/apps
 * 模块：iGM_CLI_OAuthApps
 * 作用：我的 OAuth 应用页（构建期五语言静态生成）
 * 内容：页面元数据 + 渲染 iGM_CLI_OAuthApps 客户端组件
 *       （应用列表、撤回、重置密钥、接入日志）
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_CLI_OAuthApps as IGM_CLI_OAuthApps } from "../../../../components/iGM_CLI_OAuthApps/iGM_CLI_OAuthApps";
import { iGM_CLI_GetMessages } from "../../../../i18n/iGM_CLI_Messages";
import { iGM_CLI_IsLocale } from "../../../../i18n/iGM_CLI_Locales";

// 类型定义 //
interface iGM_CLI_OAuthAppsPageProps {
  params: Promise<{ locale: string }>;
}

// 核心逻辑 //
/** 每语言页面元数据 */
export async function generateMetadata({
  params,
}: iGM_CLI_OAuthAppsPageProps): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = iGM_CLI_IsLocale(raw) ? raw : "zh-CN";
  const messages = iGM_CLI_GetMessages(locale);
  return {
    title: messages.pages.oauthApps.title,
    description: messages.pages.oauthApps.description,
  };
}

/** 我的 OAuth 应用页 */
export default async function iGM_CLI_OAuthAppsPage({
  params,
}: iGM_CLI_OAuthAppsPageProps) {
  await params;
  return <IGM_CLI_OAuthApps />;
}
