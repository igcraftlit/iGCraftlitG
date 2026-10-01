/**
 * 文件路径：apps/launcher-ui/i18n/iGM_Launcher_Locales.ts
 * 所属层：前端 / 国际化配置层
 * 路由：全局
 * 模块：iGM_Launcher_Locales
 * 作用：界面语言清单与语言包加载（模块一仅 zh-CN / en）
 * 内容：语言类型、默认语言、localStorage 键、静态 JSON 语言包映射
 */

// 导入依赖 //
import type { iGM_Launcher_Locale } from "@igm-launcher/shared";
import iGM_Launcher_MessagesZhCN from "./messages/zh-CN.json";
import iGM_Launcher_MessagesEn from "./messages/en.json";

// 类型定义 //
export type iGM_Launcher_Messages = typeof iGM_Launcher_MessagesZhCN;

// 核心逻辑（常量） //
export const IGM_LAUNCHER_DEFAULT_LOCALE: iGM_Launcher_Locale = "zh-CN";

export const IGM_LAUNCHER_LOCALE_LABELS: Record<iGM_Launcher_Locale, string> = {
  "zh-CN": "中文",
  en: "EN",
};

/** 语言代码到语言包的静态映射（构建期内联，纯静态导出可直接使用） */
export const IGM_LAUNCHER_MESSAGE_MAP: Record<
  iGM_Launcher_Locale,
  iGM_Launcher_Messages
> = {
  "zh-CN": iGM_Launcher_MessagesZhCN,
  en: iGM_Launcher_MessagesEn as iGM_Launcher_Messages,
};

/** 将任意浏览器语言字符串收敛为受支持语言，无法匹配时回退默认语言 */
export function iGM_Launcher_ResolveLocale(input: string | null | undefined): iGM_Launcher_Locale {
  if (!input) return IGM_LAUNCHER_DEFAULT_LOCALE;
  const normalized = input.toLowerCase();
  if (normalized.startsWith("zh")) return "zh-CN";
  if (normalized.startsWith("en")) return "en";
  return IGM_LAUNCHER_DEFAULT_LOCALE;
}

// 导出 //
export default IGM_LAUNCHER_MESSAGE_MAP;
