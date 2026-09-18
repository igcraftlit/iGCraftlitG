/**
 * 文件路径：apps/web/src/iGM_Components/iGM_EmptyState/iGM_EmptyState.tsx
 * 所属层：前端 / 通用组件层
 * 路由：G_Community、G_Post、G_User、G_UserPosts、G_UserComments
 * 模块：iGM_EmptyState
 * 作用：统一的空状态占位（无帖子、无评论、未选择内容等）
 * 内容：lucide 图标 + 标题 + 可选描述与操作节点
 */

// 导入依赖 //
"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import styles from "./iGM_EmptyState.module.css";

// 类型定义 //
export interface iGM_EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

// 核心逻辑 //
/** 空状态占位 */
export function iGM_EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: iGM_EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <span className={styles.icon}>
        <Icon size={32} strokeWidth={1.5} />
      </span>
      <p className={styles.title}>{title}</p>
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}

// 导出 //
export default iGM_EmptyState;
