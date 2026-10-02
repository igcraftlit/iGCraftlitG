/**
 * 文件路径：apps/launcher-download/src/components/iGM_LauncherDl_Footer/iGM_LauncherDl_Footer.tsx
 * 所属层：前端 / 组件层
 * 路由：全局
 * 模块：iGM_LauncherDl_Downloader
 * 作用：站点页脚——官网入口、联系邮箱、团队署名 iGCraftLit、版权信息
 * 内容：极简风格，图标使用 lucide-react，文案来自 next-intl 语言包
 */

// 导入依赖 //
"use client";

import { Globe, Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import styles from "./iGM_LauncherDl_Footer.module.css";

// 类型定义 //
// （本组件无外部属性）

// 核心逻辑 //
/** iGCraftLit 主站地址（页脚官网入口） */
const iGM_LauncherDl_WebsiteUrl = "https://igcraftlit.com";

/** 团队联系邮箱 */
const iGM_LauncherDl_ContactEmail = "igcraftlit@outlook.com";

/** 站点页脚 */
export function iGM_LauncherDl_Footer() {
  const t = useTranslations();
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.links}>
          <a
            className={styles.link}
            href={iGM_LauncherDl_WebsiteUrl}
            target="_blank"
            rel="noreferrer"
          >
            <Globe size={15} aria-hidden />
            {t("footer.website")}
          </a>
          <a
            className={styles.link}
            href={`mailto:${iGM_LauncherDl_ContactEmail}`}
          >
            <Mail size={15} aria-hidden />
            {iGM_LauncherDl_ContactEmail}
          </a>
        </div>
        <span className={styles.builtBy}>{t("footer.builtBy")}</span>
        <span className={styles.copyright}>
          {t("footer.copyright", { year })}
        </span>
      </div>
    </footer>
  );
}

// 导出 //
export default iGM_LauncherDl_Footer;