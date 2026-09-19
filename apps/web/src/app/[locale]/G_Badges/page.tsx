/**
 * 文件路径：apps/web/src/app/[locale]/G_Badges/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_Badges
 * 模块：G_Badges
 * 作用：勋章墙路由入口，纯静态壳 + 客户端调用本地后端
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_BadgesPage as IGM_BadgesPage } from "../../../iGM_Pages/G_Badges/iGM_BadgesPage";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";

// SEO：按语言生成页面元数据（模块五国际化与 SEO 完善）
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return iGM_BuildPageMetadata({
    locale,
    messageKey: "pages.badges",
    path: "/G_Badges",
  });
}

// 导出 //
export default function G_BadgesRoute() {
  return <IGM_BadgesPage />;
}
