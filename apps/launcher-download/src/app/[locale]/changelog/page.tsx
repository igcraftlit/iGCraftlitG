/**
 * 文件路径：apps/launcher-download/src/app/[locale]/changelog/page.tsx
 * 所属层：前端 / 页面层
 * 路由：/{locale}/changelog
 * 模块：iGM_LauncherDl_Downloader
 * 作用：更新日志页——按版本渲染时间线（版本号、日期、当前版本标记、变更条目）
 * 内容：纯静态 SSG 服务端页面，条目结构取自语言包 changelog.entries 数组
 */

// 导入依赖 //
import { notFound } from "next/navigation";
import { iGM_LauncherDl_GetMessages } from "../../../i18n/iGM_LauncherDl_Messages";
import { iGM_LauncherDl_IsLocale } from "../../../i18n/iGM_LauncherDl_Locales";
import styles from "../iGM_LauncherDl_Page.module.css";

// 类型定义 //
interface iGM_LauncherDl_ChangelogPageProps {
  params: Promise<{ locale: string }>;
}

// 核心逻辑 //
/** 更新日志页 */
export default async function iGM_LauncherDl_ChangelogPage({
  params,
}: iGM_LauncherDl_ChangelogPageProps) {
  const { locale } = await params;
  if (!iGM_LauncherDl_IsLocale(locale)) notFound();

  const messages = iGM_LauncherDl_GetMessages(locale);
  const page = messages.changelog;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{page.title}</h1>
        <p className={styles.lead}>{page.lead}</p>
      </header>

      <ol className={styles.timeline}>
        {page.entries.map((entry, index) => (
          <li key={entry.version} className={styles.timelineItem}>
            <div className={styles.timelineHead}>
              <span className={styles.timelineVersion}>{entry.version}</span>
              <span className={styles.timelineDate}>{entry.date}</span>
              {index === 0 ? (
                <span className={styles.badge}>{page.currentTag}</span>
              ) : null}
            </div>
            <ul className={styles.timelineList}>
              {entry.items.map((item) => (
                <li key={item} className={styles.timelineListItem}>
                  {item}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}