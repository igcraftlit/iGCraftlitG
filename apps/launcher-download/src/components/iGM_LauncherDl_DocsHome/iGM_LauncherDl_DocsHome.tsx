/**
 * 文件路径：apps/launcher-download/src/components/iGM_LauncherDl_DocsHome/iGM_LauncherDl_DocsHome.tsx
 * 所属层：前端 / 组件层
 * 路由：/docs 文档首页
 * 模块：iGM_LauncherDl_Downloader
 * 作用：文档中心首页——文档分区卡片（安装指南、常见问题）与「其他」外链卡片
 * 内容：极简卡片，图标使用 lucide-react（BookOpen / CircleQuestionMark / Download / Globe），
 *       文案来自 next-intl 语言包，链接经 iGM_LauncherDl_LocalePath 拼装语言前缀
 */

// 导入依赖 //
"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  BookOpen,
  CircleQuestionMark,
  Download,
  Globe,
  type LucideIcon,
} from "lucide-react";
import { iGM_LauncherDl_LocalePath } from "../../i18n/iGM_LauncherDl_LocalePath";
import { iGM_LauncherDl_UseLocale } from "../iGM_LauncherDl_Providers/iGM_LauncherDl_LocaleProvider";
import styles from "./iGM_LauncherDl_DocsHome.module.css";

// 类型定义 //
interface iGM_LauncherDl_DocCard {
  /** 标题语言包键 */
  titleKey: string;
  /** 描述语言包键 */
  descKey: string;
  /** 站内路径（不含语言前缀）；为空时视为外链 */
  href?: string;
  /** 外链地址 */
  external?: string;
  icon: LucideIcon;
}

// 核心逻辑 //
/** 文档分区卡片 */
const iGM_LauncherDl_DocSections: iGM_LauncherDl_DocCard[] = [
  {
    titleKey: "docs.index.installTitle",
    descKey: "docs.index.installDesc",
    href: "/docs/install",
    icon: BookOpen,
  },
  {
    titleKey: "docs.index.faqTitle",
    descKey: "docs.index.faqDesc",
    href: "/docs/faq",
    icon: CircleQuestionMark,
  },
];

/** 「其他」卡片：下载页与主站外链 */
const iGM_LauncherDl_DocMore: iGM_LauncherDl_DocCard[] = [
  {
    titleKey: "docs.index.downloadTitle",
    descKey: "docs.index.downloadDesc",
    href: "/download",
    icon: Download,
  },
  {
    titleKey: "docs.index.mainSiteTitle",
    descKey: "docs.index.mainSiteDesc",
    external: "https://igcraftlit.com",
    icon: Globe,
  },
];

/** 文档中心首页 */
export function iGM_LauncherDl_DocsHome() {
  const t = useTranslations();
  const { locale } = iGM_LauncherDl_UseLocale();

  /** 渲染单张卡片（站内走 Next Link，外链走 a 新标签页） */
  function renderCard(card: iGM_LauncherDl_DocCard, index: number) {
    const Icon = card.icon;
    const body = (
      <>
        <span className={styles.cardIcon}>
          <Icon size={20} aria-hidden />
        </span>
        <span className={styles.cardTitle}>{t(card.titleKey)}</span>
        <span className={styles.cardDesc}>{t(card.descKey)}</span>
        <span className={styles.cardArrow}>
          <ArrowRight size={14} aria-hidden />
        </span>
      </>
    );

    if (card.external) {
      return (
        <a
          key={index}
          className={styles.card}
          href={card.external}
          target="_blank"
          rel="noreferrer"
        >
          {body}
        </a>
      );
    }

    return (
      <Link
        key={index}
        className={styles.card}
        href={iGM_LauncherDl_LocalePath(card.href ?? "/docs", locale)}
      >
        {body}
      </Link>
    );
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h1 className={styles.title}>{t("docs.index.title")}</h1>
        <p className={styles.description}>{t("docs.index.description")}</p>
      </header>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("docs.index.sectionsTitle")}</h2>
        <div className={styles.grid}>
          {iGM_LauncherDl_DocSections.map(renderCard)}
        </div>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("docs.index.moreTitle")}</h2>
        <div className={styles.grid}>{iGM_LauncherDl_DocMore.map(renderCard)}</div>
      </section>
    </div>
  );
}

// 导出 //
export default iGM_LauncherDl_DocsHome;