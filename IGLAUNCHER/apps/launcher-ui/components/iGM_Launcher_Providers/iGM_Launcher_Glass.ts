/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Providers/iGM_Launcher_Glass.ts
 * 所属层：前端 / Provider 层工具
 * 路由：全局
 * 模块：iGM_Launcher_Glass
 * 作用：读写启动器「透明玻璃色背景」个性化预设
 * 内容：从 localStorage 读取预设、写入（或移除）html[data-igm-glass]，
 *       供 Providers 启动恢复与设置页切换共用；仅启动器端使用
 */

// 导入依赖 //
import {
  IGM_LAUNCHER_GLASS_PRESETS,
  IGM_LAUNCHER_GLASS_STORAGE_KEY,
  type iGM_Launcher_GlassPreset,
} from "@igm-launcher/shared";

// 类型定义 //
/** 玻璃预设属性名（写入 html 数据集） */
const IGM_LAUNCHER_GLASS_ATTRIBUTE = "igmGlass";

// 核心逻辑 //
/** 校验任意值是否为合法预设，非法一律回退 none */
export function iGM_Launcher_NormalizeGlassPreset(value: unknown): iGM_Launcher_GlassPreset {
  const list: readonly string[] = IGM_LAUNCHER_GLASS_PRESETS;
  return typeof value === "string" && list.includes(value)
    ? (value as iGM_Launcher_GlassPreset)
    : "none";
}

/** 读取已保存的玻璃预设，未设置或环境不可用时返回 none */
export function iGM_Launcher_ReadGlassPreset(): iGM_Launcher_GlassPreset {
  if (typeof window === "undefined") return "none";
  return iGM_Launcher_NormalizeGlassPreset(
    window.localStorage.getItem(IGM_LAUNCHER_GLASS_STORAGE_KEY),
  );
}

/** 将预设写入 DOM（none 时移除属性，回到跟随主题的默认底色） */
export function iGM_Launcher_ApplyGlassPreset(preset: unknown): iGM_Launcher_GlassPreset {
  const normalized = iGM_Launcher_NormalizeGlassPreset(preset);
  if (typeof document === "undefined") return normalized;
  const root = document.documentElement;
  if (normalized === "none") {
    delete root.dataset[IGM_LAUNCHER_GLASS_ATTRIBUTE];
  } else {
    root.dataset[IGM_LAUNCHER_GLASS_ATTRIBUTE] = normalized;
  }
  return normalized;
}

/** 保存预设到 localStorage 并立即应用 */
export function iGM_Launcher_SaveGlassPreset(preset: unknown): iGM_Launcher_GlassPreset {
  const normalized = iGM_Launcher_ApplyGlassPreset(preset);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(IGM_LAUNCHER_GLASS_STORAGE_KEY, normalized);
  }
  return normalized;
}

// 导出 //
export { IGM_LAUNCHER_GLASS_STORAGE_KEY };