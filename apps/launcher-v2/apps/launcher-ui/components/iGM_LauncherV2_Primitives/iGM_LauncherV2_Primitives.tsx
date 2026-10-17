/**
 * 文件路径：apps/launcher-ui/components/iGM_LauncherV2_Primitives/iGM_LauncherV2_Primitives.tsx
 * 所属层：前端 / 基础组件层
 * 路由：全局
 * 模块：iGM_LauncherV2_Primitives
 * 作用：启动器界面的最小基础组件集合（无边框窗口标题栏、按钮、卡片、状态标记）
 * 内容：WindowChrome 提供拖动区与原生窗口控制；Button / Card / StatusDot 为
 *       各页面复用的简约组件；全部使用 lucide-react 图标，不使用 emoji 与装饰符号
 */

// 导入依赖 //
"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Minus, Square, X } from "lucide-react";
import { iGM_LauncherV2_WindowControls } from "@/components/iGM_LauncherV2_HostBridge/iGM_LauncherV2_HostBridge";
import styles from "./iGM_LauncherV2_Primitives.module.css";

// 类型定义 //
export interface iGM_LauncherV2_ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  /** 视觉层级：主操作 / 次操作 / 幽灵按钮 */
  variant?: "primary" | "secondary" | "ghost";
  /** 可选前置图标 */
  icon?: ReactNode;
  /** 追加类名 */
  className?: string;
}

export interface iGM_LauncherV2_WindowChromeProps {
  /** 标题栏左侧品牌名 */
  label: string;
  /** 标题栏右侧版本号 */
  version?: string;
}

// 核心逻辑 //

/**
 * 无边框窗口标题栏：左侧品牌信息，右侧最小化 / 最大化切换 / 关闭。
 * 整条标题栏为拖动区（igm-drag），按钮显式声明 igm-no-drag 以保证可点击。
 */
export function iGM_LauncherV2_WindowChrome({
  label,
  version,
}: iGM_LauncherV2_WindowChromeProps) {
  return (
    <header className={`${styles.chrome} igm-drag`}>
      <div className={styles.chromeLeft}>
        <span className={styles.brand}>{label}</span>
        {version ? <span className={styles.version}>{version}</span> : null}
      </div>
      <div className={`${styles.controls} igm-no-drag`}>
        <button
          type="button"
          className={styles.controlButton}
          aria-label="最小化"
          onClick={() => iGM_LauncherV2_WindowControls.minimize()}
        >
          <Minus size={14} strokeWidth={2} />
        </button>
        <button
          type="button"
          className={styles.controlButton}
          aria-label="最大化或还原"
          onClick={() => iGM_LauncherV2_WindowControls.toggleMaximize()}
        >
          <Square size={12} strokeWidth={2} />
        </button>
        <button
          type="button"
          className={`${styles.controlButton} ${styles.controlClose}`}
          aria-label="关闭"
          onClick={() => iGM_LauncherV2_WindowControls.close()}
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>
    </header>
  );
}

/** 简约按钮：主操作使用品牌渐变，其余使用极简描边或纯文字 */
export function iGM_LauncherV2_Button({
  variant = "primary",
  icon,
  className = "",
  children,
  ...rest
}: iGM_LauncherV2_ButtonProps) {
  return (
    <button
      type="button"
      className={`${styles.button} ${styles[variant]} ${className}`}
      {...rest}
    >
      {icon ? <span className={styles.buttonIcon}>{icon}</span> : null}
      <span>{children}</span>
    </button>
  );
}

/** 玻璃拟态卡片：承载内容区块，保持通透与克制 */
export function iGM_LauncherV2_Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`${styles.card} ${className}`}>{children}</section>;
}

/** 状态标记：小圆点 + 文案，用于核心连通性与登录状态 */
export function iGM_LauncherV2_StatusDot({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "idle";
  children: ReactNode;
}) {
  return (
    <span className={`${styles.status} ${styles[`status${tone}`]}`}>
      <i className={styles.statusDot} aria-hidden />
      <span>{children}</span>
    </span>
  );
}

// 导出 //
/* 组件均已在上方命名导出 */
