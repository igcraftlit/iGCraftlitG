/**
 * 文件：apps/web/src/app/layout.tsx
 * 所属层：前端（App Router 根布局）
 * 路由：全局
 * 模块：iGM_RootLayout
 * 作用：根布局透传层；<html>/<body> 由 [locale]/layout.tsx 渲染以注入语言与主题属性。
 *       全局样式在此引入，保证根级 404 等 [locale] 段外页面也拥有主题变量。
 * 内容：全局 CSS 导入，仅返回 children
 */
// ==================== 区块：导入依赖 ====================
import type { ReactNode } from 'react';
import './iGM_Globals.css';

// ==================== 区块：根布局 ====================
export const metadata = {
  title: 'iGCraftLit Community',
};

export default function iGM_RootLayout({ children }: { children: ReactNode }) {
  return children;
}
