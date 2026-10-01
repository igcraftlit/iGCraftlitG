/**
 * 文件路径：apps/cli-download/src/components/iGM_CLI_Header/iGM_CLI_Header.tsx
 * 所属层：前端 / 组件层
 * 路由：全局
 * 模块：iGM_CLI_Downloader
 * 作用：站点顶部导航栏——Logo、菜单项（锚点/跳转）、语言切换、移动端折叠菜单
 * 内容：极简风格，图标使用 lucide-react，文案来自 next-intl 语言包
 */

// 导入依赖 //
"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowUpRight, Languages, Menu, Terminal, X } from "lucide-react";
import {
  iGM_CLI_Locales,
  type iGM_CLI_Locale,
} from "../../i18n/iGM_CLI_Locales";
import { iGM_CLI_LocalePath } from "../../i18n/iGM_CLI_LocalePath";
import { iGM_CLI_UseLocale } from "../iGM_CLI_Providers/iGM_CLI_LocaleProvider";
import { iGM_CLI_ThemeToggle as IGM_CLI_ThemeToggle } from "../iGM_CLI_ThemeToggle/iGM_CLI_ThemeToggle";
import styles from "./iGM_CLI_Header.module.css";

// 类型定义 //
interface iGM_CLI_NavItem {
  /** 语言包键（nav.*） */
  key:
    | "overview"
    | "quickstart"
    | "commands"
    | "sdk"
    | "api"
    | "docs"
    | "oauth";
  /** 目标路径（不含语言前缀，可含锚点） */
  href: string;
}

// 核心逻辑 //
/** 顶部菜单项：概览/快速开始为首页锚点，其余为独立页面 */
const iGM_CLI_NavItems: iGM_CLI_NavItem[] = [
  { key: "overview", href: "/" },
  { key: "quickstart", href: "/#quickstart" },
  { key: "commands", href: "/commands" },
  { key: "sdk", href: "/sdk" },
  { key: "api", href: "/api" },
  { key: "docs", href: "/docs" },
  { key: "oauth", href: "/oauth/apply" },
];

/** iGCraftLit 主站地址（文档子站返回入口，外链新标签页打开） */
const iGM_CLI_MainSiteUrl = "https://igcraftlit.com";

/** 站点顶部导航栏 */
export function iGM_CLI_Header() {
  const t = useTranslations();
  const { locale, setLocale } = iGM_CLI_UseLocale();
  const [menuOpen, setMenuOpen] = useState(false);

  /** 拼装带语言前缀的站内链接（锚点部分不参与前缀拼装） */
  const resolveHref = (href: string): string => {
    const [path, hash] = href.split("#");
    const prefixed = iGM_CLI_LocalePath(path || "/", locale);
    return hash ? `${prefixed}#${hash}` : prefixed;
  };

  const navLinks = iGM_CLI_NavItems.map((item) => (
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
      href={iGM_CLI_MainSiteUrl}
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
            <Terminal size={20} aria-hidden />
          </span>
          <span>{t("site.name")}</span>
        </Link>

        <nav className={styles.nav} aria-label="main">
          {navLinks}
        </nav>

        <div className={styles.actions}>
          <div className={styles.mainSiteDesktop}>{mainSiteLink}</div>

          <IGM_CLI_ThemeToggle />

          <label className={styles.langWrap} aria-label={t("common.language")}>
            <Languages size={16} aria-hidden />
            <select
              className={styles.langSelect}
              value={locale}
              onChange={(event) =>
                setLocale(event.target.value as iGM_CLI_Locale)
              }
            >
              {iGM_CLI_Locales.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className={styles.menuButton}
            aria-label="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
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
export default iGM_CLI_Header;
