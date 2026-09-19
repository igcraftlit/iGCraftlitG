/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_Seo.ts
 * 所属层：后端 / 路由层
 * 路由：/G_Seo/*
 * 模块：G_Seo
 * 作用：SEO 数据接口集合
 * 内容：sitemap 数据（站点地址、语言列表与页面路径）与 robots 数据
 * 说明：前端构建期静态导出 sitemap.xml / robots.txt 时直接内置同源数据，
 *       本路由供运行期校验与外部工具调用
 */

// 导入依赖 //
import { Elysia } from "elysia";
import { iGM_Ok } from "../iGM_Types/iGM_Response";

// 类型定义 //
// （路由层无额外类型，统一响应类型见 iGM_Types/iGM_Response.ts）

// 核心逻辑 //
/** 站点基础地址（与前端 iGM_PageMetadata 保持一致） */
const iGM_SiteUrl =
  process.env.IGM_SITE_URL ?? "https://igcraftlit.com";

/** 支持的语言前缀（与前端 iGM_Locales 保持一致） */
const iGM_Locales = ["zh-CN", "zh-TW", "en", "ja", "ru"];

/** 参与索引的公开页面路径（管理后台与认证页不收录） */
const iGM_PublicPaths = [
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
];

/** sitemap 数据 */
function iGM_HandleSitemap() {
  return iGM_Ok({
    siteUrl: iGM_SiteUrl,
    locales: iGM_Locales,
    paths: iGM_PublicPaths,
    /** 路径组装规则：/{locale}{path}，默认语言 zh-CN 亦有前缀 */
    updatedAt: new Date().toISOString(),
  });
}

/** robots 数据 */
function iGM_HandleRobots() {
  return iGM_Ok({
    siteUrl: iGM_SiteUrl,
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/G_Admin*",
          "/G_Auth*",
          "/G_AdminDashboard*",
          "/G_AdminUsers*",
          "/G_AdminContents*",
          "/G_AdminReports*",
          "/G_AdminSettings*",
          "/G_AdminMails*",
        ],
      },
    ],
    sitemap: `${iGM_SiteUrl}/sitemap.xml`,
  });
}

/**
 * G_Seo SEO 数据路由集合：公开只读
 */
export const G_Seo = new Elysia({ name: "G_Seo" })
  .get("/G_Seo/sitemap", iGM_HandleSitemap as never)
  .get("/G_Seo/robots", iGM_HandleRobots as never);

// 导出 //
export default G_Seo;
