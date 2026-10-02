/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Providers/iGM_Launcher_Providers.tsx
 * 所属层：前端 / Provider 层
 * 路由：全局
 * 模块：iGM_Launcher_Providers
 * 作用：聚合启动器界面客户端 Provider（明暗主题 + 语言）
 * 内容：next-themes 写入 html[data-theme]，与主站令牌选择器一致；
 *       启动时恢复玻璃预设与外观偏好（模块二十六 B）；
 *       语言仅 zh-CN / en，默认跟随系统
 */

// 导入依赖 //
"use client";

import { useEffect, type ReactNode } from "react";
import { ThemeProvider } from "next-themes";
import { IGM_LAUNCHER_THEME_STORAGE_KEY } from "@igm-launcher/shared";
import { iGM_Launcher_LocaleProvider as IGM_Launcher_LocaleProvider } from "./iGM_Launcher_LocaleProvider";
import { iGM_Launcher_StoreProvider as IGM_Launcher_StoreProvider } from "@/components/iGM_Launcher_Store/iGM_Launcher_StoreProvider";
import {
  iGM_Launcher_ApplyGlassPreset as IGM_Launcher_ApplyGlassPreset,
  iGM_Launcher_ReadGlassPreset as IGM_Launcher_ReadGlassPreset,
} from "./iGM_Launcher_Glass";
import {
  iGM_Launcher_ApplyAppearance as IGM_Launcher_ApplyAppearance,
  iGM_Launcher_LoadAppearance as IGM_Launcher_LoadAppearance,
  iGM_Launcher_ReadAppearanceFromStorage as IGM_Launcher_ReadAppearanceFromStorage,
} from "@/components/iGM_Launcher_Appearance/iGM_Launcher_AppearanceStore";

// 类型定义 //
interface iGM_Launcher_ProvidersProps {
  children: ReactNode;
}

// 核心逻辑 //
export function iGM_Launcher_Providers({ children }: iGM_Launcher_ProvidersProps) {
  // 个性化：启动时恢复已保存的玻璃背景预设到 html[data-igm-glass]
  useEffect(() => {
    IGM_Launcher_ApplyGlassPreset(IGM_Launcher_ReadGlassPreset());
    // 模块二十六 B：先用 localStorage 偏好即时应用（无闪烁），再异步从桥接取回背景图 data URL 覆写
    IGM_Launcher_ApplyAppearance(IGM_Launcher_ReadAppearanceFromStorage(), null);
    void (async () => {
      const state = await IGM_Launcher_LoadAppearance();
      IGM_Launcher_ApplyAppearance(state.prefs, state.backgroundDataUrl);
    })();
  }, []);

  return (
    <ThemeProvider
      attribute="data-theme"
      defaultTheme="system"
      enableSystem
      storageKey={IGM_LAUNCHER_THEME_STORAGE_KEY}
      disableTransitionOnChange
    >
      {/* 状态中心依赖 next-intl 语言包生成操作提示，故置于语言 Provider 之内 */}
      <IGM_Launcher_LocaleProvider>
        <IGM_Launcher_StoreProvider>{children}</IGM_Launcher_StoreProvider>
      </IGM_Launcher_LocaleProvider>
    </ThemeProvider>
  );
}

// 导出 //
export default iGM_Launcher_Providers;