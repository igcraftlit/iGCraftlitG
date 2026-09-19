/**
 * 文件路径：apps/web/src/app/[locale]/G_User/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_User?userId=xxx
 * 模块：G_User
 * 作用：用户公开个人主页路由入口，静态壳 + 客户端按 userId 加载
 * 说明：useSearchParams 必须包在 Suspense 内，以满足静态导出要求
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";
import { Suspense } from "react";
import { LoaderCircle } from "lucide-react";
import { iGM_UserProfilePage as IGM_UserProfilePage } from "../../../iGM_Pages/G_User/iGM_UserProfilePage";

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
    messageKey: "pages.profile",
    path: "/G_User",
  });
}
export default function G_UserRoute() {
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
      <IGM_UserProfilePage />
    </Suspense>
  );
}
