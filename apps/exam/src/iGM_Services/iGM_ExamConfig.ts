/**
 * 文件路径：apps/exam/src/iGM_Services/iGM_ExamConfig.ts
 * 所属层：前端 / 基础服务层
 * 路由：全局
 * 模块：iGM_ExamConfig
 * 作用：iG&M 教育考试系统子站点运行环境配置
 * 内容：后端 API 基础地址（运行时按页面域名解析）、前端版本号与构建时间
 * 说明：纯静态站点同一套产物同时部署于线上与本地，API 地址在浏览器运行时
 *       按当前页面域名决定：igcraftlit.com 走 api 子域，本地开发直连 3001
 */

// 导入依赖 //
// （本文件仅读取构建期环境变量与浏览器 location，无运行时依赖）

// 类型定义 //
export interface iGM_ExamWebConfig {
  /** 后端 API 基础地址（getter：每次读取时按当前域名解析） */
  readonly apiBase: string;
  /** 前端版本号 */
  version: string;
  /** 前端构建时间（ISO 字符串，构建期固化） */
  buildTime: string;
}

// 核心逻辑 //
/** 本地开发后端地址 */
const iGM_Exam_LocalApiBase = "http://localhost:3001";
/** 生产环境后端地址：Cloudflare 隧道映射到本机 3001 */
const iGM_Exam_ProdApiBase = "https://api.igcraftlit.com";
/** 视为生产环境的站点域名后缀 */
const iGM_Exam_ProdHostSuffix = "igcraftlit.com";

/**
 * 解析当前应使用的 API 基础地址
 * 优先级：构建期显式变量 NEXT_PUBLIC_IGM_API_BASE > 线上域名 > 本地地址
 */
export function iGM_Exam_GetApiBase(): string {
  const explicit = process.env.NEXT_PUBLIC_IGM_API_BASE?.replace(/\/$/, "");
  if (explicit) return explicit;

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === iGM_Exam_ProdHostSuffix || host.endsWith(`.${iGM_Exam_ProdHostSuffix}`)) {
      return iGM_Exam_ProdApiBase;
    }
  }
  return iGM_Exam_LocalApiBase;
}

/** iGM_ExamConfig 环境配置读取 */
export const iGM_ExamConfig: iGM_ExamWebConfig = {
  get apiBase(): string {
    return iGM_Exam_GetApiBase();
  },
  version: process.env.NEXT_PUBLIC_IGM_EXAM_VERSION ?? "0.1.0",
  buildTime: process.env.NEXT_PUBLIC_IGM_EXAM_BUILD_TIME ?? "",
};

// 导出 //
export default iGM_ExamConfig;
