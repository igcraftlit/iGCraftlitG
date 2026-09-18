/**
 * 文件：apps/web/src/app/not-found.tsx
 * 所属层：前端（App Router 全局 404，自包含页面）
 * 路由：[locale] 段之外或语言段布局本身抛出的未匹配路径
 * 模块：iGM_GlobalNotFound
 * 作用：全局 404 兜底页面；按 URL 首段探测语言，静态注入对应语言包，
 *       保证任何 404 场景下文案依然全部来自语言包（无硬编码文本）
 * 内容：语言探测、NextIntlClientProvider、复用本地化 404 组件
 */
// ==================== 区块：导入依赖 ====================
'use client';

import { usePathname } from 'next/navigation';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { routing, iGM_DefaultLocale, type iGM_Locale } from '@/i18n/iGM_Routing';
import { iGM_Cinzel } from '@/lib/iGM_Fonts';
// 五份语言包静态引入：全局 404 运行在语言 Provider 之外，需自备消息源
import iGM_MessagesZhCN from '../../messages/zh-CN.json';
import iGM_MessagesZhTW from '../../messages/zh-TW.json';
import iGM_MessagesEn from '../../messages/en.json';
import iGM_MessagesJa from '../../messages/ja.json';
import iGM_MessagesRu from '../../messages/ru.json';
import IGM_LocaleNotFound from './[locale]/not-found';

// ==================== 区块：语言包映射 ====================
const iGM_MessageMap: Record<iGM_Locale, Record<string, unknown>> = {
  'zh-CN': iGM_MessagesZhCN as Record<string, unknown>,
  'zh-TW': iGM_MessagesZhTW as Record<string, unknown>,
  en: iGM_MessagesEn as Record<string, unknown>,
  ja: iGM_MessagesJa as Record<string, unknown>,
  ru: iGM_MessagesRu as Record<string, unknown>,
};

// ==================== 区块：全局 404 ====================
export default function iGM_GlobalNotFound() {
  const pathname = usePathname() ?? '/';
  const firstSegment = pathname.split('/')[1] ?? '';
  // 从路径首段识别语言；无法识别时回退默认语言 zh-CN
  const locale: iGM_Locale = hasLocale(routing.locales, firstSegment)
    ? firstSegment
    : iGM_DefaultLocale;

  // 根级 not-found 替代根布局渲染，需要自带 <html>/<body>
  return (
    <html lang={locale} className={iGM_Cinzel.variable} suppressHydrationWarning>
      <body>
        <NextIntlClientProvider locale={locale} messages={iGM_MessageMap[locale]}>
          <IGM_LocaleNotFound />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
