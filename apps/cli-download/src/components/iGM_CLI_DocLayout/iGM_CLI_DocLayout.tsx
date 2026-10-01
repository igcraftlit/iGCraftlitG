/**
 * 文件路径：apps/cli-download/src/components/iGM_CLI_DocLayout/iGM_CLI_DocLayout.tsx
 * 所属层：前端 / 组件层
 * 路由：/docs、/docs/cli/* 与 /docs/adapter/* 全部文档页
 * 模块：iGM_CLI_Downloader
 * 作用：统一文档布局——左侧文档侧边栏、中间正文、右侧 ON THIS PAGE 目录
 * 内容：桌面 ≥1280 三栏常驻（侧栏与目录均 sticky）；
 *       1024-1279 左侧栏 + 正文，目录折叠为顶部横向条；
 *       768-1023 两侧均折叠为顶部横向条；
 *       <768 仅保留文档分区横向条，右侧目录隐藏；
 *       侧栏当前页高亮基于 usePathname，文案来自 next-intl；
 *       navItems / groupLabelKey / TocComponent 可注入——
 *       CLI 指南用默认值，适配器文档注入适配器分区配置与 iGM_CLI_AdapterToc
 */

// 导入依赖 //
"use client";

import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  iGM_CLI_DocNavItems,
  type iGM_CLI_DocNavItem,
} from "../../i18n/iGM_CLI_DocNav";
import { iGM_CLI_LocalePath } from "../../i18n/iGM_CLI_LocalePath";
import { iGM_CLI_StripLocalePrefix } from "../../i18n/iGM_CLI_LocalePath";
import { iGM_CLI_UseLocale } from "../iGM_CLI_Providers/iGM_CLI_LocaleProvider";
import {
  iGM_CLI_DocToc as IGM_CLI_DocToc,
  type iGM_CLI_TocItem,
} from "../iGM_CLI_DocToc/iGM_CLI_DocToc";
import styles from "./iGM_CLI_DocLayout.module.css";

// 类型定义 //
/** 可注入的目录组件契约（iGM_CLI_DocToc 与 iGM_CLI_AdapterToc 均满足） */
export interface iGM_CLI_TocComponentProps {
  items: iGM_CLI_TocItem[];
  variant?: "rail" | "top";
  title?: string;
}

interface iGM_CLI_DocLayoutProps {
  /** 右侧目录条目；空数组时不渲染目录 */
  tocItems: iGM_CLI_TocItem[];
  /** 正文内容 */
  children: ReactNode;
  /** 左侧侧边栏条目（默认 CLI 指南分区；适配器文档注入适配器分区） */
  navItems?: iGM_CLI_DocNavItem[];
  /** 侧边栏分组标题语言包键（默认 docs.sidebar.group） */
  groupLabelKey?: string;
  /** 右侧目录组件（默认 iGM_CLI_DocToc；适配器文档注入 iGM_CLI_AdapterToc） */
  TocComponent?: ComponentType<iGM_CLI_TocComponentProps>;
}

// 核心逻辑 //
/** 统一文档布局：左导航 + 正文 + 右目录，三端响应式 */
export function iGM_CLI_DocLayout({
  tocItems,
  children,
  navItems = iGM_CLI_DocNavItems,
  groupLabelKey = "docs.sidebar.group",
  TocComponent = IGM_CLI_DocToc,
}: iGM_CLI_DocLayoutProps) {
  const t = useTranslations();
  const { locale } = iGM_CLI_UseLocale();
  const pathname = usePathname();
  const currentPath = iGM_CLI_StripLocalePrefix(pathname);

  /** 侧边栏链接：当前页竖线高亮 */
  const navLinks = navItems.map((item) => (
    <Link
      key={item.href}
      href={iGM_CLI_LocalePath(item.href, locale)}
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
          <nav className={styles.sidebarTopScroll} aria-label={t("docs.sidebar.title")}>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={iGM_CLI_LocalePath(item.href, locale)}
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
            <TocComponent variant="top" items={topItems} title={t("docs.tocTitle")} />
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
            <TocComponent items={tocItems} title={t("docs.tocTitle")} />
          </aside>
        ) : null}
      </div>
    </div>
  );
}

// 导出 //
export default iGM_CLI_DocLayout;
