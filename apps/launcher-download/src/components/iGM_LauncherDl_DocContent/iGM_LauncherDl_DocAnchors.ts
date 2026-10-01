/**
 * 文件路径：apps/launcher-download/src/components/iGM_LauncherDl_DocContent/iGM_LauncherDl_DocAnchors.ts
 * 所属层：前端 / 文档内容常量层
 * 路由：/docs/install、/docs/faq 文档页
 * 模块：iGM_LauncherDl_Downloader
 * 作用：文档正文章节锚点常量单一事实来源，供页面 TOC 与正文组件共享
 * 内容：安装指南章节 id、常见问题锚点前缀与条目数量
 * 说明：本模块不含 "use client"，可同时被服务端页面与客户端正文组件安全引用
 */

// 导入依赖 //
// （本文件仅包含常量，无运行时依赖）

// 类型定义 //
// （无）

// 核心逻辑 //
/** 安装指南章节锚点：与页面 TOC 共享，避免 id 漂移 */
export const iGM_LauncherDl_InstallSectionIds = {
  system: "igm-launcherdl-doc-system",
  steps: "igm-launcherdl-doc-steps",
  verify: "igm-launcherdl-doc-verify",
  notes: "igm-launcherdl-doc-notes",
} as const;

/** 常见问题条目锚点前缀：第 n 条为 `${prefix}${n}` */
export const iGM_LauncherDl_FaqAnchorPrefix = "igm-launcherdl-faq-q";

/** 常见问题条目数量（与语言包 q1..q5 一致） */
export const iGM_LauncherDl_FaqCount = 5;

// 导出 //
export default iGM_LauncherDl_InstallSectionIds;