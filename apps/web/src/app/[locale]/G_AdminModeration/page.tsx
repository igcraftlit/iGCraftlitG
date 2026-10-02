/**
 * 文件路径：apps/web/src/app/[locale]/G_AdminModeration/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_AdminModeration（G_Admin_Moderation 审核面板）
 * 模块：G_AdminModeration
 * 作用：审核面板路由入口，纯静态壳 + 客户端调后端 API
 * 说明：模块二十五整合内容审核 / 举报处理 / 认证审核；
 *       协管员 / 管理员可操作，组织负责人只读（前端 RequireAuth + 后端强制）
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";
import { iGM_AdminModerationPage as IGM_AdminModerationPage } from "../../../iGM_Pages/G_AdminModeration/iGM_AdminModerationPage";

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
    messageKey: "pages.adminModeration",
    path: "/G_AdminModeration",
  });
}
export default function G_AdminModerationRoute() {
  return <IGM_AdminModerationPage />;
}
