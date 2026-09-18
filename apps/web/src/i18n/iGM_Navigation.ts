/**
 * 文件：apps/web/src/i18n/iGM_Navigation.ts
 * 所属层：前端（国际化层）
 * 路由：全部 G_Xxxxx 路由的本地化版本
 * 模块：iGM_Navigation
 * 作用：基于 routing 创建感知语言的 Link / useRouter / usePathname / redirect
 * 内容：导出 Link、redirect、usePathname、useRouter，全站跳转必须使用此处封装
 */
// ==================== 区块：导入依赖 ====================
import { createNavigation } from 'next-intl/navigation';
import { routing } from './iGM_Routing';

// ==================== 区块：导航封装 ====================
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);

// ==================== 区块：导出 ====================
export { routing };
