/**
 * 文件路径：apps/web/src/app/[locale]/G_Realtime/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_Realtime
 * 模块：G_Realtime
 * 作用：实时在线状态页路由入口，纯静态壳
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";
import { iGM_RealtimePage as IGM_RealtimePage } from "../../../iGM_Pages/G_Realtime/iGM_RealtimePage";

// 导出 //
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return iGM_BuildPageMetadata({
    locale,
    messageKey: "pages.realtime",
    path: "/G_Realtime",
  });
}

export default function G_RealtimeRoute() {
  return <IGM_RealtimePage />;
}
