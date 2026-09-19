/**
 * 文件路径：apps/web/src/app/[locale]/G_Points/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_Points
 * 模块：G_Points
 * 作用：我的积分路由入口，纯静态壳 + 客户端调用本地后端
 * 说明：登录可见，角色控制为体验层，安全边界在后端
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_PointsPage as IGM_PointsPage } from "../../../iGM_Pages/G_Points/iGM_PointsPage";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";

// SEO：按语言生成页面元数据（模块五国际化与 SEO 完善）
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return iGM_BuildPageMetadata({
    locale,
    messageKey: "pages.points",
    path: "/G_Points",
  });
}

// 导出 //
export default function G_PointsRoute() {
  return <IGM_PointsPage />;
}
