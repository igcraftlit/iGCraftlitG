/**
 * 文件路径：apps/launcher-download/src/i18n/iGM_LauncherDl_DocNav.ts
 * 所属层：前端 / 国际化与导航配置层
 * 路由：/docs 与 /docs/install、/docs/faq
 * 模块：iGM_LauncherDl_Downloader
 * 作用：文档左侧侧边栏的单一事实来源——分区与子页面链接配置
 * 内容：文案键（docs.sidebar.*）与不带语言前缀的站内路径；
 *       高亮匹配与链接拼装统一由 iGM_LauncherDl_DocLayout 完成
 */

// 导入依赖 //
// （本文件仅包含常量与类型，无运行时依赖）

// 类型定义 //
export interface iGM_LauncherDl_DocNavItem {
  /** 不带语言前缀的站内路径 */
  href: string;
  /** 语言包键（docs.sidebar.*） */
  labelKey: string;
}

// 核心逻辑 //
/** 文档侧边栏条目（顺序即展示顺序） */
export const iGM_LauncherDl_DocNavItems: iGM_LauncherDl_DocNavItem[] = [
  { href: "/docs", labelKey: "docs.sidebar.index" },
  { href: "/docs/install", labelKey: "docs.sidebar.install" },
  { href: "/docs/faq", labelKey: "docs.sidebar.faq" },
];

// 导出 //
export default iGM_LauncherDl_DocNavItems;