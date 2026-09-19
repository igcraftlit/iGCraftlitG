/**
 * 文件路径：apps/web/src/app/[locale]/G_AdminUsers/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_AdminUsers
 * 模块：G_AdminUsers
 * 作用：用户管理路由入口，纯静态壳 + 客户端调后端 API
 * 说明：权限 moderator 及以上；封禁与角色操作仅 admin（前端隐藏 + 后端校验）
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";
import { iGM_AdminUsersPage as IGM_AdminUsersPage } from "../../../iGM_Pages/G_AdminUsers/iGM_AdminUsersPage";

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
    messageKey: "pages.adminUsers",
    path: "/G_AdminUsers",
  });
}
export default function G_AdminUsersRoute() {
  return <IGM_AdminUsersPage />;
}
