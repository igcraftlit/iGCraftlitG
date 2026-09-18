/**
 * 文件路径：apps/web/src/iGM_Services/iGM_Config.ts
 * 所属层：前端 / 基础服务层
 * 路由：全局
 * 模块：iGM_Config
 * 作用：统一读取前端运行所需的环境配置
 * 内容：本地后端 API 地址、前端版本号、构建时间
 * 说明：所有 NEXT_PUBLIC_* 变量在 next.config.ts 构建期注入，纯静态可用
 */

// 导入依赖 //
// （本文件仅读取构建期环境变量，无运行时依赖）

// 类型定义 //
export interface iGM_WebConfig {
  /** 本地后端 API 基础地址，默认 http://localhost:3001 */
  apiBase: string;
  /** 前端版本号 */
  version: string;
  /** 前端构建时间（ISO 字符串，构建期固化） */
  buildTime: string;
}

// 核心逻辑 //
/** iGM_Config 环境配置读取 */
export const iGM_Config: iGM_WebConfig = {
  apiBase:
    process.env.NEXT_PUBLIC_IGM_API_BASE?.replace(/\/$/, "") ??
    "http://localhost:3001",
  version: process.env.NEXT_PUBLIC_IGM_VERSION ?? "0.1.0",
  buildTime: process.env.NEXT_PUBLIC_IGM_BUILD_TIME ?? "",
};

// 导出 //
export default iGM_Config;
