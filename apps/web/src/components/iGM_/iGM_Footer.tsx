/**
 * 文件：apps/web/src/components/iGM_/iGM_Footer.tsx
 * 所属层：前端（服务端组件 / 全局页脚）
 * 路由：全局
 * 模块：iGM_Footer
 * 作用：全局页脚，展示 Cinzel 网站名称与版权信息
 * 内容：品牌名称（点击回首页）、按年生成的版权文案
 */
// ==================== 区块：导入依赖 ====================
import { useTranslations } from 'next-intl';
import { iGM_SiteName as IGM_SiteName } from './iGM_SiteName';
import styles from './iGM_Footer.module.css';

// ==================== 区块：核心逻辑 ====================
export function iGM_Footer() {
  const t = useTranslations('iGM_Footer');

  return (
    <footer className={styles.footer}>
      <IGM_SiteName variant="footer" />
      <p className={styles.copyright}>
        {t('copyright', { year: new Date().getFullYear() })}
      </p>
    </footer>
  );
}

// ==================== 区块：导出 ====================
export default iGM_Footer;
