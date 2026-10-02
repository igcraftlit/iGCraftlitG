/**
 * 文件路径：apps/cli-download/src/app/[locale]/api/page.tsx
 * 所属层：前端 / 页面层
 * 路由：/{locale}/api
 * 模块：iGM_CLI_Downloader
 * 作用：API 参考页——完整接口文档（概述、端点、格式、错误码、鉴权、限流、示例、FAQ）
 * 内容：构建期五语言静态生成；正文由 iGM_CLI_ApiDoc 客户端组件渲染，
 *       长文内容仅 zh-CN / en，其余语言回退 en（见 iGM_CLI_ResolveDocLocale）
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_CLI_ApiDoc as IGM_CLI_ApiDoc } from "../../../components/iGM_CLI_ApiDoc/iGM_CLI_ApiDoc";
import { iGM_CLI_GetMessages } from "../../../i18n/iGM_CLI_Messages";
import { iGM_CLI_IsLocale } from "../../../i18n/iGM_CLI_Locales";
import { iGM_CLI_ResolveDocLocale } from "../../../i18n/iGM_CLI_DocLocale";
import { iGM_CLI_ApiDocContent } from "../../../i18n/iGM_CLI_ApiDocContent";

// 类型定义 //
interface iGM_CLI_ApiPageProps {
  params: Promise<{ locale: string }>;
}

// 核心逻辑 //
/** 每语言页面元数据 */
export async function generateMetadata({
  params,
}: iGM_CLI_ApiPageProps): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = iGM_CLI_IsLocale(raw) ? raw : "zh-CN";
  const messages = iGM_CLI_GetMessages(locale);
  const content = iGM_CLI_ApiDocContent[iGM_CLI_ResolveDocLocale(locale)];
  return {
    title: messages.pages.api.title,
    description: content.lead,
  };
}

/** API 参考页：完整接口文档正文 */
export default async function iGM_CLI_ApiPage({ params }: iGM_CLI_ApiPageProps) {
  await params;
  return <IGM_CLI_ApiDoc />;
}
