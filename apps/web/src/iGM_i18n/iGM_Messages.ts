/**
 * 文件路径：apps/web/src/iGM_i18n/iGM_Messages.ts
 * 所属层：前端 / 国际化基础层
 * 路由：全局
 * 模块：iGM_i18n
 * 作用：静态聚合五种语言的语言包，供客户端 Provider 按语言取用
 * 内容：语言包映射表与浏览器语言匹配逻辑
 */

// 导入依赖 //
import type { iGM_Locale } from "./iGM_Locales";
import { iGM_DefaultLocale, iGM_IsLocale, iGM_Locales } from "./iGM_Locales";
import iGM_MessagesZhCN from "../../messages/zh-CN.json";
import iGM_MessagesZhTW from "../../messages/zh-TW.json";
import iGM_MessagesEn from "../../messages/en.json";
import iGM_MessagesJa from "../../messages/ja.json";
import iGM_MessagesRu from "../../messages/ru.json";

// 类型定义 //
/** 以简体中文语言包为消息结构唯一真源，其余语言保持同构 */
export type iGM_MessageShape = typeof iGM_MessagesZhCN;

const iGM_MessageMap: Record<iGM_Locale, iGM_MessageShape> = {
  "zh-CN": iGM_MessagesZhCN,
  "zh-TW": iGM_MessagesZhTW,
  en: iGM_MessagesEn,
  ja: iGM_MessagesJa,
  ru: iGM_MessagesRu,
};

// 核心逻辑 //
/** 按语言获取语言包 */
export function iGM_GetMessages(locale: iGM_Locale): iGM_MessageShape {
  return iGM_MessageMap[locale];
}

/**
 * 解析初始语言：
 * 1. 显式传入的 Cookie 值优先；
 * 2. 否则按浏览器 navigator.languages 匹配（含中文繁简前缀回退）；
 * 3. 均不匹配时回退默认语言 zh-CN。
 */
export function iGM_ResolveInitialLocale(cookieValue?: string | null): iGM_Locale {
  if (iGM_IsLocale(cookieValue)) return cookieValue;

  if (typeof navigator !== "undefined") {
    for (const raw of navigator.languages) {
      const candidate = raw.toLowerCase();
      const matched = iGM_Locales.find((locale) =>
        candidate.startsWith(locale.toLowerCase()),
      );
      if (matched) return matched;

      // 繁体中文环境的前缀回退
      if (candidate.startsWith("zh-hant") || candidate.startsWith("zh-hk")) {
        return "zh-TW";
      }
      // 其余中文环境回退简体中文
      if (candidate.startsWith("zh")) return iGM_DefaultLocale;
    }
  }

  return iGM_DefaultLocale;
}

// 导出 //
export default iGM_MessageMap;
