/**
 * 文件路径：apps/cli-download/src/app/[locale]/api/page.tsx
 * 所属层：前端 / 页面层
 * 路由：/{locale}/api
 * 模块：iGM_CLI_Downloader
 * 作用：API 页面——本阶段给出 iGM CLI 安装入口（五种平台安装方式 + 一键复制）
 * 内容：页面标题 + 安装区块（复用 iGM_CLI_InstallMethods 与 iGM_CLI_CodeBlock），
 *       安装标签与提示文案来自 next-intl；底部提供跳转完整安装文档的入口
 */

// 导入依赖 //
import type { Metadata } from "next";
import Link from "next/link";
import { Braces } from "lucide-react";
import { iGM_CLI_CodeBlock as IGM_CLI_CodeBlock } from "../../../components/iGM_CLI_CodeBlock/iGM_CLI_CodeBlock";
import { iGM_CLI_InstallMethods } from "../../../components/iGM_CLI_CliGuide/iGM_CLI_InstallSnippets";
import { iGM_CLI_VersionBadge as IGM_CLI_VersionBadge } from "../../../components/iGM_CLI_VersionBadge/iGM_CLI_VersionBadge";
import { iGM_CLI_GetMessages } from "../../../i18n/iGM_CLI_Messages";
import { iGM_CLI_IsLocale } from "../../../i18n/iGM_CLI_Locales";
import { iGM_CLI_LocalePath } from "../../../i18n/iGM_CLI_LocalePath";
import styles from "../../../components/iGM_CLI_CliGuide/iGM_CLI_DocContent.module.css";

// 类型定义 //
interface iGM_CLI_ApiPageProps {
  params: Promise<{ locale: string }>;
}

// 核心逻辑 //
/** 每语言页面元数据 */
export async function generateMetadata({
  params,
}: iGM_CLI_ApiPageProps): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = iGM_CLI_IsLocale(raw) ? raw : "zh-CN";
  const messages = iGM_CLI_GetMessages(locale);
  return {
    title: messages.pages.api.title,
    description: messages.pages.api.installLead,
  };
}

/** API 页面：标题 + iGM CLI 安装区块 */
export default async function iGM_CLI_ApiPage({ params }: iGM_CLI_ApiPageProps) {
  const { locale: raw } = await params;
  const locale = iGM_CLI_IsLocale(raw) ? raw : "zh-CN";
  const messages = iGM_CLI_GetMessages(locale);
  const api = messages.pages.api;
  const install = messages.docs.cli.install;

  return (
    <div
      style={{
        maxWidth: 1080,
        margin: "0 auto",
        padding: "64px 20px 80px",
      }}
    >
      <header className={styles.articleHead}>
        <h1 className={styles.h1}>{api.title}</h1>
        <p className={styles.lead}>{api.installLead}</p>
        <IGM_CLI_VersionBadge label={api.latestVersion} />
      </header>

      <section className={styles.section}>
        <h2 className={styles.h2}>{api.installTitle}</h2>
        <p className={styles.p}>{install.lead}</p>

        {iGM_CLI_InstallMethods.map((method) => (
          <div key={method.id} id={method.id} className={styles.subBlock}>
            <h3 className={styles.h3}>{install[method.labelKey]}</h3>
            {method.comingSoon ? (
              <p className={styles.comingSoon}>{install.comingSoon}</p>
            ) : (
              <IGM_CLI_CodeBlock label={method.lang} code={method.code} />
            )}
          </div>
        ))}

        <p className={styles.p}>{install.done}</p>

        <Link
          href={iGM_CLI_LocalePath("/docs/cli/install", locale)}
          className={styles.textLink}
        >
          {api.viewFullInstall}
        </Link>
      </section>

      <section className={styles.section}>
        <h2 className={styles.h2}>{api.updateTitle}</h2>
        <p className={styles.p}>{api.updateNote}</p>
        <div id="update-cache" className={styles.subBlock}>
          <h3 className={styles.h3}>igm cache clean</h3>
          <IGM_CLI_CodeBlock label="shell" code="igm cache clean" />
        </div>
        <div id="update-npm" className={styles.subBlock}>
          <h3 className={styles.h3}>npm</h3>
          <IGM_CLI_CodeBlock label="shell" code="npm install -g igm-cli@latest" />
        </div>
        <div id="update-bun" className={styles.subBlock}>
          <h3 className={styles.h3}>bun</h3>
          <IGM_CLI_CodeBlock label="shell" code="bun add -g igm-cli@latest" />
        </div>
      </section>
    </div>
  );
}
