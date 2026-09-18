/**
 * 文件：apps/web/src/components/iGM_/iGM_Providers.tsx
 * 所属层：前端（客户端组件 / Provider 根）
 * 路由：全部 G_Xxxxx 路由
 * 模块：iGM_Providers
 * 作用：聚合全站核心 Provider（next-intl 语言 Provider、next-themes 主题 Provider）
 * 内容：NextIntlClientProvider 与 iGM_ThemeProvider 的统一嵌套
 */
// ==================== 区块：导入依赖 ====================
'use client';

import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { iGM_ThemeProvider as IGM_ThemeProvider } from './iGM_ThemeProvider';
import type { iGM_Locale } from '@/i18n/iGM_Routing';

// ==================== 区块：类型定义 ====================
interface iGM_ProvidersProps {
  locale: iGM_Locale;
  messages: Record<string, unknown>;
  children: ReactNode;
}

// ==================== 区块：核心逻辑 ====================
export function iGM_Providers({ locale, messages, children }: iGM_ProvidersProps) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <IGM_ThemeProvider>{children}</IGM_ThemeProvider>
    </NextIntlClientProvider>
  );
}

// ==================== 区块：导出 ====================
export default iGM_Providers;
