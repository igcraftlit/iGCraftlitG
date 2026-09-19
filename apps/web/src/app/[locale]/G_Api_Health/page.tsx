/**
 * 文件路径：apps/web/src/app/[locale]/G_Api_Health/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_Api_Health
 * 模块：G_Api_Health
 * 作用：健康检查页路由入口，实际页面见 iGM_Pages/G_Api_Health
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";
import { G_Api_Health } from "../../../iGM_Pages/G_Api_Health";

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
    messageKey: "pages.apiHealth",
    path: "/G_Api_Health",
  });
}
export default function G_Api_HealthPage() {
  return <G_Api_Health />;
}
