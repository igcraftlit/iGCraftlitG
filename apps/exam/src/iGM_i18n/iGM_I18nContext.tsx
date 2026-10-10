/**
 * 文件路径：apps/exam/src/iGM_i18n/iGM_I18nContext.tsx
 * 所属层：前端 / 国际化层
 * 路由：全局
 * 模块：iGM_ExamI18n
 * 作用：轻量语言上下文，提供 useI18n() Hook（{ t, lang, setLang, formatDate }）
 * 内容：语言状态、localStorage 缓存读写、文案查表与占位符替换、日期本地化
 * 说明：默认 zh-CN；不引入 next-intl，不做路由前缀，保证纯静态导出与 SEO
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
import { iGM_en } from "./iGM_en";
import { iGM_zhCN } from "./iGM_zhCN";
import type { iGM_ExamLang, iGM_I18nDict, iGM_I18nKey } from "./iGM_I18nTypes";

// 类型定义 //
/** 语言上下文值 */
interface iGM_I18nContextValue {
  /** 当前语言 */
  lang: iGM_ExamLang;
  /** 切换语言（同时写入 localStorage） */
  setLang: (next: iGM_ExamLang) => void;
  /** 文案查表，vars 用于替换 {token} 占位符 */
  t: (key: iGM_I18nKey, vars?: Record<string, string | number>) => string;
  /** 按当前语言格式化日期 */
  formatDate: (date: Date) => string;
}

// 核心逻辑 //
/** localStorage 缓存键（与 layout 首屏脚本保持一致） */
export const iGM_ExamLangStorageKey = "iGM_Exam_Lang";

/** 默认语言 */
const iGM_ExamDefaultLang: iGM_ExamLang = "zh-CN";

/** 语言包索引 */
const iGM_ExamDicts: Record<iGM_ExamLang, iGM_I18nDict> = {
  "zh-CN": iGM_zhCN,
  en: iGM_en,
};

const iGM_I18nContext = createContext<iGM_I18nContextValue | null>(null);

/** 语言取值守卫 */
function iGM_Exam_IsLang(value: unknown): value is iGM_ExamLang {
  return value === "zh-CN" || value === "en";
}

/** 读取缓存语言，缺失或非法时回落默认值 */
function iGM_Exam_ReadStoredLang(): iGM_ExamLang {
  if (typeof window === "undefined") return iGM_ExamDefaultLang;
  try {
    const raw = window.localStorage.getItem(iGM_ExamLangStorageKey);
    if (iGM_Exam_IsLang(raw)) return raw;
  } catch {
    // 隐私模式下读取失败可忽略
  }
  return iGM_ExamDefaultLang;
}

/** 按语言本地化日期（zh-CN：2026年10月10日；en：Oct 10, 2026） */
export function iGM_Exam_FormatDate(date: Date, lang: iGM_ExamLang): string {
  return new Intl.DateTimeFormat(lang === "zh-CN" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: lang === "zh-CN" ? "long" : "short",
    day: "numeric",
  }).format(date);
}

/** 语言上下文 Provider */
export function iGM_ExamI18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<iGM_ExamLang>(iGM_ExamDefaultLang);

  // 首屏挂载后同步缓存语言与文档语言标记
  useEffect(() => {
    const stored = iGM_Exam_ReadStoredLang();
    setLangState(stored);
    document.documentElement.lang = stored;
  }, []);

  // 语言变化时同步文档语言标记（供中文排版样式选择器使用）
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: iGM_ExamLang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(iGM_ExamLangStorageKey, next);
    } catch {
      // 隐私模式下写入失败可忽略
    }
  }, []);

  const t = useCallback(
    (key: iGM_I18nKey, vars?: Record<string, string | number>) => {
      let text: string = iGM_ExamDicts[lang][key];
      if (vars) {
        for (const [name, value] of Object.entries(vars)) {
          text = text.replace(`{${name}}`, String(value));
        }
      }
      return text;
    },
    [lang],
  );

  const formatDate = useCallback(
    (date: Date) => iGM_Exam_FormatDate(date, lang),
    [lang],
  );

  const value = useMemo<iGM_I18nContextValue>(
    () => ({ lang, setLang, t, formatDate }),
    [lang, setLang, t, formatDate],
  );

  return <iGM_I18nContext.Provider value={value}>{children}</iGM_I18nContext.Provider>;
}

/** 读取语言上下文；未包裹 Provider 时抛出明确错误 */
export function useI18n(): iGM_I18nContextValue {
  const ctx = useContext(iGM_I18nContext);
  if (!ctx) {
    throw new Error("useI18n 必须在 iGM_ExamI18nProvider 内使用");
  }
  return ctx;
}
