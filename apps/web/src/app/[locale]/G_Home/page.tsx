/**
 * 文件路径：apps/web/src/app/[locale]/G_Home/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_Home
 * 模块：G_Home
 * 作用：首页路由入口，实际页面见 iGM_Pages/G_Home
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";
import { G_Home } from "../../../iGM_Pages/G_Home";

// 导出 //

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
    path: "/G_Home",
  });
}
export default function G_HomePage() {
  return <G_Home />;
}
