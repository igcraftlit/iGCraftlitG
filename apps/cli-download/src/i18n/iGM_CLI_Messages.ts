/**
 * 文件路径：apps/cli-download/src/i18n/iGM_CLI_Messages.ts
 * 所属层：前端 / 国际化基础层
 * 路由：全局
 * 模块：iGM_CLI_Downloader
 * 作用：静态聚合五种语言的语言包，供客户端 Provider 按语言取用
 * 内容：语言包映射表与浏览器语言匹配逻辑
 */

// 导入依赖 //
import type { iGM_CLI_Locale } from "./iGM_CLI_Locales";
import { iGM_CLI_DefaultLocale, iGM_CLI_IsLocale, iGM_CLI_Locales } from "./iGM_CLI_Locales";
import iGM_CLI_MessagesZhCN from "../../messages/zh-CN.json";
import iGM_CLI_MessagesZhTW from "../../messages/zh-TW.json";
import iGM_CLI_MessagesEn from "../../messages/en.json";
import iGM_CLI_MessagesJa from "../../messages/ja.json";
import iGM_CLI_MessagesRu from "../../messages/ru.json";

// 类型定义 //
/** 以简体中文语言包为消息结构唯一真源，其余语言保持同构 */
export type iGM_CLI_MessageShape = typeof iGM_CLI_MessagesZhCN;

const iGM_CLI_MessageMap: Record<iGM_CLI_Locale, iGM_CLI_MessageShape> = {
  "zh-CN": iGM_CLI_MessagesZhCN,
  "zh-TW": iGM_CLI_MessagesZhTW,
  en: iGM_CLI_MessagesEn,
  ja: iGM_CLI_MessagesJa,
  ru: iGM_CLI_MessagesRu,
};

// 核心逻辑 //
/** 按语言获取语言包 */
export function iGM_CLI_GetMessages(locale: iGM_CLI_Locale): iGM_CLI_MessageShape {
  return iGM_CLI_MessageMap[locale];
}

/**
 * 解析初始语言：
 * 1. 显式传入的 Cookie 值优先；
 * 2. 否则按浏览器 navigator.languages 匹配（含中文繁简前缀回退）；
 * 3. 均不匹配时回退默认语言 zh-CN。
 */
export function iGM_CLI_ResolveInitialLocale(cookieValue?: string | null): iGM_CLI_Locale {
  if (iGM_CLI_IsLocale(cookieValue)) return cookieValue;

  if (typeof navigator !== "undefined") {
    for (const raw of navigator.languages) {
      const candidate = raw.toLowerCase();
      const matched = iGM_CLI_Locales.find((locale) =>
        candidate.startsWith(locale.toLowerCase()),
      );
      if (matched) return matched;

      if (candidate.startsWith("zh-hant") || candidate.startsWith("zh-hk")) {
        return "zh-TW";
      }
      if (candidate.startsWith("zh")) return iGM_CLI_DefaultLocale;
    }
  }

  return iGM_CLI_DefaultLocale;
}

// 导出 //
export default iGM_CLI_MessageMap;
