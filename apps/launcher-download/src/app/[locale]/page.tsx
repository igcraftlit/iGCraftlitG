/**
 * 文件路径：apps/launcher-download/src/app/[locale]/page.tsx
 * 所属层：前端 / 页面层
 * 路由：/{locale}（主页面）
 * 模块：iGM_LauncherDl_Downloader
 * 作用：iGM CraftCeon Launcher 主页面——Hero、版本信息、功能介绍、组织署名
 * 内容：纯静态 SSG 服务端组件，文案全部来自语言包；
 *       Launcher 使用 .launcherText 渐变；下载为占位地址，不产生真实下载
 */

// 导入依赖 //
import Link from "next/link";
import {
  Boxes,
  Coffee,
  Download,
  Monitor,
  ShieldCheck,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import { iGM_LauncherDl_GetMessages } from "../../i18n/iGM_LauncherDl_Messages";
import { iGM_LauncherDl_IsLocale } from "../../i18n/iGM_LauncherDl_Locales";
import {
  iGM_LauncherDl_FileName,
  iGM_LauncherDl_DownloadHref,
  iGM_LauncherDl_Platform,
  iGM_LauncherDl_ReleaseDate,
  iGM_LauncherDl_VersionLabel,
} from "../../i18n/iGM_LauncherDl_ReleaseInfo";
import { iGM_LauncherDl_LocalePath } from "../../i18n/iGM_LauncherDl_LocalePath";
import styles from "./iGM_LauncherDl_Home.module.css";
import { notFound } from "next/navigation";

// 类型定义 //
interface iGM_LauncherDl_HomePageProps {
  params: Promise<{ locale: string }>;
}

interface iGM_LauncherDl_FeatureEntry {
  key: "instances" | "java" | "resources" | "auth" | "offline";
  icon: LucideIcon;
}

// 核心逻辑 //
/** 五项功能介绍的图标映射（文案取自语言包 features.*） */
const iGM_LauncherDl_Features: iGM_LauncherDl_FeatureEntry[] = [
  { key: "instances", icon: Boxes },
  { key: "java", icon: Coffee },
  { key: "resources", icon: Download },
  { key: "auth", icon: ShieldCheck },
  { key: "offline", icon: WifiOff },
];

/** 主标题渐变片段：Launcher 使用 .launcherText */
const iGM_LauncherDl_TitleAccent = "Launcher";

/** 主页面 */
export default async function iGM_LauncherDl_HomePage({
  params,
}: iGM_LauncherDl_HomePageProps) {
  const { locale } = await params;
  if (!iGM_LauncherDl_IsLocale(locale)) notFound();

  const messages = iGM_LauncherDl_GetMessages(locale);
  const hero = messages.hero;
  const titleBase = hero.title.endsWith(iGM_LauncherDl_TitleAccent)
    ? hero.title.slice(0, -iGM_LauncherDl_TitleAccent.length)
    : hero.title;

  return (
    <div className={styles.page}>
      {/* Hero */}
      <section className={styles.hero}>
        <span className={styles.heroBadge}>
          <Monitor size={14} aria-hidden />
          {iGM_LauncherDl_Platform}
        </span>
        <h1 className={styles.heroTitle}>
          {titleBase}
          <span className={styles.launcherText}>
            {iGM_LauncherDl_TitleAccent}
          </span>
        </h1>
        <p className={styles.heroSubtitle}>{hero.subtitle}</p>
        <p className={styles.heroDescription}>{hero.description}</p>
        <div className={styles.heroActions}>
          <a className={styles.primaryButton} href={iGM_LauncherDl_DownloadHref}>
            <Download size={17} aria-hidden />
            {hero.downloadCta}
          </a>
          <Link
            className={styles.secondaryButton}
            href={iGM_LauncherDl_LocalePath("/docs", locale)}
          >
            {hero.docsCta}
          </Link>
        </div>
      </section>

      {/* 版本信息 */}
      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>{messages.version.sectionTitle}</h2>
          <p className={styles.sectionDesc}>{messages.version.sectionDesc}</p>
        </header>
        <div className={styles.versionCard}>
          <dl className={styles.versionGrid}>
            <div className={styles.versionItem}>
              <dt>{messages.version.label}</dt>
              <dd className={styles.versionValue}>
                {iGM_LauncherDl_VersionLabel}
              </dd>
            </div>
            <div className={styles.versionItem}>
              <dt>{messages.version.platform}</dt>
              <dd>{iGM_LauncherDl_Platform}</dd>
            </div>
            <div className={styles.versionItem}>
              <dt>{messages.version.releasedAt}</dt>
              <dd>{iGM_LauncherDl_ReleaseDate}</dd>
            </div>
            <div className={styles.versionItem}>
              <dt>{messages.version.fileSize}</dt>
              <dd className={styles.versionPending}>
                {messages.version.pending}
              </dd>
            </div>
            <div className={styles.versionItem}>
              <dt>{messages.version.sha256}</dt>
              <dd className={styles.versionPending}>
                {messages.version.pending}
              </dd>
            </div>
            <div className={styles.versionItem}>
              <dt>{messages.version.fileName}</dt>
              <dd className={styles.versionFile}>
                {iGM_LauncherDl_FileName}
              </dd>
            </div>
          </dl>
          <a className={styles.primaryButton} href={iGM_LauncherDl_DownloadHref}>
            <Download size={17} aria-hidden />
            {messages.version.download}
          </a>
        </div>
      </section>

      {/* 功能介绍 */}
      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>
            {messages.features.sectionTitle}
          </h2>
          <p className={styles.sectionDesc}>{messages.features.sectionDesc}</p>
        </header>
        <div className={styles.featureGrid}>
          {iGM_LauncherDl_Features.map(({ key, icon: Icon }) => (
            <article key={key} className={styles.featureCard}>
              <span className={styles.featureIcon}>
                <Icon size={20} aria-hidden />
              </span>
              <h3 className={styles.featureTitle}>
                {messages.features[key].title}
              </h3>
              <p className={styles.featureDesc}>
                {messages.features[key].desc}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* 组织署名 */}
      <section className={styles.section}>
        <div className={styles.orgCard}>
          <span className={styles.orgBadge}>{messages.org.badge}</span>
          <h2 className={styles.orgTitle}>{messages.org.title}</h2>
          <p className={styles.orgDesc}>{messages.org.description}</p>
        </div>
      </section>
    </div>
  );
}