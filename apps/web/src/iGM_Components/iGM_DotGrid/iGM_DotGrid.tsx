/**
 * 文件路径：apps/web/src/iGM_Components/iGM_DotGrid/iGM_DotGrid.tsx
 * 所属层：前端 / 通用组件层
 * 路由：G_Landing（首页 Hero 背景）
 * 模块：iGM_DotGrid
 * 作用：Canvas 交互点阵网格背景，鼠标移动时邻近圆点被推离并提亮，形成微妙互动
 * 内容：自适应点阵构建、指针影响半径内的缓动反馈、明暗主题取色、
 *       设备像素比适配、ResizeObserver 自适应、prefers-reduced-motion 静态降级
 * 说明：纯 Canvas 2D 实现，无 WebGL 依赖；颜色取自作用域内 CSS 变量 --igm-accent
 */

// 导入依赖 //
"use client";

import { useEffect, useRef } from "react";
import styles from "./iGM_DotGrid.module.css";

// 类型定义 //
export interface iGM_DotGridProps {
  /** 追加到画布容器的样式类 */
  className?: string;
  /** 点阵间距（px） */
  gap?: number;
  /** 指针影响半径（px） */
  radius?: number;
}

/** 单个点：ox/oy 为基准坐标，a 为受指针影响强度（0–1，缓动逼近） */
interface iGM_DotPoint {
  ox: number;
  oy: number;
  a: number;
}

// 核心逻辑 //
/** 将十六进制颜色转换为 rgba 字符串，alpha 可为小数 */
function iGM_HexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace("#", "").trim();
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  const num = Number.parseInt(full, 16);
  if (Number.isNaN(num) || full.length !== 6) {
    // 非法色值回退品牌蓝，避免绘制异常
    return `rgba(77, 107, 254, ${alpha})`;
  }
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 交互点阵网格背景 */
export function iGM_DotGrid({
  className = "",
  gap = 30,
  radius = 130,
}: iGM_DotGridProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 系统偏好减少动态：绘制一次静态点阵，不启动动画
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let width = 0;
    let height = 0;
    let points: iGM_DotPoint[] = [];
    let raf = 0;
    const pointer = { x: -9999, y: -9999, active: false };

    /** 按当前主题读取点阵与高亮色 */
    function iGM_ReadColors(): { base: string; glow: string } {
      const accent =
        getComputedStyle(host as HTMLDivElement)
          .getPropertyValue("--igm-accent")
          .trim() || "#4d6bfe";
      const dark =
        document.documentElement.getAttribute("data-theme") === "dark";
      return {
        base: iGM_HexToRgba(accent, dark ? 0.26 : 0.2),
        glow: iGM_HexToRgba(accent, 0.9),
      };
    }

    let colors = iGM_ReadColors();

    /** 重建画布尺寸与点阵坐标 */
    function iGM_Build(): void {
      const rect = host!.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = Math.floor(width * dpr);
      canvas!.height = Math.floor(height * dpr);
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cols = Math.ceil(width / gap) + 1;
      const rows = Math.ceil(height / gap) + 1;
      const offsetX = (width - (cols - 1) * gap) / 2;
      const offsetY = (height - (rows - 1) * gap) / 2;

      points = [];
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          points.push({
            ox: offsetX + c * gap,
            oy: offsetY + r * gap,
            a: 0,
          });
        }
      }
    }

    /** 绘制一帧：基准点淡显，受指针影响的点被推开并提亮 */
    function iGM_Render(): void {
      ctx!.clearRect(0, 0, width, height);

      for (const point of points) {
        const dx = point.ox - pointer.x;
        const dy = point.oy - pointer.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // 影响强度：越靠近指针越强，平方衰减更柔和
        let target = 0;
        if (pointer.active && dist < radius) {
          const linear = 1 - dist / radius;
          target = linear * linear;
        }
        point.a += (target - point.a) * 0.14;
        if (point.a < 0.002) point.a = target === 0 ? 0 : point.a;

        // 轻微推开：沿远离指针方向偏移
        const push = point.a * 7;
        const nx = point.ox + (dist > 0.001 ? (dx / dist) * push : 0);
        const ny = point.oy + (dist > 0.001 ? (dy / dist) * push : 0);

        const highlighted = point.a > 0.02;
        ctx!.beginPath();
        ctx!.arc(nx, ny, 1.1 + point.a * 2.4, 0, Math.PI * 2);
        ctx!.fillStyle = highlighted ? colors.glow : colors.base;
        ctx!.globalAlpha = highlighted ? 0.4 + point.a * 0.6 : 1;
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;
    }

    /** 动画帧循环 */
    function iGM_Loop(): void {
      iGM_Render();
      raf = window.requestAnimationFrame(iGM_Loop);
    }

    /** 指针移动：换算为画布内相对坐标 */
    function iGM_HandlePointerMove(event: PointerEvent): void {
      const rect = canvas!.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.active = true;
    }

    /** 指针离开视口：停止影响 */
    function iGM_HandlePointerLeave(): void {
      pointer.active = false;
      pointer.x = -9999;
      pointer.y = -9999;
    }

    iGM_Build();
    if (reduced) {
      iGM_Render();
    } else {
      raf = window.requestAnimationFrame(iGM_Loop);
    }

    const resizeObserver = new ResizeObserver(() => {
      iGM_Build();
      if (reduced) iGM_Render();
    });
    resizeObserver.observe(host);

    // 主题切换：重新取色并立即重绘静态降级画面
    const themeObserver = new MutationObserver(() => {
      colors = iGM_ReadColors();
      if (reduced) iGM_Render();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    window.addEventListener("pointermove", iGM_HandlePointerMove, {
      passive: true,
    });
    window.addEventListener("pointerleave", iGM_HandlePointerLeave);
    window.addEventListener("blur", iGM_HandlePointerLeave);

    return () => {
      window.cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      window.removeEventListener("pointermove", iGM_HandlePointerMove);
      window.removeEventListener("pointerleave", iGM_HandlePointerLeave);
      window.removeEventListener("blur", iGM_HandlePointerLeave);
    };
  }, [gap, radius]);

  return (
    <div ref={hostRef} className={`${styles.host} ${className}`} aria-hidden>
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
}

// 导出 //
export default iGM_DotGrid;
