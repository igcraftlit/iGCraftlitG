/**
 * 文件路径：apps/web/src/iGM_Components/iGM_NavCard/iGM_NavCard.tsx
 * 所属层：前端 / 通用组件层
 * 路由：G_Home
 * 模块：iGM_NavCard
 * 作用：首页三个简约入口卡片的统一结构
 * 内容：图标容器、标题、描述、右侧箭头，hover 仅做边框与阴影轻提示
 */

// 导入依赖 //
"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import styles from "./iGM_NavCard.module.css";

// 类型定义 //
export interface iGM_NavCardProps {
  /** 跳转路由，统一 G_Xxxxx */
  href: `/${string}`;
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
  return (
    <Link href={href} className={styles.card}>
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
    </Link>
  );
}

// 导出 //
export default iGM_NavCard;
