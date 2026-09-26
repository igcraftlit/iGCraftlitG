/**
 * 文件路径：apps/web/src/app/[locale]/G_MessageSettings/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_MessageSettings
 * 模块：G_MessageSettings
 * 作用：私信隐私设置路由入口，纯静态壳 + 客户端加载数据
 */

// 导入依赖 //
import type { Metadata } from "next";
import { Suspense } from "react";
import { LoaderCircle } from "lucide-react";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";
import { iGM_MessageSettingsPage as IGM_MessageSettingsPage } from "../../../iGM_Pages/G_MessageSettings/iGM_MessageSettingsPage";

// 导出 //
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return iGM_BuildPageMetadata({
    locale,
    messageKey: "pages.messageSettings",
    path: "/G_MessageSettings",
  });
}

export default function G_MessageSettingsRoute() {
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
      <IGM_MessageSettingsPage />
    </Suspense>
  );
}
