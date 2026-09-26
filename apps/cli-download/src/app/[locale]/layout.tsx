/**
 * 文件路径：apps/cli-download/src/app/[locale]/layout.tsx
 * 所属层：前端 / 语言路由布局（Next.js App Router 动态段框架文件）
 * 路由：/zh-CN、/zh-TW、/en、/ja、/ru（全部页面挂载于语言前缀之下）
 * 模块：iGM_CLI_Downloader
 * 作用：语言路由段布局——构建期为五种语言各自生成静态页面，注入初始语言并挂载站点头尾
 * 内容：generateStaticParams 五语言参数、每语言元数据、Provider(key=locale) + Header/Footer
 */

// 导入依赖 //
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { iGM_CLI_Providers as IGM_CLI_Providers } from "../../components/iGM_CLI_Providers/iGM_CLI_Providers";
import { iGM_CLI_Header as IGM_CLI_Header } from "../../components/iGM_CLI_Header/iGM_CLI_Header";
import { iGM_CLI_Footer as IGM_CLI_Footer } from "../../components/iGM_CLI_Footer/iGM_CLI_Footer";
import { iGM_CLI_GetMessages } from "../../i18n/iGM_CLI_Messages";
import {
  iGM_CLI_IsLocale,
  iGM_CLI_Locales,
  type iGM_CLI_Locale,
} from "../../i18n/iGM_CLI_Locales";

// 类型定义 //
interface iGM_CLI_LocaleLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

// 核心逻辑 //
/** 站点根地址：构建期可通过 IGM_CLI_SITE_URL 覆盖（默认生产域名） */
const iGM_CLI_SiteUrl = (
  process.env.IGM_CLI_SITE_URL ?? "https://api.igcraftlit.com"
).replace(/\/$/, "");

/** 构建期为五种语言各自生成静态路由参数（output: 'export' 必需） */
export function generateStaticParams(): { locale: iGM_CLI_Locale }[] {
  return iGM_CLI_Locales.map((locale) => ({ locale }));
}

/** 未列出的语言段一律 404，保证纯静态导出无动态渲染 */
export const dynamicParams = false;

/** 每语言元数据：标题、描述、Open Graph 与 hreflang 多语言互链 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = iGM_CLI_IsLocale(raw) ? raw : "zh-CN";
  const messages = iGM_CLI_GetMessages(locale);

  const languages = Object.fromEntries(
    iGM_CLI_Locales.map((item) => [item, `${iGM_CLI_SiteUrl}/${item}`]),
  );

  return {
    metadataBase: new URL(iGM_CLI_SiteUrl),
    title: {
      default: messages.site.name,
      template: `%s | ${messages.site.name}`,
    },
    description: messages.site.tagline,
    alternates: {
      canonical: `${iGM_CLI_SiteUrl}/${locale}`,
      languages: { ...languages, "x-default": iGM_CLI_SiteUrl },
    },
    openGraph: {
      type: "website",
      siteName: messages.site.name,
      title: messages.site.name,
      description: messages.site.tagline,
      locale,
      url: `${iGM_CLI_SiteUrl}/${locale}`,
    },
  };
}

/** 语言路由布局：按 locale 初始化 Provider 并挂载站点头尾 */
export default async function iGM_CLI_LocaleLayout({
  children,
  params,
}: iGM_CLI_LocaleLayoutProps) {
  const { locale: raw } = await params;
  if (!iGM_CLI_IsLocale(raw)) notFound();
  const locale: iGM_CLI_Locale = raw;

  return (
    <IGM_CLI_Providers key={locale} initialLocale={locale}>
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <IGM_CLI_Header />
        <main style={{ flex: 1 }}>{children}</main>
        <IGM_CLI_Footer />
      </div>
    </IGM_CLI_Providers>
  );
}
