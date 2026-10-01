/**
 * 文件路径：apps/web/src/app/[locale]/G_DeveloperReview/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_DeveloperReview
 * 模块：G_DeveloperReview
 * 作用：开发者申请审核路由入口，纯静态壳 + 客户端调后端 API
 * 说明：页面 RequireAuth 守卫，审核权限（管理员或受信任组织负责人）
 *       由后端 iGM_IsDeveloperReviewer 二次校验
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";
import { iGM_DeveloperReviewPage as IGM_DeveloperReviewPage } from "../../../iGM_Pages/G_DeveloperReview/iGM_DeveloperReviewPage";

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
    messageKey: "pages.developerReview",
    path: "/G_DeveloperReview",
  });
}
export default function G_DeveloperReviewRoute() {
  return <IGM_DeveloperReviewPage />;
}