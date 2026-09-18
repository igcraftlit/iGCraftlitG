/**
 * 文件路径：apps/web/src/iGM_Providers/iGM_Providers.tsx
 * 所属层：前端 / Provider 层
 * 路由：全局
 * 模块：iGM_Providers
 * 作用：聚合全站客户端 Provider（主题 + 语言 + 认证）
 * 内容：统一在根布局中包裹一次，避免布局文件堆叠多层 Provider
 */

// 导入依赖 //
"use client";

import type { ReactNode } from "react";
import { iGM_ThemeProvider as IGM_ThemeProvider } from "./iGM_ThemeProvider";
import { iGM_LocaleProvider as IGM_LocaleProvider } from "./iGM_LocaleProvider";
import { iGM_AuthProvider as IGM_AuthProvider } from "./iGM_AuthProvider";

// 类型定义 //
interface iGM_ProvidersProps {
  children: ReactNode;
}

// 核心逻辑 //
/** 全站 Provider 聚合组件：外层主题、中层语言、内层认证 */
export function iGM_Providers({ children }: iGM_ProvidersProps) {
  return (
    <IGM_ThemeProvider>
      <IGM_LocaleProvider>
        <IGM_AuthProvider>{children}</IGM_AuthProvider>
      </IGM_LocaleProvider>
    </IGM_ThemeProvider>
  );
}

// 导出 //
export default iGM_Providers;
