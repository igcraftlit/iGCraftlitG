/**
 * 文件路径：apps/web/src/app/[locale]/G_AdminDashboard/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_AdminDashboard（G_Admin_Dashboard 综合面板）
 * 模块：G_AdminDashboard
 * 作用：管理后台综合面板路由入口，纯静态壳 + 客户端调后端 API
 * 说明：模块二十五起整合实时状态 / 运营看板 / 数据详情；
 *       权限协管员 / 管理员 / 受信任组织负责人（前端 RequireAuth + 后端强制）
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
    messageKey: "pages.adminPanel",
    path: "/G_AdminDashboard",
  });
}
export default function G_AdminDashboardRoute() {
  return <IGM_AdminDashboardPage />;
}
