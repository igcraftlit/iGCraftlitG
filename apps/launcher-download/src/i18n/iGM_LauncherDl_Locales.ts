/**
 * 文件路径：apps/launcher-download/src/i18n/iGM_LauncherDl_Locales.ts
 * 所属层：前端 / 国际化基础层
 * 路由：全局
 * 模块：iGM_LauncherDl_Downloader
 * 作用：定义 iGM CraftCeon Launcher 下载站支持的语言列表、默认语言与语言持久化 Cookie 名称
 * 内容：zh-CN、zh-TW、en、ja、ru 五种语言常量
 */

// 导入依赖 //
// （本文件仅包含常量与类型，无运行时依赖）

// 类型定义 //
export const iGM_LauncherDl_Locales = ["zh-CN", "zh-TW", "en", "ja", "ru"] as const;
export type iGM_LauncherDl_Locale = (typeof iGM_LauncherDl_Locales)[number];

// 核心逻辑 //
/** 默认语言：简体中文 */
export const iGM_LauncherDl_DefaultLocale: iGM_LauncherDl_Locale = "zh-CN";

/** 语言选择持久化 Cookie 名称 */
export const iGM_LauncherDl_LocaleCookieName = "iGM_LauncherDl_LOCALE";

/** Cookie 有效期（一年） */
export const iGM_LauncherDl_LocaleCookieMaxAge = 60 * 60 * 24 * 365;

/** 全局默认时区（IANA）：纯静态导出需要保持日期渲染一致 */
export const iGM_LauncherDl_DefaultTimeZone = "Asia/Shanghai";

/** 判断未知字符串是否为受支持的语言 */
export function iGM_LauncherDl_IsLocale(
  value: string | null | undefined,
): value is iGM_LauncherDl_Locale {
  return iGM_LauncherDl_Locales.includes(value as iGM_LauncherDl_Locale);
}

// 导出 //
export default iGM_LauncherDl_Locales;