/**
 * 文件：apps/web/src/components/iGM_/iGM_PagePlaceholder.tsx
 * 所属层：前端（服务端组件 / 通用占位）
 * 路由：供 G_Notification / G_Post / G_Activity 等模块一占位页复用
 * 模块：iGM_PagePlaceholder
 * 作用：统一渲染"功能建设中"占位页，仅含页面标题与一句说明
 * 内容：标题槽位 + i18n 占位说明文案
 */
// ==================== 区块：导入依赖 ====================
import { useTranslations } from 'next-intl';
import styles from './iGM_PagePlaceholder.module.css';

// ==================== 区块：类型定义 ====================
interface iGM_PagePlaceholderProps {
  /** 页面标题（由各页面传入已本地化的路由名称） */
  title: string;
}

// ==================== 区块：核心逻辑 ====================
export function iGM_PagePlaceholder({ title }: iGM_PagePlaceholderProps) {
  const t = useTranslations('iGM_Placeholder');

  return (
    <section className={styles.placeholder}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.description}>{t('description')}</p>
    </section>
  );
}

// ==================== 区块：导出 ====================
export default iGM_PagePlaceholder;
