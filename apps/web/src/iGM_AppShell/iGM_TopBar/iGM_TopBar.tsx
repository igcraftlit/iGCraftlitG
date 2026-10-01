/**
 * 文件路径：apps/web/src/iGM_AppShell/iGM_TopBar/iGM_TopBar.tsx
 * 所属层：前端 / 应用骨架层
 * 路由：全局
 * 模块：iGM_TopBar
 * 作用：顶部栏，左侧菜单按钮与网站名称，右侧用户区、主题与语言切换
 * 内容：移动端菜单按钮、Cinzel 艺术字网站名、登录按钮、
 *       已登录用户区（头像 + 用户名 + 组织认证标识，点击展开下拉菜单：
 *       个人主页 / 账户设置 / 组织认证 / 退出登录）、
 *       iGM_ThemeToggle、iGM_LanguageSwitcher
 */

// 导入依赖 //
"use client";

import { useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  ChevronDown,
  LogOut,
  Menu,
  Settings,
  UserRound,
} from "lucide-react";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import { useTranslations } from "next-intl";
import { iGM_ThemeToggle as IGM_ThemeToggle } from "../../iGM_Components/iGM_ThemeToggle/iGM_ThemeToggle";
import { iGM_LanguageSwitcher as IGM_LanguageSwitcher } from "../../iGM_Components/iGM_LanguageSwitcher/iGM_LanguageSwitcher";
import { iGM_Avatar as IGM_Avatar } from "../../iGM_Components/iGM_Avatar/iGM_Avatar";
import { iGM_VerifiedBadge as IGM_VerifiedBadge } from "../../iGM_Components/iGM_VerifiedBadge/iGM_VerifiedBadge";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
import { iGM_UseLocaleRouter } from "../../iGM_i18n/iGM_UseLocaleRouter";
import styles from "./iGM_TopBar.module.css";

// 类型定义 //
interface iGM_TopBarProps {
  /** 打开移动端导航抽屉 */
  onOpenMenu: () => void;
  /** 移动端抽屉当前是否打开（用于无障碍 aria-expanded，桌面端忽略） */
  drawerOpen?: boolean;
}

// 核心逻辑 //
/** 顶部栏 */
export function iGM_TopBar({ onOpenMenu, drawerOpen = false }: iGM_TopBarProps) {
  const t = useTranslations();
  const { status, user, logout } = iGM_UseAuth();
  const router = iGM_UseLocaleRouter();
  /** 用户下拉菜单展开态 */
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  /** 点击菜单外部或按 Esc 关闭下拉 */
  useEffect(() => {
    if (!menuOpen) return;
    function iGM_HandlePointerDown(event: MouseEvent): void {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function iGM_HandleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", iGM_HandlePointerDown);
    document.addEventListener("keydown", iGM_HandleKeyDown);
    return () => {
      document.removeEventListener("mousedown", iGM_HandlePointerDown);
      document.removeEventListener("keydown", iGM_HandleKeyDown);
    };
  }, [menuOpen]);

  /** 退出登录后回到登录页 */
  async function iGM_HandleLogout(): Promise<void> {
    if (loggingOut) return;
    setLoggingOut(true);
    setMenuOpen(false);
    try {
      await logout();
      router.replace("/G_Auth/login");
    } finally {
      setLoggingOut(false);
    }
  }

  /** 下拉菜单项配置（文案全部来自语言包） */
  const menuItems = user
    ? [
        {
          href: `/G_User?userId=${encodeURIComponent(user.id)}`,
          icon: UserRound,
          label: t("nav.profile"),
        },
        {
          href: "/G_Settings",
          icon: Settings,
          label: t("nav.settings"),
        },
        {
          href: "/G_OrgVerify",
          icon: BadgeCheck,
          label: t("nav.orgVerify"),
        },
      ]
    : [];

  return (
    <header className={styles.topbar}>
      <div className={styles.left}>
        <button
          type="button"
          className={styles.menuButton}
          aria-label={t("topbar.menu")}
          aria-expanded={drawerOpen}
          aria-controls="igm-sidebar"
          onClick={onOpenMenu}
        >
          <Menu size={20} strokeWidth={1.8} />
        </button>
        <Link href="/G_Home" className={`igm-font-brand ${styles.brand}`}>
          {/* 站点 LOGO：D:/IGWEB/image/save1.ico，静态资源位于 public 根目录 */}
          <img
            src="/iGM_save1.ico"
            alt=""
            aria-hidden
            className={styles.brandLogo}
          />
          {t("site.name")}
        </Link>
      </div>

      <div className={styles.actions}>
        {/* 未登录：登录按钮 */}
        {status === "anonymous" && (
          <Link href="/G_Auth/login" className={styles.loginLink}>
            {t("auth.actions.login")}
          </Link>
        )}
        {/* 已登录：头像 + 用户名 + 认证标识，点击展开下拉菜单 */}
        {status === "authenticated" && user && (
          <div className={styles.userMenu} ref={menuRef}>
            <button
              type="button"
              className={`${styles.userChip} ${menuOpen ? styles.userChipActive : ""}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <IGM_Avatar
                src={user.avatar}
                name={user.displayName || user.username}
                size="sm"
              />
              <span className={styles.userName}>
                {user.displayName || user.username}
              </span>
              {/* 组织认证标识：紧凑形态仅显示图标，悬停展示组织名 */}
              <IGM_VerifiedBadge org={user.verifiedOrg} showName={false} />
              {!user.emailVerified && (
                <span className={styles.unverifiedDot} aria-hidden />
              )}
              <ChevronDown
                size={13}
                strokeWidth={1.8}
                className={styles.chevron}
              />
            </button>

            {menuOpen && (
              <div className={styles.dropdown} role="menu">
                <div className={styles.dropdownHeader}>
                  <span className={styles.dropdownName}>
                    {user.displayName || user.username}
                  </span>
                  <IGM_VerifiedBadge org={user.verifiedOrg} />
                  <span className={styles.dropdownMeta}>@{user.username}</span>
                </div>
                {menuItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={styles.menuItem}
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                  >
                    <item.icon size={14} strokeWidth={1.8} />
                    {item.label}
                  </Link>
                ))}
                <div className={styles.menuDivider} />
                <button
                  type="button"
                  className={`${styles.menuItem} ${styles.menuItemDanger}`}
                  role="menuitem"
                  disabled={loggingOut}
                  onClick={() => void iGM_HandleLogout()}
                >
                  <LogOut size={14} strokeWidth={1.8} />
                  {t("auth.actions.logout")}
                </button>
              </div>
            )}
          </div>
        )}
        <IGM_LanguageSwitcher />
        <IGM_ThemeToggle />
      </div>
    </header>
  );
}

// 导出 //
export default iGM_TopBar;
