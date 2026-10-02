/**
 * 文件路径：apps/web/src/app/[locale]/G_AdminSystem/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_AdminSystem（G_Admin_System 系统面板）
 * 模块：G_AdminSystem
 * 作用：系统面板路由入口，纯静态壳 + 客户端调后端 API
 * 说明：模块二十五整合系统信息与邮件测试；
 *       管理员可见邮件测试，组织负责人仅系统信息只读（后端逐接口强制）
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";
import { iGM_AdminSystemPage as IGM_AdminSystemPage } from "../../../iGM_Pages/G_AdminSystem/iGM_AdminSystemPage";

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
    messageKey: "pages.adminSystem",
    path: "/G_AdminSystem",
  });
}
export default function G_AdminSystemRoute() {
  return <IGM_AdminSystemPage />;
}
