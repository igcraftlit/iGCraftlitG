/**
 * 文件路径：apps/cli-download/src/app/[locale]/page.tsx
 * 所属层：前端 / 页面层
 * 路由：/{locale}
 * 模块：iGM_CLI_Downloader
 * 作用：iGM CLI Download API 主页面——Hero + 各内容区块占位
 * 内容：顶部导航与页脚由 [locale]/layout.tsx 提供；
 *       快速开始、命令列表、SDK、适配器协议区块本阶段仅保留占位标题
 */

// 导入依赖 //
import type { Metadata } from "next";
import { Terminal, Zap, ListOrdered, Package, Plug } from "lucide-react";
import { iGM_CLI_PlaceholderSection as IGM_CLI_PlaceholderSection } from "../../components/iGM_CLI_PlaceholderSection/iGM_CLI_PlaceholderSection";
import { iGM_CLI_GetMessages } from "../../i18n/iGM_CLI_Messages";
import { iGM_CLI_IsLocale } from "../../i18n/iGM_CLI_Locales";
import styles from "./iGM_CLI_Home.module.css";

// 类型定义 //
interface iGM_CLI_HomePageProps {
  params: Promise<{ locale: string }>;
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

/** 主页面：Hero + 占位区块 */
export default async function iGM_CLI_HomePage({ params }: iGM_CLI_HomePageProps) {
  const { locale: raw } = await params;
  const locale = iGM_CLI_IsLocale(raw) ? raw : "zh-CN";
  const messages = iGM_CLI_GetMessages(locale);

  return (
    <>
      {/* Hero 区：大标题 + 副标题 + 一句话简介占位 */}
      <section className={styles.hero}>
        <span className={styles.heroIcon}>
          <Terminal size={28} aria-hidden />
        </span>
        <h1 className={styles.heroTitle}>{messages.hero.title}</h1>
        <p className={styles.heroSubtitle}>{messages.hero.subtitle}</p>
        <p className={styles.heroDescription}>{messages.hero.description}</p>
      </section>

      {/* 快速开始区块：占位，暂不填充安装命令 */}
      <IGM_CLI_PlaceholderSection
        id="quickstart"
        title={messages.sections.quickstart}
        icon={<Zap size={20} aria-hidden />}
      />

      {/* 命令列表区块：占位，暂不填充具体命令 */}
      <IGM_CLI_PlaceholderSection
        id="commands"
        title={messages.sections.commands}
        icon={<ListOrdered size={20} aria-hidden />}
      />

      {/* SDK 区块：占位 */}
      <IGM_CLI_PlaceholderSection
        id="sdk"
        title={messages.sections.sdk}
        icon={<Package size={20} aria-hidden />}
      />

      {/* 适配器协议区块：占位 */}
      <IGM_CLI_PlaceholderSection
        id="adapter"
        title={messages.sections.adapter}
        icon={<Plug size={20} aria-hidden />}
      />
    </>
  );
}
