/**
 * 文件：apps/web/src/i18n/iGM_RequestConfig.ts
 * 所属层：前端（国际化层）
 * 路由：全局中间件与所有 G_Xxxxx 页面
 * 模块：iGM_RequestConfig
 * 作用：next-intl 服务端请求配置，按当前请求语言加载 messages 语言包
 * 内容：默认语言回退、语言包动态导入，供 next-intl 插件与 Provider 使用
 */
// ==================== 区块：导入依赖 ====================
import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing, iGM_DefaultLocale } from './iGM_Routing';

// ==================== 区块：请求配置 ====================
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  // 非法或缺失语言时回退到默认语言 zh-CN
  const locale = requested && hasLocale(routing.locales, requested)
    ? requested
    : iGM_DefaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default as Record<string, unknown>,
  };
});
