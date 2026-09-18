/**
 * 文件路径：apps/web/src/iGM_Components/iGM_Reveal/iGM_Reveal.tsx
 * 所属层：前端 / 通用组件层
 * 路由：全局（落地页滚动入场动效）
 * 模块：iGM_Reveal
 * 作用：元素进入视口时触发“拉出 + 淡入”过渡，支持方向与阶梯延迟
 * 内容：IntersectionObserver 可见性探测、prefers-reduced-motion 降级
 */

// 导入依赖 //
"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import styles from "./iGM_Reveal.module.css";

// 类型定义 //
export interface iGM_RevealProps {
  /** 被包装的内容 */
  children: ReactNode;
  /** 拉出方向：up 从下 / down 从上 / left 从左 / right 从右 / none 仅淡入 */
  direction?: "up" | "down" | "left" | "right" | "none";
  /** 入场延迟（毫秒），用于同组元素阶梯式拉出 */
  delay?: number;
  /** 过渡时长（毫秒） */
  duration?: number;
  /** 追加到包装元素的样式类 */
  className?: string;
}

// 核心逻辑 //
/** 滚动进场包装：进入视口后添加可见态，仅触发一次 */
export function iGM_Reveal({
  children,
  direction = "up",
  delay = 0,
  duration = 700,
  className = "",
}: iGM_RevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // 系统要求减少动态效果时直接呈现完整内容
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`${styles.reveal} ${styles[direction]} ${
        visible ? styles.visible : ""
      } ${className}`}
      style={{
        transitionDuration: `${duration}ms`,
        transitionDelay: visible ? `${delay}ms` : "0ms",
      }}
    >
      {children}
    </div>
  );
}

// 导出 //
export default iGM_Reveal;
