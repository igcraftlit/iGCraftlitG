/**
 * 文件路径：apps/launcher-ui/components/iGM_LauncherV2_Providers/iGM_LauncherV2_LocaleProvider.tsx
 * 所属层：前端 / Provider 层
 * 路由：全局
 * 模块：iGM_LauncherV2_LocaleProvider
 * 作用：在纯静态导出中为 next-intl 提供客户端语言上下文（无路由前缀）
 * 内容：localStorage 持久化、首屏按浏览器语言收敛 zh-CN/en、
 *       NextIntlClientProvider 注入对应静态语言包、同步 <html lang>
 * 说明：首帧固定默认语言以保证静态 HTML 与首次渲染一致，
 *       挂载后再读取本地持久化语言并实时（无刷新）切换
 */

// 导入依赖 //
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { NextIntlClientProvider } from "next-intl";
import {
  IGM_LAUNCHERV2_DEFAULT_LOCALE,
  IGM_LAUNCHERV2_LOCALE_STORAGE_KEY,
  IGM_LAUNCHERV2_MESSAGE_MAP,
  iGM_LauncherV2_ResolveLocale,
  type iGM_LauncherV2_Locale,
  type iGM_LauncherV2_Messages,
} from "@/i18n/iGM_LauncherV2_Locales";

// 类型定义 //

/** 语言上下文：当前语言与设置 / 切换能力 */
interface iGM_LauncherV2_LocaleContextValue {
  locale: iGM_LauncherV2_Locale;
  setLocale: (locale: iGM_LauncherV2_Locale) => void;
  toggleLocale: () => void;
}

const iGM_LauncherV2_LocaleContext = createContext<iGM_LauncherV2_LocaleContextValue>({
  locale: IGM_LAUNCHERV2_DEFAULT_LOCALE,
  setLocale: () => undefined,
  toggleLocale: () => undefined,
});

// 核心逻辑 //

/**
 * 语言 Provider：
 * - 初始渲染固定默认语言，保证静态 HTML 与首帧一致；
 * - 挂载后依次读取 localStorage、浏览器语言并收敛到受支持语言。
 */
export function iGM_LauncherV2_LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<iGM_LauncherV2_Locale>(
    IGM_LAUNCHERV2_DEFAULT_LOCALE,
  );

  // 同步 <html lang>，保证辅助技术与系统语言感知一致
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(IGM_LAUNCHERV2_LOCALE_STORAGE_KEY);
    } catch {
      // localStorage 不可用时回退浏览器语言
    }
    if (stored) {
      setLocaleState(iGM_LauncherV2_ResolveLocale(stored));
      return;
    }
    setLocaleState(iGM_LauncherV2_ResolveLocale(window.navigator.language));
  }, []);

  const setLocale = useCallback((next: iGM_LauncherV2_Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(IGM_LAUNCHERV2_LOCALE_STORAGE_KEY, next);
    } catch {
      // 忽略持久化失败
    }
  }, []);

  const toggleLocale = useCallback(() => {
    setLocaleState((current) => {
      const next: iGM_LauncherV2_Locale = current === "zh-CN" ? "en" : "zh-CN";
      try {
        window.localStorage.setItem(IGM_LAUNCHERV2_LOCALE_STORAGE_KEY, next);
      } catch {
        // 忽略持久化失败
      }
      return next;
    });
  }, []);

  const contextValue = useMemo<iGM_LauncherV2_LocaleContextValue>(
    () => ({ locale, setLocale, toggleLocale }),
    [locale, setLocale, toggleLocale],
  );

  const messages: iGM_LauncherV2_Messages = IGM_LAUNCHERV2_MESSAGE_MAP[locale];

  return (
    <iGM_LauncherV2_LocaleContext.Provider value={contextValue}>
      <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
        {children}
      </NextIntlClientProvider>
    </iGM_LauncherV2_LocaleContext.Provider>
  );
}

/** 读取当前语言上下文 */
export function iGM_LauncherV2_UseLocale(): iGM_LauncherV2_LocaleContextValue {
  return useContext(iGM_LauncherV2_LocaleContext);
}

// 导出 //
export default iGM_LauncherV2_LocaleProvider;
