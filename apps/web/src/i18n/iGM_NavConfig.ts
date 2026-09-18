/**
 * 文件：apps/web/src/i18n/iGM_NavConfig.ts
 * 所属层：前端（配置层）
 * 路由：G_Home / G_Notification / G_Community / G_Post / G_Activity / G_Resource / G_User / G_Settings / G_Admin
 * 模块：iGM_NavConfig
 * 作用：集中定义侧边导航的区块划分、路由代号、物理路径、文案键与 lucide 图标映射
 * 内容：导出 iGM_NavItem / iGM_NavSection 类型、iGM_NavSections 区块配置
 */
// ==================== 区块：导入依赖 ====================
import type { LucideIcon } from 'lucide-react';
import {
  Home,
  Bell,
  Users,
  FileText,
  CalendarDays,
  Library,
  UserRound,
  Settings,
  ShieldCheck,
} from 'lucide-react';

// ==================== 区块：类型定义 ====================
export interface iGM_NavItem {
  /** 路由代号，遵循 G_Xxxxx 命名 */
  code: string;
  /** 用户友好的物理路径（不含语言前缀） */
  href: string;
  /** 语言包中的文案键，命名空间 iGM_Nav */
  labelKey: string;
  /** lucide-react 线性图标 */
  icon: LucideIcon;
}

export interface iGM_NavSection {
  /** 区块标识 */
  id: 'main' | 'community' | 'personal' | 'admin';
  /** 区块标题文案键 */
  titleKey: string;
  /** 区块包含的菜单项 */
  items: readonly iGM_NavItem[];
}

// ==================== 区块：导航区块配置 ====================
// 按服务类型区块化：主页 / 社区 / 个人 / 管理
export const iGM_NavSections: readonly iGM_NavSection[] = [
  {
    id: 'main',
    titleKey: 'sectionMain',
    items: [
      { code: 'G_Home', href: '/', labelKey: 'G_Home', icon: Home },
      { code: 'G_Notification', href: '/notifications', labelKey: 'G_Notification', icon: Bell },
    ],
  },
  {
    id: 'community',
    titleKey: 'sectionCommunity',
    items: [
      { code: 'G_Community', href: '/community', labelKey: 'G_Community', icon: Users },
      { code: 'G_Post', href: '/posts', labelKey: 'G_Post', icon: FileText },
      { code: 'G_Activity', href: '/activities', labelKey: 'G_Activity', icon: CalendarDays },
      { code: 'G_Resource', href: '/resources', labelKey: 'G_Resource', icon: Library },
    ],
  },
  {
    id: 'personal',
    titleKey: 'sectionPersonal',
    items: [
      { code: 'G_User', href: '/profile', labelKey: 'G_User', icon: UserRound },
      { code: 'G_Settings', href: '/settings', labelKey: 'G_Settings', icon: Settings },
    ],
  },
  {
    id: 'admin',
    titleKey: 'sectionAdmin',
    items: [
      { code: 'G_Admin', href: '/admin', labelKey: 'G_Admin', icon: ShieldCheck },
    ],
  },
];

// ==================== 区块：导出 ====================
export default iGM_NavSections;
