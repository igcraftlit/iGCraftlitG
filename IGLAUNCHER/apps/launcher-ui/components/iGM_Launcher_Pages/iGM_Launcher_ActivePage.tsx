/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Pages/iGM_Launcher_ActivePage.tsx
 * 所属层：前端 / 页面层
 * 路由：G_Home / G_Instances / G_ResourceCenter / G_Settings / G_Account（SPA 单页，URL 不变）
 * 模块：iGM_Launcher_ActivePage
 * 作用：按当前激活页面 id 渲染对应页面组件
 * 内容：页面 id 来自 AppShell 的 shell 布局上下文，切换为纯客户端重渲染，
 *       不产生任何导航请求
 */

// 导入依赖 //
"use client";

import { iGM_Launcher_UseShellLayout } from "@/components/iGM_Launcher_AppShell/iGM_Launcher_AppShell";
import { IGM_LAUNCHER_PAGE_REGISTRY } from "./iGM_Launcher_PageRegistry";

// 类型定义 //
/* （页面 id 类型由 iGM_Launcher_PageRegistry 提供） */

// 核心逻辑 //
export function iGM_Launcher_ActivePage() {
  const { pageId, params } = iGM_Launcher_UseShellLayout();
  const ActivePage = IGM_LAUNCHER_PAGE_REGISTRY[pageId];
  return <ActivePage params={params} />;
}

// 导出 //
export default iGM_Launcher_ActivePage;