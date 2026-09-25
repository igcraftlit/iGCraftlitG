/**
 * 文件路径：apps/web/src/app/[locale]/G_OrgDetails/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_OrgDetails?orgId=xxx（或 slug）
 * 模块：G_OrgDetails
 * 作用：组织详情路由入口，纯静态壳 + 客户端按 orgId/slug 加载
 * 说明：useSearchParams 必须包在 Suspense 内，以满足静态导出要求；
 *       页面公开可读，编辑/退出权限由后端校验
 */

// 导入依赖 //
import type { Metadata } from "next";
import { Suspense } from "react";
import { LoaderCircle } from "lucide-react";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";
import { iGM_OrgDetailsPage as IGM_OrgDetailsPage } from "../../../iGM_Pages/G_OrgDetails/iGM_OrgDetailsPage";

// 导出 //

// SEO：按语言生成页面元数据
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return iGM_BuildPageMetadata({
    locale,
    messageKey: "pages.orgDetails",
    path: "/G_OrgDetails",
  });
}

export default function G_OrgDetailsRoute() {
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
      <IGM_OrgDetailsPage />
    </Suspense>
  );
}
