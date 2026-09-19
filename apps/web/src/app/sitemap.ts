/**
 * 文件路径：apps/web/src/app/sitemap.ts
 * 所属层：前端 / SEO（Next.js App Router 框架文件）
 * 路由：/sitemap.xml
 * 模块：iGM_Sitemap
 * 作用：构建期生成多语言 sitemap（模块五国际化与 SEO 完善）
 * 内容：公开页面 × 五语言组合，逐条输出 hreflang alternates；
 *       数据来自 iGM_SeoRegistry（与后端 G_Seo 路由同口径）
 * 说明：纯静态导出无后端可用，故构建期内置数据
 */

// 导入依赖 //
import type { MetadataRoute } from "next";
import {
  iGM_SeoLocales,
  iGM_SeoPublicPaths,
  iGM_SeoSiteUrl,
} from "../iGM_i18n/iGM_SeoRegistry";

// 类型定义 //
// （框架文件无自定义类型）

// 核心逻辑 //
/** 强制构建期静态生成 */
export const dynamic = "force-static";

// 导出 //
/** 多语言 sitemap：每个公开路径输出五种语言变体并互链 */
export default function iGM_Sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return iGM_SeoPublicPaths.flatMap((path) =>
    iGM_SeoLocales.map((locale) => {
      const url = `${iGM_SeoSiteUrl}/${locale}${path === "/" ? "" : path}`;
      return {
        url,
        lastModified: now,
        changeFrequency: "weekly" as const,
        priority: path === "/" ? 1 : 0.7,
        alternates: {
          languages: Object.fromEntries(
            iGM_SeoLocales.map((alt) => [
              alt,
              `${iGM_SeoSiteUrl}/${alt}${path === "/" ? "" : path}`,
            ]),
          ),
        },
      };
    }),
  );
}
