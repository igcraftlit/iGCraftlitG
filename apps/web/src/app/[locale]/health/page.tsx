/**
 * 文件：apps/web/src/app/[locale]/health/page.tsx
 * 所属层：前端（App Router 页面）
 * 路由：G_Api_Health（健康检查占位页）
 * 模块：iGM_HealthPage
 * 作用：前端健康检查页，仅显示前端版本号与构建时间
 * 内容：版本号（package.json）、构建时间（next.config 构建期注入）
 */
// ==================== 区块：导入依赖 ====================
import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import type { iGM_Locale } from '@/i18n/iGM_Routing';
import { iGM_staticLocaleParams } from '@/i18n/iGM_Page';
import iGM_Env from '@/lib/iGM_Env';
import styles from './iGM_Health.module.css';

// ==================== 区块：静态参数与元数据 ====================
export const generateStaticParams = iGM_staticLocaleParams;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: iGM_Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'iGM_Health' });
  return { title: t('title'), robots: { index: false } };
}

// ==================== 区块：页面 ====================
export default async function iGM_HealthPage({
  params,
}: {
  params: Promise<{ locale: iGM_Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'iGM_Health' });

  return (
    <section className={styles.health}>
      <h1 className={styles.title}>{t('title')}</h1>
      <dl className={styles.list}>
        <div className={styles.row}>
          <dt className={styles.term}>{t('version')}</dt>
          <dd className={styles.detail}>{iGM_Env.appVersion}</dd>
        </div>
        <div className={styles.row}>
          <dt className={styles.term}>{t('buildTime')}</dt>
          <dd className={styles.detail}>{iGM_Env.buildTime}</dd>
        </div>
      </dl>
    </section>
  );
}
