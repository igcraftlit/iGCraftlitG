/**
 * 文件路径：apps/launcher-download/src/app/[locale]/releases/page.tsx
 * 所属层：前端 / 页面层
 * 路由：/{locale}/releases
 * 模块：iGM_LauncherDl_Downloader
 * 作用：历史版本页——按版本渲染完整发布记录（版本号、日期、更新类型、新增 / 优化 / 修复内容）
 * 内容：纯静态 SSG 服务端页面，数据取自构建期常量 public/release-history.json；
 *       最新版置顶并加「最新」标记，其余按发布日期倒序；每版保留下载与发布页入口
 */

// 导入依赖 //
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, ExternalLink, ScrollText } from "lucide-react";
import { iGM_LauncherDl_GetMessages } from "../../../i18n/iGM_LauncherDl_Messages";
import { iGM_LauncherDl_IsLocale } from "../../../i18n/iGM_LauncherDl_Locales";
import { iGM_LauncherDl_LocalePath } from "../../../i18n/iGM_LauncherDl_LocalePath";
import {
  iGM_LauncherDl_GetReleaseHistory,
  iGM_LauncherDl_GetReleaseNotes,
} from "../../../i18n/iGM_LauncherDl_ReleaseInfo";
import styles from "../iGM_LauncherDl_Page.module.css";

// 类型定义 //
interface iGM_LauncherDl_ReleasesPageProps {
  params: Promise<{ locale: string }>;
}

// 核心逻辑 //
/** 历史版本页 */
export default async function iGM_LauncherDl_ReleasesPage({
  params,
}: iGM_LauncherDl_ReleasesPageProps) {
  const { locale } = await params;
  if (!iGM_LauncherDl_IsLocale(locale)) notFound();

  const messages = iGM_LauncherDl_GetMessages(locale);
  const page = messages.releases;
  const releases = iGM_LauncherDl_GetReleaseHistory();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{page.title}</h1>
        <p className={styles.lead}>{page.lead}</p>
      </header>

      <ol className={styles.releaseList}>
        {releases.map((release) => {
          const notes = iGM_LauncherDl_GetReleaseNotes(release.notes, locale);
          const noteGroups = [
            { key: "added", label: page.noteGroups.added, items: notes.added ?? [] },
            {
              key: "improved",
              label: page.noteGroups.improved,
              items: notes.improved ?? [],
            },
            { key: "fixed", label: page.noteGroups.fixed, items: notes.fixed ?? [] },
          ].filter((group) => group.items.length > 0);

          return (
            <li key={release.id} className={styles.releaseCard}>
              <div className={styles.releaseHead}>
                <span className={styles.timelineVersion}>{release.version}</span>
                <span className={styles.timelineDate}>{release.releasedAt}</span>
                <span className={styles.updateTypeTag}>
                  {page.updateType[release.updateType]}
                </span>
                {release.isLatest ? (
                  <span className={styles.badgeLatest}>{page.latestTag}</span>
                ) : null}
              </div>

              <div className={styles.noteGroups}>
                {noteGroups.map((group) => (
                  <div key={group.key} className={styles.noteGroup}>
                    <p className={styles.noteGroupTitle}>{group.label}</p>
                    <ul className={styles.timelineList}>
                      {group.items.map((item) => (
                        <li key={item} className={styles.timelineListItem}>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <div className={styles.actions}>
                <a className={styles.primaryButton} href={release.downloadUrl}>
                  <Download size={17} aria-hidden />
                  {page.downloadAction}
                </a>
                <a
                  className={styles.secondaryButton}
                  href={release.releasePageUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink size={16} aria-hidden />
                  {page.releasePageAction}
                </a>
              </div>
            </li>
          );
        })}
      </ol>

      <div className={styles.actions}>
        <Link
          className={styles.secondaryButton}
          href={iGM_LauncherDl_LocalePath("/changelog", locale)}
        >
          <ScrollText size={16} aria-hidden />
          {page.viewChangelog}
        </Link>
      </div>
    </div>
  );
}