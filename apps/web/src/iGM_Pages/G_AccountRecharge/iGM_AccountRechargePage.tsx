/**
 * 文件路径：apps/web/src/iGM_Pages/G_AccountRecharge/iGM_AccountRechargePage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_Account_Recharge
 * 模块：G_AccountRecharge
 * 作用：SPR 充值占位页（AI 赋能系统模块三）——Premium 通道「充值 SPR」入口落点
 * 内容：页头（标题 / SPR 说明）与「即将开放」占位面板
 * 说明：纯静态 SSG 占位页，暂未接入支付；正式充值能力后续模块开放
 */

// 导入依赖 //
"use client";

import { useTranslations } from "next-intl";
import { Coins } from "lucide-react";
import pageStyles from "../iGM_Page.module.css";

// 类型定义 //
// （本页无数据类型）

// 核心逻辑 //
/** SPR 充值占位页主体 */
export function iGM_AccountRechargePage() {
  const t = useTranslations();

  return (
    <div className={pageStyles.page}>
      <header className={pageStyles.pageHeader}>
        <h1 className={pageStyles.pageTitle}>
          <span className={pageStyles.pageTitleIcon}>
            <Coins size={22} strokeWidth={1.8} />
          </span>
          {t("pages.accountRecharge.title")}
        </h1>
        <p className={pageStyles.pageDescription}>
          {t("pages.accountRecharge.description")}
        </p>
      </header>

      {/* 占位面板：充值能力后续开放 */}
      <section className={pageStyles.placeholderPanel}>
        <span className={pageStyles.placeholderBadge}>
          {t("pages.accountRecharge.badge")}
        </span>
        <p className={pageStyles.placeholderText}>
          {t("pages.accountRecharge.comingSoon")}
        </p>
      </section>
    </div>
  );
}

// 导出 //
export default iGM_AccountRechargePage;