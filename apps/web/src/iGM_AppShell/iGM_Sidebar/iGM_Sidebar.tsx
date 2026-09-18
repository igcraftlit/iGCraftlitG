/**
 * 文件路径：apps/web/src/iGM_AppShell/iGM_Sidebar/iGM_Sidebar.tsx
 * 所属层：前端 / 应用骨架层
 * 路由：全局
 * 模块：iGM_Sidebar
 * 作用：左侧分区导航栏，当前路由高亮
 * 响应式：桌面端常驻展开，平板端折叠为图标栏，移动端抽屉化
 * 内容：按服务类型分区的导航链接列表
 */

// 导入依赖 //
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { iGM_NavGroups } from "../../iGM_Navigation/iGM_NavConfig";
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

/** 侧边导航栏 */
export function iGM_Sidebar({ open, onNavigate }: iGM_SidebarProps) {
  const t = useTranslations();
  const pathname = usePathname().replace(/\/$/, "") || "/";
  const { user } = iGM_UseAuth();

  // 角色可见性过滤：未声明 roles 的入口对所有访客可见
  const visibleGroups = iGM_NavGroups.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) =>
        !item.roles ||
        (user !== null && item.roles.includes(user.role)),
    ),
  })).filter((group) => group.items.length > 0);

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
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = iGM_IsActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
                      aria-current={active ? "page" : undefined}
                      title={t(item.labelKey)}
                      onClick={onNavigate}
                    >
                      <span className={styles.navIcon}>
                        <Icon size={19} strokeWidth={1.8} />
                      </span>
                      <span className={styles.navLabel}>{t(item.labelKey)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </nav>
    </aside>
  );
}

// 导出 //
export default iGM_Sidebar;
