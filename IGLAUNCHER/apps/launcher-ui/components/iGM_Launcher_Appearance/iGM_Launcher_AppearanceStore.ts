/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Appearance/iGM_Launcher_AppearanceStore.ts
 * 所属层：前端 / 外观偏好层
 * 路由：全局（外观页与 Providers 共用）
 * 模块：iGM_Launcher_AppearanceStore
 * 作用：管理主题预设 / 自定义主色 / 背景图相对路径 / 模糊强度，
 *       并把偏好应用为 html 数据集与内联 CSS 变量
 * 内容：持久化走后端桥接 JSON（IGM_LAUNCHER_DATA_ROOT/appearance/appearance.json），
 *       浏览器预览回退 localStorage；图片本体不进 localStorage，只存相对路径，
 *       由主进程读回 data URL 后再写入 --igm-launcher-bg-image
 *
 * 说明：主题预设写入 html[data-igm-theme-preset]，与 next-themes 的 data-theme
 *       并行且互不冲突（system 时移除该属性，回落为随系统的明暗主题）；
 *       自定义主色覆写 --igm-accent 系列（含 hover/contrast/soft 派生值）。
 */

// 导入依赖 //
import {
  IGM_LAUNCHER_APPEARANCE_STORAGE_KEY,
  IGM_LAUNCHER_BG_BLUR_MAX,
  iGM_Launcher_NormalizeAppearance,
  type iGM_Launcher_AppearancePrefs,
} from "@igm-launcher/shared";
import { iGM_Launcher_BridgeCall as IGM_Launcher_BridgeCall } from "@/components/iGM_Launcher_Bridge/iGM_Launcher_BridgeClient";

// 类型定义 //
/** 自定义主色派生出的完整强调色变量集合 */
interface iGM_Launcher_AccentVars {
  accent: string;
  hover: string;
  contrast: string;
  soft: string;
}

/** 外观页 / Providers 恢复所需的数据包 */
export interface iGM_Launcher_AppearanceState {
  prefs: iGM_Launcher_AppearancePrefs;
  /** 背景图 data URL（浏览器回退层恒为 null，图片本体不落 localStorage） */
  backgroundDataUrl: string | null;
}

// 核心逻辑 //

/* ---- DOM 属性名 ---- */

/** 主题预设数据集键（写入 html[data-igm-theme-preset]） */
const IGM_LAUNCHER_THEME_PRESET_ATTRIBUTE = "igmThemePreset";

/** 背景图存在标记数据集键（写入 html[data-igm-bg="image"]，供全局样式切换半透明面板） */
const IGM_LAUNCHER_BG_ATTRIBUTE = "igmBg";

/* ---- 颜色派生 ---- */

/** 解析 #rrggbb 为 rgb 分量，非法返回 null */
function iGM_Launcher_ParseHex(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) return null;
  const value = Number.parseInt(match[1], 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function iGM_Launcher_ToHex(r: number, g: number, b: number): string {
  const toPair = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${toPair(r)}${toPair(g)}${toPair(b)}`;
}

/** 按比例混向黑（amount 为负）或白（amount 为正），amount 取值 -1..1 */
function iGM_Launcher_Shade(hex: string, amount: number): string {
  const rgb = iGM_Launcher_ParseHex(hex);
  if (!rgb) return hex;
  const target = amount >= 0 ? 255 : 0;
  const ratio = Math.abs(amount);
  return iGM_Launcher_ToHex(
    rgb.r + (target - rgb.r) * ratio,
    rgb.g + (target - rgb.g) * ratio,
    rgb.b + (target - rgb.b) * ratio,
  );
}

/** 相对亮度（0-1），用于选取前景对比色 */
function iGM_Launcher_Luminance(hex: string): number {
  const rgb = iGM_Launcher_ParseHex(hex);
  if (!rgb) return 0;
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** 由自定义主色派生 accent / hover / contrast / soft */
export function iGM_Launcher_DeriveAccentVars(hex: string): iGM_Launcher_AccentVars {
  const rgb = iGM_Launcher_ParseHex(hex) ?? { r: 37, g: 99, b: 235 };
  const luminance = iGM_Launcher_Luminance(hex);
  return {
    accent: iGM_Launcher_ToHex(rgb.r, rgb.g, rgb.b),
    // 深色主色提亮作 hover，浅色主色压暗作 hover，保证悬停始终可见
    hover: iGM_Launcher_Shade(hex, luminance > 0.5 ? -0.16 : 0.18),
    contrast: luminance > 0.55 ? "#18181b" : "#ffffff",
    soft: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.14)`,
  };
}

/* ---- localStorage 回退 ---- */

/** 从 localStorage 读取外观偏好，缺失或解析失败时返回默认值 */
export function iGM_Launcher_ReadAppearanceFromStorage(): iGM_Launcher_AppearancePrefs {
  if (typeof window === "undefined") return iGM_Launcher_NormalizeAppearance(null);
  try {
    const raw = window.localStorage.getItem(IGM_LAUNCHER_APPEARANCE_STORAGE_KEY);
    if (!raw) return iGM_Launcher_NormalizeAppearance(null);
    return iGM_Launcher_NormalizeAppearance(JSON.parse(raw));
  } catch {
    return iGM_Launcher_NormalizeAppearance(null);
  }
}

/** 写入 localStorage（仅偏好，不含图片本体） */
export function iGM_Launcher_SaveAppearanceToStorage(prefs: iGM_Launcher_AppearancePrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(IGM_LAUNCHER_APPEARANCE_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // 忽略写入失败（隐私模式等），界面仍以内存状态工作
  }
}

/* ---- 应用为 DOM 属性 / 内联变量 ---- */

/**
 * 把外观偏好应用到 DOM：
 * 1) 主题预设写 html[data-igm-theme-preset]；
 * 2) 自定义主色覆写 --igm-accent 系列（null 时移除，回落预设主题色）；
 * 3) 背景图与模糊写 --igm-launcher-bg-image / --igm-launcher-bg-blur；
 * 4) 有背景图时置 html[data-igm-bg="image"]，全局样式据此让面板半透明并加 backdrop-filter。
 */
export function iGM_Launcher_ApplyAppearance(
  prefsInput: unknown,
  backgroundDataUrl: string | null = null,
): iGM_Launcher_AppearancePrefs {
  const prefs = iGM_Launcher_NormalizeAppearance(prefsInput);
  if (typeof document === "undefined") return prefs;
  const root = document.documentElement;

  // 主题预设：system 表示跟随系统明暗，移除属性回落 next-themes 的 data-theme
  if (prefs.themePreset === "system") {
    delete root.dataset[IGM_LAUNCHER_THEME_PRESET_ATTRIBUTE];
  } else {
    root.dataset[IGM_LAUNCHER_THEME_PRESET_ATTRIBUTE] = prefs.themePreset;
  }

  // 自定义主色
  const accentKeys = ["--igm-accent", "--igm-accent-hover", "--igm-accent-contrast", "--igm-accent-soft"];
  if (prefs.accentColor) {
    const vars = iGM_Launcher_DeriveAccentVars(prefs.accentColor);
    root.style.setProperty("--igm-accent", vars.accent);
    root.style.setProperty("--igm-accent-hover", vars.hover);
    root.style.setProperty("--igm-accent-contrast", vars.contrast);
    root.style.setProperty("--igm-accent-soft", vars.soft);
  } else {
    accentKeys.forEach((key) => root.style.removeProperty(key));
  }

  // 背景图 + 模糊
  root.style.setProperty("--igm-launcher-bg-blur", `${prefs.backgroundBlur}px`);
  if (backgroundDataUrl) {
    root.style.setProperty("--igm-launcher-bg-image", `url("${backgroundDataUrl}")`);
    root.dataset[IGM_LAUNCHER_BG_ATTRIBUTE] = "image";
  } else {
    root.style.removeProperty("--igm-launcher-bg-image");
    delete root.dataset[IGM_LAUNCHER_BG_ATTRIBUTE];
  }

  return prefs;
}

/* ---- 桥接读写 ---- */

/** 从后端桥接读取外观偏好与背景图 data URL，失败时回退 localStorage */
export async function iGM_Launcher_LoadAppearance(): Promise<iGM_Launcher_AppearanceState> {
  try {
    const response = await IGM_Launcher_BridgeCall("appearance:get");
    if (response.success && response.data) {
      return {
        prefs: iGM_Launcher_NormalizeAppearance(response.data.appearance),
        backgroundDataUrl: response.data.backgroundDataUrl ?? null,
      };
    }
  } catch {
    // 桥接不可用时回退本地存储
  }
  return { prefs: iGM_Launcher_ReadAppearanceFromStorage(), backgroundDataUrl: null };
}

/** 保存外观偏好：先写 localStorage（即时预览），再经桥接落盘 JSON */
export async function iGM_Launcher_PersistAppearance(
  prefs: iGM_Launcher_AppearancePrefs,
): Promise<iGM_Launcher_AppearancePrefs> {
  iGM_Launcher_SaveAppearanceToStorage(prefs);
  try {
    const response = await IGM_Launcher_BridgeCall("appearance:save", { appearance: prefs });
    if (response.success && response.data) {
      return iGM_Launcher_NormalizeAppearance(response.data.appearance);
    }
  } catch {
    // 忽略桥接失败，本地存储已生效
  }
  return prefs;
}

/** 模糊强度上限再导出，供外观页滑块使用 */
export { IGM_LAUNCHER_BG_BLUR_MAX as IGM_LAUNCHER_APPEARANCE_BLUR_MAX };

// 导出 //
export default iGM_Launcher_LoadAppearance;