/**
 * 文件路径：apps/web/src/app/[locale]/G_AdminExaminer/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_AdminExaminer
 * 模块：G_AdminExaminer
 * 作用：命题创作者申请审核路由入口，纯静态壳 + 客户端调后端 API
 * 说明：仅管理员可访问（前端隐藏 + 后端 /api/admin/examiner-applications 强制校验）
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";
import { iGM_AdminExaminerPage as IGM_AdminExaminerPage } from "../../../iGM_Pages/G_AdminExaminer/iGM_AdminExaminerPage";

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
    messageKey: "pages.adminExaminer",
    path: "/G_AdminExaminer",
  });
}
export default function G_AdminExaminerRoute() {
  return <IGM_AdminExaminerPage />;
}
