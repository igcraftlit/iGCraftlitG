/**
 * 文件路径：apps/web/src/app/[locale]/G_GameInstalled/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_GameInstalled
 * 模块：G_GameInstalled
 * 作用：已安装 Minecraft 版本管理路由入口（仅登录用户）
 * 说明：本页不使用 useSearchParams，无需 Suspense 包裹
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_GameInstalledPage as IGM_GameInstalledPage } from "../../../iGM_Pages/G_GameInstalled/iGM_GameInstalledPage";

// 导出 //
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return iGM_BuildPageMetadata({
    locale,
    messageKey: "pages.gameInstalled",
    path: "/G_GameInstalled",
  });
}

export default function G_GameInstalledRoute() {
  return (
    <IGM_RequireAuth>
      <IGM_GameInstalledPage />
    </IGM_RequireAuth>
  );
}