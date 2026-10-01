/**
 * 文件路径：apps/web/src/iGM_Components/iGM_Footer/iGM_Footer.tsx
 * 所属层：前端 / 通用组件层
 * 路由：全局
 * 模块：iGM_Footer
 * 作用：全站页脚，展示开发者门户外链入口与极简版权信息
 * 内容：iGM CLI Download API 独立站点入口（新标签页打开）、版权年份与网站名称，
 *       文案来自语言包
 */

// 导入依赖 //
"use client";

import { useTranslations } from "next-intl";
import { ArrowUpRight, Terminal } from "lucide-react";
import styles from "./iGM_Footer.module.css";

// 类型定义 //
/** iGM CLI Download API 开发者门户地址（独立部署子站，外链新标签页打开） */
const iGM_DeveloperPortalUrl = "https://cli.igcraftlit.com";

// 核心逻辑 //
/** 页脚 */
export function iGM_Footer() {
  const t = useTranslations();
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.links}>
        <a
          className={styles.devLink}
          href={iGM_DeveloperPortalUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Terminal size={13} aria-hidden />
          {t("footer.devPortal")}
          <ArrowUpRight size={12} aria-hidden />
        </a>
      </div>
      <span className={styles.text}>{t("footer.copyright", { year })}</span>
    </footer>
  );
}

// 导出 //
export default iGM_Footer;
