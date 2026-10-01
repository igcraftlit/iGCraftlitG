/**
 * 文件路径：apps/web/src/app/[locale]/G_DeveloperPortal/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_DeveloperPortal
 * 模块：G_DeveloperPortal
 * 作用：开发者平台首页路由入口，纯静态壳 + 客户端调用本地后端
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_DeveloperPortalPage as IGM_DeveloperPortalPage } from "../../../iGM_Pages/G_DeveloperPortal/iGM_DeveloperPortalPage";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";

// SEO：按语言生成页面元数据
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return iGM_BuildPageMetadata({
    locale,
    messageKey: "pages.developerPortal",
    path: "/G_DeveloperPortal",
  });
}

// 导出 //
export default function G_DeveloperPortalRoute() {
  return <IGM_DeveloperPortalPage />;
}
