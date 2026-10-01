/**
 * 文件路径：apps/web/src/app/[locale]/G_GameInstall/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_GameInstall?version=xxx
 * 模块：G_GameInstall
 * 作用：Minecraft 本体下载确认路由入口（仅登录用户）
 * 说明：useSearchParams 必须包在 Suspense 内，以满足 Next.js 静态导出要求
 */

// 导入依赖 //
import type { Metadata } from "next";
import { Suspense } from "react";
import { LoaderCircle } from "lucide-react";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_GameInstallPage as IGM_GameInstallPage } from "../../../iGM_Pages/G_GameInstall/iGM_GameInstallPage";

// 导出 //
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return iGM_BuildPageMetadata({
    locale,
    messageKey: "pages.gameInstall",
    path: "/G_GameInstall",
  });
}

export default function G_GameInstallRoute() {
  return (
    <IGM_RequireAuth>
      <Suspense
        fallback={
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "40vh",
            }}
          >
            <LoaderCircle size={16} className="igm-spin" />
          </div>
        }
      >
        <IGM_GameInstallPage />
      </Suspense>
    </IGM_RequireAuth>
  );
}