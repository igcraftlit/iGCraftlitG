/**
 * 文件路径：apps/cli-download/src/components/iGM_CLI_Footer/iGM_CLI_Footer.tsx
 * 所属层：前端 / 组件层
 * 路由：全局
 * 模块：iGM_CLI_Downloader
 * 作用：站点页脚——团队署名 iGCraftLit × MuoCeon 联合构建、版权信息
 * 内容：极简风格，文案来自 next-intl 语言包
 */

// 导入依赖 //
"use client";

import { useTranslations } from "next-intl";
import styles from "./iGM_CLI_Footer.module.css";

// 类型定义 //
// （本组件无外部属性）

// 核心逻辑 //
/** 站点页脚 */
export function iGM_CLI_Footer() {
  const t = useTranslations();
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <span className={styles.builtBy}>{t("footer.builtBy")}</span>
        <span className={styles.copyright}>
          {t("footer.copyright", { year })}
        </span>
      </div>
    </footer>
  );
}

// 导出 //
export default iGM_CLI_Footer;
