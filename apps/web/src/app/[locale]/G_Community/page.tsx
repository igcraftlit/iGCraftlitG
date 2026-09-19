/**
 * 文件路径：apps/web/src/app/[locale]/G_Community/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_Community?category=&tag=&q=&page=
 * 模块：G_Community
 * 作用：社区广场路由入口，纯静态壳 + 客户端按查询参数加载数据
 * 说明：useSearchParams 必须包在 Suspense 内，以满足 Next.js 静态导出要求
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";
import { Suspense } from "react";
import { LoaderCircle } from "lucide-react";
import { iGM_CommunityPage as IGM_CommunityPage } from "../../../iGM_Pages/G_Community/iGM_CommunityPage";

// 导出 //

// SEO：按语言生成页面元数据（模块五国际化与 SEO 完善）
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return iGM_BuildPageMetadata({
    locale,
    messageKey: "pages.community",
    path: "/G_Community",
  });
}
export default function G_CommunityRoute() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            minHeight: "40vh",
            color: "var(--igm-text-muted)",
            fontSize: 13,
          }}
        >
          <LoaderCircle size={16} className="igm-spin" />
        </div>
      }
    >
      <IGM_CommunityPage />
    </Suspense>
  );
}
