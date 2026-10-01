/**
 * 文件路径：apps/cli-download/src/components/iGM_CLI_AdapterLayout/iGM_CLI_AdapterLayout.tsx
 * 所属层：前端 / 组件层
 * 路由：/docs/adapter 与 /docs/adapter/* 全部适配器文档页
 * 模块：iGM_CLI_Downloader
 * 作用：适配器文档统一布局——左侧适配器分区侧边栏、中间正文、右侧 ON THIS PAGE 目录
 * 内容：复用模块十三 iGM_CLI_DocLayout 的三栏响应式骨架与样式（sticky/折叠规则一致），
 *       注入适配器导航配置 iGM_CLI_AdapterNavItems、分组标题 docs.sidebar.adapterGroup
 *       与适配器目录组件 iGM_CLI_AdapterToc；自身不重复布局样式，保持单一事实来源
 */

// 导入依赖 //
"use client";

import type { ReactNode } from "react";
import { iGM_CLI_DocLayout as IGM_CLI_DocLayout } from "../iGM_CLI_DocLayout/iGM_CLI_DocLayout";
import { iGM_CLI_AdapterToc as IGM_CLI_AdapterToc } from "../iGM_CLI_AdapterToc/iGM_CLI_AdapterToc";
import type { iGM_CLI_TocItem } from "../iGM_CLI_DocToc/iGM_CLI_DocToc";
import { iGM_CLI_AdapterNavItems } from "../../i18n/iGM_CLI_AdapterNav";

// 类型定义 //
interface iGM_CLI_AdapterLayoutProps {
  /** 右侧目录条目；空数组时不渲染目录 */
  tocItems: iGM_CLI_TocItem[];
  /** 正文内容 */
  children: ReactNode;
}

// 核心逻辑 //
/** 适配器文档布局：CLI 文档布局 + 适配器导航/目录注入 */
export function iGM_CLI_AdapterLayout({ tocItems, children }: iGM_CLI_AdapterLayoutProps) {
  return (
    <IGM_CLI_DocLayout
      tocItems={tocItems}
      navItems={iGM_CLI_AdapterNavItems}
      groupLabelKey="docs.sidebar.adapterGroup"
      TocComponent={IGM_CLI_AdapterToc}
    >
      {children}
    </IGM_CLI_DocLayout>
  );
}

// 导出 //
export default iGM_CLI_AdapterLayout;
