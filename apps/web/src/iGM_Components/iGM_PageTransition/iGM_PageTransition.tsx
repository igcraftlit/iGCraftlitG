/**
 * 文件路径：apps/web/src/iGM_Components/iGM_PageTransition/iGM_PageTransition.tsx
 * 所属层：前端 / 通用组件层
 * 路由：全局（由 app/template.tsx 挂载）
 * 模块：iGM_PageTransition
 * 作用：页面内容进入动画包装；App Router 的 template 每次导航都会重新挂载，
 *       因此 CSS 入场动画对链接跳转、router 跳转、浏览器前进/后退均自动重播
 * 内容：淡出 + 轻微上移归位，prefers-reduced-motion 时禁用
 */

// 导入依赖 //
import type { ReactNode } from "react";
import styles from "./iGM_PageTransition.module.css";

// 类型定义 //
interface iGM_PageTransitionProps {
  /** 新页面内容 */
  children: ReactNode;
}

// 核心逻辑 //
/** 页面入场包装：纯 CSS 动画，无客户端状态，可作为服务端组件渲染 */
export function iGM_PageTransition({ children }: iGM_PageTransitionProps) {
  return <div className={styles.pageEnter}>{children}</div>;
}

// 导出 //
export default iGM_PageTransition;
