/**
 * 文件：apps/web/src/i18n/iGM_Page.ts
 * 所属层：前端（国际化层 / 页面工具）
 * 路由：全部需要静态语言参数的 G_Xxxxx 页面
 * 模块：iGM_Page
 * 作用：为各语言段页面统一提供静态参数生成与本地化 metadata 工具，消除重复代码
 * 内容：iGM_staticLocaleParams、iGM_pageMetadata
 */
// ==================== 区块：导入依赖 ====================
import { getTranslations } from 'next-intl/server';
import { iGM_Locales, type iGM_Locale } from './iGM_Routing';

// ==================== 区块：工具函数 ====================
/** 生成 next-intl 五种语言的静态参数 */
export function iGM_staticLocaleParams() {
  return iGM_Locales.map((locale) => ({ locale }));
}

/**
 * 生成基于侧边导航文案的页面标题
 * @param locale 当前语言
 * @param navKey iGM_Nav 命名空间下的文案键，如 G_Notification
 */
export async function iGM_pageMetadata(locale: iGM_Locale, navKey: string) {
  const t = await getTranslations({ locale, namespace: 'iGM_Nav' });
  return { title: t(navKey) };
}

// ==================== 区块：导出 ====================
export default iGM_staticLocaleParams;
