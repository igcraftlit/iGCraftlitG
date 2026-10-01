/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Sidebar/iGM_Launcher_Sidebar.tsx
 * 所属层：前端 / 侧边栏层
 * 路由：全局（SPA 单页）
 * 模块：iGM_Launcher_Sidebar
 * 作用：按功能分组的左侧导航（主页/游戏/账户/设置）
 * 内容：导航项为按钮，点击后切换 AppShell 的 SPA 页面状态，不产生任何导航请求；
 *       模块七移除「启动」动作项，启动入口统一收敛到实例管理页；
 *       支持折叠为图标轨，底部提供折叠开关
 */

// 导入依赖 //
"use client";

import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  IGM_LAUNCHER_NAV_GROUPS,
  type iGM_Launcher_NavItem,
} from "@/components/iGM_Launcher_Nav/iGM_Launcher_NavConfig";
import { iGM_Launcher_UseShellLayout } from "@/components/iGM_Launcher_AppShell/iGM_Launcher_AppShell";
import type { iGM_Launcher_PageId } from "@/components/iGM_Launcher_Pages/iGM_Launcher_PageRegistry";
import styles from "./iGM_Launcher_Sidebar.module.css";

// 类型定义 //
interface iGM_Launcher_NavRowProps {
  item: iGM_Launcher_NavItem;
  active: boolean;
  collapsed: boolean;
  onSelect: () => void;
}

// 核心逻辑 //
/** 单个导航行（JSX 要求首字母大写，故使用 IGM_ 前缀的局部组件名） */
function IGM_Launcher_NavRow({ item, active, collapsed, onSelect }: iGM_Launcher_NavRowProps) {
  const t = useTranslations("nav");
  const label = t(item.labelKey);
  const Icon = item.icon;

  const className = [
    styles.navItem,
    active ? styles.navItemActive : "",
    collapsed ? styles.navItemRail : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={className}
      onClick={onSelect}
      title={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
    >
      <Icon size={17} strokeWidth={1.8} className={styles.navIcon} />
      {!collapsed && <span className={styles.navLabel}>{label}</span>}
    </button>
  );
}

export function iGM_Launcher_Sidebar() {
  const t = useTranslations("nav");
  const { collapsed, toggleCollapsed, pageId, setPageId } = iGM_Launcher_UseShellLayout();

  // 子页面归属主入口：实例编辑归属实例管理，账户登录归属账户
  const activePageId: iGM_Launcher_PageId =
    pageId === "instancesEdit" ? "instances" : pageId === "accountLogin" ? "account" : pageId;

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.sidebarRail : ""}`}>
      <nav className={styles.nav}>
        {IGM_LAUNCHER_NAV_GROUPS.map((group) => (
          <div key={group.labelKey} className={styles.navGroup}>
            {!collapsed && <p className={styles.groupTitle}>{t(group.labelKey)}</p>}
            {collapsed && <span className={styles.railDivider} aria-hidden="true" />}
            <div className={styles.groupItems}>
              {group.items.map((item) => (
                <IGM_Launcher_NavRow
                  key={item.id}
                  item={item}
                  collapsed={collapsed}
                  active={item.pageId === activePageId}
                  onSelect={() => {
                    if (item.pageId) {
                      setPageId(item.pageId);
                    }
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <button
        type="button"
        className={styles.collapseButton}
        onClick={toggleCollapsed}
        title={collapsed ? t("expand") : t("collapse")}
        aria-label={collapsed ? t("expand") : t("collapse")}
      >
        {collapsed ? (
          <ChevronsRight size={16} strokeWidth={1.8} />
        ) : (
          <ChevronsLeft size={16} strokeWidth={1.8} />
        )}
        {!collapsed && <span>{t("collapse")}</span>}
      </button>
    </aside>
  );
}

// 导出 //
export default iGM_Launcher_Sidebar;