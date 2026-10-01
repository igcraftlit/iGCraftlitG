/**
 * 文件路径：apps/cli-download/src/app/[locale]/sdk/page.tsx
 * 所属层：前端 / 页面层
 * 路由：/{locale}/sdk
 * 模块：iGM_CLI_Downloader
 * 作用：SDK 占位页——SDK 能力已迁入文档中心适配器章节，
 *       本页提供跳转 /docs/adapter/sdk 的主行动入口与返回首页链接
 */

// 导入依赖 //
import type { Metadata } from "next";
import { Package } from "lucide-react";
import { iGM_CLI_PlaceholderPage as IGM_CLI_PlaceholderPage } from "../../../components/iGM_CLI_PlaceholderSection/iGM_CLI_PlaceholderPage";
import { iGM_CLI_GetMessages } from "../../../i18n/iGM_CLI_Messages";
import { iGM_CLI_IsLocale } from "../../../i18n/iGM_CLI_Locales";
import { iGM_CLI_LocalePath } from "../../../i18n/iGM_CLI_LocalePath";

// 类型定义 //
interface iGM_CLI_SdkPageProps {
  params: Promise<{ locale: string }>;
}

// 核心逻辑 //
/** 每语言页面元数据 */
export async function generateMetadata({
  params,
}: iGM_CLI_SdkPageProps): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = iGM_CLI_IsLocale(raw) ? raw : "zh-CN";
  const messages = iGM_CLI_GetMessages(locale);
  return { title: messages.pages.sdk.title };
}

/** SDK 页：占位提示 + 适配器 SDK 文档跳转 */
export default async function iGM_CLI_SdkPage({ params }: iGM_CLI_SdkPageProps) {
  const { locale: raw } = await params;
  const locale = iGM_CLI_IsLocale(raw) ? raw : "zh-CN";
  const messages = iGM_CLI_GetMessages(locale);

  return (
    <IGM_CLI_PlaceholderPage
      title={messages.pages.sdk.title}
      icon={<Package size={28} aria-hidden />}
      hint={messages.pages.sdk.hint}
      actionHref={iGM_CLI_LocalePath("/docs/adapter/sdk", locale)}
      actionLabel={messages.pages.sdk.viewDoc}
    />
  );
}
