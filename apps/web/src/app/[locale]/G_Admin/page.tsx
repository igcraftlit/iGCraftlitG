/**
 * 文件路径：apps/web/src/app/[locale]/G_Admin/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_Admin
 * 模块：G_Admin
 * 作用：管理后台旧入口，模块五起自动跳转至 /G_AdminDashboard
 * 说明：静态导出无法服务端 302，使用客户端 replace 保持当前语言前缀
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";
import { iGM_AdminRedirect as IGM_AdminRedirect } from "../../../iGM_Pages/iGM_AdminRedirect";

// 导出 //

// SEO：管理后台不对外收录，仅提供基础元数据
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return iGM_BuildPageMetadata({
    locale,
    messageKey: "pages.adminDashboard",
    path: "/G_Admin",
  });
}
export default function G_AdminRoute() {
  return <IGM_AdminRedirect />;
}
