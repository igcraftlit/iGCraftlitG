/**
 * 文件路径：apps/cli-download/src/i18n/iGM_CLI_AdapterNav.ts
 * 所属层：前端 / 国际化与导航配置层
 * 路由：/docs/adapter 与 /docs/adapter/*
 * 模块：iGM_CLI_Downloader
 * 作用：适配器文档左侧侧边栏的单一事实来源——适配器分区与子页面链接配置
 * 内容：文案键（docs.sidebar.adapter*）与不带语言前缀的站内路径；
 *       高亮匹配与链接拼装统一由 iGM_CLI_AdapterLayout（复用 DocLayout）完成
 */

// 导入依赖 //
import type { iGM_CLI_DocNavItem } from "./iGM_CLI_DocNav";

// 类型定义 //
// （复用 iGM_CLI_DocNavItem：href 为站内路径，labelKey 为语言包键）

// 核心逻辑 //
/** 适配器文档侧边栏条目（顺序即展示顺序） */
export const iGM_CLI_AdapterNavItems: iGM_CLI_DocNavItem[] = [
  { href: "/docs/adapter", labelKey: "docs.sidebar.adapterGuide" },
  { href: "/docs/adapter/overview", labelKey: "docs.sidebar.adapterOverview" },
  { href: "/docs/adapter/sdk", labelKey: "docs.sidebar.adapterSdk" },
  { href: "/docs/adapter/protocol", labelKey: "docs.sidebar.adapterProtocol" },
  { href: "/docs/adapter/progress", labelKey: "docs.sidebar.adapterProgress" },
  { href: "/docs/adapter/faq", labelKey: "docs.sidebar.adapterFaq" },
];

// 导出 //
export default iGM_CLI_AdapterNavItems;
