/**
 * 文件路径：apps/launcher-ui/i18n/iGM_LauncherV2_Locales.ts
 * 所属层：前端 / 国际化配置层
 * 路由：全局
 * 模块：iGM_LauncherV2_Locales
 * 作用：界面语言清单与语言包加载（简体中文 / English）
 * 内容：语言类型、默认语言、localStorage 键、内置语言包映射与语言收敛函数
 * 说明：纯静态导出场景下不使用路由前缀与中间件，
 *       语言包在构建期内联，运行时由 LocaleProvider 注入 next-intl
 */

// 导入依赖 //
import iGM_LauncherV2_MessagesZhCN from "./messages/zh-CN.json";
import iGM_LauncherV2_MessagesEn from "./messages/en.json";

// 类型定义 //

/** 受支持的界面语言：简体中文 / English */
export type iGM_LauncherV2_Locale = "zh-CN" | "en";

/** 语言包结构（以中文语言包为基准类型） */
export type iGM_LauncherV2_Messages = typeof iGM_LauncherV2_MessagesZhCN;

// 核心逻辑 //

/** 语言选择的本地持久化键 */
export const IGM_LAUNCHERV2_LOCALE_STORAGE_KEY = "iGM_LauncherV2_Locale";

/** 默认语言 */
export const IGM_LAUNCHERV2_DEFAULT_LOCALE: iGM_LauncherV2_Locale = "zh-CN";

/** 语言切换入口展示标签 */
export const IGM_LAUNCHERV2_LOCALE_LABELS: Record<iGM_LauncherV2_Locale, string> = {
  "zh-CN": "简体中文",
  en: "English",
};

/** 语言代码到语言包的静态映射（构建期内联，纯静态导出可直接使用） */
export const IGM_LAUNCHERV2_MESSAGE_MAP: Record<
  iGM_LauncherV2_Locale,
  iGM_LauncherV2_Messages
> = {
  "zh-CN": iGM_LauncherV2_MessagesZhCN,
  en: iGM_LauncherV2_MessagesEn as iGM_LauncherV2_Messages,
};

/** 将任意浏览器语言字符串收敛为受支持语言，无法匹配时回退默认语言 */
export function iGM_LauncherV2_ResolveLocale(
  input: string | null | undefined,
): iGM_LauncherV2_Locale {
  if (!input) return IGM_LAUNCHERV2_DEFAULT_LOCALE;
  const normalized = input.toLowerCase();
  if (normalized === "en" || normalized.startsWith("en")) return "en";
  if (normalized.startsWith("zh")) return "zh-CN";
  return IGM_LAUNCHERV2_DEFAULT_LOCALE;
}

// 导出 //
export default IGM_LAUNCHERV2_MESSAGE_MAP;
