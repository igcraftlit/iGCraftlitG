/**
 * 文件路径：apps/web/src/app/template.tsx
 * 所属层：前端 / 路由模板（Next.js App Router 框架必需文件）
 * 路由：全局
 * 模块：iGM_PageTransition
 * 作用：App Router 模板层，每次导航都会重新挂载，驱动页面入场转场动画
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
