/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Providers/iGM_Launcher_LocaleProvider.tsx
 * 所属层：前端 / Provider 层
 * 路由：全局
 * 模块：iGM_Launcher_LocaleProvider
 * 作用：在纯静态导出中为 next-intl 提供客户端语言上下文（无路由前缀）
 * 内容：localStorage 持久化、首屏按浏览器语言收敛 zh-CN/en、
 *       NextIntlClientProvider 注入对应静态语言包；
 *       模块七新增：本地无语言记录时读取安装程序写入的语言（app:locale），
 *       使安装向导的语言选择在启动器首启即生效
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
  IGM_LAUNCHER_LOCALE_STORAGE_KEY,
  type iGM_Launcher_Locale,
} from "@igm-launcher/shared";
import { iGM_Launcher_BridgeCall } from "@/components/iGM_Launcher_Bridge/iGM_Launcher_BridgeClient";
import {
  IGM_LAUNCHER_DEFAULT_LOCALE,
  IGM_LAUNCHER_MESSAGE_MAP,
  iGM_Launcher_ResolveLocale,
  type iGM_Launcher_Messages,
} from "@/i18n/iGM_Launcher_Locales";

// 类型定义 //
interface iGM_Launcher_LocaleContextValue {
  locale: iGM_Launcher_Locale;
  setLocale: (locale: iGM_Launcher_Locale) => void;
  toggleLocale: () => void;
}

const iGM_Launcher_LocaleContext = createContext<iGM_Launcher_LocaleContextValue>({
  locale: IGM_LAUNCHER_DEFAULT_LOCALE,
  setLocale: () => undefined,
  toggleLocale: () => undefined,
});

// 核心逻辑 //
/**
 * 语言 Provider：
 * - 初始渲染固定默认语言，保证静态 HTML 与首帧一致
 * - 挂载后依次读取 localStorage、浏览器语言并收敛到受支持语言
 */
export function iGM_Launcher_LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<iGM_Launcher_Locale>(
    IGM_LAUNCHER_DEFAULT_LOCALE,
  );

  // 同步 <html lang>，保证辅助技术与系统语言感知一致
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(IGM_LAUNCHER_LOCALE_STORAGE_KEY);
    } catch {
      // localStorage 不可用时回退浏览器语言
    }
    if (stored) {
      setLocaleState(iGM_Launcher_ResolveLocale(stored));
      return;
    }

    // 模块七：本地尚无语言记录时，优先采用安装程序写入的语言（外壳内有效）
    let cancelled = false;
    void iGM_Launcher_BridgeCall("app:locale").then((response) => {
      if (cancelled) return;
      const installed = response.success ? response.data?.locale ?? null : null;
      setLocaleState(
        installed
          ? iGM_Launcher_ResolveLocale(installed)
          : iGM_Launcher_ResolveLocale(window.navigator.language),
      );
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback((next: iGM_Launcher_Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(IGM_LAUNCHER_LOCALE_STORAGE_KEY, next);
    } catch {
      // 忽略持久化失败
    }
  }, []);

  const toggleLocale = useCallback(() => {
    setLocaleState((current) => {
      const next: iGM_Launcher_Locale = current === "zh-CN" ? "en" : "zh-CN";
      try {
        window.localStorage.setItem(IGM_LAUNCHER_LOCALE_STORAGE_KEY, next);
      } catch {
        // 忽略持久化失败
      }
      return next;
    });
  }, []);

  const contextValue = useMemo<iGM_Launcher_LocaleContextValue>(
    () => ({ locale, setLocale, toggleLocale }),
    [locale, setLocale, toggleLocale],
  );

  const messages: iGM_Launcher_Messages = IGM_LAUNCHER_MESSAGE_MAP[locale];

  return (
    <iGM_Launcher_LocaleContext.Provider value={contextValue}>
      <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
        {children}
      </NextIntlClientProvider>
    </iGM_Launcher_LocaleContext.Provider>
  );
}

/** 读取当前语言上下文 */
export function iGM_Launcher_UseLocale(): iGM_Launcher_LocaleContextValue {
  return useContext(iGM_Launcher_LocaleContext);
}

// 导出 //
export default iGM_Launcher_LocaleProvider;
