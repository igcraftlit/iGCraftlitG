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
  // 模块八：用户管理规定（公开、可收录）
  "/G_UserRules",
  // 模块十五：等级展示、任务中心与用户管理规定（公开、可收录）
  // 模块十六：开发者申请页与状态页须登录后访问，不参与索引
  "/G_Levels",
  "/G_Tasks",
  "/G_UserAgreement",
  // 模块十七：Minecraft 本体版本资料库（公开、可收录）
  "/G_MinecraftVersions",
] as const;

/** 爬虫禁止收录的路径前缀（robots.txt 通配规则） */
export const iGM_SeoDisallowPatterns = [
  "/*/G_Admin",
  "/*/G_AdminDashboard",
  "/*/G_AdminUsers",
  "/*/G_AdminContents",
  "/*/G_AdminReports",
  // 模块七：认证审核管理页
  "/*/G_AdminOrgVerify",
  "/*/G_AdminSettings",
  "/*/G_AdminMails",
  "/*/G_Auth",
  "/*/G_Settings",
  "/*/G_Notification",
  // 模块七：组织认证申请、记录与详情（详情带查询参数，保守不收录）
  "/*/G_OrgVerify",
  "/*/G_OrgVerifyStatus",
  "/*/G_OrgDetails",
  "/G_Admin",
  "/G_Auth",
  // 模块十五：开发者申请与状态页（须登录，不收录）
  "/*/G_DeveloperApply",
  "/*/G_DeveloperStatus",
  // 模块十六：开发者申请审核页（须登录，不收录）
  "/*/G_DeveloperReview",
  // 模块十八：本体版本详情（带查询参数）与下载相关页面（登录态/用户私有，不收录）
  "/*/G_MinecraftVersionDetail",
  "/*/G_GameInstall",
  "/*/G_GameProgress",
  "/*/G_GameInstalled",
  "/G_Game",
] as const;

// 导出 //
export const iGM_SeoLocales = iGM_Locales;
export default {
  iGM_SeoSiteUrl,
  iGM_SeoLocales,
  iGM_SeoPublicPaths,
  iGM_SeoDisallowPatterns,
};
