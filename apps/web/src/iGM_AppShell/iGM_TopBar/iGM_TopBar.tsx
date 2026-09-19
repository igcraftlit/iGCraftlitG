/**
 * 文件路径：apps/web/src/iGM_AppShell/iGM_TopBar/iGM_TopBar.tsx
 * 所属层：前端 / 应用骨架层
 * 路由：全局
 * 模块：iGM_TopBar
 * 作用：顶部栏，左侧菜单按钮与网站名称，右侧用户入口、主题与语言切换
 * 内容：移动端菜单按钮、Cinzel 艺术字网站名、登录链接/当前用户徽标、
 *       iGM_ThemeToggle、iGM_LanguageSwitcher
 */

// 导入依赖 //
"use client";

import { Menu, UserRound } from "lucide-react";
import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import { useTranslations } from "next-intl";
import { iGM_ThemeToggle as IGM_ThemeToggle } from "../../iGM_Components/iGM_ThemeToggle/iGM_ThemeToggle";
import { iGM_LanguageSwitcher as IGM_LanguageSwitcher } from "../../iGM_Components/iGM_LanguageSwitcher/iGM_LanguageSwitcher";
import { iGM_UseAuth } from "../../iGM_Providers/iGM_AuthProvider";
import styles from "./iGM_TopBar.module.css";

// 类型定义 //
interface iGM_TopBarProps {
  /** 打开移动端导航抽屉 */
  onOpenMenu: () => void;
}

// 核心逻辑 //
/** 顶部栏 */
export function iGM_TopBar({ onOpenMenu }: iGM_TopBarProps) {
  const t = useTranslations();
  const { status, user } = iGM_UseAuth();

  return (
    <header className={styles.topbar}>
      <div className={styles.left}>
        <button
          type="button"
          className={styles.menuButton}
          aria-label={t("topbar.menu")}
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
        {/* 未登录：登录入口；已登录：账户徽标（点击进入账户设置） */}
        {status === "anonymous" && (
          <Link href="/G_Auth/login" className={styles.loginLink}>
            {t("auth.actions.login")}
          </Link>
        )}
        {status === "authenticated" && user && (
          <Link
            href="/G_Settings"
            className={styles.userChip}
            title={t("auth.settings.title")}
          >
            <UserRound size={15} strokeWidth={1.8} />
            <span className={styles.userName}>{user.username}</span>
            {!user.emailVerified && (
              <span className={styles.unverifiedDot} aria-hidden />
            )}
          </Link>
        )}
        <IGM_LanguageSwitcher />
        <IGM_ThemeToggle />
      </div>
    </header>
  );
}

// 导出 //
export default iGM_TopBar;
