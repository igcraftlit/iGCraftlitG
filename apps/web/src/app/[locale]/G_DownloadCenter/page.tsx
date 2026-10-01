/**
 * 文件路径：apps/web/src/app/[locale]/G_DownloadCenter/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_DownloadCenter?taskId=xxx
 * 模块：G_DownloadCenter
 * 作用：第三方资源下载中心路由入口（仅登录用户），纯静态壳 + 客户端加载数据
 * 说明：useSearchParams 必须包在 Suspense 内，以满足 Next.js 静态导出要求
 */

// 导入依赖 //
import type { Metadata } from "next";
import { Suspense } from "react";
import { LoaderCircle } from "lucide-react";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_DownloadCenterPage as IGM_DownloadCenterPage } from "../../../iGM_Pages/G_DownloadCenter/iGM_DownloadCenterPage";

// 导出 //
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return iGM_BuildPageMetadata({
    locale,
    messageKey: "pages.downloadCenter",
    path: "/G_DownloadCenter",
  });
}

export default function G_DownloadCenterRoute() {
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
        <IGM_DownloadCenterPage />
      </Suspense>
    </IGM_RequireAuth>
  );
}