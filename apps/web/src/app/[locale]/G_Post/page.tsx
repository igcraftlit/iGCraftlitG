/**
 * 文件路径：apps/web/src/app/[locale]/G_Post/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_Post?postId=xxx
 * 模块：G_Post
 * 作用：帖子详情路由入口，静态壳 + 客户端按 postId 加载
 * 说明：useSearchParams 必须包在 Suspense 内，以满足 Next.js 静态导出要求
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";
import { Suspense } from "react";
import { LoaderCircle } from "lucide-react";
import { iGM_PostDetailPage as IGM_PostDetailPage } from "../../../iGM_Pages/G_Post/iGM_PostDetailPage";

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
    messageKey: "pages.post",
    path: "/G_Post",
  });
}
export default function G_PostRoute() {
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
      <IGM_PostDetailPage />
    </Suspense>
  );
}
