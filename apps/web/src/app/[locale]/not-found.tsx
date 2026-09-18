/**
 * 文件：apps/web/src/app/[locale]/not-found.tsx
 * 所属层：前端（App Router 404）
 * 路由：语言段内未匹配路由
 * 模块：iGM_LocaleNotFound
 * 作用：语言段内 404 页面，全部文案来自语言包，提供返回首页入口
 * 内容：404 标题、说明、返回首页链接（客户端组件以覆盖未匹配渲染场景）
 */
// ==================== 区块：导入依赖 ====================
'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/iGM_Navigation';
import styles from './iGM_NotFound.module.css';

// ==================== 区块：404 页面 ====================
export default function iGM_LocaleNotFound() {
  const t = useTranslations('iGM_NotFound');

  return (
    <section className={styles.notFound}>
      <p className={styles.code}>404</p>
      <h1 className={styles.title}>{t('title')}</h1>
      <p className={styles.description}>{t('description')}</p>
      <Link href="/" className={styles.link}>
        {t('backHome')}
      </Link>
    </section>
  );
}
