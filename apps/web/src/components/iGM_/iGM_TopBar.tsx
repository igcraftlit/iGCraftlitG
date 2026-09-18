/**
 * 文件：apps/web/src/components/iGM_/iGM_TopBar.tsx
 * 所属层：前端（客户端组件 / AppShell 顶部栏）
 * 路由：全局
 * 模块：iGM_TopBar
 * 作用：全局顶部导航条，左侧网站名称，右侧主题切换与语言切换
 * 内容：移动端菜单按钮（Menu）、平板端折叠按钮（PanelLeft*）、品牌名、右侧控件组
 */
// ==================== 区块：导入依赖 ====================
'use client';

import { Menu, PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { iGM_SiteName as IGM_SiteName } from './iGM_SiteName';
import { iGM_ThemeToggle as IGM_ThemeToggle } from './iGM_ThemeToggle';
import { iGM_LanguageSwitcher as IGM_LanguageSwitcher } from './iGM_LanguageSwitcher';
import styles from './iGM_TopBar.module.css';

// ==================== 区块：类型定义 ====================
interface iGM_TopBarProps {
  /** 侧边导航当前是否展开（控制平板端图标方向） */
  navOpen: boolean;
  /** 切换侧边导航打开/关闭 */
  onToggleNav: () => void;
}

// ==================== 区块：核心逻辑 ====================
export function iGM_TopBar({ navOpen, onToggleNav }: iGM_TopBarProps) {
  const t = useTranslations('iGM_TopBar');

  return (
    <header className={styles.topbar}>
      <div className={styles.left}>
        {/* 移动端：抽屉开关，仅移动端可见 */}
        <button
          type="button"
          className={`${styles.iconButton} iGM-u-mobile`}
          onClick={onToggleNav}
          aria-label={navOpen ? t('closeNav') : t('openNav')}
          aria-expanded={navOpen}
          aria-controls="iGM-sidebar"
        >
          <Menu size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>

        {/* 平板端：折叠/展开开关，仅平板端可见 */}
        <button
          type="button"
          className={`${styles.iconButton} iGM-u-tablet`}
          onClick={onToggleNav}
          aria-label={navOpen ? t('closeNav') : t('openNav')}
          aria-expanded={navOpen}
          aria-controls="iGM-sidebar"
        >
          {navOpen ? (
            <PanelLeftClose size={20} strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <PanelLeftOpen size={20} strokeWidth={1.75} aria-hidden="true" />
          )}
        </button>

        <IGM_SiteName variant="topbar" />
      </div>

      <div className={styles.right}>
        <IGM_ThemeToggle />
        <IGM_LanguageSwitcher />
      </div>
    </header>
  );
}

// ==================== 区块：导出 ====================
export default iGM_TopBar;
