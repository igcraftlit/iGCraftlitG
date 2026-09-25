/**
 * 文件路径：apps/web/src/app/[locale]/G_Auth/login/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_Auth/login
 * 模块：G_Auth
 * 作用：登录深链入口，渲染与根路径一致的登录/注册同屏界面（默认登录页签）
 * 说明：站内各处登录链接指向本路径；界面本体见 iGM_Pages/G_RootAuth
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
    messageKey: "pages.authLogin",
    path: "/G_Auth/login",
  });
}

export default function G_AuthLoginPage() {
  return (
    <Suspense fallback={null}>
      <IGM_RootAuthPage defaultTab="login" />
    </Suspense>
  );
}
