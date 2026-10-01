/**
 * 文件路径：apps/launcher-download/src/i18n/iGM_LauncherDl_LocalePath.ts
 * 所属层：前端 / 国际化基础层
 * 路由：全局
 * 模块：iGM_LauncherDl_Downloader
 * 作用：多语言前缀路径工具（URL 前缀式多语言路由）
 * 内容：路径语言前缀拼装、剥离、语言检测
 */

// 导入依赖 //
import {
  iGM_LauncherDl_DefaultLocale,
  iGM_LauncherDl_IsLocale,
  iGM_LauncherDl_LocaleCookieName,
  iGM_LauncherDl_Locales,
  type iGM_LauncherDl_Locale,
} from "./iGM_LauncherDl_Locales";

// 类型定义 //
// （本文件仅包含纯函数，无组件）

// 核心逻辑 //
/** 剥离路径开头的语言前缀；无前缀时原样返回 */
export function iGM_LauncherDl_StripLocalePrefix(path: string): string {
  const match = path.match(/^\/(zh-CN|zh-TW|en|ja|ru)(?=\/|$)/);
  return match ? path.slice(match[0].length) || "/" : path;
}

/**
 * 为站内路径拼装当前语言前缀（幂等：已带目标语言前缀时原样返回）
 * - 非站内路径（外链、锚点、协议链接）原样返回
 * - 根路径映射为 /{locale}
 */
export function iGM_LauncherDl_LocalePath(
  path: string,
  locale: iGM_LauncherDl_Locale | string,
): string {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  const rest = iGM_LauncherDl_StripLocalePrefix(path);
  if (rest === path && path === "/") return `/${locale}`;
  return `/${locale}${rest === "/" ? "" : rest}`;
}

/** 从 Cookie 读取持久化语言（服务端渲染安全：无 document 时返回 null） */
export function iGM_LauncherDl_ReadLocaleCookieValue(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${iGM_LauncherDl_LocaleCookieName}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

/**
 * 根路径重定向语言检测：Cookie 优先，其次浏览器语言，默认 zh-CN
 */
export function iGM_LauncherDl_DetectRootLocale(): iGM_LauncherDl_Locale {
  const cookie = iGM_LauncherDl_ReadLocaleCookieValue();
  if (iGM_LauncherDl_IsLocale(cookie)) return cookie;
  if (typeof navigator !== "undefined") {
    for (const raw of navigator.languages ?? []) {
      const candidate = raw.toLowerCase();
      const matched = iGM_LauncherDl_Locales.find((locale) =>
        candidate.startsWith(locale.toLowerCase()),
      );
      if (matched) return matched;
      if (candidate.startsWith("zh-hant") || candidate.startsWith("zh-hk")) {
        return "zh-TW";
      }
      if (candidate.startsWith("zh")) return iGM_LauncherDl_DefaultLocale;
    }
  }
  return iGM_LauncherDl_DefaultLocale;
}

// 导出 //
export default iGM_LauncherDl_LocalePath;