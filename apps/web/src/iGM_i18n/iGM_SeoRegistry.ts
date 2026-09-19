/**
 * 文件路径：apps/web/src/iGM_i18n/iGM_SeoRegistry.ts
 * 所属层：前端 / SEO 基础层
 * 路由：全局（供 app/sitemap.ts、app/robots.ts 构建期使用）
 * 模块：iGM_SeoRegistry
 * 作用：站点 SEO 数据注册表——站点地址、参与索引的公开页面路径与爬虫规则（模块五）
 * 内容：与后端 G_Seo 路由保持同口径；构建期静态导出 sitemap.xml / robots.txt
 *       无法访问后端，故前端内置同源数据，运行期后端数据仅供校验
 * 说明：站点地址可通过 IGM_SITE_URL 环境变量覆盖（与后端一致）
 */

// 导入依赖 //
import { iGM_Locales } from "./iGM_Locales";

// 类型定义 //
// （本文件仅包含常量，无组件）

// 核心逻辑 //
/** 站点基础地址（默认生产域名，可用 IGM_SITE_URL 覆盖） */
export const iGM_SeoSiteUrl = (
  process.env.IGM_SITE_URL ?? "https://igcraftlit.com"
).replace(/\/$/, "");

/** 参与索引的公开页面路径（不带语言前缀；管理后台与认证页不收录） */
export const iGM_SeoPublicPaths = [
  "/",
  "/G_Home",
  "/G_Community",
  "/G_Post",
  "/G_Activity",
  "/G_Resource",
  "/G_User",
  "/G_Points",
  "/G_Leaderboard",
  "/G_Badges",
  "/G_Checkin",
  "/G_Api_Health",
] as const;

/** 爬虫禁止收录的路径前缀（robots.txt 通配规则） */
export const iGM_SeoDisallowPatterns = [
  "/*/G_Admin",
  "/*/G_AdminDashboard",
  "/*/G_AdminUsers",
  "/*/G_AdminContents",
  "/*/G_AdminReports",
  "/*/G_AdminSettings",
  "/*/G_AdminMails",
  "/*/G_Auth",
  "/*/G_Settings",
  "/*/G_Notification",
  "/G_Admin",
  "/G_Auth",
] as const;

// 导出 //
export const iGM_SeoLocales = iGM_Locales;
export default {
  iGM_SeoSiteUrl,
  iGM_SeoLocales,
  iGM_SeoPublicPaths,
  iGM_SeoDisallowPatterns,
};
