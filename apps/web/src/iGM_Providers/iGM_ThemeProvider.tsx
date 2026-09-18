/**
 * 文件路径：apps/web/src/iGM_Providers/iGM_ThemeProvider.tsx
 * 所属层：前端 / Provider 层
 * 路由：全局
 * 模块：iGM_ThemeProvider
 * 作用：基于 next-themes 提供 light / dark / system 三种明暗模式
 * 内容：默认跟随系统，切换即时生效并持久化到 localStorage，
 *       通过 html[data-theme] 驱动全局 CSS 变量
 */

// 导入依赖 //
"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

// 类型定义 //
interface iGM_ThemeProviderProps {
  children: ReactNode;
}

// 核心逻辑 //
/** 明暗主题 Provider：attribute=data-theme 对应全局 CSS 变量选择器 */
export function iGM_ThemeProvider({ children }: iGM_ThemeProviderProps) {
  return (
    <ThemeProvider
      attribute="data-theme"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="iGM_THEME"
    >
      {children}
    </ThemeProvider>
  );
}

// 导出 //
export default iGM_ThemeProvider;
