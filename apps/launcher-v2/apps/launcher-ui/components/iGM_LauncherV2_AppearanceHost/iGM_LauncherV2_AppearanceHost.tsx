/**
 * 文件路径：apps/launcher-ui/components/iGM_LauncherV2_AppearanceHost/iGM_LauncherV2_AppearanceHost.tsx
 * 所属层：前端 / 页面组件层
 * 路由：全局（各页面根容器内挂载）
 * 模块：iGM_LauncherV2_AppearanceHost
 * 作用：外观设置的运行时应用：背景模式、主题色与毛玻璃模糊度的实际生效点
 * 内容：订阅外壳下发的外观配置，把主题色与模糊度写入 :root 的 CSS 变量，
 *       并按背景模式渲染背景层——动态云背景（按配色方案传入流体云组件）、
 *       纯色背景（四种方案，浅色方案同时把根节点标记 data-bg-theme="light"，
 *       由全局样式把文字与面板令牌切换为深色，保证对比度）
 * 说明：所有页面共用同一实例语义，因此各页面根容器内挂载本组件即可全局生效；
 *       浏览器预览（无外壳）时使用默认外观，不影响界面预览
 */

// 导入依赖 //
"use client";

import { useEffect } from "react";
import { iGM_LauncherV2_FluidBackground as IGM_LauncherV2_FluidBackground } from "@/components/iGM_LauncherV2_FluidBackground/iGM_LauncherV2_FluidBackground";
import { iGM_LauncherV2_UseAppearance as IGM_LauncherV2_UseAppearance } from "@/components/iGM_LauncherV2_HostBridge/iGM_LauncherV2_HostBridge";
import {
  IGM_LAUNCHERV2_SOLID_PALETTES,
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

/**
 * 切换明暗令牌：浅色纯色背景时标记 data-bg-theme="light"，
 * 由 iGM_Globals.css 中的同名选择器把文字 / 面板 / 边框令牌整体翻转为深色系。
 * 逐组件写死颜色容易遗漏，因此统一在变量层切换。
 */
function iGM_AppearanceApplyTheme(light: boolean): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.bgTheme = light ? "light" : "dark";
}

export function iGM_LauncherV2_AppearanceHost({
  className = "",
}: iGM_LauncherV2_AppearanceHostProps) {
  const { appearance } = IGM_LauncherV2_UseAppearance();
  const solid = IGM_LAUNCHERV2_SOLID_PALETTES.find((item) => item.id === appearance.solid);
  const light = appearance.background === "solid" && Boolean(solid?.light);

  // 主题色、模糊度与导航栏底色实时写入 CSS 变量：改动即生效，无需等待渲染
  useEffect(() => {
    iGM_AppearanceApplyTokens(appearance.theme, appearance.blur, appearance.navColor);
  }, [appearance.theme, appearance.blur, appearance.navColor]);

  // 明暗令牌随背景方案切换：浅色纯色背景自动转深色文字
  useEffect(() => {
    iGM_AppearanceApplyTheme(light);
  }, [light]);

  return (
    <div className={`${styles.host} ${className}`} aria-hidden="true">
      {appearance.background === "cloud" ? (
        <IGM_LauncherV2_FluidBackground palette={appearance.cloud} />
      ) : null}
      {appearance.background === "solid" ? (
        <div
          className={styles.solid}
          style={{ background: solid?.preview ?? "#05070f" }}
        />
      ) : null}
    </div>
  );
}

// 导出 //
export default iGM_LauncherV2_AppearanceHost;
