/**
 * 文件路径：apps/web/src/app/[locale]/G_AdminOAuth/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_AdminOAuth
 * 模块：G_AdminOAuth
 * 作用：管理端 OAuth 应用审核路由入口，纯静态壳 + 客户端调用本地后端
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_AdminOAuthPage as IGM_AdminOAuthPage } from "../../../iGM_Pages/G_AdminOAuth/iGM_AdminOAuthPage";
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
    messageKey: "pages.adminOAuth",
    path: "/G_AdminOAuth",
  });
}

// 导出 //
export default function G_AdminOAuthRoute() {
  return <IGM_AdminOAuthPage />;
}
