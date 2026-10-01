/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_WindowControls/iGM_Launcher_WindowControls.tsx
 * 所属层：前端 / 窗口控制层
 * 路由：全局（TopBar）
 * 模块：iGM_Launcher_WindowControls
 * 作用：Electrobun 桌面外壳内的最小化 / 最大化切换 / 关闭按钮
 * 内容：普通浏览器中宿主桥接不存在，组件返回 null，不影响 next dev 自检
 */

// 导入依赖 //
"use client";

import { Copy, Minus, X } from "lucide-react";
import { iGM_Launcher_UseHostBridge } from "@/components/iGM_Launcher_HostBridge/iGM_Launcher_HostBridge";
import styles from "./iGM_Launcher_WindowControls.module.css";

// 类型定义 //
/* （无额外类型） */

// 核心逻辑 //
export function iGM_Launcher_WindowControls() {
  const bridge = iGM_Launcher_UseHostBridge();

  // 桥接仅在桌面外壳内注入；浏览器开发时不渲染窗口控件
  if (!bridge) return null;

  return (
    <div className={styles.controls} aria-label="window controls">
      <button
        type="button"
        className={styles.controlButton}
        aria-label="minimize"
        onClick={() => bridge.minimize()}
      >
        <Minus size={15} strokeWidth={1.8} />
      </button>
      <button
        type="button"
        className={styles.controlButton}
        aria-label="maximize"
        onClick={() => bridge.toggleMaximize()}
      >
        <Copy size={12} strokeWidth={1.8} />
      </button>
      <button
        type="button"
        className={`${styles.controlButton} ${styles.closeButton}`}
        aria-label="close"
        onClick={() => bridge.close()}
      >
        <X size={15} strokeWidth={1.8} />
      </button>
    </div>
  );
}

// 导出 //
export default iGM_Launcher_WindowControls;
