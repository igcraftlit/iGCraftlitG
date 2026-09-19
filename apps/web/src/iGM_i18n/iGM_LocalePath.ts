/**
 * 文件路径：apps/web/src/iGM_i18n/iGM_LocalePath.ts
 * 所属层：前端 / 国际化基础层
 * 路由：全局
 * 模块：iGM_LocalePath
 * 作用：多语言前缀路径工具（模块五：URL 前缀式多语言路由）
 * 内容：路径语言前缀拼装、剥离、落地页判定、语言检测
 * 说明：所有站内跳转必须经过 iGM_LocalePath / iGM_Link / iGM_UseLocaleRouter，
 *       保证链接自动携带当前语言前缀（如 /zh-CN/G_Home）
 */

// 导入依赖 //
import {
  iGM_DefaultLocale,
  iGM_IsLocale,
  iGM_LocaleCookieName,
  iGM_Locales,
  type iGM_Locale,
} from "./iGM_Locales";

// 类型定义 //
// （本文件仅包含纯函数，无组件）

// 核心逻辑 //
/** 剥离路径开头的语言前缀；无前缀时原样返回 */
export function iGM_StripLocalePrefix(path: string): string {
  const match = path.match(/^\/(zh-CN|zh-TW|en|ja|ru)(?=\/|$)/);
  return match ? path.slice(match[0].length) || "/" : path;
}

/**
 * 为站内路径拼装当前语言前缀（幂等：已带目标语言前缀时原样返回）
 * - 非站内路径（外链、锚点、协议链接）原样返回
 * - 根路径映射为 /{locale}
 */
export function iGM_LocalePath(path: string, locale: iGM_Locale | string): string {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  const rest = iGM_StripLocalePrefix(path);
  if (rest === path && path === "/") return `/${locale}`;
  return `/${locale}${rest === "/" ? "" : rest}`;
}

/**
 * 判断路径是否为落地页（无任何 G_Xxxx 段）：
 * / 与 /{locale}（如 /zh-CN）均为门户落地页，豁免控制台外壳
 */
export function iGM_IsLandingPath(pathname: string): boolean {
  return /^\/?(zh-CN|zh-TW|en|ja|ru)?\/?$/.test(pathname);
}

/** 从 Cookie 读取持久化语言（服务端渲染安全：无 document 时返回 null） */
export function iGM_ReadLocaleCookieValue(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${iGM_LocaleCookieName}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

/**
 * 根路径重定向语言检测：Cookie 优先，其次浏览器语言，默认 zh-CN
 * 仅供根路径跳转页使用（不做 React 状态，直接同步计算）
 */
export function iGM_DetectRootLocale(): iGM_Locale {
  const cookie = iGM_ReadLocaleCookieValue();
  if (iGM_IsLocale(cookie)) return cookie;
  if (typeof navigator !== "undefined") {
    for (const raw of navigator.languages ?? []) {
      const candidate = raw.toLowerCase();
      const matched = iGM_Locales.find((locale) =>
        candidate.startsWith(locale.toLowerCase()),
      );
      if (matched) return matched;
      if (candidate.startsWith("zh-hant") || candidate.startsWith("zh-hk")) {
        return "zh-TW";
      }
      if (candidate.startsWith("zh")) return iGM_DefaultLocale;
    }
  }
  return iGM_DefaultLocale;
}

// 导出 //
export default iGM_LocalePath;
