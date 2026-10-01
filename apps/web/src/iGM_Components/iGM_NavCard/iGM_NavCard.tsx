/**
 * 文件路径：apps/web/src/iGM_Components/iGM_NavCard/iGM_NavCard.tsx
 * 所属层：前端 / 通用组件层
 * 路由：G_Home
 * 模块：iGM_NavCard
 * 作用：首页四个简约入口卡片的统一结构
 * 内容：图标容器、标题、描述、右侧箭头，hover 仅做边框与阴影轻提示；
 *       外链（绝对地址）渲染为新标签页的原生 <a>，站内路径走 iGM_Link
 */

// 导入依赖 //
"use client";

import { iGM_Link as Link } from "../../iGM_Components/iGM_Link/iGM_Link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import styles from "./iGM_NavCard.module.css";

// 类型定义 //
export interface iGM_NavCardProps {
  /**
   * 跳转地址：站内统一 G_Xxxxx 路径（经 iGM_Link 自动拼装语言前缀）；
   * 也可为外部绝对地址（如 iGM Launcher 下载站），iGM_LocalePath 会原样透传
   */
  href: string;
  /** lucide-react 图标 */
  icon: LucideIcon;
  /** 已翻译标题 */
  title: string;
  /** 已翻译描述 */
  description: string;
}

// 核心逻辑 //
/** 首页导航入口卡片 */
export function iGM_NavCard({
  href,
  icon: Icon,
  title,
  description,
}: iGM_NavCardProps) {
  // 外链（如 iGM Launcher 下载站）：按站内惯例新开标签页，避免离开控制台
  const external = /^https?:\/\//.test(href);
  const content = (
    <>
      <span className={styles.iconBox}>
        <Icon size={20} strokeWidth={1.8} />
      </span>
      <span className={styles.body}>
        <span className={styles.title}>{title}</span>
        <span className={styles.description}>{description}</span>
      </span>
      <ArrowRight
        className={styles.arrow}
        size={18}
        strokeWidth={1.8}
        aria-hidden
      />
    </>
  );

  if (external) {
    return (
      <a
        href={href}
        className={styles.card}
        target="_blank"
        rel="noopener noreferrer"
      >
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className={styles.card}>
      {content}
    </Link>
  );
}

// 导出 //
export default iGM_NavCard;
