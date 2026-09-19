/**
 * 文件路径：apps/web/src/iGM_AppShell/iGM_Sidebar/iGM_Sidebar.tsx
 * 所属层：前端 / 应用骨架层
 * 路由：全局
 * 模块：iGM_Sidebar
 * 作用：左侧树状导航栏，当前路由高亮，父节点可展开折叠
 * 响应式：桌面端常驻展开，平板端折叠为图标栏（仅父级入口），移动端抽屉化
 * 内容：按服务类型分区，区内父子层级递归渲染；当前路由所在分支自动展开
 */

// 导入依赖 //
"use client";

import { useState } from "react";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import { usePathname } from "next/navigation";
import { iGM_StripLocalePrefix } from "../../iGM_i18n/iGM_LocalePath";
import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import {
  iGM_NavGroups,
  type iGM_NavItem,
} from "../../iGM_Navigation/iGM_NavConfig";
import type { iGM_User } from "../../iGM_Services/iGM_AuthClient";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
import styles from "./iGM_Sidebar.module.css";

// 类型定义 //
interface iGM_SidebarProps {
  /** 移动端抽屉是否打开（桌面端不受影响） */
  open: boolean;
  /** 导航跳转后关闭移动端抽屉 */
  onNavigate: () => void;
}

// 核心逻辑 //
/** 判断当前路由是否高亮：首页精确匹配，其余路由按前缀匹配 */
function iGM_IsActive(pathname: string, href: string): boolean {
  if (href === "/G_Home") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** 递归判断某节点（含子孙）是否命中当前路由 */
function iGM_BranchActive(pathname: string, item: iGM_NavItem): boolean {
  if (iGM_IsActive(pathname, item.href)) return true;
  return (
    item.children?.some((child) => iGM_BranchActive(pathname, child)) ?? false
  );
}

/** 按角色递归过滤导航项；子项被全部过滤时父节点退化为普通叶子 */
function iGM_FilterItems(
  items: iGM_NavItem[],
  user: iGM_User | null,
): iGM_NavItem[] {
  return items
    .map((item) => {
      if (!item.children) return item;
      const children = iGM_FilterItems(item.children, user);
      return { ...item, children: children.length > 0 ? children : undefined };
    })
    .filter(
      (item) =>
        !item.roles || (user !== null && item.roles.includes(user.role)),
    );
}

/** 侧边导航栏 */
export function iGM_Sidebar({ open, onNavigate }: iGM_SidebarProps) {
  const t = useTranslations();
  // 剥离语言前缀后再与导航配置（无前缀）比对（模块五多语言路由）
  const pathname =
    iGM_StripLocalePrefix(usePathname()).replace(/\/$/, "") || "/";
  const { user } = iGM_UseAuth();

  // 用户手动展开/折叠覆盖：缺省时命中当前路由的分支自动展开
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  /** 角色可见性过滤（含子树），隐藏无可见项的分区 */
  const visibleGroups = iGM_NavGroups.map((group) => ({
    ...group,
    items: iGM_FilterItems(group.items, user),
  })).filter((group) => group.items.length > 0);

  /** 节点是否展开：手动覆盖优先，否则按当前路由自动展开 */
  function iGM_IsOpen(item: iGM_NavItem): boolean {
    return overrides[item.href] ?? iGM_BranchActive(pathname, item);
  }

  /** 切换父节点展开态 */
  function iGM_Toggle(item: iGM_NavItem): void {
    setOverrides((current) => ({
      ...current,
      [item.href]: !iGM_IsOpen(item),
    }));
  }

  /** 递归渲染单个导航节点（叶子或树状父节点） */
  function iGM_RenderNavItem(item: iGM_NavItem, depth: number) {
    const Icon = item.icon;
    const active = iGM_IsActive(pathname, item.href);
    const hasChildren = !!item.children && item.children.length > 0;
    const expanded = hasChildren && iGM_IsOpen(item);

    return (
      <li key={item.href}>
        <div className={styles.itemRow}>
          <Link
            href={item.href}
            className={`${styles.navLink} ${active ? styles.navLinkActive : ""} ${
              depth > 0 ? styles.navLinkChild : ""
            }`}
            aria-current={active ? "page" : undefined}
            title={t(item.labelKey)}
            onClick={onNavigate}
          >
            <span className={styles.navIcon}>
              <Icon
                size={depth > 0 ? 15 : 19}
                strokeWidth={1.8}
              />
            </span>
            <span className={styles.navLabel}>{t(item.labelKey)}</span>
          </Link>
          {hasChildren && (
            <button
              type="button"
              className={styles.navToggle}
              aria-label={t(item.labelKey)}
              aria-expanded={expanded}
              onClick={() => iGM_Toggle(item)}
            >
              <ChevronRight
                size={15}
                strokeWidth={2}
                className={expanded ? styles.chevronOpen : styles.chevron}
              />
            </button>
          )}
        </div>

        {/* 子树：竖线树形缩进 */}
        {hasChildren && expanded && (
          <ul className={styles.subList}>
            {item.children!.map((child) => iGM_RenderNavItem(child, depth + 1))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <aside
      className={`${styles.sidebar} ${open ? styles.open : ""}`}
      aria-label={t("nav.groupMain")}
    >
      <nav className={styles.nav}>
        {visibleGroups.map((group) => (
          <section key={group.titleKey} className={styles.group}>
            <h3 className={styles.groupTitle}>{t(group.titleKey)}</h3>
            <ul className={styles.groupList}>
              {group.items.map((item) => iGM_RenderNavItem(item, 0))}
            </ul>
          </section>
        ))}
      </nav>
    </aside>
  );
}

// 导出 //
export default iGM_Sidebar;
