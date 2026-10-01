/**
 * 文件路径：apps/launcher-download/src/components/iGM_LauncherDl_Providers/iGM_LauncherDl_LocaleProvider.tsx
 * 所属层：前端 / Provider 层
 * 路由：全局
 * 模块：iGM_LauncherDl_Downloader
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
  iGM_LauncherDl_DefaultLocale,
  iGM_LauncherDl_DefaultTimeZone,
  iGM_LauncherDl_IsLocale,
  iGM_LauncherDl_LocaleCookieMaxAge,
  iGM_LauncherDl_LocaleCookieName,
  type iGM_LauncherDl_Locale,
} from "../../i18n/iGM_LauncherDl_Locales";
import { iGM_LauncherDl_GetMessages } from "../../i18n/iGM_LauncherDl_Messages";
import {
  iGM_LauncherDl_LocalePath,
  iGM_LauncherDl_ReadLocaleCookieValue,
} from "../../i18n/iGM_LauncherDl_LocalePath";

// 类型定义 //
interface iGM_LauncherDl_LocaleContextValue {
  /** 当前语言 */
  locale: iGM_LauncherDl_Locale;
  /** 切换语言：持久化 Cookie 并导航到对应语言前缀路径 */
  setLocale: (locale: iGM_LauncherDl_Locale) => void;
}

interface iGM_LauncherDl_LocaleProviderProps {
  children: ReactNode;
  /** 由 [locale] 路由布局注入的初始语言（URL 为语言唯一真源） */
  initialLocale?: string;
}

// 核心逻辑 //
const iGM_LauncherDl_LocaleContext =
  createContext<iGM_LauncherDl_LocaleContextValue | null>(null);

/** 将语言选择持久化到 Cookie */
function iGM_LauncherDl_WriteCookie(locale: iGM_LauncherDl_Locale): void {
  document.cookie = `${iGM_LauncherDl_LocaleCookieName}=${encodeURIComponent(locale)}; path=/; max-age=${iGM_LauncherDl_LocaleCookieMaxAge}; samesite=lax`;
}

/** 语言 Provider：内部包裹 next-intl 客户端 Provider */
export function iGM_LauncherDl_LocaleProvider({
  children,
  initialLocale,
}: iGM_LauncherDl_LocaleProviderProps) {
  const initial = iGM_LauncherDl_IsLocale(initialLocale)
    ? initialLocale
    : iGM_LauncherDl_DefaultLocale;
  const [locale, setLocaleState] = useState<iGM_LauncherDl_Locale>(initial);
  const router = useRouter();
  const pathname = usePathname();

  // 挂载后同步 html lang 与 Cookie
  useEffect(() => {
    document.documentElement.lang = locale;
    iGM_LauncherDl_WriteCookie(locale);
  }, [locale]);

  // 兜底：无 initialLocale 的旧用法按 Cookie 解析一次
  useEffect(() => {
    if (iGM_LauncherDl_IsLocale(initialLocale)) return;
    const resolved = iGM_LauncherDl_IsLocale(
      iGM_LauncherDl_ReadLocaleCookieValue(),
    )
      ? (iGM_LauncherDl_ReadLocaleCookieValue() as iGM_LauncherDl_Locale)
      : iGM_LauncherDl_DefaultLocale;
    if (resolved !== locale) setLocaleState(resolved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLocale = useCallback(
    (nextLocale: iGM_LauncherDl_Locale) => {
      if (!iGM_LauncherDl_IsLocale(nextLocale)) return;
      setLocaleState(nextLocale);
      iGM_LauncherDl_WriteCookie(nextLocale);
      document.documentElement.lang = nextLocale;
      const search = typeof window !== "undefined" ? window.location.search : "";
      router.replace(iGM_LauncherDl_LocalePath(pathname, nextLocale) + search);
    },
    [router, pathname],
  );

  const contextValue = useMemo(
    () => ({ locale, setLocale }),
    [locale, setLocale],
  );

  return (
    <iGM_LauncherDl_LocaleContext.Provider value={contextValue}>
      <NextIntlClientProvider
        locale={locale}
        timeZone={iGM_LauncherDl_DefaultTimeZone}
        messages={iGM_LauncherDl_GetMessages(locale)}
      >
        {children}
      </NextIntlClientProvider>
    </iGM_LauncherDl_LocaleContext.Provider>
  );
}

/** 读取当前语言上下文的 Hook */
export function iGM_LauncherDl_UseLocale(): iGM_LauncherDl_LocaleContextValue {
  const context = useContext(iGM_LauncherDl_LocaleContext);
  if (!context) {
    throw new Error(
      "iGM_LauncherDl_UseLocale 必须在 iGM_LauncherDl_LocaleProvider 内使用",
    );
  }
  return context;
}

// 导出 //
export default iGM_LauncherDl_LocaleProvider;