/**
 * 文件路径：apps/cli-download/src/app/[locale]/docs/adapter/sdk/page.tsx
 * 所属层：前端 / 页面层
 * 路由：/{locale}/docs/adapter/sdk
 * 模块：iGM_CLI_Downloader
 * 作用：SDK 嵌入子页——C ABI 动态库产物、核心导出函数、进度结构、C++/Zig 调用示例
 * 内容：构建期五语言静态生成，正文由 iGM_CLI_AdapterGuide(sdk) 客户端组件渲染
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_CLI_AdapterGuide as IGM_CLI_AdapterGuide } from "../../../../../components/iGM_CLI_AdapterGuide/iGM_CLI_AdapterGuide";
import { iGM_CLI_GetMessages } from "../../../../../i18n/iGM_CLI_Messages";
import { iGM_CLI_IsLocale } from "../../../../../i18n/iGM_CLI_Locales";

// 类型定义 //
interface iGM_CLI_DocsAdapterSdkPageProps {
  params: Promise<{ locale: string }>;
}

// 核心逻辑 //
/** 每语言页面元数据 */
export async function generateMetadata({
  params,
}: iGM_CLI_DocsAdapterSdkPageProps): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = iGM_CLI_IsLocale(raw) ? raw : "zh-CN";
  return { title: iGM_CLI_GetMessages(locale).pages.docsAdapterSdk.title };
}

/** SDK 嵌入子页 */
export default async function iGM_CLI_DocsAdapterSdkPage({
  params,
}: iGM_CLI_DocsAdapterSdkPageProps) {
  await params;
  return <IGM_CLI_AdapterGuide variant="sdk" />;
}
