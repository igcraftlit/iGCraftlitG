/**
 * 文件路径：apps/cli-download/src/components/iGM_CLI_AdapterToc/iGM_CLI_AdapterToc.tsx
 * 所属层：前端 / 组件层
 * 路由：/docs/adapter 与 /docs/adapter/* 全部适配器文档页
 * 模块：iGM_CLI_Downloader
 * 作用：适配器文档右侧目录（ON THIS PAGE 样式）的适配器专属入口
 * 内容：交互完全复用模块十三 iGM_CLI_DocToc——大写小标题、层级缩进、
 *       当前章节左侧竖线高亮（无背景色）、rAF 节流 Scroll Spy、
 *       点击平滑滚动、滚到底强制末项高亮、rail/top 双形态；
 *       本组件仅做契约透传，保证适配器模块拥有独立可演进的目录组件位
 */

// 导入依赖 //
"use client";

import {
  iGM_CLI_DocToc as IGM_CLI_DocToc,
  type iGM_CLI_TocItem,
} from "../iGM_CLI_DocToc/iGM_CLI_DocToc";

// 类型定义 //
export interface iGM_CLI_AdapterTocProps {
  /** 目录条目（顺序即章节顺序） */
  items: iGM_CLI_TocItem[];
  /** 顶部小标题，默认 ON THIS PAGE */
  title?: string;
  /** rail：桌面右侧竖排常驻；top：窄屏顶部横向折叠 */
  variant?: "rail" | "top";
  /** 高亮判定线距视口顶部的偏移（避让 60px 吸顶头部），默认 84 */
  offset?: number;
}

// 核心逻辑 //
/** 适配器右侧目录：直接复用 iGM_CLI_DocToc 的滚动监听与高亮交互 */
export function iGM_CLI_AdapterToc(props: iGM_CLI_AdapterTocProps) {
  return <IGM_CLI_DocToc {...props} />;
}

// 导出 //
export default iGM_CLI_AdapterToc;
