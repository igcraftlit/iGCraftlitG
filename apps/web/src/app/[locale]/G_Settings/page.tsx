/**
 * 文件路径：apps/web/src/app/[locale]/G_Settings/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_Settings
 * 模块：G_Settings / G_Auth
 * 作用：账户设置页路由入口，实际页面见 iGM_Pages/iGM_AccountSettingsPage
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";
import { iGM_AccountSettingsPage as IGM_AccountSettingsPage } from "../../../iGM_Pages/iGM_AccountSettingsPage";

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
    messageKey: "pages.settings",
    path: "/G_Settings",
  });
}
export default function G_SettingsPage() {
  return <IGM_AccountSettingsPage />;
}
