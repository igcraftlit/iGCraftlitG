/**
 * 文件路径：apps/web/src/app/[locale]/G_DeveloperIntro/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_DeveloperIntro
 * 模块：G_DeveloperIntro
 * 作用：开发者初始界面路由入口，纯静态壳 + 客户端调用本地后端
 * 内容：三标签（开发者申请 / 申请文档 / 开发者公示），
 *       未通过审核的非开发者由此入口了解与提交申请
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_DeveloperIntroPage as IGM_DeveloperIntroPage } from "../../../iGM_Pages/G_DeveloperIntro/iGM_DeveloperIntroPage";
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
    messageKey: "pages.developerIntro",
    path: "/G_DeveloperIntro",
  });
}

// 导出 //
export default function G_DeveloperIntroRoute() {
  return <IGM_DeveloperIntroPage />;
}