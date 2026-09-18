/**
 * 文件：apps/web/src/components/iGM_/iGM_ThemeProvider.tsx
 * 所属层：前端（客户端组件 / Provider）
 * 路由：全局
 * 模块：iGM_ThemeProvider
 * 作用：封装 next-themes，通过 html[data-theme] 驱动全局 CSS 变量切换
 * 内容：支持 light / dark / system 三种模式，默认跟随系统，状态由 next-themes 持久化
 */
// ==================== 区块：导入依赖 ====================
'use client';

import type { ReactNode } from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

// ==================== 区块：类型定义 ====================
interface iGM_ThemeProviderProps {
  children: ReactNode;
}

// ==================== 区块：核心逻辑 ====================
// attribute="data-theme"：next-themes 会把解析后的 light/dark 写入 <html data-theme>
// enableSystem + defaultTheme="system"：默认跟随系统，用户选择后持久化到 localStorage
export function iGM_ThemeProvider({ children }: iGM_ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}

// ==================== 区块：导出 ====================
export default iGM_ThemeProvider;
