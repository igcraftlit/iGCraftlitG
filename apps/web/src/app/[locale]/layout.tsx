/**
 * 文件路径：apps/web/src/app/[locale]/layout.tsx
 * 所属层：前端 / 语言路由布局（Next.js App Router 动态段框架文件）
 * 路由：/zh-CN、/zh-TW、/en、/ja、/ru（全部页面挂载于语言前缀之下）
 * 模块：iGM_LocaleLayout
 * 作用：语言路由段布局——构建期为五种语言各自生成静态页面，注入初始语言并挂载控制台外壳
 * 内容：generateStaticParams 五语言参数、generateMetadata 每语言元数据
 *       （标题/描述/Open Graph/hreflang 互链）、JSON-LD 结构化数据、
 *       Provider(key=locale) + AppShell + 转场幕布
 * 说明：URL 前缀是语言唯一真源；本布局内组件随语言切换整体重挂载，
 *       保证静态导出产物语言正确（模块五国际化与 SEO 完善核心）
 */

// 导入依赖 //
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { iGM_AppShell as IGM_AppShell } from "../../iGM_AppShell/iGM_AppShell";
import { iGM_NavVeil as IGM_NavVeil } from "../../iGM_Components/iGM_NavVeil/iGM_NavVeil";
import { iGM_Providers as IGM_Providers } from "../../iGM_Providers/iGM_Providers";
import {
  iGM_GetMessages,
} from "../../iGM_i18n/iGM_Messages";
import {
  iGM_IsLocale,
  iGM_Locales,
  type iGM_Locale,
} from "../../iGM_i18n/iGM_Locales";

// 类型定义 //
interface iGM_LocaleLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

// 核心逻辑 //
/** 站点根地址：构建期可通过 IGM_SITE_URL 覆盖（默认生产域名） */
const iGM_SiteUrl = (
  process.env.IGM_SITE_URL ?? "https://igcraftlit.com"
).replace(/\/$/, "");

/** 构建期为五种语言各自生成静态路由参数（output: 'export' 必需） */
export function generateStaticParams(): { locale: iGM_Locale }[] {
  return iGM_Locales.map((locale) => ({ locale }));
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
  const locale = iGM_IsLocale(raw) ? raw : "zh-CN";
  const messages = iGM_GetMessages(locale);

  const languages = Object.fromEntries(
    iGM_Locales.map((item) => [item, `${iGM_SiteUrl}/${item}`]),
  );

  return {
    metadataBase: new URL(iGM_SiteUrl),
    title: {
      default: messages.site.name,
      template: `%s | ${messages.site.name}`,
    },
    description: messages.site.tagline,
    alternates: {
      canonical: `${iGM_SiteUrl}/${locale}`,
      languages: { ...languages, "x-default": iGM_SiteUrl },
    },
    openGraph: {
      type: "website",
      siteName: messages.site.name,
      title: messages.site.name,
      description: messages.site.tagline,
      locale,
      url: `${iGM_SiteUrl}/${locale}`,
    },
  };
}

/** WebSite 结构化数据：帮助搜索引擎识别站点名称与多语言版本 */
function iGM_WebsiteJsonLd({ locale }: { locale: iGM_Locale }): string {
  const messages = iGM_GetMessages(locale);
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: messages.site.name,
    description: messages.site.tagline,
    url: `${iGM_SiteUrl}/${locale}`,
    inLanguage: locale,
  });
}

/** 语言路由布局：按 locale 初始化 Provider 并挂载控制台外壳与转场幕布 */
export default async function iGM_LocaleLayout({
  children,
  params,
}: iGM_LocaleLayoutProps) {
  const { locale: raw } = await params;
  if (!iGM_IsLocale(raw)) notFound();
  const locale: iGM_Locale = raw;

  return (
    <IGM_Providers key={locale} initialLocale={locale}>
      <IGM_AppShell>{children}</IGM_AppShell>
      <IGM_NavVeil />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: iGM_WebsiteJsonLd({ locale }),
        }}
      />
    </IGM_Providers>
  );
}
