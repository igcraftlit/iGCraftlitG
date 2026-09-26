/**
 * 文件路径：apps/cli-download/src/components/iGM_CLI_Providers/iGM_CLI_Providers.tsx
 * 所属层：前端 / Provider 层
 * 路由：全局
 * 模块：iGM_CLI_Downloader
 * 作用：聚合站点客户端 Provider（语言）
 * 内容：统一在语言路由布局中包裹一次，避免布局文件堆叠多层 Provider
 */

// 导入依赖 //
"use client";

import type { ReactNode } from "react";
import { iGM_CLI_LocaleProvider as IGM_CLI_LocaleProvider } from "./iGM_CLI_LocaleProvider";

// 类型定义 //
interface iGM_CLI_ProvidersProps {
  children: ReactNode;
  /** 由 [locale] 路由布局注入的初始语言 */
  initialLocale?: string;
}

// 核心逻辑 //
/** 站点 Provider 聚合组件：当前仅包含语言 Provider */
export function iGM_CLI_Providers({ children, initialLocale }: iGM_CLI_ProvidersProps) {
  return (
    <IGM_CLI_LocaleProvider initialLocale={initialLocale}>
      {children}
    </IGM_CLI_LocaleProvider>
  );
}

// 导出 //
export default iGM_CLI_Providers;
