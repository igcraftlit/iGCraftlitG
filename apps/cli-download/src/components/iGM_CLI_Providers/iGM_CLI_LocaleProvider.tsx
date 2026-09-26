/**
 * 文件路径：apps/cli-download/src/components/iGM_CLI_Providers/iGM_CLI_LocaleProvider.tsx
 * 所属层：前端 / Provider 层
 * 路由：全局
 * 模块：iGM_CLI_Downloader
 * 作用：基于 next-intl 提供五种语言的客户端国际化能力（URL 前缀式多语言）
 * 内容：初始语言由 [locale] 路由段注入，语言切换写入 Cookie 并导航到目标语言前缀路径
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
} from "react";
import { NextIntlClientProvider } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import {
  iGM_CLI_DefaultLocale,
  iGM_CLI_DefaultTimeZone,
  iGM_CLI_IsLocale,
  iGM_CLI_LocaleCookieMaxAge,
  iGM_CLI_LocaleCookieName,
  type iGM_CLI_Locale,
} from "../../i18n/iGM_CLI_Locales";
import { iGM_CLI_GetMessages } from "../../i18n/iGM_CLI_Messages";
import {
  iGM_CLI_LocalePath,
  iGM_CLI_ReadLocaleCookieValue,
} from "../../i18n/iGM_CLI_LocalePath";

// 类型定义 //
interface iGM_CLI_LocaleContextValue {
  /** 当前语言 */
  locale: iGM_CLI_Locale;
  /** 切换语言：持久化 Cookie 并导航到对应语言前缀路径 */
  setLocale: (locale: iGM_CLI_Locale) => void;
}

interface iGM_CLI_LocaleProviderProps {
  children: ReactNode;
  /** 由 [locale] 路由布局注入的初始语言（URL 为语言唯一真源） */
  initialLocale?: string;
}

// 核心逻辑 //
const iGM_CLI_LocaleContext = createContext<iGM_CLI_LocaleContextValue | null>(null);

/** 将语言选择持久化到 Cookie */
function iGM_CLI_WriteCookie(locale: iGM_CLI_Locale): void {
  document.cookie = `${iGM_CLI_LocaleCookieName}=${encodeURIComponent(locale)}; path=/; max-age=${iGM_CLI_LocaleCookieMaxAge}; samesite=lax`;
}

/** 语言 Provider：内部包裹 next-intl 客户端 Provider */
export function iGM_CLI_LocaleProvider({
  children,
  initialLocale,
}: iGM_CLI_LocaleProviderProps) {
  const initial = iGM_CLI_IsLocale(initialLocale) ? initialLocale : iGM_CLI_DefaultLocale;
  const [locale, setLocaleState] = useState<iGM_CLI_Locale>(initial);
  const router = useRouter();
  const pathname = usePathname();

  // 挂载后同步 html lang 与 Cookie
  useEffect(() => {
    document.documentElement.lang = locale;
    iGM_CLI_WriteCookie(locale);
  }, [locale]);

  // 兜底：无 initialLocale 的旧用法按 Cookie 解析一次
  useEffect(() => {
    if (iGM_CLI_IsLocale(initialLocale)) return;
    const resolved = iGM_CLI_IsLocale(iGM_CLI_ReadLocaleCookieValue())
      ? (iGM_CLI_ReadLocaleCookieValue() as iGM_CLI_Locale)
      : iGM_CLI_DefaultLocale;
    if (resolved !== locale) setLocaleState(resolved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLocale = useCallback(
    (nextLocale: iGM_CLI_Locale) => {
      if (!iGM_CLI_IsLocale(nextLocale)) return;
      setLocaleState(nextLocale);
      iGM_CLI_WriteCookie(nextLocale);
      document.documentElement.lang = nextLocale;
      const search =
        typeof window !== "undefined" ? window.location.search : "";
      router.replace(iGM_CLI_LocalePath(pathname, nextLocale) + search);
    },
    [router, pathname],
  );

  const contextValue = useMemo(
    () => ({ locale, setLocale }),
    [locale, setLocale],
  );

  return (
    <iGM_CLI_LocaleContext.Provider value={contextValue}>
      <NextIntlClientProvider
        locale={locale}
        timeZone={iGM_CLI_DefaultTimeZone}
        messages={iGM_CLI_GetMessages(locale)}
      >
        {children}
      </NextIntlClientProvider>
    </iGM_CLI_LocaleContext.Provider>
  );
}

/** 读取当前语言上下文的 Hook */
export function iGM_CLI_UseLocale(): iGM_CLI_LocaleContextValue {
  const context = useContext(iGM_CLI_LocaleContext);
  if (!context) {
    throw new Error("iGM_CLI_UseLocale 必须在 iGM_CLI_LocaleProvider 内使用");
  }
  return context;
}

// 导出 //
export default iGM_CLI_LocaleProvider;
