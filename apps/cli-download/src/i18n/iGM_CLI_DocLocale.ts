/**
 * 文件路径：apps/cli-download/src/i18n/iGM_CLI_DocLocale.ts
 * 所属层：前端 / 国际化基础层
 * 路由：/{locale}/api、/{locale}/sdk
 * 模块：iGM_CLI_Downloader
 * 作用：API / SDK 长文文档的语言域解析——仅提供简体中文与英文两套正文
 * 内容：文档语言类型 iGM_CLI_DocLocale 与站点语言到文档语言的降级解析；
 *       繁体中文、日文、俄文统一回退英文，避免长文内容维护四份
 */

// 导入依赖 //
import type { iGM_CLI_Locale } from "./iGM_CLI_Locales";

// 类型定义 //
/** 长文文档可用语言（简体中文 / 英文） */
export type iGM_CLI_DocLocale = "zh-CN" | "en";

// 核心逻辑 //
/**
 * 解析文档语言：简体中文返回 zh-CN；
 * 其余语言（zh-TW、ja、ru）一律回退英文 en。
 */
export function iGM_CLI_ResolveDocLocale(locale: iGM_CLI_Locale): iGM_CLI_DocLocale {
  return locale === "zh-CN" ? "zh-CN" : "en";
}

// 导出 //
export default iGM_CLI_ResolveDocLocale;
