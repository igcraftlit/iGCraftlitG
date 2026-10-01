/**
 * 文件路径：apps/web/src/app/[locale]/G_Levels/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_Levels
 * 模块：G_Levels
 * 作用：等级展示页路由入口，纯静态壳 + 客户端调用本地后端
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_LevelsPage as IGM_LevelsPage } from "../../../iGM_Pages/G_Levels/iGM_LevelsPage";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";

// SEO：按语言生成页面元数据
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return iGM_BuildPageMetadata({
    locale,
    messageKey: "pages.levels",
    path: "/G_Levels",
  });
}

// 导出 //
export default function G_LevelsRoute() {
  return <IGM_LevelsPage />;
}