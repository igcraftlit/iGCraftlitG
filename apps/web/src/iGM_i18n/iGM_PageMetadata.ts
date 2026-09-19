/**
 * 文件路径：apps/web/src/iGM_i18n/iGM_PageMetadata.ts
 * 所属层：前端 / SEO 基础层
 * 路由：全局（供各页面 generateMetadata 调用）
 * 模块：iGM_PageMetadata
 * 作用：按语言与页面键组装页面级元数据（模块五国际化与 SEO 完善）
 * 内容：标题（经布局模板自动附加站名）、描述、canonical、
 *       Open Graph（含 per-locale hreflang 互链）
 * 说明：页面壳文件中以固定写法调用：
 *       export async function generateMetadata({ params }) {
 *         const { locale } = await params;
 *         return iGM_BuildPageMetadata({ locale, messageKey: "pages.community", path: "/G_Community" });
 *       }
 */

// 导入依赖 //
import type { Metadata } from "next";
import { iGM_GetMessages } from "./iGM_Messages";
import { iGM_IsLocale, iGM_Locales, type iGM_Locale } from "./iGM_Locales";
import { iGM_SeoSiteUrl } from "./iGM_SeoRegistry";

// 类型定义 //
export interface iGM_PageSeoInput {
  /** 路由段语言（未识别时回退默认语言） */
  locale: string;
  /** 语言包键：pages 段下的键名（如 "community"） */
  messageKey: string;
  /** 页面规范路径（不带语言前缀，如 "/G_Community"；根页传 "/"） */
  path: string;
}

// 核心逻辑 //
/** 从语言包 pages 段读取页面标题与描述（键缺失时回退站点口号） */
function iGM_ResolvePageCopy(
  locale: iGM_Locale,
  messageKey: string,
): { title: string; description: string } {
  const messages = iGM_GetMessages(locale) as unknown as {
    pages?: Record<string, { title?: string; description?: string }>;
    site: { name: string; tagline: string };
  };
  // 允许 "community" 与 "pages.community" 两种写法
  const key = messageKey.replace(/^pages\./, "");
  const page = messages.pages?.[key];
  return {
    title: page?.title ?? messages.site.tagline,
    description: page?.description ?? messages.site.tagline,
  };
}

/** 组装页面级元数据 */
export function iGM_BuildPageMetadata(input: iGM_PageSeoInput): Metadata {
  const locale = iGM_IsLocale(input.locale) ? input.locale : "zh-CN";
  const { title, description } = iGM_ResolvePageCopy(locale, input.messageKey);
  const base = iGM_SeoSiteUrl;
  const canonical = `${base}/${locale}${input.path === "/" ? "" : input.path}`;

  const languages = Object.fromEntries(
    iGM_Locales.map((item) => [
      item,
      `${base}/${item}${input.path === "/" ? "" : input.path}`,
    ]),
  );

  return {
    title,
    description,
    alternates: {
      canonical,
      languages: { ...languages, "x-default": `${base}/` },
    },
    openGraph: {
      type: "website",
      siteName: iGM_GetMessages(locale).site.name,
      title,
      description,
      locale,
      url: canonical,
    },
  };
}

// 导出 //
export default iGM_BuildPageMetadata;
