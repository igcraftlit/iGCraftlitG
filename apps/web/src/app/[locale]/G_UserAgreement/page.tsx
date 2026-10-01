/**
 * 文件路径：apps/web/src/app/[locale]/G_UserAgreement/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_UserAgreement（?from=register 时为注册向导第三步阅读模式）
 * 模块：G_UserAgreement
 * 作用：用户管理规定查看页路由入口，纯静态壳 + 客户端 Markdown 渲染与滚动交互
 * 说明：公开页面，构建期按五语言静态生成；
 *       页面使用 useSearchParams，需 Suspense 包裹以满足静态导出
 */

// 导入依赖 //
import type { Metadata } from "next";
import { Suspense } from "react";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";
import { iGM_UserAgreementPage as IGM_UserAgreementPage } from "../../../iGM_Pages/G_UserAgreement/iGM_UserAgreementPage";

// SEO：按语言生成页面元数据
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return iGM_BuildPageMetadata({
    locale,
    messageKey: "pages.userAgreement",
    path: "/G_UserAgreement",
  });
}

// 导出 //
export default function G_UserAgreementRoute() {
  return (
    <Suspense fallback={null}>
      <IGM_UserAgreementPage />
    </Suspense>
  );
}