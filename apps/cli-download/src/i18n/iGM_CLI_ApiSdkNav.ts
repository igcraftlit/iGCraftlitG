/**
 * 文件路径：apps/cli-download/src/i18n/iGM_CLI_ApiSdkNav.ts
 * 所属层：前端 / 国际化与导航配置层
 * 路由：/{locale}/api、/{locale}/sdk
 * 模块：iGM_CLI_Downloader
 * 作用：API / SDK 文档页左侧侧边栏条目配置
 * 内容：复用语言包中已有的导航键（nav.api、nav.sdk 等）与站内路径，
 *       避免新增语言包键；高亮与链接拼装由 iGM_CLI_DocLayout 统一完成
 */

// 导入依赖 //
import type { iGM_CLI_DocNavItem } from "./iGM_CLI_DocNav";

// 类型定义 //
// （复用 iGM_CLI_DocNavItem：href 为站内路径，labelKey 为语言包键）

// 核心逻辑 //
/** API / SDK 文档侧边栏条目（顺序即展示顺序） */
export const iGM_CLI_ApiSdkNavItems: iGM_CLI_DocNavItem[] = [
  { href: "/api", labelKey: "nav.api" },
  { href: "/sdk", labelKey: "nav.sdk" },
  { href: "/docs/adapter", labelKey: "docs.sidebar.adapterGuide" },
  { href: "/docs", labelKey: "docs.sidebar.index" },
];

// 导出 //
export default iGM_CLI_ApiSdkNavItems;
