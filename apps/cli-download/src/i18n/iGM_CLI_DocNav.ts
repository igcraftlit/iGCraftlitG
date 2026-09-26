/**
 * 文件路径：apps/cli-download/src/i18n/iGM_CLI_DocNav.ts
 * 所属层：前端 / 国际化与导航配置层
 * 路由：/docs 与 /docs/cli/*
 * 模块：iGM_CLI_Downloader
 * 作用：文档左侧侧边栏的单一事实来源——分区与子页面链接配置
 * 内容：文案键（docs.sidebar.*）与不带语言前缀的站内路径；
 *       高亮匹配与链接拼装统一由 iGM_CLI_DocLayout 完成
 */

// 导入依赖 //
// （本文件仅包含常量与类型，无运行时依赖）

// 类型定义 //
export interface iGM_CLI_DocNavItem {
  /** 不带语言前缀的站内路径 */
  href: string;
  /** 语言包键（docs.sidebar.*） */
  labelKey: string;
}

// 核心逻辑 //
/** 文档侧边栏条目（顺序即展示顺序） */
export const iGM_CLI_DocNavItems: iGM_CLI_DocNavItem[] = [
  { href: "/docs", labelKey: "docs.sidebar.index" },
  { href: "/docs/cli", labelKey: "docs.sidebar.guide" },
  { href: "/docs/cli/install", labelKey: "docs.sidebar.install" },
  { href: "/docs/cli/commands", labelKey: "docs.sidebar.commands" },
  { href: "/docs/cli/config", labelKey: "docs.sidebar.config" },
  { href: "/docs/cli/faq", labelKey: "docs.sidebar.faq" },
];

// 导出 //
export default iGM_CLI_DocNavItems;
