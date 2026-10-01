/**
 * 文件路径：apps/launcher-download/src/components/iGM_LauncherDl_Header/iGM_LauncherDl_Header.tsx
 * 所属层：前端 / 组件层
 * 路由：全局
 * 模块：iGM_LauncherDl_Downloader
 * 作用：站点顶部导航栏——Logo、菜单项（下载/版本/文档/关于）、语言切换、主题切换、移动端折叠菜单
 * 内容：极简风格，图标使用 lucide-react，文案来自 next-intl 语言包
 */

// 导入依赖 //
"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowUpRight, Menu, Rocket, X } from "lucide-react";
import { iGM_LauncherDl_LocalePath } from "../../i18n/iGM_LauncherDl_LocalePath";
import { iGM_LauncherDl_UseLocale } from "../iGM_LauncherDl_Providers/iGM_LauncherDl_LocaleProvider";
import { iGM_LauncherDl_ThemeToggle as IGM_LauncherDl_ThemeToggle } from "../iGM_LauncherDl_ThemeToggle/iGM_LauncherDl_ThemeToggle";
import { iGM_LauncherDl_LanguageSwitcher as IGM_LauncherDl_LanguageSwitcher } from "../iGM_LauncherDl_LanguageSwitcher/iGM_LauncherDl_LanguageSwitcher";
import styles from "./iGM_LauncherDl_Header.module.css";

// 类型定义 //
interface iGM_LauncherDl_NavItem {
  /** 语言包键（nav.*） */
  key: "download" | "releases" | "docs" | "about";
  /** 目标路径（不含语言前缀） */
  href: string;
}

// 核心逻辑 //
/** 顶部菜单项：下载 / 版本 / 文档 / 关于 */
const iGM_LauncherDl_NavItems: iGM_LauncherDl_NavItem[] = [
  { key: "download", href: "/download" },
  { key: "releases", href: "/releases" },
  { key: "docs", href: "/docs" },
  { key: "about", href: "/about" },
];

/** iGCraftLit 主站地址（返回入口，外链新标签页打开） */
const iGM_LauncherDl_MainSiteUrl = "https://igcraftlit.com";

/** 站点顶部导航栏 */
export function iGM_LauncherDl_Header() {
  const t = useTranslations();
  const { locale } = iGM_LauncherDl_UseLocale();
  const [menuOpen, setMenuOpen] = useState(false);

  /** 拼装带语言前缀的站内链接 */
  const resolveHref = (href: string): string =>
    iGM_LauncherDl_LocalePath(href, locale);

  const navLinks = iGM_LauncherDl_NavItems.map((item) => (
    <Link
      key={item.key}
      href={resolveHref(item.href)}
      className={styles.navLink}
      onClick={() => setMenuOpen(false)}
    >
      {t(`nav.${item.key}`)}
    </Link>
  ));

  /** 返回主站外链（桌面显示文字 + 图标，移动端仅图标） */
  const mainSiteLink = (
    <a
      href={iGM_LauncherDl_MainSiteUrl}
      target="_blank"
      rel="noreferrer"
      className={styles.mainSiteLink}
      aria-label={t("common.backToMainSite")}
      onClick={() => setMenuOpen(false)}
    >
      <span>{t("common.backToMainSite")}</span>
      <ArrowUpRight size={14} aria-hidden />
    </a>
  );

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href={resolveHref("/")} className={styles.logo}>
          <span className={styles.logoIcon}>
            <Rocket size={20} aria-hidden />
          </span>
          <span>{t("site.name")}</span>
        </Link>

        <nav className={styles.nav} aria-label="main">
          {navLinks}
        </nav>

        <div className={styles.actions}>
          <div className={styles.mainSiteDesktop}>{mainSiteLink}</div>

          <IGM_LauncherDl_ThemeToggle />

          <IGM_LauncherDl_LanguageSwitcher />

          <button
            type="button"
            className={styles.menuButton}
            aria-label="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? (
              <X size={20} aria-hidden />
            ) : (
              <Menu size={20} aria-hidden />
            )}
          </button>
        </div>
      </div>

      <nav className={styles.mobileNav} data-open={menuOpen} aria-label="mobile">
        {navLinks}
        <div className={styles.mainSiteMobile}>{mainSiteLink}</div>
      </nav>
    </header>
  );
}

// 导出 //
export default iGM_LauncherDl_Header;