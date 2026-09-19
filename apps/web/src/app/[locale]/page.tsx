/**
 * 文件路径：apps/web/src/app/[locale]/page.tsx
 * 所属层：前端 / 语言路由根页面（Next.js App Router 框架必需文件）
 * 路由：/{locale}（如 /zh-CN、/en）
 * 模块：G_Landing
 * 作用：各语言前缀根路径入口，渲染控制台之前的品牌门户落地页
 * 说明：本文件为 Next.js 强制命名的框架入口，实际逻辑见 iGM_Pages/G_Landing/iGM_LandingPage
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_LandingPage as IGM_LandingPage } from "../../iGM_Pages/G_Landing/iGM_LandingPage";
import { iGM_BuildPageMetadata } from "../../iGM_i18n/iGM_PageMetadata";

// SEO：按语言生成页面元数据（模块五国际化与 SEO 完善）
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return iGM_BuildPageMetadata({
    locale,
    messageKey: "pages.home",
    path: "/",
  });
}

// 导出 //
export default function iGM_RootPage() {
  return <IGM_LandingPage />;
}
