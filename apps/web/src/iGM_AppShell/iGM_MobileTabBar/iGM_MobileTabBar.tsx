/**
 * 文件路径：apps/web/src/iGM_AppShell/iGM_MobileTabBar/iGM_MobileTabBar.tsx
 * 所属层：前端 / 应用骨架层
 * 路由：全局（仅 < 768px 显示）
 * 模块：iGM_MobileTabBar
 * 作用：移动端专属底部标签栏，提供 3–5 个主入口的快速切换
 * 内容：从 iGM_NavConfig 复用 labelKey 与 lucide 图标；按角色/负责人身份
 *       与侧边栏一致地过滤可见性；当前路由高亮；固定底部并适配安全区
 */

// 导入依赖 //
"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import { iGM_StripLocalePrefix } from "../../iGM_i18n/iGM_LocalePath";
import {
  iGM_NavGroups,
  type iGM_NavItem,
} from "../../iGM_Navigation/iGM_NavConfig";
import type { iGM_User } from "../../iGM_Services/iGM_AuthClient";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
import styles from "./iGM_MobileTabBar.module.css";

// 类型定义 //
/** 主入口标签项：由导航配置解析而来 */
interface iGM_TabEntry {
  href: string;
  icon: iGM_NavItem["icon"];
  labelKey: string;
}

// 核心逻辑 //
/** 底部标签栏主入口（按顺序展示；均取自导航配置的顶级主入口） */
const iGM_TabHrefs: readonly string[] = [
  "/G_Home",
  "/G_Community",
  "/G_Resource",
  "/G_Notification",
  "/G_User",
];

/** 在导航配置（含子树）中按 href 查找节点，复用其图标与文案键 */
function iGM_FindNavItem(items: iGM_NavItem[], href: string): iGM_NavItem | null {
  for (const item of items) {
    if (item.href === href) return item;
    if (item.children) {
      const found = iGM_FindNavItem(item.children, href);
      if (found) return found;
    }
  }
  return null;
}

/** 与侧边栏一致的可见性过滤：角色与组织负责人身份同时满足 */
function iGM_CanSeeItem(item: iGM_NavItem, user: iGM_User | null): boolean {
  if (item.roles && (user === null || !item.roles.includes(user.role))) {
    return false;
  }
  if (item.orgOwnerOnly && user?.verifiedOrg?.isOwner !== true) {
    return false;
  }
  return true;
}

/** 当前路由是否高亮：首页精确匹配，其余按前缀匹配（与侧边栏一致） */
function iGM_IsActive(pathname: string, href: string): boolean {
  if (href === "/G_Home") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** 移动端底部标签栏 */
export function iGM_MobileTabBar() {
  const t = useTranslations();
  // 剥离语言前缀后再与导航配置（无前缀）比对（模块五多语言路由）
  const pathname =
    iGM_StripLocalePrefix(usePathname()).replace(/\/$/, "") || "/";
  const { user } = iGM_UseAuth();

  // 解析主入口：复用配置图标/文案，过滤登录态受限项；未登录访客按无角色处理
  const entries: iGM_TabEntry[] = [];
  for (const href of iGM_TabHrefs) {
    const item = iGM_FindNavItem(iGM_NavGroups.flatMap((g) => g.items), href);
    if (item && iGM_CanSeeItem(item, user)) {
      entries.push({ href: item.href, icon: item.icon, labelKey: item.labelKey });
    }
  }

  return (
    <nav className={styles.tabBar} aria-label={t("nav.groupMain")}>
      {entries.map((entry) => {
        const Icon = entry.icon;
        const active = iGM_IsActive(pathname, entry.href);
        return (
          <Link
            key={entry.href}
            href={entry.href}
            className={`${styles.tabItem} ${active ? styles.tabItemActive : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <span className={styles.tabIcon}>
              <Icon size={20} strokeWidth={1.8} />
            </span>
            <span className={styles.tabLabel}>{t(entry.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

// 导出 //
export default iGM_MobileTabBar;
