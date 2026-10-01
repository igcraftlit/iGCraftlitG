/**
 * 文件路径：apps/launcher-download/src/i18n/iGM_LauncherDl_Messages.ts
 * 所属层：前端 / 国际化基础层
 * 路由：全局
 * 模块：iGM_LauncherDl_Downloader
 * 作用：静态聚合五种语言的语言包，供客户端 Provider 按语言取用
 * 内容：语言包映射表与浏览器语言匹配逻辑
 */

// 导入依赖 //
import type { iGM_LauncherDl_Locale } from "./iGM_LauncherDl_Locales";
import {
  iGM_LauncherDl_DefaultLocale,
  iGM_LauncherDl_IsLocale,
  iGM_LauncherDl_Locales,
} from "./iGM_LauncherDl_Locales";
import iGM_LauncherDl_MessagesZhCN from "../../messages/zh-CN.json";
import iGM_LauncherDl_MessagesZhTW from "../../messages/zh-TW.json";
import iGM_LauncherDl_MessagesEn from "../../messages/en.json";
import iGM_LauncherDl_MessagesJa from "../../messages/ja.json";
import iGM_LauncherDl_MessagesRu from "../../messages/ru.json";

// 类型定义 //
/** 以简体中文语言包为消息结构唯一真源，其余语言保持同构 */
export type iGM_LauncherDl_MessageShape = typeof iGM_LauncherDl_MessagesZhCN;

const iGM_LauncherDl_MessageMap: Record<
  iGM_LauncherDl_Locale,
  iGM_LauncherDl_MessageShape
> = {
  "zh-CN": iGM_LauncherDl_MessagesZhCN,
  "zh-TW": iGM_LauncherDl_MessagesZhTW,
  en: iGM_LauncherDl_MessagesEn,
  ja: iGM_LauncherDl_MessagesJa,
  ru: iGM_LauncherDl_MessagesRu,
};

// 核心逻辑 //
/** 按语言获取语言包 */
export function iGM_LauncherDl_GetMessages(
  locale: iGM_LauncherDl_Locale,
): iGM_LauncherDl_MessageShape {
  return iGM_LauncherDl_MessageMap[locale];
}

/**
 * 解析初始语言：
 * 1. 显式传入的 Cookie 值优先；
 * 2. 否则按浏览器 navigator.languages 匹配（含中文繁简前缀回退）；
 * 3. 均不匹配时回退默认语言 zh-CN。
 */
export function iGM_LauncherDl_ResolveInitialLocale(
  cookieValue?: string | null,
): iGM_LauncherDl_Locale {
  if (iGM_LauncherDl_IsLocale(cookieValue)) return cookieValue;

  if (typeof navigator !== "undefined") {
    for (const raw of navigator.languages) {
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
export default iGM_LauncherDl_MessageMap;