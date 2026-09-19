/**
 * 文件路径：apps/web/src/app/[locale]/G_UserComments/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_UserComments
 * 模块：G_UserComments
 * 作用：我的评论页面路由入口（仅登录用户）
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_MyCommentsPage as IGM_MyCommentsPage } from "../../../iGM_Pages/G_UserComments/iGM_MyCommentsPage";

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
    messageKey: "pages.profile",
    path: "/G_UserComments",
  });
}
export default function G_UserCommentsRoute() {
  return (
    <IGM_RequireAuth>
      <IGM_MyCommentsPage />
    </IGM_RequireAuth>
  );
}
