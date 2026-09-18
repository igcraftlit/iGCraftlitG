/**
 * 文件：apps/web/src/components/iGM_/iGM_SiteName.tsx
 * 所属层：前端（服务端组件 / 品牌组件）
 * 路由：G_Home（点击返回首页）
 * 模块：iGM_SiteName
 * 作用：以 Cinzel 艺术字体展示网站名称 "iGCraftLit Community"，点击返回首页
 * 内容：topbar / hero / footer 三种尺寸变体
 */
// ==================== 区块：导入依赖 ====================
import { Link } from '@/i18n/iGM_Navigation';
import { useTranslations } from 'next-intl';
import styles from './iGM_SiteName.module.css';

// ==================== 区块：类型定义 ====================
interface iGM_SiteNameProps {
  /** 展示变体：顶部栏 / 首页主视觉 / 页脚 */
  variant?: 'topbar' | 'hero' | 'footer';
}

// ==================== 区块：核心逻辑 ====================
export function iGM_SiteName({ variant = 'topbar' }: iGM_SiteNameProps) {
  const t = useTranslations('iGM_Brand');

  return (
    <Link
      href="/"
      className={`iGM-cinzel ${styles[variant]}`}
      aria-label={t('name')}
    >
      {t('name')}
    </Link>
  );
}

// ==================== 区块：导出 ====================
export default iGM_SiteName;
