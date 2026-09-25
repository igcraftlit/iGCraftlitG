/**
 * 文件路径：apps/web/src/iGM_Components/iGM_PageTransition/iGM_PageTransition.tsx
 * 所属层：前端 / 通用组件层
 * 路由：全局（由 app/[locale]/template.tsx 挂载）
 * 模块：iGM_PageTransition
 * 作用：页面切换动画包装；App Router 的 template 每次导航都会重新挂载，
 *       因此 CSS 入场动画对链接跳转、router 跳转、浏览器前进/后退、
 *       多语言前缀切换（/zh-CN、/en 等）均自动重播，静态导出可用
 * 内容：探索（12px 位移 + 4px 模糊消散）、创新（0.992 微缩放）、
 *       求真（320ms ease-out 干净收敛）、创造（子模块 40ms 交错渐显）；
 *       纯 CSS 实现，无客户端状态、无新增依赖，可作为服务端组件渲染
 * 豁免：页面根节点声明 data-igm-motion="off" 时跳过内部交错渐显
 *       （落地页自带 iGM_Reveal 滚动编排）
 * 降级：prefers-reduced-motion 时样式层直接关闭全部动画
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
