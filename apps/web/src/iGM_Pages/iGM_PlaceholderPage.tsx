/**
 * 文件路径：apps/web/src/iGM_Pages/iGM_PlaceholderPage.tsx
 * 所属层：前端 / 页面层
 * 路由：G_Notification、G_Community、G_Post、G_Activity、
 *       G_Resources、G_User、G_Settings、G_Admin
 * 模块：iGM_PlaceholderPage
 * 作用：模块一各业务页的统一界面骨架占位
 * 内容：页头（图标 + 标题 + 说明）与“后续版本提供”占位面板，不含业务逻辑
 */

// 导入依赖 //
"use client";

import { useTranslations } from "next-intl";
import { iGM_NavGroups } from "../iGM_Navigation/iGM_NavConfig";
import styles from "./iGM_Page.module.css";

// 类型定义 //
/** 占位页标识：必须对应语言包 pages 下的键 */
export type iGM_PlaceholderId =
  | "notification"
  | "community"
  | "post"
  | "activity"
  | "resources"
  | "profile"
  | "settings"
  | "admin";

export interface iGM_PlaceholderPageProps {
  /** 页面标识，用于读取 pages.<id> 文案 */
  pageId: iGM_PlaceholderId;
  /** 对应 G_Xxxxx 路由，用于从导航配置匹配图标 */
  href: `/${string}`;
}

// 核心逻辑 //
/** 从导航配置中查找路由对应的 lucide 图标 */
function iGM_FindNavIcon(href: string) {
  for (const group of iGM_NavGroups) {
    const item = group.items.find((entry) => entry.href === href);
    if (item) return item.icon;
  }
  return null;
}

/** 业务模块占位骨架页 */
export function iGM_PlaceholderPage({
  pageId,
  href,
}: iGM_PlaceholderPageProps) {
  const t = useTranslations();
  const Icon = iGM_FindNavIcon(href);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>
          {Icon && (
            <span className={styles.pageTitleIcon}>
              <Icon size={22} strokeWidth={1.8} />
            </span>
          )}
          {t(`pages.${pageId}.title`)}
        </h1>
        <p className={styles.pageDescription}>
          {t(`pages.${pageId}.description`)}
        </p>
      </header>

      <section className={styles.placeholderPanel}>
        <span className={styles.placeholderBadge}>
          {t("placeholder.badge")}
        </span>
        <p className={styles.placeholderText}>
          {t("placeholder.comingSoon")}
        </p>
      </section>
    </div>
  );
}

// 导出 //
export default iGM_PlaceholderPage;
