/**
 * 文件路径：apps/web/src/iGM_Providers/iGM_LocaleProvider.tsx
 * 所属层：前端 / Provider 层
 * 路由：全局
 * 模块：iGM_LocaleProvider
 * 作用：基于 next-intl 提供五种语言的客户端国际化能力
 * 内容：初始语言解析（Cookie 优先、浏览器语言回退、默认 zh-CN），
 *       语言切换写入 Cookie 持久化并同步 html lang 属性
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
import type { ReactNode } from "react";
import {
  iGM_DefaultLocale,
  iGM_IsLocale,
  iGM_LocaleCookieMaxAge,
  iGM_LocaleCookieName,
  type iGM_Locale,
} from "../iGM_i18n/iGM_Locales";
import {
  iGM_GetMessages,
  iGM_ResolveInitialLocale,
} from "../iGM_i18n/iGM_Messages";

// 类型定义 //
interface iGM_LocaleContextValue {
  /** 当前语言 */
  locale: iGM_Locale;
  /** 切换语言：更新状态并写入 Cookie */
  setLocale: (locale: iGM_Locale) => void;
}

interface iGM_LocaleProviderProps {
  children: ReactNode;
}

// 核心逻辑 //
const iGM_LocaleContext = createContext<iGM_LocaleContextValue | null>(null);

/** 读取 Cookie 中持久化的语言 */
function iGM_ReadCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${iGM_LocaleCookieName}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

/** 将语言选择持久化到 Cookie */
function iGM_WriteCookie(locale: iGM_Locale): void {
  document.cookie = `${iGM_LocaleCookieName}=${encodeURIComponent(locale)}; path=/; max-age=${iGM_LocaleCookieMaxAge}; samesite=lax`;
}

/** 语言 Provider：内部包裹 next-intl 客户端 Provider */
export function iGM_LocaleProvider({ children }: iGM_LocaleProviderProps) {
  // 纯静态导出场景下语言完全由客户端决定，使用默认值完成服务端首屏，
  // 挂载后立即解析真实语言
  const [locale, setLocaleState] = useState<iGM_Locale>(iGM_DefaultLocale);

  useEffect(() => {
    const resolved = iGM_ResolveInitialLocale(iGM_ReadCookie());
    setLocaleState(resolved);
    document.documentElement.lang = resolved;
  }, []);

  const setLocale = useCallback((nextLocale: iGM_Locale) => {
    if (!iGM_IsLocale(nextLocale)) return;
    setLocaleState(nextLocale);
    iGM_WriteCookie(nextLocale);
    document.documentElement.lang = nextLocale;
  }, []);

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
