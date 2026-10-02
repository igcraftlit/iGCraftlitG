/**
 * 文件路径：apps/cli-download/src/app/[locale]/sdk/page.tsx
 * 所属层：前端 / 页面层
 * 路由：/{locale}/sdk
 * 模块：iGM_CLI_Downloader
 * 作用：SDK 文档页——SDK 能力与七章手把手新手教程（含可运行最小项目）
 * 内容：构建期五语言静态生成；正文由 iGM_CLI_SdkDoc 客户端组件渲染，
 *       长文内容仅 zh-CN / en，其余语言回退 en（见 iGM_CLI_ResolveDocLocale）
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_CLI_SdkDoc as IGM_CLI_SdkDoc } from "../../../components/iGM_CLI_SdkDoc/iGM_CLI_SdkDoc";
import { iGM_CLI_GetMessages } from "../../../i18n/iGM_CLI_Messages";
import { iGM_CLI_IsLocale } from "../../../i18n/iGM_CLI_Locales";
import { iGM_CLI_ResolveDocLocale } from "../../../i18n/iGM_CLI_DocLocale";
import { iGM_CLI_SdkDocContent } from "../../../i18n/iGM_CLI_SdkDocContent";

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
  const content = iGM_CLI_SdkDocContent[iGM_CLI_ResolveDocLocale(locale)];
  return {
    title: messages.pages.sdk.title,
    description: content.lead,
  };
}

/** SDK 文档页：SDK 说明 + 手把手新手教程 */
export default async function iGM_CLI_SdkPage({ params }: iGM_CLI_SdkPageProps) {
  await params;
  return <IGM_CLI_SdkDoc />;
}
