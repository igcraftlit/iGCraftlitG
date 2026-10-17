/**
 * 文件路径：apps/web/src/app/[locale]/auth/muoceon/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/auth/muoceon
 * 模块：G_MuoCeonAuth
 * 作用：MuoCeon 账号授权中转页入口，渲染独立全屏授权界面
 * 内容：按语言生成页面元数据，并渲染 iGM_MuoCeonAuthPage
 * 说明：本路径由 iGM_IsShellExemptPath 豁免，不挂载主站侧边导航/顶部栏/页脚
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_BuildPageMetadata } from "../../../../iGM_i18n/iGM_PageMetadata";
import { iGM_MuoCeonAuthPage as IGM_MuoCeonAuthPage } from "../../../../iGM_Pages/G_MuoCeonAuth/iGM_MuoCeonAuthPage";

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
    messageKey: "pages.authMuoceon",
    path: "/auth/muoceon",
  });
}

export default function G_MuoCeonAuthRoute() {
  return <IGM_MuoCeonAuthPage />;
}
