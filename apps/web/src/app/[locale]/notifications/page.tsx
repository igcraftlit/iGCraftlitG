/**
 * 文件：apps/web/src/app/[locale]/notifications/page.tsx
 * 所属层：前端（App Router 页面）
 * 路由：G_Notification（通知）
 * 模块：iGM_NotificationPage
 * 作用：通知中心模块一占位页，仅展示页面标题与建设中说明
 * 内容：iGM_PagePlaceholder
 */
// ==================== 区块：导入依赖 ====================
import { setRequestLocale, getTranslations } from 'next-intl/server';
import type { iGM_Locale } from '@/i18n/iGM_Routing';
import { iGM_staticLocaleParams, iGM_pageMetadata } from '@/i18n/iGM_Page';
import { iGM_PagePlaceholder as IGM_PagePlaceholder } from '@/components/iGM_/iGM_PagePlaceholder';

// ==================== 区块：静态参数与元数据 ====================
export const generateStaticParams = iGM_staticLocaleParams;
export const generateMetadata = async ({ params }: { params: Promise<{ locale: iGM_Locale }> }) =>
  iGM_pageMetadata((await params).locale, 'G_Notification');

// ==================== 区块：页面 ====================
export default async function iGM_NotificationPage({
  params,
}: {
  params: Promise<{ locale: iGM_Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'iGM_Nav' });
  return <IGM_PagePlaceholder title={t('G_Notification')} />;
}
