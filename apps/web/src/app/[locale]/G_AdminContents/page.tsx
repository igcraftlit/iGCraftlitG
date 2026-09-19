/**
 * 文件路径：apps/web/src/app/[locale]/G_AdminContents/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_AdminContents
 * 模块：G_AdminContents
 * 作用：内容审核路由入口，纯静态壳 + 客户端调后端 API
 * 说明：权限 moderator 及以上（页面 RequireAuth + 后端 iGM_AuthGuard 双重校验）
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";
import { iGM_AdminContentsPage as IGM_AdminContentsPage } from "../../../iGM_Pages/G_AdminContents/iGM_AdminContentsPage";

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
    messageKey: "pages.adminContents",
    path: "/G_AdminContents",
  });
}
export default function G_AdminContentsRoute() {
  return <IGM_AdminContentsPage />;
}
