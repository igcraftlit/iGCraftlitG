/**
 * 文件：apps/web/src/app/[locale]/layout.tsx
 * 所属层：前端（App Router 语言段布局）
 * 路由：G_Locale 下全部页面
 * 模块：iGM_LocaleLayout
 * 作用：渲染 <html lang data-theme> 与 <body>，挂载 Providers 与 AppShell 布局骨架
 * 内容：Cinzel 字体变量、静态参数生成、消息加载、metadata
 */
// ==================== 区块：导入依赖 ====================
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { iGM_Cinzel } from '@/lib/iGM_Fonts';
import { iGM_Locales, type iGM_Locale } from '@/i18n/iGM_Routing';
import { iGM_Providers as IGM_Providers } from '@/components/iGM_/iGM_Providers';
import { iGM_AppShell as IGM_AppShell } from '@/components/iGM_/iGM_AppShell';

// ==================== 区块：静态参数与元数据 ====================
export function generateStaticParams() {
  return iGM_Locales.map((locale) => ({ locale }));
}

export const metadata: Metadata = {
  metadataBase: new URL('https://igcraftlit.com'),
  title: {
    default: 'iGCraftLit Community',
    template: '%s · iGCraftLit Community',
  },
  description: 'iGCraftLit Community',
};

// ==================== 区块：语言段布局 ====================
export default async function iGM_LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // 非法语言段（如被 proxy 排除的带后缀路径命中动态段）直接转全局 404，避免语言包动态导入失败
  if (!hasLocale(iGM_Locales, locale)) {
    notFound();
  }

  // 启用静态渲染时的请求级语言固定（经 hasLocale 收窄为 iGM_Locale）
  const validLocale: iGM_Locale = locale;
  setRequestLocale(validLocale);

  // 按语言加载消息包并下发给客户端 Provider
  const messages = (
    await import(`../../../messages/${validLocale}.json`)
  ).default as Record<string, unknown>;

  return (
    <html
      lang={validLocale}
      suppressHydrationWarning
      className={iGM_Cinzel.variable}
    >
      <body>
        <IGM_Providers locale={validLocale} messages={messages}>
          <IGM_AppShell>{children}</IGM_AppShell>
        </IGM_Providers>
      </body>
    </html>
  );
}
