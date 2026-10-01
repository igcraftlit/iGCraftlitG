/**
 * 文件路径：apps/launcher-download/src/app/[locale]/layout.tsx
 * 所属层：前端 / 语言路由布局层
 * 路由：/{locale} 下全部页面
 * 模块：iGM_LauncherDl_Downloader
 * 作用：多语言路由布局——静态参数生成、动态参数禁用、SEO 元数据、Provider 与站点外壳（Header/Footer）
 * 内容：五种语言 generateStaticParams、dynamicParams=false、
 *       每语言 canonical 与 hreflang（含 x-default 指向站点根）、Open Graph
 */

// 导入依赖 //
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { iGM_LauncherDl_IsLocale, iGM_LauncherDl_Locales } from "../../i18n/iGM_LauncherDl_Locales";
import { iGM_LauncherDl_SiteUrl } from "../../i18n/iGM_LauncherDl_SiteUrl";
import { iGM_LauncherDl_Providers as IGM_LauncherDl_Providers } from "../../components/iGM_LauncherDl_Providers/iGM_LauncherDl_Providers";
import { iGM_LauncherDl_Header as IGM_LauncherDl_Header } from "../../components/iGM_LauncherDl_Header/iGM_LauncherDl_Header";
import { iGM_LauncherDl_Footer as IGM_LauncherDl_Footer } from "../../components/iGM_LauncherDl_Footer/iGM_LauncherDl_Footer";

// 类型定义 //
interface iGM_LauncherDl_LocaleLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

// 核心逻辑 //
/** 语言路由段：纯静态导出，仅预生成五种语言 */
export const dynamicParams = false;

/** 预生成五种语言的静态参数 */
export function generateStaticParams(): { locale: string }[] {
  return iGM_LauncherDl_Locales.map((locale) => ({ locale }));
}

/** 生成每语言的 SEO 元数据：canonical + hreflang + x-default */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!iGM_LauncherDl_IsLocale(locale)) return {};

  const languages: Record<string, string> = {};
  for (const item of iGM_LauncherDl_Locales) {
    languages[item] = `${iGM_LauncherDl_SiteUrl}/${item}`;
  }
  // x-default 指向站点根，由根页面按浏览器语言重定向
  languages["x-default"] = iGM_LauncherDl_SiteUrl;

  return {
    metadataBase: new URL(iGM_LauncherDl_SiteUrl),
    title: {
      default: "iGM CraftCeon Launcher",
      template: "%s | iGM CraftCeon Launcher",
    },
    description: "iGCraftLit × MuoCeon 联合构建",
    alternates: {
      canonical: `${iGM_LauncherDl_SiteUrl}/${locale}`,
      languages,
    },
    openGraph: {
      type: "website",
      siteName: "iGM CraftCeon Launcher",
      title: "iGM CraftCeon Launcher",
      description: "iGCraftLit × MuoCeon 联合构建",
      url: `${iGM_LauncherDl_SiteUrl}/${locale}`,
    },
  };
}

/** 语言路由布局：Provider 包裹 Header、内容、Footer */
export default async function iGM_LauncherDl_LocaleLayout({
  children,
  params,
}: iGM_LauncherDl_LocaleLayoutProps) {
  const { locale } = await params;
  if (!iGM_LauncherDl_IsLocale(locale)) notFound();

  return (
    <IGM_LauncherDl_Providers initialLocale={locale}>
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--igm-bg)",
        }}
      >
        <IGM_LauncherDl_Header />
        <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
        <IGM_LauncherDl_Footer />
      </div>
    </IGM_LauncherDl_Providers>
  );
}