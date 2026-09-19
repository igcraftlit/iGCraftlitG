/**
 * 文件路径：apps/web/src/iGM_Providers/iGM_LocaleProvider.tsx
 * 所属层：前端 / Provider 层
 * 路由：全局
 * 模块：iGM_LocaleProvider
 * 作用：基于 next-intl 提供五种语言的客户端国际化能力（模块五：URL 前缀式多语言）
 * 内容：初始语言由 [locale] 路由段注入（构建期已按语言生成静态页面），
 *       语言切换写入 Cookie 持久化（供后端邮件本地化）并同步 html lang，
 *       setLocale 通过导航切换语言前缀路径
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
  iGM_DefaultLocale,
  iGM_IsLocale,
  iGM_LocaleCookieMaxAge,
  iGM_LocaleCookieName,
  type iGM_Locale,
} from "../iGM_i18n/iGM_Locales";
import { iGM_GetMessages } from "../iGM_i18n/iGM_Messages";
import { iGM_LocalePath, iGM_ReadLocaleCookieValue } from "../iGM_i18n/iGM_LocalePath";

// 类型定义 //
interface iGM_LocaleContextValue {
  /** 当前语言 */
  locale: iGM_Locale;
  /** 切换语言：持久化 Cookie 并导航到对应语言前缀路径 */
  setLocale: (locale: iGM_Locale) => void;
}

interface iGM_LocaleProviderProps {
  children: ReactNode;
  /** 由 [locale] 路由布局注入的初始语言（URL 为语言唯一真源） */
  initialLocale?: string;
}

// 核心逻辑 //
const iGM_LocaleContext = createContext<iGM_LocaleContextValue | null>(null);

/** 将语言选择持久化到 Cookie（后端 x-igm-locale 邮件本地化依赖此 Cookie） */
function iGM_WriteCookie(locale: iGM_Locale): void {
  document.cookie = `${iGM_LocaleCookieName}=${encodeURIComponent(locale)}; path=/; max-age=${iGM_LocaleCookieMaxAge}; samesite=lax`;
}

/** 语言 Provider：内部包裹 next-intl 客户端 Provider */
export function iGM_LocaleProvider({ children, initialLocale }: iGM_LocaleProviderProps) {
  // URL 前缀是语言唯一真源：初始状态直接取路由段语言，
  // 服务端首屏即按当前语言渲染，静态导出产物语言正确
  const initial = iGM_IsLocale(initialLocale) ? initialLocale : iGM_DefaultLocale;
  const [locale, setLocaleState] = useState<iGM_Locale>(initial);
  const router = useRouter();
  const pathname = usePathname();

  // 挂载后同步 html lang 与 Cookie（供后端邮件语言与浏览器回退使用）
  useEffect(() => {
    document.documentElement.lang = locale;
    iGM_WriteCookie(locale);
  }, [locale]);

  // 兜底：无 initialLocale 的旧用法（如根 404）按 Cookie 解析一次
  useEffect(() => {
    if (iGM_IsLocale(initialLocale)) return;
    const resolved = iGM_IsLocale(iGM_ReadLocaleCookieValue())
      ? (iGM_ReadLocaleCookieValue() as iGM_Locale)
      : iGM_DefaultLocale;
    if (resolved !== locale) setLocaleState(resolved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLocale = useCallback(
    (nextLocale: iGM_Locale) => {
      if (!iGM_IsLocale(nextLocale)) return;
      setLocaleState(nextLocale);
      iGM_WriteCookie(nextLocale);
      document.documentElement.lang = nextLocale;
      // 导航到同路径的目标语言前缀（保留查询串；锚点由浏览器处理）
      const search =
        typeof window !== "undefined" ? window.location.search : "";
      router.replace(iGM_LocalePath(pathname, nextLocale) + search);
    },
    [router, pathname],
  );

  const contextValue = useMemo(
    () => ({ locale, setLocale }),
    [locale, setLocale],
  );

  return (
    <iGM_LocaleContext.Provider value={contextValue}>
      <NextIntlClientProvider locale={locale} messages={iGM_GetMessages(locale)}>
        {children}
      </NextIntlClientProvider>
    </iGM_LocaleContext.Provider>
  );
}

/** 读取当前语言上下文的 Hook */
export function iGM_UseLocale(): iGM_LocaleContextValue {
  const context = useContext(iGM_LocaleContext);
  if (!context) {
    throw new Error("iGM_UseLocale 必须在 iGM_LocaleProvider 内使用");
  }
  return context;
}

// 导出 //
export default iGM_LocaleProvider;
