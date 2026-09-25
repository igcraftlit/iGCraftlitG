/**
 * 文件路径：apps/web/src/app/[locale]/template.tsx
 * 所属层：前端 / 路由模板（Next.js App Router 框架必需文件）
 * 路由：/zh-CN、/zh-TW、/en、/ja、/ru 下全部页面
 * 模块：iGM_PageTransition
 * 作用：App Router 模板层，每次导航（含多语言前缀切换）都会重新挂载，
 *       驱动页面入场转场与内容模块交错渐显
 * 说明：本文件为 Next.js 强制命名的框架入口，实际组件逻辑见
 *       iGM_Components/iGM_PageTransition/iGM_PageTransition
 */

// 导入依赖 //
import type { ReactNode } from "react";
import { iGM_PageTransition as IGM_PageTransition } from "../../iGM_Components/iGM_PageTransition/iGM_PageTransition";

// 类型定义 //
interface iGM_TemplateProps {
  children: ReactNode;
}

// 导出 //
export default function iGM_Template({ children }: iGM_TemplateProps) {
  return <IGM_PageTransition>{children}</IGM_PageTransition>;
}
