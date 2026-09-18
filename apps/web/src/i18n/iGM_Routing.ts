/**
 * 文件：apps/web/src/i18n/iGM_Routing.ts
 * 所属层：前端（国际化层）
 * 路由：G_Locale（zh-CN / zh-TW / en / ja / ru）
 * 模块：iGM_Routing
 * 作用：集中定义 next-intl 支持的语言清单、默认语言与 URL 前缀策略
 * 内容：导出 routing 配置与 iGM_Locale 类型
 */
// ==================== 区块：导入依赖 ====================
import { defineRouting } from 'next-intl/routing';

// ==================== 区块：语言与路由配置 ====================
// 支持语言：简体中文、繁体中文、英语、日语、俄语；默认简体中文
export const iGM_Locales = ['zh-CN', 'zh-TW', 'en', 'ja', 'ru'] as const;

export type iGM_Locale = (typeof iGM_Locales)[number];

export const iGM_DefaultLocale: iGM_Locale = 'zh-CN';

export const routing = defineRouting({
  locales: iGM_Locales,
  defaultLocale: iGM_DefaultLocale,
  // 所有语言（含默认语言）均带语言前缀，如 /zh-CN/community
  localePrefix: 'always',
});

// ==================== 区块：导出 ====================
export default routing;
