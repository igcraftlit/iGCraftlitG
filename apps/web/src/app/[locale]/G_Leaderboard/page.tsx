/**
 * 文件路径：apps/web/src/app/[locale]/G_Leaderboard/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_Leaderboard
 * 模块：G_Leaderboard
 * 作用：积分排行榜路由入口，纯静态壳 + 客户端调用本地后端
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_LeaderboardPage as IGM_LeaderboardPage } from "../../../iGM_Pages/G_Leaderboard/iGM_LeaderboardPage";
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
    messageKey: "pages.leaderboard",
    path: "/G_Leaderboard",
  });
}

// 导出 //
export default function G_LeaderboardRoute() {
  return <IGM_LeaderboardPage />;
}
