/**
 * 文件路径：apps/web/src/iGM_Pages/iGM_NotFoundPage.tsx
 * 所属层：前端 / 页面层
 * 路由：全局 404
 * 模块：iGM_NotFoundPage
 * 作用：未匹配路由的 404 页面
 * 内容：404 编号、提示文案与返回首页入口，文案全部来自语言包
 */

// 导入依赖 //
"use client";

import Link from "next/link";
import { Home } from "lucide-react";
import { useTranslations } from "next-intl";
import styles from "./iGM_Page.module.css";

// 类型定义 //
// （404 页无属性输入）

// 核心逻辑 //
/** 404 页面 */
export function iGM_NotFoundPage() {
  const t = useTranslations();

  return (
    <div className={styles.notFound}>
      <span className={styles.notFoundCode}>404</span>
      <h1 className={styles.notFoundTitle}>{t("notfound.title")}</h1>
      <p className={styles.notFoundDescription}>
        {t("notfound.description")}
      </p>
      <Link href="/G_Home" className={styles.primaryLink}>
        <Home size={16} strokeWidth={1.8} />
        {t("notfound.backHome")}
      </Link>
    </div>
  );
}

// 导出 //
export default iGM_NotFoundPage;
