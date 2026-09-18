/**
 * 文件路径：apps/web/src/iGM_Components/iGM_Footer/iGM_Footer.tsx
 * 所属层：前端 / 通用组件层
 * 路由：全局
 * 模块：iGM_Footer
 * 作用：全站页脚，仅展示极简版权信息
 * 内容：版权年份与网站名称，文案来自语言包
 */

// 导入依赖 //
"use client";

import { useTranslations } from "next-intl";
import styles from "./iGM_Footer.module.css";

// 类型定义 //
// （页脚无属性输入）

// 核心逻辑 //
/** 页脚 */
export function iGM_Footer() {
  const t = useTranslations();
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <span className={styles.text}>{t("footer.copyright", { year })}</span>
    </footer>
  );
}

// 导出 //
export default iGM_Footer;
