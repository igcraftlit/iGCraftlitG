/**
 * 文件路径：apps/launcher-download/src/components/iGM_LauncherDl_DocLayout/iGM_LauncherDl_DocLayout.tsx
 * 所属层：前端 / 组件层
 * 路由：/docs、/docs/install、/docs/faq 全部文档页
 * 模块：iGM_LauncherDl_Downloader
 * 作用：统一文档布局——左侧文档侧边栏、中间正文、右侧 ON THIS PAGE 目录
 * 内容：桌面 ≥1280 三栏常驻（侧栏与目录均 sticky）；
 *       1024-1279 左侧栏 + 正文，目录折叠为顶部横向条；
 *       768-1023 两侧均折叠为顶部横向条；
 *       <768 仅保留文档分区横向条，右侧目录隐藏；
 *       侧栏当前页高亮基于 usePathname，文案来自 next-intl
 */

// 导入依赖 //
"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  iGM_LauncherDl_DocNavItems,
  type iGM_LauncherDl_DocNavItem,
} from "../../i18n/iGM_LauncherDl_DocNav";
import {
  iGM_LauncherDl_LocalePath,
  iGM_LauncherDl_StripLocalePrefix,
} from "../../i18n/iGM_LauncherDl_LocalePath";
import { iGM_LauncherDl_UseLocale } from "../iGM_LauncherDl_Providers/iGM_LauncherDl_LocaleProvider";
import {
  iGM_LauncherDl_DocToc as IGM_LauncherDl_DocToc,
  type iGM_LauncherDl_TocItem,
} from "../iGM_LauncherDl_DocToc/iGM_LauncherDl_DocToc";
import styles from "./iGM_LauncherDl_DocLayout.module.css";

// 类型定义 //
interface iGM_LauncherDl_DocLayoutProps {
  /** 右侧目录条目；空数组时不渲染目录 */
  tocItems: iGM_LauncherDl_TocItem[];
  /** 正文内容 */
  children: ReactNode;
  /** 左侧侧边栏条目（默认文档中心分区） */
  navItems?: iGM_LauncherDl_DocNavItem[];
  /** 侧边栏分组标题语言包键（默认 docs.sidebar.group） */
  groupLabelKey?: string;
}

// 核心逻辑 //
/** 统一文档布局：左导航 + 正文 + 右目录，三端响应式 */
export function iGM_LauncherDl_DocLayout({
  tocItems,
  children,
  navItems = iGM_LauncherDl_DocNavItems,
  groupLabelKey = "docs.sidebar.group",
}: iGM_LauncherDl_DocLayoutProps) {
  const t = useTranslations();
  const { locale } = iGM_LauncherDl_UseLocale();
  const pathname = usePathname();
  const currentPath = iGM_LauncherDl_StripLocalePrefix(pathname);

  /** 侧边栏链接：当前页竖线高亮 */
  const navLinks = navItems.map((item) => (
    <Link
      key={item.href}
      href={iGM_LauncherDl_LocalePath(item.href, locale)}
      className={[
        styles.sideLink,
        currentPath === item.href ? styles.sideActive : "",
      ].join(" ")}
      aria-current={currentPath === item.href ? "page" : undefined}
    >
      {t(item.labelKey)}
    </Link>
  ));

  /** 顶部横向条仅放主章节，避免条目过长 */
  const topItems = tocItems.filter((item) => item.level === 1);

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        {/* 窄屏（<1024）：文档分区横向胶囊条 */}
        <div className={styles.sidebarTop}>
          <p className={styles.sidebarTopTitle}>{t(groupLabelKey)}</p>
          <nav
            className={styles.sidebarTopScroll}
            aria-label={t("docs.sidebar.title")}
          >
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={iGM_LauncherDl_LocalePath(item.href, locale)}
                className={[
                  styles.topPill,
                  currentPath === item.href ? styles.topPillActive : "",
                ].join(" ")}
                aria-current={currentPath === item.href ? "page" : undefined}
              >
                {t(item.labelKey)}
              </Link>
            ))}
          </nav>
        </div>

        {/* 1024-1279 / 768-1023：页面目录折叠为顶部横向条 */}
        {topItems.length > 0 ? (
          <div className={styles.tocTop}>
            <IGM_LauncherDl_DocToc
              variant="top"
              items={topItems}
              title={t("docs.tocTitle")}
            />
          </div>
        ) : null}

        {/* 桌面（≥1024）：左侧文档侧边栏，sticky 常驻 */}
        <aside className={styles.sidebar}>
          <p className={styles.sidebarTitle}>{t(groupLabelKey)}</p>
          <nav className={styles.sideList} aria-label={t("docs.sidebar.title")}>
            {navLinks}
          </nav>
        </aside>

        {/* 中间：文档正文 */}
        <article className={styles.article}>{children}</article>

        {/* 大屏（≥1280）：右侧 ON THIS PAGE 目录，sticky 常驻 */}
        {tocItems.length > 0 ? (
          <aside className={styles.tocRail}>
            <IGM_LauncherDl_DocToc items={tocItems} title={t("docs.tocTitle")} />
          </aside>
        ) : null}
      </div>
    </div>
  );
}

// 导出 //
export default iGM_LauncherDl_DocLayout;