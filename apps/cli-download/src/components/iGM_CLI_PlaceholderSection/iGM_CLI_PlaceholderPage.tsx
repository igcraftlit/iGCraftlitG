/**
 * 文件路径：apps/cli-download/src/components/iGM_CLI_PlaceholderSection/iGM_CLI_PlaceholderPage.tsx
 * 所属层：前端 / 组件层
 * 路由：全局
 * 模块：iGM_CLI_Downloader
 * 作用：独立占位页骨架——页面标题、占位提示与返回首页链接
 * 内容：极简风格，图标使用 lucide-react，文案来自 next-intl 语言包
 */

// 导入依赖 //
"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { iGM_CLI_LocalePath } from "../../i18n/iGM_CLI_LocalePath";
import { iGM_CLI_UseLocale } from "../iGM_CLI_Providers/iGM_CLI_LocaleProvider";
import styles from "./iGM_CLI_PlaceholderPage.module.css";

// 类型定义 //
interface iGM_CLI_PlaceholderPageProps {
  /** 页面标题 */
  title: string;
  /** 标题图标（lucide-react 节点） */
  icon?: ReactNode;
}

// 核心逻辑 //
/** 独立占位页：标题 + 占位提示 + 返回首页链接 */
export function iGM_CLI_PlaceholderPage({ title, icon }: iGM_CLI_PlaceholderPageProps) {
  const t = useTranslations();
  const { locale } = iGM_CLI_UseLocale();

  return (
    <div className={styles.page}>
      {icon ? <span className={styles.icon}>{icon}</span> : null}
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.placeholder}>{t("placeholder")}</p>
      <Link href={iGM_CLI_LocalePath("/", locale)} className={styles.backLink}>
        <ArrowLeft size={16} aria-hidden />
        {t("common.backToHome")}
      </Link>
    </div>
  );
}

// 导出 //
export default iGM_CLI_PlaceholderPage;
