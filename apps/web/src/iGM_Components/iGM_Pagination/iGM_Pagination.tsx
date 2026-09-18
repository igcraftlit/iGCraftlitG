/**
 * 文件路径：apps/web/src/iGM_Components/iGM_Pagination/iGM_Pagination.tsx
 * 所属层：前端 / 通用组件层
 * 路由：G_Community、G_User、G_UserPosts、G_UserComments
 * 模块：iGM_Pagination
 * 作用：帖子与评论列表的极简分页控件
 * 内容：上一页/下一页按钮与页码指示，单页时不渲染
 */

// 导入依赖 //
"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import styles from "./iGM_Pagination.module.css";

// 类型定义 //
export interface iGM_PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

// 核心逻辑 //
/** 分页控件：上一页 / 页码 / 下一页 */
export function iGM_Pagination({
  page,
  totalPages,
  onChange,
}: iGM_PaginationProps) {
  const t = useTranslations();
  if (totalPages <= 1) return null;

  return (
    <nav className={styles.pagination} aria-label={t("community.pagination.label")}>
      <button
        type="button"
        className={styles.navButton}
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft size={15} strokeWidth={1.8} />
        {t("community.pagination.prev")}
      </button>
      <span className={styles.pageInfo}>
        {t("community.pagination.pageInfo", { page, totalPages })}
      </span>
      <button
        type="button"
        className={styles.navButton}
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        {t("community.pagination.next")}
        <ChevronRight size={15} strokeWidth={1.8} />
      </button>
    </nav>
  );
}

// 导出 //
export default iGM_Pagination;
