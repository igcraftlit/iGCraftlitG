/**
 * 文件路径：apps/launcher-download/src/app/[locale]/about/page.tsx
 * 所属层：前端 / 页面层
 * 路由：/{locale}/about
 * 模块：iGM_LauncherDl_Downloader
 * 作用：关于页——iGM CraftCeon Launcher 介绍、iGCraftLit Community × MuoCeon 署名、目标与联系方式
 * 内容：纯静态 SSG 服务端页面，文案全部来自语言包；图标使用 lucide-react，无 emoji
 */

// 导入依赖 //
import { notFound } from "next/navigation";
import { Blocks, Globe, Mail, Users } from "lucide-react";
import { iGM_LauncherDl_GetMessages } from "../../../i18n/iGM_LauncherDl_Messages";
import { iGM_LauncherDl_IsLocale } from "../../../i18n/iGM_LauncherDl_Locales";
import styles from "../iGM_LauncherDl_Page.module.css";

// 类型定义 //
interface iGM_LauncherDl_AboutPageProps {
  params: Promise<{ locale: string }>;
}

// 核心逻辑 //
/** 团队官网地址 */
const iGM_LauncherDl_WebsiteUrl = "https://igcraftlit.com";

/** 团队联系邮箱 */
const iGM_LauncherDl_ContactEmail = "igcraftlit@outlook.com";

/** 关于页 */
export default async function iGM_LauncherDl_AboutPage({
  params,
}: iGM_LauncherDl_AboutPageProps) {
  const { locale } = await params;
  if (!iGM_LauncherDl_IsLocale(locale)) notFound();

  const messages = iGM_LauncherDl_GetMessages(locale);
  const page = messages.about;

  const orgs: { title: string; desc: string; icon: typeof Users }[] = [
    { ...page.igcraftlit, icon: Users },
    { ...page.muoceon, icon: Blocks },
  ];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{page.title}</h1>
        <p className={styles.lead}>{page.lead}</p>
      </header>

      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>{page.missionTitle}</h2>
        <p className={styles.infoDesc}>{page.mission}</p>
      </section>

      <div className={styles.grid}>
        {orgs.map(({ title, desc, icon: Icon }) => (
          <article key={title} className={styles.infoCard}>
            <span className={styles.infoIcon}>
              <Icon size={20} aria-hidden />
            </span>
            <h3 className={styles.infoTitle}>{title}</h3>
            <p className={styles.infoDesc}>{desc}</p>
          </article>
        ))}
      </div>

      <section className={styles.card}>
        <h2 className={styles.sectionTitle}>{page.contactTitle}</h2>
        <div className={styles.actions}>
          <a
            className={styles.secondaryButton}
            href={iGM_LauncherDl_WebsiteUrl}
            target="_blank"
            rel="noreferrer"
          >
            <Globe size={16} aria-hidden />
            {page.websiteLabel}
          </a>
          <a
            className={styles.secondaryButton}
            href={`mailto:${iGM_LauncherDl_ContactEmail}`}
          >
            <Mail size={16} aria-hidden />
            {iGM_LauncherDl_ContactEmail}
          </a>
        </div>
      </section>
    </div>
  );
}