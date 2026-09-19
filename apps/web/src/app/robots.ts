/**
 * 文件路径：apps/web/src/app/robots.ts
 * 所属层：前端 / SEO（Next.js App Router 框架文件）
 * 路由：/robots.txt
 * 模块：iGM_Robots
 * 作用：构建期生成 robots.txt（模块五国际化与 SEO 完善）
 * 内容：允许全站抓取，禁止管理后台、认证与个人设置路径；
 *       声明 sitemap 地址；数据来自 iGM_SeoRegistry（与后端 G_Seo 路由同口径）
 */

// 导入依赖 //
import type { MetadataRoute } from "next";
import {
  iGM_SeoDisallowPatterns,
  iGM_SeoSiteUrl,
} from "../iGM_i18n/iGM_SeoRegistry";

// 类型定义 //
// （框架文件无自定义类型）

// 核心逻辑 //
/** 强制构建期静态生成 */
export const dynamic = "force-static";

// 导出 //
/** robots.txt：全站允许，管理后台/认证/隐私路径禁止 */
export default function iGM_Robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [...iGM_SeoDisallowPatterns],
      },
    ],
    sitemap: `${iGM_SeoSiteUrl}/sitemap.xml`,
  };
}
