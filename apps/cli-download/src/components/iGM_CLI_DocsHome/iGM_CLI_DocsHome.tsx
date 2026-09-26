/**
 * 文件路径：apps/cli-download/src/components/iGM_CLI_DocsHome/iGM_CLI_DocsHome.tsx
 * 所属层：前端 / 页面内容组件层
 * 路由：/docs
 * 模块：iGM_CLI_Downloader
 * 作用：文档中心首页——文档分区卡片导航（完整指南/安装/命令/配置/FAQ）+ 返回主站
 * 内容：统一 iGM_CLI_DocLayout 布局（无右侧目录），卡片图标使用 lucide-react，
 *       文案全部来自 next-intl 语言包
 */

// 导入依赖 //
"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Download,
  Globe,
  HelpCircle,
  Settings,
  Terminal,
} from "lucide-react";
import { iGM_CLI_DocLayout as IGM_CLI_DocLayout } from "../iGM_CLI_DocLayout/iGM_CLI_DocLayout";
import { iGM_CLI_LocalePath } from "../../i18n/iGM_CLI_LocalePath";
import { iGM_CLI_UseLocale } from "../iGM_CLI_Providers/iGM_CLI_LocaleProvider";
import styles from "./iGM_CLI_DocsHome.module.css";

// 类型定义 //
interface iGM_CLI_DocCard {
  /** 站内路径（不带语言前缀） */
  href: string;
  /** 语言包标题键（docs.index.*） */
  titleKey: "guideTitle" | "installTitle" | "commandsTitle" | "configTitle" | "faqTitle";
  /** 语言包描述键（docs.index.*） */
  descKey:
    | "guideDesc"
    | "installDesc"
    | "commandsDesc"
    | "configDesc"
    | "faqDesc";
  /** lucide-react 图标组件 */
  icon: ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>;
}

// 核心逻辑 //
/** 文档分区卡片配置 */
const iGM_CLI_DocCards: iGM_CLI_DocCard[] = [
  {
    href: "/docs/cli",
    titleKey: "guideTitle",
    descKey: "guideDesc",
    icon: BookOpen,
  },
  {
    href: "/docs/cli/install",
    titleKey: "installTitle",
    descKey: "installDesc",
    icon: Download,
  },
  {
    href: "/docs/cli/commands",
    titleKey: "commandsTitle",
    descKey: "commandsDesc",
    icon: Terminal,
  },
  {
    href: "/docs/cli/config",
    titleKey: "configTitle",
    descKey: "configDesc",
    icon: Settings,
  },
  {
    href: "/docs/cli/faq",
    titleKey: "faqTitle",
    descKey: "faqDesc",
    icon: HelpCircle,
  },
];

/** 文档中心首页 */
export function iGM_CLI_DocsHome() {
  const t = useTranslations();
  const { locale } = iGM_CLI_UseLocale();

  return (
    <IGM_CLI_DocLayout tocItems={[]}>
      {/* 页头 */}
      <header className={styles.homeHead}>
        <h1 className={styles.h1}>{t("docs.index.title")}</h1>
        <p className={styles.lead}>{t("docs.index.description")}</p>
      </header>

      {/* 文档分区 */}
      <h2 className={styles.groupTitle}>{t("docs.index.sectionsTitle")}</h2>
      <div className={styles.cardGrid}>
        {iGM_CLI_DocCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href}
              href={iGM_CLI_LocalePath(card.href, locale)}
              className={styles.card}
            >
              <span className={styles.cardIcon}>
                <Icon size={18} strokeWidth={1.8} aria-hidden />
              </span>
              <span className={styles.cardBody}>
                <span className={styles.cardTitle}>
                  {t(`docs.index.${card.titleKey}`)}
                </span>
                <span className={styles.cardDesc}>
                  {t(`docs.index.${card.descKey}`)}
                </span>
              </span>
              <ArrowRight size={15} className={styles.cardArrow} aria-hidden />
            </Link>
          );
        })}
      </div>

      {/* 其他：返回主站 */}
      <h2 className={styles.groupTitle}>{t("docs.index.moreTitle")}</h2>
      <a
        className={styles.card}
        href="https://igcraftlit.com"
        target="_blank"
        rel="noreferrer"
      >
        <span className={styles.cardIcon}>
          <Globe size={18} strokeWidth={1.8} aria-hidden />
        </span>
        <span className={styles.cardBody}>
          <span className={styles.cardTitle}>{t("docs.index.mainSiteTitle")}</span>
          <span className={styles.cardDesc}>{t("docs.index.mainSiteDesc")}</span>
        </span>
        <ArrowUpRight size={15} className={styles.cardArrow} aria-hidden />
      </a>
    </IGM_CLI_DocLayout>
  );
}

// 导出 //
export default iGM_CLI_DocsHome;
