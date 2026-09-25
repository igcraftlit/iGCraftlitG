/**
 * 文件路径：apps/web/src/app/[locale]/G_OrgVerify/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_OrgVerify
 * 模块：G_OrgVerify
 * 作用：组织认证申请路由入口，纯静态壳 + 客户端调后端 API
 * 说明：仅登录用户可访问（页面 RequireAuth + 后端 iGM_AuthGuard 双重校验）
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";
import { iGM_OrgVerifyPage as IGM_OrgVerifyPage } from "../../../iGM_Pages/G_OrgVerify/iGM_OrgVerifyPage";

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
    messageKey: "pages.orgVerify",
    path: "/G_OrgVerify",
  });
}
export default function G_OrgVerifyRoute() {
  return <IGM_OrgVerifyPage />;
}
