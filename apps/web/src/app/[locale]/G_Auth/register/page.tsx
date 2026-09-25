/**
 * 文件路径：apps/web/src/app/[locale]/G_Auth/register/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_Auth/register
 * 模块：G_Auth
 * 作用：注册深链入口，渲染与根路径一致的登录/注册同屏界面（默认注册页签）
 * 说明：注册流程为五框向导，界面本体见 iGM_Pages/G_RootAuth
 */

// 导入依赖 //
import type { Metadata } from "next";
import { Suspense } from "react";
import { iGM_BuildPageMetadata } from "../../../../iGM_i18n/iGM_PageMetadata";
import { iGM_RootAuthPage as IGM_RootAuthPage } from "../../../../iGM_Pages/G_RootAuth/iGM_RootAuthPage";

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
    messageKey: "pages.authRegister",
    path: "/G_Auth/register",
  });
}

export default function G_AuthRegisterPage() {
  return (
    <Suspense fallback={null}>
      <IGM_RootAuthPage defaultTab="register" />
    </Suspense>
  );
}
