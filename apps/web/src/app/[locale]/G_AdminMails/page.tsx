/**
 * 文件路径：apps/web/src/app/[locale]/G_AdminMails/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_AdminMails
 * 模块：G_AdminMails
 * 作用：邮件测试路由入口，纯静态壳 + 客户端调后端 API
 * 说明：仅 admin（页面 RequireAuth + 后端 iGM_AuthGuard 双重校验）
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";
import { iGM_AdminMailsPage as IGM_AdminMailsPage } from "../../../iGM_Pages/G_AdminMails/iGM_AdminMailsPage";

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
    messageKey: "pages.adminMails",
    path: "/G_AdminMails",
  });
}
export default function G_AdminMailsRoute() {
  return <IGM_AdminMailsPage />;
}
