/**
 * 文件路径：apps/web/src/app/[locale]/G_PostEdit/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_PostEdit、/G_PostEdit?postId=xxx
 * 模块：G_PostEdit
 * 作用：发帖与编辑帖子路由入口，需要登录
 * 说明：RequireAuth 为体验层守卫，真正的权限边界在后端；
 *       useSearchParams 包在 Suspense 内以满足静态导出要求
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";
import { Suspense } from "react";
import { LoaderCircle } from "lucide-react";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_PostEditPage as IGM_PostEditPage } from "../../../iGM_Pages/G_PostEdit/iGM_PostEditPage";

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
    path: "/G_PostEdit",
  });
}
export default function G_PostEditRoute() {
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
        <IGM_PostEditPage />
      </Suspense>
    </IGM_RequireAuth>
  );
}
