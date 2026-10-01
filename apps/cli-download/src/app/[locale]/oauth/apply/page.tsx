/**
 * 文件路径：apps/cli-download/src/app/[locale]/oauth/apply/page.tsx
 * 所属层：前端 / 页面层
 * 路由：/{locale}/oauth/apply
 * 模块：iGM_CLI_OAuthApply
 * 作用：OAuth 应用接入申请页（构建期五语言静态生成）
 * 内容：页面元数据 + 渲染 iGM_CLI_OAuthApply 客户端组件（申请表与登录守卫）
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_CLI_OAuthApply as IGM_CLI_OAuthApply } from "../../../../components/iGM_CLI_OAuthApply/iGM_CLI_OAuthApply";
import { iGM_CLI_GetMessages } from "../../../../i18n/iGM_CLI_Messages";
import { iGM_CLI_IsLocale } from "../../../../i18n/iGM_CLI_Locales";

// 类型定义 //
interface iGM_CLI_OAuthApplyPageProps {
  params: Promise<{ locale: string }>;
}

// 核心逻辑 //
/** 每语言页面元数据 */
export async function generateMetadata({
  params,
}: iGM_CLI_OAuthApplyPageProps): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = iGM_CLI_IsLocale(raw) ? raw : "zh-CN";
  const messages = iGM_CLI_GetMessages(locale);
  return {
    title: messages.pages.oauthApply.title,
    description: messages.pages.oauthApply.description,
  };
}

/** OAuth 应用接入申请页 */
export default async function iGM_CLI_OAuthApplyPage({
  params,
}: iGM_CLI_OAuthApplyPageProps) {
  await params;
  return <IGM_CLI_OAuthApply />;
}
