/**
 * 文件路径：apps/launcher-ui/components/iGM_LauncherV2_AppearanceHost/iGM_LauncherV2_AppearanceHost.tsx
 * 所属层：前端 / 页面组件层
 * 路由：全局（各页面根容器内挂载）
 * 模块：iGM_LauncherV2_AppearanceHost
 * 作用：外观设置的运行时应用：主题色、导航栏底色与毛玻璃模糊度的实际生效点
 * 内容：订阅外壳下发的外观配置，把主题色、模糊度与导航栏底色写入 :root 的 CSS 变量，
 *       并渲染固定的深色纯色 / 静态线性渐变背景层
 * 说明：动态云（WebGL / Canvas 流体）渲染逻辑已彻底移除，全局背景固定为深色纯色，
 *       保证所有磨砂玻璃卡片在纯色底上有清晰轮廓；所有页面共用同一实例语义，
 *       因此各页面根容器内挂载本组件即可全局生效；浏览器预览（无外壳）时使用默认外观
 */

// 导入依赖 //
"use client";

import { useEffect } from "react";
import { iGM_LauncherV2_UseAppearance as IGM_LauncherV2_UseAppearance } from "@/components/iGM_LauncherV2_HostBridge/iGM_LauncherV2_HostBridge";
import {
  IGM_LAUNCHERV2_THEMES,
  iGM_LauncherV2_ResolveNavColor,
} from "@/lib/iGM_LauncherV2_Constants";
import styles from "./iGM_LauncherV2_AppearanceHost.module.css";

// 类型定义 //
export interface iGM_LauncherV2_AppearanceHostProps {
  /** 附加类名，便于页面按需调整背景层叠放次序 */
  className?: string;
}

// 核心逻辑 //

/**
 * 应用主题色、模糊度与导航栏底色到 :root。
 * 说明：主题色只改 CSS 变量，按钮与高亮色均由变量驱动，因此无需逐组件传参；
 *       导航栏底色为「默认」时移除内联变量，交由 CSS 回落到 --igm-glass 玻璃面令牌。
 */
function iGM_AppearanceApplyTokens(theme: string, blur: number, navColor: string): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const preset = IGM_LAUNCHERV2_THEMES.find((item) => item.id === theme) ?? IGM_LAUNCHERV2_THEMES[0];

  root.style.setProperty("--igm-accent", preset.accent);
  root.style.setProperty("--igm-accent-soft", preset.accentSoft);
  root.style.setProperty("--igm-brand", preset.accent);
  root.style.setProperty("--igm-brand-soft", preset.accentSoft);
  root.style.setProperty("--igm-blur", `${blur}px`);

  const nav = iGM_LauncherV2_ResolveNavColor(navColor);
  if (nav) {
    root.style.setProperty("--igm-nav", nav);
  } else {
    root.style.removeProperty("--igm-nav");
  }
}

export function iGM_LauncherV2_AppearanceHost({
  className = "",
}: iGM_LauncherV2_AppearanceHostProps) {
  const { appearance } = IGM_LauncherV2_UseAppearance();

  // 主题色、模糊度与导航栏底色实时写入 CSS 变量：改动即生效，无需等待渲染
  useEffect(() => {
    iGM_AppearanceApplyTokens(appearance.theme, appearance.blur, appearance.navColor);
  }, [appearance.theme, appearance.blur, appearance.navColor]);

  return (
    <div className={`${styles.host} ${className}`} aria-hidden="true">
      <div className={styles.solid} />
    </div>
  );
}

// 导出 //
export default iGM_LauncherV2_AppearanceHost;
