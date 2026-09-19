/**
 * 文件路径：apps/web/src/app/[locale]/G_Auth/reset-password/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_Auth/reset-password
 * 模块：G_Auth
 * 作用：重置密码页路由入口，实际页面见 iGM_Pages/G_Auth/iGM_ResetPasswordPage
 * 说明：页面使用 useSearchParams 读取 token，静态导出要求 Suspense 边界
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_BuildPageMetadata } from "../../../../iGM_i18n/iGM_PageMetadata";
import { Suspense } from "react";
import { iGM_ResetPasswordPage as IGM_ResetPasswordPage } from "../../../../iGM_Pages/G_Auth/iGM_ResetPasswordPage";

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
    messageKey: "pages.authReset",
    path: "/G_Auth/reset-password",
  });
}
export default function G_AuthResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <IGM_ResetPasswordPage />
    </Suspense>
  );
}
