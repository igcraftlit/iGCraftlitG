/**
 * 文件路径：apps/web/src/app/[locale]/G_ExaminerReview/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_ExaminerReview
 * 模块：G_ExaminerReview
 * 作用：命题创作者申请审核路由入口，纯静态壳 + 客户端调后端 API
 * 说明：页面 RequireAuth（staff）守卫，审核权限（管理员或信任组织负责人）
 *       由后端二次校验；普通用户 403
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";
import { iGM_ExaminerReviewPage as IGM_ExaminerReviewPage } from "../../../iGM_Pages/G_ExaminerReview/iGM_ExaminerReviewPage";

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
    messageKey: "pages.examinerReview",
    path: "/G_ExaminerReview",
  });
}
export default function G_ExaminerReviewRoute() {
  return <IGM_ExaminerReviewPage />;
}
