/**
 * 文件路径：apps/launcher-download/src/app/[locale]/releases/page.tsx
 * 所属层：前端 / 页面层
 * 路由：/{locale}/releases
 * 模块：iGM_LauncherDl_Downloader
 * 作用：版本列表页——展示当前发布记录的字段信息与下载/更新日志入口
 * 内容：纯静态 SSG 服务端页面，文案全部来自语言包；当前仅 Windows x64 构建
 */

// 导入依赖 //
import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, ScrollText } from "lucide-react";
import { iGM_LauncherDl_GetMessages } from "../../../i18n/iGM_LauncherDl_Messages";
import { iGM_LauncherDl_IsLocale } from "../../../i18n/iGM_LauncherDl_Locales";
import { iGM_LauncherDl_LocalePath } from "../../../i18n/iGM_LauncherDl_LocalePath";
import {
  iGM_LauncherDl_DownloadHref,
  iGM_LauncherDl_FileName,
  iGM_LauncherDl_FileSizeLabel,
  iGM_LauncherDl_Platform,
  iGM_LauncherDl_ReleaseDate,
  iGM_LauncherDl_Sha256,
  iGM_LauncherDl_VersionLabel,
} from "../../../i18n/iGM_LauncherDl_ReleaseInfo";
import styles from "../iGM_LauncherDl_Page.module.css";

// 类型定义 //
interface iGM_LauncherDl_ReleasesPageProps {
  params: Promise<{ locale: string }>;
}

// 核心逻辑 //
/** 版本列表页 */
export default async function iGM_LauncherDl_ReleasesPage({
  params,
}: iGM_LauncherDl_ReleasesPageProps) {
  const { locale } = await params;
  if (!iGM_LauncherDl_IsLocale(locale)) notFound();

  const messages = iGM_LauncherDl_GetMessages(locale);
  const page = messages.releases;

  const fields: { label: string; value: string; variant?: string }[] = [
    { label: page.platform, value: iGM_LauncherDl_Platform },
    { label: page.releasedAt, value: iGM_LauncherDl_ReleaseDate },
    { label: page.file, value: iGM_LauncherDl_FileName, variant: styles.fieldValueMono },
    { label: page.fileSize, value: iGM_LauncherDl_FileSizeLabel },
    { label: page.sha256, value: iGM_LauncherDl_Sha256, variant: styles.fieldValueMono },
  ];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{page.title}</h1>
        <p className={styles.lead}>{page.lead}</p>
      </header>

      <div className={styles.card}>
        <div className={styles.timelineHead}>
          <span className={styles.timelineVersion}>
            {iGM_LauncherDl_VersionLabel}
          </span>
          <span className={styles.badge}>{page.currentTag}</span>
        </div>

        <dl className={styles.fieldGrid}>
          {fields.map((field) => (
            <div key={field.label} className={styles.field}>
              <dt className={styles.fieldLabel}>{field.label}</dt>
              <dd className={[styles.fieldValue, field.variant].join(" ")}>
                {field.value}
              </dd>
            </div>
          ))}
        </dl>

        <div className={styles.actions}>
          <a className={styles.primaryButton} href={iGM_LauncherDl_DownloadHref}>
            <Download size={17} aria-hidden />
            {page.downloadAction}
          </a>
          <Link
            className={styles.secondaryButton}
            href={iGM_LauncherDl_LocalePath("/changelog", locale)}
          >
            <ScrollText size={16} aria-hidden />
            {page.viewChangelog}
          </Link>
        </div>
      </div>
    </div>
  );
}