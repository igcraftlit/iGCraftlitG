/**
 * 文件路径：apps/cli-download/src/components/iGM_CLI_PlaceholderSection/iGM_CLI_PlaceholderSection.tsx
 * 所属层：前端 / 组件层
 * 路由：全局
 * 模块：iGM_CLI_Downloader
 * 作用：内容占位区块——占位标题 + 占位提示，本阶段不填充具体功能与数据
 * 内容：极简风格，图标使用 lucide-react，文案来自 next-intl 语言包
 */

// 导入依赖 //
"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import styles from "./iGM_CLI_PlaceholderSection.module.css";

// 类型定义 //
interface iGM_CLI_PlaceholderSectionProps {
  /** 区块锚点 ID（供顶部导航锚点跳转） */
  id?: string;
  /** 占位标题 */
  title: string;
  /** 标题图标（lucide-react 节点） */
  icon?: ReactNode;
}

// 核心逻辑 //
/** 内容占位区块：仅渲染标题与占位提示框 */
export function iGM_CLI_PlaceholderSection({
  id,
  title,
  icon,
}: iGM_CLI_PlaceholderSectionProps) {
  const t = useTranslations();

  return (
    <section id={id} className={styles.section}>
      <h2 className={styles.title}>
        {icon ? <span className={styles.titleIcon}>{icon}</span> : null}
        {title}
      </h2>
      <div className={styles.body}>
        <span className={styles.placeholderText}>{t("placeholder")}</span>
      </div>
    </section>
  );
}

// 导出 //
export default iGM_CLI_PlaceholderSection;
