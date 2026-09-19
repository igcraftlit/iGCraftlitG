/**
 * 文件路径：apps/web/src/app/[locale]/G_AdminDashboard/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_AdminDashboard
 * 模块：G_AdminDashboard
 * 作用：管理后台数据概览路由入口，纯静态壳 + 客户端调后端 API
 * 说明：权限 moderator 及以上（页面 RequireAuth + 后端 iGM_AuthGuard 双重校验）
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";
import { iGM_AdminDashboardPage as IGM_AdminDashboardPage } from "../../../iGM_Pages/G_AdminDashboard/iGM_AdminDashboardPage";

// 导出 //

// SEO：按语言生成页面元数据
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return iGM_BuildPageMetadata({
    locale,
    messageKey: "pages.adminDashboard",
    path: "/G_AdminDashboard",
  });
}
export default function G_AdminDashboardRoute() {
  return <IGM_AdminDashboardPage />;
}
