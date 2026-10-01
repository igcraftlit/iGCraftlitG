/**
 * 文件路径：apps/launcher-download/src/components/iGM_LauncherDl_LanguageSwitcher/iGM_LauncherDl_LanguageSwitcher.tsx
 * 所属层：前端 / 组件层
 * 路由：全局（站点头部）
 * 模块：iGM_LauncherDl_Downloader
 * 作用：语言切换器——Languages 触发按钮 + 五种语言下拉菜单
 * 内容：基于 next-intl 与 iGM_LauncherDl_UseLocale；选择后经 iGM_LauncherDl_LocalePath
 *       导航到目标语言前缀路径并写入 Cookie；图标使用 lucide-react，无 emoji
 */

// 导入依赖 //
"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Languages } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  iGM_LauncherDl_Locales,
  type iGM_LauncherDl_Locale,
} from "../../i18n/iGM_LauncherDl_Locales";
import { iGM_LauncherDl_UseLocale } from "../iGM_LauncherDl_Providers/iGM_LauncherDl_LocaleProvider";
import styles from "./iGM_LauncherDl_LanguageSwitcher.module.css";

// 类型定义 //
// （语言类型见 i18n/iGM_LauncherDl_Locales.ts）

// 核心逻辑 //
/** 语言切换按钮与五种语言菜单 */
export function iGM_LauncherDl_LanguageSwitcher() {
  const t = useTranslations();
  const { locale, setLocale } = iGM_LauncherDl_UseLocale();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  /* 点击组件外区域关闭菜单 */
  useEffect(() => {
    if (!open) return;
    function onClick(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  /** 选择语言：切换后关闭菜单 */
  function iGM_LauncherDl_Select(option: iGM_LauncherDl_Locale) {
    setLocale(option);
    setOpen(false);
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-label={t("common.selectLanguage")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Languages size={17} aria-hidden />
      </button>

      {open ? (
        <ul className={styles.menu} role="menu">
          {iGM_LauncherDl_Locales.map((option) => (
            <li key={option}>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={locale === option}
                className={styles.item}
                onClick={() => iGM_LauncherDl_Select(option)}
              >
                <span className={styles.itemLabel}>
                  {t(`language.${option}`)}
                </span>
                {locale === option ? (
                  <Check size={15} strokeWidth={2.2} aria-hidden />
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// 导出 //
export default iGM_LauncherDl_LanguageSwitcher;