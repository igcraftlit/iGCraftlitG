/**
 * 文件：apps/web/src/app/[locale]/page.tsx
 * 所属层：前端（App Router 页面）
 * 路由：G_Home（首页 /）
 * 模块：iGM_HomePage
 * 作用：模块一首页，仅含网站名称、一句话简介与三个功能入口卡片
 * 内容：主视觉区（Cinzel 名称 + 简介）、社区 / 个人主页 / 管理后台入口卡片
 */
// ==================== 区块：导入依赖 ====================
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/iGM_Navigation';
import { iGM_Locales, type iGM_Locale } from '@/i18n/iGM_Routing';
import { iGM_SiteName as IGM_SiteName } from '@/components/iGM_/iGM_SiteName';
import styles from './iGM_Home.module.css';

// ==================== 区块：静态参数 ====================
export function generateStaticParams() {
  return iGM_Locales.map((locale) => ({ locale }));
}

// ==================== 区块：首页 ====================
export default async function iGM_HomePage({
  params,
}: {
  params: Promise<{ locale: iGM_Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const tBrand = await getTranslations('iGM_Brand');
  const tHome = await getTranslations('iGM_Home');

  // 三个功能入口：社区 G_Community、个人主页 G_User、管理后台 G_Admin
  const cards = [
    {
      href: '/community' as const,
      title: tHome('entryCommunityTitle'),
      description: tHome('entryCommunityDesc'),
    },
    {
      href: '/profile' as const,
      title: tHome('entryProfileTitle'),
      description: tHome('entryProfileDesc'),
    },
    {
      href: '/admin' as const,
      title: tHome('entryAdminTitle'),
      description: tHome('entryAdminDesc'),
    },
  ];

  return (
    <div className={styles.page}>
      {/* 主视觉：仅网站名称 + 一句话简介 */}
      <section className={styles.hero}>
        <IGM_SiteName variant="hero" />
        <p className={styles.tagline}>{tBrand('tagline')}</p>
      </section>

      {/* 功能入口卡片 */}
      <section className={styles.cards} aria-label={tBrand('name')}>
        {cards.map((card) => (
          <Link key={card.href} href={card.href} className={styles.card}>
            <h2 className={styles.cardTitle}>{card.title}</h2>
            <p className={styles.cardDescription}>{card.description}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
