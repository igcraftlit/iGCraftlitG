/**
 * 文件路径：apps/shell/src/iGM_LauncherV2_Appearance.ts
 * 所属层：桌面外壳 / 外观设置层
 * 路由：全局
 * 模块：iGM_LauncherV2_Appearance
 * 作用：启动器外观与主题自定义的读写
 * 内容：背景模式（动态云 / 纯色）、动态云配色（经典深紫 / 梦幻冷蓝 / 极光幻粉）、
 *       静态渐变背景方案（深邃暗黑 / 明亮浅色 / 古典深咖 / 极光幽绿）、
 *       毛玻璃模糊度（0-30px）、主题色预设标识与导航栏底色（预设透明色 / 自定义色值）；
 *       配置落盘于 launcher_data/appearance.json，启动时读取并应用
 * 说明：配色与主题色只落标识，具体色值由界面侧预设表决定，便于后续替换配色而不改外壳；
 *       默认背景为静态渐变纯色，动态云须由用户在「设置 · 外观」中手动开启
 */

// 导入依赖 //
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { iGM_LauncherV2_LauncherDataPath } from "./iGM_LauncherV2_Paths";

// 类型定义 //

/** 背景模式：动态云 / 纯色 */
export type iGM_LauncherV2_BackgroundMode = "cloud" | "solid";

/** 动态云配色方案标识 */
export type iGM_LauncherV2_CloudPalette = "purple" | "blue" | "pink";

/** 静态渐变背景方案标识 */
export type iGM_LauncherV2_SolidPalette = "dark" | "light" | "coffee" | "green";

/**
 * 导航栏底色标识：三个预设透明色 + 「默认」（跟随玻璃面令牌）；
 * 也可存放自定义 16 进制色值（形如 #1a2333），由界面侧解析。
 */
export type iGM_LauncherV2_NavColor =
  | "default"
  | "slate"
  | "navy"
  | "violet"
  | (string & {});

/** 外观持久化配置 */
export interface iGM_LauncherV2_Appearance {
  /** 背景模式：动态云 / 纯色 */
  background: iGM_LauncherV2_BackgroundMode;
  /** 动态云配色（仅 cloud 模式生效），只改背景色调，不改 UI 主题色 */
  cloud: iGM_LauncherV2_CloudPalette;
  /** 静态渐变背景方案（仅 solid 模式生效） */
  solid: iGM_LauncherV2_SolidPalette;
  /** 毛玻璃模糊度（px），取值区间 0-30 */
  blur: number;
  /** 主题色预设标识（具体色值由界面侧预设表决定） */
  theme: string;
  /** 导航栏底色：预设标识或自定义 16 进制色值，保留磨砂玻璃质感 */
  navColor: iGM_LauncherV2_NavColor;
}

/** 外观下发视图（与持久化结构一致） */
export type iGM_LauncherV2_AppearanceState = iGM_LauncherV2_Appearance;

/** 外观修改入参（浅合并，未提供的字段保持不变） */
export interface iGM_LauncherV2_AppearancePatch {
  background?: iGM_LauncherV2_BackgroundMode;
  cloud?: iGM_LauncherV2_CloudPalette;
  solid?: iGM_LauncherV2_SolidPalette;
  blur?: number;
  theme?: string;
  navColor?: iGM_LauncherV2_NavColor;
}

// 核心逻辑 //

/** 外观配置文件名（位于 launcher_data 内） */
export const IGM_LAUNCHERV2_APPEARANCE_FILE = "appearance.json";

/** 动态云配色白名单 */
const IGM_LAUNCHERV2_APPEARANCE_CLOUDS: iGM_LauncherV2_CloudPalette[] = ["purple", "blue", "pink"];

/** 纯色背景方案白名单 */
const IGM_LAUNCHERV2_APPEARANCE_SOLIDS: iGM_LauncherV2_SolidPalette[] = [
  "dark",
  "light",
  "coffee",
  "green",
];

/** 导航栏底色预设标识白名单（自定义色值走 16 进制校验分支） */
const IGM_LAUNCHERV2_APPEARANCE_NAV_PRESETS: iGM_LauncherV2_NavColor[] = [
  "default",
  "slate",
  "navy",
  "violet",
];

/** 模糊度上下限（px） */
export const IGM_LAUNCHERV2_APPEARANCE_BLUR_MIN = 0;
export const IGM_LAUNCHERV2_APPEARANCE_BLUR_MAX = 30;

/**
 * 默认外观：静态渐变纯色背景 + 靛蓝主题色 + 中等模糊度 + 默认导航栏底色。
 * 说明：默认不再启用动态云（WebGL / Canvas 粒子），改为干净专注的静态渐变，
 *       动态云仅由用户在「设置 · 外观」中手动开启。
 */
const IGM_LAUNCHERV2_APPEARANCE_DEFAULT: iGM_LauncherV2_Appearance = {
  background: "solid",
  cloud: "purple",
  solid: "dark",
  blur: 14,
  theme: "indigo",
  navColor: "default",
};

/** 当前外观缓存（Appearance 首次读取后可用） */
let iGM_LauncherV2_AppearanceCache: iGM_LauncherV2_Appearance = {
  ...IGM_LAUNCHERV2_APPEARANCE_DEFAULT,
};

/** 外观配置文件绝对路径 */
export function iGM_LauncherV2_AppearancePath(): string {
  return join(iGM_LauncherV2_LauncherDataPath(), IGM_LAUNCHERV2_APPEARANCE_FILE);
}

/** 归一化背景模式：非法值回落到默认模式 */
function iGM_AppearanceNormalizeMode(raw: unknown): iGM_LauncherV2_BackgroundMode {
  if (raw === "cloud" || raw === "solid") return raw;
  return IGM_LAUNCHERV2_APPEARANCE_DEFAULT.background;
}

/** 归一化动态云配色：非白名单值回落到默认配色 */
function iGM_AppearanceNormalizeCloud(raw: unknown): iGM_LauncherV2_CloudPalette {
  return IGM_LAUNCHERV2_APPEARANCE_CLOUDS.includes(raw as iGM_LauncherV2_CloudPalette)
    ? (raw as iGM_LauncherV2_CloudPalette)
    : IGM_LAUNCHERV2_APPEARANCE_DEFAULT.cloud;
}

/** 归一化纯色方案：非白名单值回落到默认方案 */
function iGM_AppearanceNormalizeSolid(raw: unknown): iGM_LauncherV2_SolidPalette {
  return IGM_LAUNCHERV2_APPEARANCE_SOLIDS.includes(raw as iGM_LauncherV2_SolidPalette)
    ? (raw as iGM_LauncherV2_SolidPalette)
    : IGM_LAUNCHERV2_APPEARANCE_DEFAULT.solid;
}

/** 归一化模糊度：夹在 0-30 之间并取整 */
function iGM_AppearanceNormalizeBlur(raw: unknown): number {
  const value =
    typeof raw === "number" && Number.isFinite(raw) ? raw : IGM_LAUNCHERV2_APPEARANCE_DEFAULT.blur;
  return Math.max(
    IGM_LAUNCHERV2_APPEARANCE_BLUR_MIN,
    Math.min(IGM_LAUNCHERV2_APPEARANCE_BLUR_MAX, Math.round(value)),
  );
}

/** 归一化主题标识：非空字符串才接受 */
function iGM_AppearanceNormalizeTheme(raw: unknown): string {
  return typeof raw === "string" && raw.trim()
    ? raw.trim()
    : IGM_LAUNCHERV2_APPEARANCE_DEFAULT.theme;
}

/**
 * 归一化导航栏底色：接受预设标识或 16 进制色值（#rgb / #rrggbb），
 * 其余非法值一律回落到默认（跟随玻璃面令牌）。
 */
function iGM_AppearanceNormalizeNavColor(raw: unknown): iGM_LauncherV2_NavColor {
  if (typeof raw !== "string") return IGM_LAUNCHERV2_APPEARANCE_DEFAULT.navColor;
  const value = raw.trim();
  if (IGM_LAUNCHERV2_APPEARANCE_NAV_PRESETS.includes(value)) return value;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) return value;
  return IGM_LAUNCHERV2_APPEARANCE_DEFAULT.navColor;
}

/** 写入外观配置文件 */
async function iGM_AppearanceSave(): Promise<void> {
  await mkdir(iGM_LauncherV2_LauncherDataPath(), { recursive: true });
  await writeFile(
    iGM_LauncherV2_AppearancePath(),
    JSON.stringify(iGM_LauncherV2_AppearanceCache, null, 2),
    { encoding: "utf8", mode: 0o600 },
  );
}

/** 读取外观配置（启动时调用一次；文件缺失或损坏时使用默认值） */
export async function iGM_LauncherV2_Appearance_Load(): Promise<iGM_LauncherV2_AppearanceState> {
  try {
    const text = (await readFile(iGM_LauncherV2_AppearancePath(), "utf8")).trim();
    if (text) {
      const parsed = JSON.parse(text) as Partial<iGM_LauncherV2_Appearance>;
      iGM_LauncherV2_AppearanceCache = {
        background: iGM_AppearanceNormalizeMode(parsed.background),
        cloud: iGM_AppearanceNormalizeCloud(parsed.cloud),
        solid: iGM_AppearanceNormalizeSolid(parsed.solid),
        blur: iGM_AppearanceNormalizeBlur(parsed.blur),
        theme: iGM_AppearanceNormalizeTheme(parsed.theme),
        navColor: iGM_AppearanceNormalizeNavColor(parsed.navColor),
      };
    }
  } catch {
    // 配置缺失或损坏时保持默认外观，不抛出
  }
  return { ...iGM_LauncherV2_AppearanceCache };
}

/** 当前外观视图（同步读取缓存） */
export function iGM_LauncherV2_AppearanceGet(): iGM_LauncherV2_Appearance {
  return { ...iGM_LauncherV2_AppearanceCache };
}

/** 修改外观配置并落盘，返回最新下发视图 */
export async function iGM_LauncherV2_Appearance_Set(
  patch: iGM_LauncherV2_AppearancePatch,
): Promise<iGM_LauncherV2_AppearanceState> {
  iGM_LauncherV2_AppearanceCache = {
    background:
      patch.background === undefined
        ? iGM_LauncherV2_AppearanceCache.background
        : iGM_AppearanceNormalizeMode(patch.background),
    cloud:
      patch.cloud === undefined
        ? iGM_LauncherV2_AppearanceCache.cloud
        : iGM_AppearanceNormalizeCloud(patch.cloud),
    solid:
      patch.solid === undefined
        ? iGM_LauncherV2_AppearanceCache.solid
        : iGM_AppearanceNormalizeSolid(patch.solid),
    blur:
      patch.blur === undefined
        ? iGM_LauncherV2_AppearanceCache.blur
        : iGM_AppearanceNormalizeBlur(patch.blur),
    theme:
      patch.theme === undefined
        ? iGM_LauncherV2_AppearanceCache.theme
        : iGM_AppearanceNormalizeTheme(patch.theme),
    navColor:
      patch.navColor === undefined
        ? iGM_LauncherV2_AppearanceCache.navColor
        : iGM_AppearanceNormalizeNavColor(patch.navColor),
  };
  await iGM_AppearanceSave();
  return { ...iGM_LauncherV2_AppearanceCache };
}

// 导出 //
/* （对外接口均以命名导出提供：Appearance_Load / AppearanceGet / Appearance_Set / AppearancePath） */
