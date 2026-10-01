/**
 * 文件路径：apps/cli-download/src/app/[locale]/page.tsx
 * 所属层：前端 / 页面层
 * 路由：/{locale}
 * 模块：iGM_CLI_Downloader
 * 作用：iGM CLI Download API 主页面——Hero + 四个内容入口卡片
 * 内容：顶部导航与页脚由 [locale]/layout.tsx 提供；
 *       快速开始→安装文档、命令列表→命令手册、SDK→适配器 SDK 嵌入章、
 *       适配器协议→适配器完整文档；全部为客户端路由静态链接
 */

// 导入依赖 //
import type { Metadata } from "next";
import Link from "next/link";
import {
  Terminal,
  Zap,
  ListOrdered,
  Package,
  Plug,
  BookOpen,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { iGM_CLI_GetMessages } from "../../i18n/iGM_CLI_Messages";
import { iGM_CLI_IsLocale } from "../../i18n/iGM_CLI_Locales";
import { iGM_CLI_LocalePath } from "../../i18n/iGM_CLI_LocalePath";
import styles from "./iGM_CLI_Home.module.css";

// 类型定义 //
interface iGM_CLI_HomePageProps {
  params: Promise<{ locale: string }>;
}

interface iGM_CLI_HomeEntry {
  /** 区块锚点 ID（供顶部导航锚点跳转） */
  id: "quickstart" | "commands" | "sdk" | "adapter";
  /** lucide-react 区块图标 */
  icon: LucideIcon;
  /** 不带语言前缀的站内文档路径 */
  href: string;
  /** 区块文案（标题/简介/按钮） */
  text: {
    title: string;
    desc: string;
    cta: string;
  };
}

// 核心逻辑 //
/** 每语言页面元数据 */
export async function generateMetadata({
  params,
}: iGM_CLI_HomePageProps): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = iGM_CLI_IsLocale(raw) ? raw : "zh-CN";
  const messages = iGM_CLI_GetMessages(locale);
  return {
    title: messages.site.name,
    description: messages.hero.description,
  };
}

/** 主页面：Hero + 四个文档入口卡片 */
export default async function iGM_CLI_HomePage({ params }: iGM_CLI_HomePageProps) {
  const { locale: raw } = await params;
  const locale = iGM_CLI_IsLocale(raw) ? raw : "zh-CN";
  const messages = iGM_CLI_GetMessages(locale);

  /** 首页入口卡片配置：顺序即展示顺序 */
  const entries: iGM_CLI_HomeEntry[] = [
    {
      id: "quickstart",
      icon: Zap,
      href: "/docs/cli/install",
      text: messages.sections.quickstart,
    },
    {
      id: "commands",
      icon: ListOrdered,
      href: "/docs/cli/commands",
      text: messages.sections.commands,
    },
    {
      id: "sdk",
      icon: Package,
      href: "/docs/adapter/sdk",
      text: messages.sections.sdk,
    },
    {
      id: "adapter",
      icon: Plug,
      href: "/docs/adapter",
      text: messages.sections.adapter,
    },
  ];

  return (
    <>
      {/* Hero 区：大标题 + 副标题 + 一句话简介 */}
      <section className={styles.hero}>
        <span className={styles.heroIcon}>
          <Terminal size={28} aria-hidden />
        </span>
        <h1 className={styles.heroTitle}>
          {messages.hero.title.replace(/API$/, "")}
          <span className={styles.heroTitleAccent}>API</span>
        </h1>
        <p className={styles.heroSubtitle}>{messages.hero.subtitle}</p>
        <p className={styles.heroDescription}>{messages.hero.description}</p>

        {/* Hero 跳转按钮：快速开始锚点 + 文档中心 */}
        <div className={styles.heroActions}>
          <Link
            href={`${iGM_CLI_LocalePath("/", locale)}#quickstart`}
            className={styles.ctaPrimary}
          >
            <Zap size={16} aria-hidden />
            {messages.nav.quickstart}
          </Link>
          <Link
            href={iGM_CLI_LocalePath("/docs", locale)}
            className={styles.ctaSecondary}
          >
            <BookOpen size={16} aria-hidden />
            {messages.nav.docs}
          </Link>
        </div>
      </section>

      {/* 内容入口卡片：快速开始 / 命令 / SDK / 适配器协议（整卡可点） */}
      <div className={styles.entryList}>
        {entries.map((entry) => {
          const EntryIcon = entry.icon;
          return (
            <Link
              key={entry.id}
              id={entry.id}
              href={iGM_CLI_LocalePath(entry.href, locale)}
              className={styles.entryCard}
            >
              <span className={styles.entryIcon}>
                <EntryIcon size={18} aria-hidden />
              </span>
              <div className={styles.entryBody}>
                <h2 className={styles.entryTitle}>{entry.text.title}</h2>
                <p className={styles.entryDesc}>{entry.text.desc}</p>
              </div>
              <span className={styles.entryCta}>
                {entry.text.cta}
                <ArrowRight size={15} aria-hidden />
              </span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
