/**
 * 文件路径：apps/web/src/iGM_Components/iGM_Format/iGM_Format.ts
 * 所属层：前端 / 通用工具层
 * 路由：G_Community、G_Post、G_User 等
 * 模块：iGM_Format
 * 作用：社区模块共享的展示格式化工具
 * 内容：ISO 时间按当前界面语言格式化、相对时间（刚刚/分钟前等）
 */

// 导入依赖 //
// （仅使用浏览器内置 Intl，无额外依赖）

// 类型定义 //
// （本文件仅导出工具函数）

// 核心逻辑 //
/** 按界面语言格式化为日期（如 2026年9月19日 / Sep 19, 2026） */
export function iGM_FormatDate(locale: string, iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

/** 按界面语言格式化为日期 + 时间 */
export function iGM_FormatDateTime(locale: string, iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/**
 * 相对时间：返回“刚刚 / n 分钟前 / n 小时前 / n 天前”，超过 7 天回退绝对日期。
 * 各语言文案由调用方通过 rtf 回调或直接使用 Intl.RelativeTimeFormat
 */
export function iGM_FormatRelative(locale: string, iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const absSeconds = Math.abs(diffSeconds);

  if (absSeconds < 60) return rtf.format(Math.round(diffSeconds), "second");
  const absMinutes = Math.round(absSeconds / 60);
  if (absMinutes < 60) return rtf.format(-absMinutes, "minute");
  const absHours = Math.round(absMinutes / 60);
  if (absHours < 24) return rtf.format(-absHours, "hour");
  const absDays = Math.round(absHours / 24);
  if (absDays < 7) return rtf.format(-absDays, "day");

  return iGM_FormatDate(locale, iso);
}

// 导出 //
export default { iGM_FormatDate, iGM_FormatDateTime, iGM_FormatRelative };
