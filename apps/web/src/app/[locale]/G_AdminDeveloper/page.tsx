/**
 * 文件路径：apps/web/src/app/[locale]/G_AdminDeveloper/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_AdminDeveloper（管理后台开发者分区）
 * 模块：G_AdminDeveloper
 * 作用：开发者分区路由入口，纯静态壳 + 客户端调后端 API
 * 说明：模块二十五新增；申请审核 / 应用审核 / 开发者账号 / 调用量监测；
 *       仅管理员与受信任组织负责人可访问（前端 RequireAuth + 后端强制）
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";
import { iGM_AdminDeveloperPage as IGM_AdminDeveloperPage } from "../../../iGM_Pages/G_AdminDeveloper/iGM_AdminDeveloperPage";

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
    messageKey: "pages.adminDeveloper",
    path: "/G_AdminDeveloper",
  });
}
export default function G_AdminDeveloperRoute() {
  return <IGM_AdminDeveloperPage />;
}
