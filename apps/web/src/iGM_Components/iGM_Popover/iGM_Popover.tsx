/**
 * 文件路径：apps/web/src/iGM_Components/iGM_Popover/iGM_Popover.tsx
 * 所属层：前端 / 通用组件层
 * 路由：全局
 * 模块：iGM_Popover
 * 作用：主题切换与语言切换共用的轻量弹出菜单
 * 内容：图标触发按钮、弹出面板、外部点击与 Escape 关闭
 */

// 导入依赖 //
"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import styles from "./iGM_Popover.module.css";

// 类型定义 //
interface iGM_PopoverProps {
  /** 触发按钮图标 */
  icon: LucideIcon;
  /** 无障碍标签（已翻译） */
  ariaLabel: string;
  /** 面板内容，接收关闭函数 */
  children: (close: () => void) => ReactNode;
}

// 核心逻辑 //
/** 通用弹出菜单：右侧对齐，点击外部或 Escape 关闭 */
export function iGM_Popover({
  icon: Icon,
  ariaLabel,
  children,
}: iGM_PopoverProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={styles.container}>
      <button
        type="button"
        className={styles.trigger}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <Icon size={18} strokeWidth={1.8} />
      </button>
      {open && (
        <div id={panelId} role="menu" className={styles.panel}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

// 导出 //
export default iGM_Popover;
