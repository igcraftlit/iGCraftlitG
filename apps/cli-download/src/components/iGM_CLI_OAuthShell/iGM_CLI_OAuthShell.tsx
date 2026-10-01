/**
 * 文件路径：apps/cli-download/src/components/iGM_CLI_OAuthShell/iGM_CLI_OAuthShell.tsx
 * 所属层：前端 / 组件层
 * 路由：/oauth/apply、/oauth/apps、/oauth/docs
 * 模块：iGM_CLI_OAuthShell
 * 作用：OAuth 分区统一外壳——页头、分区页签导航、会话过期提示挂载点
 * 内容：三页面互相跳转的 tab 链接（申请接入 / 我的应用 / 接入文档）、
 *       统一内容容器，并挂载 iGM_CLI_SessionExpired 处理 401 提示
 */

// 导入依赖 //
"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { iGM_CLI_LocalePath } from "../../i18n/iGM_CLI_LocalePath";
import { iGM_CLI_UseLocale } from "../iGM_CLI_Providers/iGM_CLI_LocaleProvider";
import { iGM_CLI_SessionExpired as IGM_CLI_SessionExpired } from "../iGM_CLI_SessionExpired/iGM_CLI_SessionExpired";
import styles from "./iGM_CLI_OAuth.module.css";

// 类型定义 //
/** 当前激活的分区页签 */
export type iGM_CLI_OAuthSection = "apply" | "apps" | "docs";

interface iGM_CLI_OAuthShellProps {
  /** 当前分区 */
  active: iGM_CLI_OAuthSection;
  /** 页面正文 */
  children: ReactNode;
}

// 核心逻辑 //
/** 分区页签配置（顺序即展示顺序，文案复用 pages.oauth* 标题） */
const iGM_CLI_OAuthSections: {
  key: iGM_CLI_OAuthSection;
  href: string;
  labelKey: string;
}[] = [
  { key: "apply", href: "/oauth/apply", labelKey: "pages.oauthApply.title" },
  { key: "apps", href: "/oauth/apps", labelKey: "pages.oauthApps.title" },
  { key: "docs", href: "/oauth/docs", labelKey: "pages.oauthDocs.title" },
];

/** OAuth 分区外壳：页签 + 正文 + 会话过期提示 */
export function iGM_CLI_OAuthShell({ active, children }: iGM_CLI_OAuthShellProps) {
  const t = useTranslations();
  const { locale } = iGM_CLI_UseLocale();

  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <h1 className={styles.pageTitle}>
          <span className={styles.pageTitleIcon}>
            <Lock size={20} strokeWidth={1.8} aria-hidden />
          </span>
          {t("nav.oauth")}
        </h1>
      </header>

      <nav className={styles.tabs} aria-label={t("nav.oauth")}>
        {iGM_CLI_OAuthSections.map((section) => (
          <Link
            key={section.key}
            href={iGM_CLI_LocalePath(section.href, locale)}
            className={[
              styles.tab,
              section.key === active ? styles.tabActive : "",
            ].join(" ")}
            aria-current={section.key === active ? "page" : undefined}
          >
            {t(section.labelKey)}
          </Link>
        ))}
      </nav>

      <div className={styles.body}>{children}</div>

      <IGM_CLI_SessionExpired />
    </div>
  );
}

// 导出 //
export default iGM_CLI_OAuthShell;
