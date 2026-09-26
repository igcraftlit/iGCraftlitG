/**
 * 文件路径：apps/web/src/app/[locale]/G_Dashboard/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_Dashboard
 * 模块：G_Dashboard
 * 作用：运营看板路由入口，纯静态壳
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";
import { iGM_DashboardPage as IGM_DashboardPage } from "../../../iGM_Pages/G_Dashboard/iGM_DashboardPage";

// 导出 //
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return iGM_BuildPageMetadata({
    locale,
    messageKey: "pages.dashboard",
    path: "/G_Dashboard",
  });
}

export default function G_DashboardRoute() {
  return <IGM_DashboardPage />;
}
