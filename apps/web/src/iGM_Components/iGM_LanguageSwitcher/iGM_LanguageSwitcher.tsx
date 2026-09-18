/**
 * 文件路径：apps/web/src/iGM_Components/iGM_LanguageSwitcher/iGM_LanguageSwitcher.tsx
 * 所属层：前端 / 通用组件层
 * 路由：全局（TopBar）
 * 模块：iGM_LanguageSwitcher
 * 作用：语言切换器，支持 zh-CN / zh-TW / en / ja / ru
 * 内容：Languages 触发图标，弹出菜单列出五种语言，选择后 Cookie 持久化
 */

// 导入依赖 //
"use client";

import { Check, Languages } from "lucide-react";
import { useTranslations } from "next-intl";
import { iGM_Popover as IGM_Popover } from "../iGM_Popover/iGM_Popover";
import styles from "../iGM_Popover/iGM_Popover.module.css";
import { iGM_UseLocale } from "../../iGM_Providers/iGM_LocaleProvider";
import { iGM_Locales, type iGM_Locale } from "../../iGM_i18n/iGM_Locales";

// 类型定义 //
// （语言类型见 iGM_i18n/iGM_Locales.ts）

// 核心逻辑 //
/** 语言切换按钮与五种语言菜单 */
export function iGM_LanguageSwitcher() {
  const t = useTranslations();
  const { locale, setLocale } = iGM_UseLocale();

  return (
    <IGM_Popover icon={Languages} ariaLabel={t("topbar.language")}>
      {(close) => (
        <>
          {iGM_Locales.map((option: iGM_Locale) => (
            <button
              key={option}
              type="button"
              role="menuitemradio"
              aria-checked={locale === option}
              className={styles.item}
              onClick={() => {
                setLocale(option);
                close();
              }}
            >
              <span className={styles.itemLabel}>{t(`language.${option}`)}</span>
              {locale === option && (
                <span className={styles.itemCheck}>
                  <Check size={15} strokeWidth={2.2} />
                </span>
              )}
            </button>
          ))}
        </>
      )}
    </IGM_Popover>
  );
}

// 导出 //
export default iGM_LanguageSwitcher;
