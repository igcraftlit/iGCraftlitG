/**
 * 文件路径：apps/launcher-download/src/i18n/iGM_LauncherDl_SiteUrl.ts
 * 所属层：前端 / 站点配置层
 * 路由：全局
 * 模块：iGM_LauncherDl_Downloader
 * 作用：站点根地址常量，用于 canonical、hreflang、Open Graph 等 SEO 元数据
 * 内容：构建期可通过 IGM_LAUNCHERDL_SITE_URL 环境变量覆盖，默认生产域名
 */

// 导入依赖 //
// （本文件仅包含常量，无运行时依赖）

// 类型定义 //
// （无）

// 核心逻辑 //
/** 站点根地址（去尾斜杠）：默认 https://launcher.igcraftlit.com */
export const iGM_LauncherDl_SiteUrl = (
  process.env.IGM_LAUNCHERDL_SITE_URL ?? "https://launcher.igcraftlit.com"
).replace(/\/$/, "");

// 导出 //
export default iGM_LauncherDl_SiteUrl;