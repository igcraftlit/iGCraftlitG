/**
 * 文件路径：apps/web/src/app/[locale]/G_UserRules/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_UserRules（?from=register 时为注册向导第四框阅读模式）
 * 模块：G_UserRules
 * 作用：用户管理规定查看页路由入口，纯静态壳 + 客户端滚动交互
 * 说明：公开页面，构建期按五语言静态生成；
 *       页面使用 useSearchParams，需 Suspense 包裹以满足静态导出
 */

// 导入依赖 //
import type { Metadata } from "next";
import { Suspense } from "react";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";
import { iGM_UserRulesPage as IGM_UserRulesPage } from "../../../iGM_Pages/G_UserRules/iGM_UserRulesPage";

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
    messageKey: "pages.userRules",
    path: "/G_UserRules",
  });
}

export default function G_UserRulesRoute() {
  return (
    <Suspense fallback={null}>
      <IGM_UserRulesPage />
    </Suspense>
  );
}
