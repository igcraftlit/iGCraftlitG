/**
 * 文件：apps/web/src/components/iGM_/iGM_ThemeToggle.tsx
 * 所属层：前端（客户端组件 / TopBar 控件）
 * 路由：全局
 * 模块：iGM_ThemeToggle
 * 作用：明暗模式切换按钮，按 system -> light -> dark 顺序循环
 * 内容：Sun / Moon 线性图标、当前模式提示、hydration 安全处理
 */
// ==================== 区块：导入依赖 ====================
'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { Sun, Moon } from 'lucide-react';
import styles from './iGM_ThemeToggle.module.css';

// ==================== 区块：常量 ====================
// 三态循环顺序：跟随系统 -> 亮色 -> 暗色 -> 跟随系统
const iGM_ThemeOrder = ['system', 'light', 'dark'] as const;
type iGM_ThemeMode = (typeof iGM_ThemeOrder)[number];

// ==================== 区块：核心逻辑 ====================
export function iGM_ThemeToggle() {
  const t = useTranslations('iGM_Theme');
  const { theme, resolvedTheme, setTheme } = useTheme();
  // hydration 安全：挂载前不读取主题，避免服务端/客户端图标不一致
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const currentMode: iGM_ThemeMode =
    mounted && theme && (iGM_ThemeOrder as readonly string[]).includes(theme)
      ? (theme as iGM_ThemeMode)
      : 'system';

  const handleToggle = () => {
    const index = iGM_ThemeOrder.indexOf(currentMode);
    const next = iGM_ThemeOrder[(index + 1) % iGM_ThemeOrder.length];
    if (next) {
      setTheme(next);
    }
  };

  // 暗色解析态显示 Moon，亮色解析态显示 Sun；未挂载时占位为 Sun
  const isDark = mounted && resolvedTheme === 'dark';
  const modeLabel = t(currentMode);

  return (
    <button
      type="button"
      className={styles.button}
      onClick={handleToggle}
      aria-label={t('label')}
      title={t('currentHint', { mode: modeLabel })}
    >
      {isDark ? (
        <Moon size={18} strokeWidth={1.75} aria-hidden="true" />
      ) : (
        <Sun size={18} strokeWidth={1.75} aria-hidden="true" />
      )}
      <span className="iGM-visually-hidden">{t('label')}</span>
    </button>
  );
}

// ==================== 区块：导出 ====================
export default iGM_ThemeToggle;
