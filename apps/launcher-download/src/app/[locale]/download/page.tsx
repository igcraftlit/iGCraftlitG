/**
 * 文件路径：apps/launcher-download/src/app/[locale]/download/page.tsx
 * 所属层：前端 / 页面层
 * 路由：/{locale}/download
 * 模块：iGM_LauncherDl_Downloader
 * 作用：下载页——展示平台、版本、文件、大小、SHA256 与真实下载入口
 * 内容：纯静态 SSG 服务端页面，文案全部来自语言包；安装说明入口跳转 /docs/install；
 *       下载地址与校验值取自发布清单 public/release.json（GitHub Releases 归档直链）
 */

// 导入依赖 //
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, Download, Monitor, Terminal } from "lucide-react";
import { iGM_LauncherDl_GetMessages } from "../../../i18n/iGM_LauncherDl_Messages";
import { iGM_LauncherDl_IsLocale } from "../../../i18n/iGM_LauncherDl_Locales";
import { iGM_LauncherDl_LocalePath } from "../../../i18n/iGM_LauncherDl_LocalePath";
import {
  iGM_LauncherDl_DownloadHref,
  iGM_LauncherDl_FileName,
  iGM_LauncherDl_FileSizeLabel,
  iGM_LauncherDl_Platform,
  iGM_LauncherDl_Sha256,
  iGM_LauncherDl_VersionLabel,
} from "../../../i18n/iGM_LauncherDl_ReleaseInfo";
import styles from "../iGM_LauncherDl_Page.module.css";

// 类型定义 //
interface iGM_LauncherDl_DownloadPageProps {
  params: Promise<{ locale: string }>;
}

// 核心逻辑 //
/** 下载页 */
export default async function iGM_LauncherDl_DownloadPage({
  params,
}: iGM_LauncherDl_DownloadPageProps) {
  const { locale } = await params;
  if (!iGM_LauncherDl_IsLocale(locale)) notFound();

  const messages = iGM_LauncherDl_GetMessages(locale);
  const page = messages.download;

  const fields: { label: string; value: string; variant?: string }[] = [
    { label: page.platform, value: iGM_LauncherDl_Platform },
    { label: page.version, value: iGM_LauncherDl_VersionLabel, variant: styles.fieldValueStrong },
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
            {page.downloadBtn}
          </a>
          <Link
            className={styles.secondaryButton}
            href={iGM_LauncherDl_LocalePath("/docs/install", locale)}
          >
            <BookOpen size={16} aria-hidden />
            {page.installGuide}
          </Link>
        </div>

        <p className={styles.note}>
          <Monitor size={13} aria-hidden /> {page.note}
        </p>

        <p className={styles.note}>
          <Terminal size={13} aria-hidden /> {page.cliHint}{" "}
          <code className={styles.hintCode}>&gt; igm launcher</code>
        </p>
      </div>
    </div>
  );
}