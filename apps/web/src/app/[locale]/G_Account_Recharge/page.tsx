/**
 * 文件路径：apps/web/src/app/[locale]/G_Account_Recharge/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_Account_Recharge
 * 模块：G_AccountRecharge
 * 作用：SPR 充值占位页路由入口，纯静态壳
 * 说明：入口来自 iGM StarWhisper Premium 通道「充值 SPR」按钮；构建期按五语言静态生成
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_AccountRechargePage as IGM_AccountRechargePage } from "../../../iGM_Pages/G_AccountRecharge/iGM_AccountRechargePage";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";

// SEO：按语言生成页面元数据
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return iGM_BuildPageMetadata({
    locale,
    messageKey: "pages.accountRecharge",
    path: "/G_Account_Recharge",
  });
}

// 导出 //
export default function G_AccountRechargeRoute() {
  return <IGM_AccountRechargePage />;
}