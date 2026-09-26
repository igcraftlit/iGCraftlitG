/**
 * 文件路径：apps/web/src/app/[locale]/G_MinecraftUpload/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_MinecraftUpload、/G_MinecraftUpload?resourceId=xxx
 * 模块：G_MinecraftUpload
 * 作用：Minecraft 资源上传/编辑路由入口，纯静态壳 + 客户端加载数据
 */

// 导入依赖 //
import type { Metadata } from "next";
import { Suspense } from "react";
import { LoaderCircle } from "lucide-react";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";
import { iGM_MinecraftUploadPage as IGM_MinecraftUploadPage } from "../../../iGM_Pages/G_MinecraftUpload/iGM_MinecraftUploadPage";

// 导出 //
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return iGM_BuildPageMetadata({
    locale,
    messageKey: "pages.minecraftUpload",
    path: "/G_MinecraftUpload",
  });
}

export default function G_MinecraftUploadRoute() {
  return (
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
      <IGM_MinecraftUploadPage />
    </Suspense>
  );
}
