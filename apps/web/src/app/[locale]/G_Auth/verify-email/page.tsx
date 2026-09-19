/**
 * 文件路径：apps/web/src/app/[locale]/G_Auth/verify-email/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_Auth/verify-email
 * 模块：G_Auth
 * 作用：邮箱验证页路由入口，实际页面见 iGM_Pages/G_Auth/iGM_VerifyEmailPage
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_BuildPageMetadata } from "../../../../iGM_i18n/iGM_PageMetadata";
import { iGM_VerifyEmailPage as IGM_VerifyEmailPage } from "../../../../iGM_Pages/G_Auth/iGM_VerifyEmailPage";

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
    messageKey: "pages.authVerify",
    path: "/G_Auth/verify-email",
  });
}
export default function G_AuthVerifyEmailPage() {
  return <IGM_VerifyEmailPage />;
}
