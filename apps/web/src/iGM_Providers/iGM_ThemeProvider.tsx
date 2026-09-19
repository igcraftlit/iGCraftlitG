/**
 * 文件路径：apps/web/src/iGM_Providers/iGM_ThemeProvider.tsx
 * 所属层：前端 / Provider 层
 * 路由：全局
 * 模块：iGM_ThemeProvider
 * 作用：基于 React Context 提供 light / dark / system 三种明暗模式
 * 内容：默认跟随系统，切换即时生效并持久化到 localStorage（键 iGM_THEME），
 *       通过 html[data-theme] 驱动全局 CSS 变量
 * 说明：防 FOUC 的初始化脚本放在根布局 <head> 中（next/script beforeInteractive），
 *       不渲染在本客户端组件树内，避免 React 19 对 <script> 的运行时警告；
 *       本组件仅负责运行时状态同步与系统主题监听
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

// 类型定义 //
/** 可选主题模式 */
export type iGM_ThemeMode = "light" | "dark" | "system";
/** 解析后的实际主题（light/dark） */
export type iGM_ResolvedTheme = "light" | "dark";

/** 主题上下文值 */
interface iGM_ThemeContextValue {
  /** 当前选择的主题（含 system） */
  theme: iGM_ThemeMode;
  /** 实际生效的主题（system 解析为 light/dark） */
  resolvedTheme: iGM_ResolvedTheme;
  /** 设置主题并持久化 */
  setTheme: (mode: iGM_ThemeMode) => void;
}

/** localStorage 存储键，与防 FOUC 脚本保持一致 */
const iGM_THEME_STORAGE_KEY = "iGM_THEME";
/** 系统深色偏好媒体查询 */
const iGM_DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

/** 默认值（未挂载时使用，避免 hydration 不一致） */
const iGM_DefaultContext: iGM_ThemeContextValue = {
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => {},
};

const iGM_ThemeContext = createContext<iGM_ThemeContextValue>(iGM_DefaultContext);

// 核心逻辑 //
/** 从 data-theme 属性读取当前实际主题（由 <head> 防 FOUC 脚本预先写入） */
function iGM_ReadInitialTheme(): iGM_ThemeMode {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(iGM_THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // localStorage 不可用时回退 system
  }
  return "system";
}

/** 解析 system 为实际主题 */
function iGM_ResolveSystemTheme(): iGM_ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia(iGM_DARK_MEDIA_QUERY).matches ? "dark" : "light";
}

/** 应用主题到 <html> 与 color-scheme */
function iGM_ApplyTheme(resolved: iGM_ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", resolved);
  root.style.colorScheme = resolved;
}

/**
 * 主题 Provider：
 * - 挂载时读取 localStorage 与 data-theme 初始化
 * - system 模式下监听系统主题变化并同步
 * - setTheme 同步写入 data-theme / color-scheme / localStorage
 */
export function iGM_ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<iGM_ThemeMode>("system");
  const [resolvedTheme, setResolvedTheme] = useState<iGM_ResolvedTheme>("light");

  // 挂载后初始化一次（防 FOUC 脚本已在首屏写入 data-theme）
  useEffect(() => {
    const initial = iGM_ReadInitialTheme();
    setThemeState(initial);
    setResolvedTheme(initial === "system" ? iGM_ResolveSystemTheme() : initial);
  }, []);

  // system 模式下监听系统主题变化
  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia(iGM_DARK_MEDIA_QUERY);
    const onChange = (e: MediaQueryListEvent) => {
      const resolved = e.matches ? "dark" : "light";
      setResolvedTheme(resolved);
      iGM_ApplyTheme(resolved);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((mode: iGM_ThemeMode) => {
    setThemeState(mode);
    const resolved = mode === "system" ? iGM_ResolveSystemTheme() : mode;
    setResolvedTheme(resolved);
    iGM_ApplyTheme(resolved);
    try {
      window.localStorage.setItem(iGM_THEME_STORAGE_KEY, mode);
    } catch {
      // 忽略持久化失败（隐私模式等）
    }
  }, []);

  const value = useMemo<iGM_ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return (
    <iGM_ThemeContext.Provider value={value}>
      {children}
    </iGM_ThemeContext.Provider>
  );
}

/** 读取当前主题上下文 */
export function iGM_UseTheme(): iGM_ThemeContextValue {
  return useContext(iGM_ThemeContext);
}

// 导出 //
export default iGM_ThemeProvider;
