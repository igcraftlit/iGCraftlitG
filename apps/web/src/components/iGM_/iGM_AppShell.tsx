/**
 * 文件：apps/web/src/components/iGM_/iGM_AppShell.tsx
 * 所属层：前端（客户端组件 / 布局骨架）
 * 路由：全部 G_Xxxxx 路由
 * 模块：iGM_AppShell
 * 作用：标准 AppShell 布局，管理侧边导航抽屉状态并组合 TopBar / 内容区 / Footer
 * 内容：侧边栏开合状态、移动端背景滚动锁定、响应式内容列
 */
// ==================== 区块：导入依赖 ====================
'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { iGM_Sidebar as IGM_Sidebar } from './iGM_Sidebar';
import { iGM_TopBar as IGM_TopBar } from './iGM_TopBar';
import { iGM_Footer as IGM_Footer } from './iGM_Footer';
import styles from './iGM_AppShell.module.css';

// ==================== 区块：类型定义 ====================
interface iGM_AppShellProps {
  children: ReactNode;
}

// ==================== 区块：核心逻辑 ====================
export function iGM_AppShell({ children }: iGM_AppShellProps) {
  // 同时控制移动端抽屉与平板端展开浮层
  const [navOpen, setNavOpen] = useState(false);

  // 移动端抽屉打开时锁定背景滚动；平板/桌面不受影响
  useEffect(() => {
    if (!navOpen) {
      return;
    }
    const mobileMedia = window.matchMedia('(max-width: 767.98px)');
    if (!mobileMedia.matches) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [navOpen]);

  return (
    <div className={styles.shell}>
      <IGM_Sidebar open={navOpen} onClose={() => setNavOpen(false)} />

      <div className={styles.column}>
        <IGM_TopBar navOpen={navOpen} onToggleNav={() => setNavOpen((value) => !value)} />
        <main className={styles.content} id="iGM-main-content">
          {children}
        </main>
        <IGM_Footer />
      </div>
    </div>
  );
}

// ==================== 区块：导出 ====================
export default iGM_AppShell;
