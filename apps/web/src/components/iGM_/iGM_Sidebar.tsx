/**
 * 文件：apps/web/src/components/iGM_/iGM_Sidebar.tsx
 * 所属层：前端（客户端组件 / AppShell 侧边导航）
 * 路由：G_Home / G_Notification / G_Community / G_Post / G_Activity / G_Resource / G_User / G_Settings / G_Admin
 * 模块：iGM_Sidebar
 * 作用：按服务类型区块化展示的侧边导航，支持当前路由高亮与三级响应式
 * 内容：
 *   桌面端（>=1200px）：永久展开
 *   平板端（768-1199px）：默认图标轨道，展开为浮层
 *   移动端（<768px）：抽屉式，遮罩点击 / Esc / 路由切换后关闭
 */
// ==================== 区块：导入依赖 ====================
'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/iGM_Navigation';
import { iGM_NavSections } from '@/i18n/iGM_NavConfig';
import styles from './iGM_Sidebar.module.css';

// ==================== 区块：类型定义 ====================
interface iGM_SidebarProps {
  /** 移动端抽屉 / 平板端浮层是否展开 */
  open: boolean;
  /** 请求关闭抽屉 */
  onClose: () => void;
}

// ==================== 区块：核心逻辑 ====================
export function iGM_Sidebar({ open, onClose }: iGM_SidebarProps) {
  const t = useTranslations('iGM_Nav');
  const pathname = usePathname();

  // 路由切换后自动收起抽屉/浮层
  useEffect(() => {
    onClose();
    // 仅在路径变化时触发，onClose 为稳定回调无需加入依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Esc 键关闭移动端抽屉
  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // 判断菜单项是否为当前激活路由：首页精确匹配，其余前缀匹配
  const isItemActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <>
      {/* 移动端遮罩层：点击关闭（平板/桌面端由 CSS 隐藏） */}
      <div
        className={styles.overlay}
        data-open={open}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        id="iGM-sidebar"
        className={styles.sidebar}
        data-open={open}
        aria-label={t('navLabel')}
      >
        <nav className={styles.nav}>
          {iGM_NavSections.map((section) => (
            <section key={section.id} className={styles.section}>
              <h3 className={styles.sectionTitle}>{t(section.titleKey)}</h3>
              <ul className={styles.itemList}>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isItemActive(item.href);
                  return (
                    <li key={item.code}>
                      <Link
                        href={item.href}
                        className={styles.item}
                        data-active={active}
                        title={t(item.labelKey)}
                        aria-current={active ? 'page' : undefined}
                      >
                        <Icon
                          size={18}
                          strokeWidth={1.75}
                          className={styles.icon}
                          aria-hidden="true"
                        />
                        <span className={styles.label}>{t(item.labelKey)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </nav>
      </aside>
    </>
  );
}

// ==================== 区块：导出 ====================
export default iGM_Sidebar;
