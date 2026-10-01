/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_LanguageSwitcher/iGM_Launcher_LanguageSwitcher.tsx
 * 所属层：前端 / 语言切换层
 * 路由：全局（TopBar）
 * 模块：iGM_Launcher_LanguageSwitcher
 * 作用：在 zh-CN 与 en 之间切换界面语言（模块一仅这两种）
 * 内容：点击即在两种语言间互换，显示当前语言自称
 */

// 导入依赖 //
"use client";

import { Languages } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  IGM_LAUNCHER_LOCALE_LABELS,
} from "@/i18n/iGM_Launcher_Locales";
import { iGM_Launcher_UseLocale } from "@/components/iGM_Launcher_Providers/iGM_Launcher_LocaleProvider";
import styles from "./iGM_Launcher_LanguageSwitcher.module.css";

// 类型定义 //
/* （无额外类型） */

// 核心逻辑 //
export function iGM_Launcher_LanguageSwitcher() {
  const t = useTranslations("common");
  const { locale, toggleLocale } = iGM_Launcher_UseLocale();

  return (
    <button
      type="button"
      className={styles.iconButton}
      title={t("language")}
      aria-label="switch language"
      onClick={toggleLocale}
    >
      <Languages size={16} strokeWidth={1.8} />
      <span className={styles.localeLabel}>{IGM_LAUNCHER_LOCALE_LABELS[locale]}</span>
    </button>
  );
}

// 导出 //
export default iGM_Launcher_LanguageSwitcher;
