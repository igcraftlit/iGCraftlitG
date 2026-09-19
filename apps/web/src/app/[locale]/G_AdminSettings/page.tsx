/**
 * 文件路径：apps/web/src/app/[locale]/G_AdminSettings/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_AdminSettings
 * 模块：G_AdminSettings
 * 作用：系统信息路由入口，纯静态壳 + 客户端调后端 API
 * 说明：仅 admin（页面 RequireAuth + 后端 iGM_AuthGuard 双重校验）
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";
import { iGM_AdminSettingsPage as IGM_AdminSettingsPage } from "../../../iGM_Pages/G_AdminSettings/iGM_AdminSettingsPage";

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
    messageKey: "pages.adminSettings",
    path: "/G_AdminSettings",
  });
}
export default function G_AdminSettingsRoute() {
  return <IGM_AdminSettingsPage />;
}
