/**
 * 文件路径：apps/web/src/app/[locale]/G_StatsDetail/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_StatsDetail
 * 模块：G_StatsDetail
 * 作用：数据详情页路由入口，纯静态壳
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";
import { iGM_StatsDetailPage as IGM_StatsDetailPage } from "../../../iGM_Pages/G_StatsDetail/iGM_StatsDetailPage";

// 导出 //
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return iGM_BuildPageMetadata({
    locale,
    messageKey: "pages.statsDetail",
    path: "/G_StatsDetail",
  });
}

export default function G_StatsDetailRoute() {
  return <IGM_StatsDetailPage />;
}
