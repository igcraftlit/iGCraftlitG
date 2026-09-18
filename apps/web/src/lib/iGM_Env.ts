/**
 * 文件：apps/web/src/lib/iGM_Env.ts
 * 所属层：前端（基础服务层）
 * 路由：全局
 * 模块：iGM_Env
 * 作用：统一读取环境配置，禁止各模块散落访问 process.env
 * 内容：API 基址、前端版本号、构建时间、运行环境标识
 */
// ==================== 区块：环境配置 ====================
// NEXT_PUBLIC_APP_VERSION / NEXT_PUBLIC_BUILD_TIME 由 next.config.ts 在构建期注入
export const iGM_Env = {
  /** 后端 API 基址，默认走同源 /api 反向代理路径 */
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api',
  /** 前端版本号（来自 package.json） */
  appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0',
  /** 前端构建时间（ISO 字符串，构建期注入） */
  buildTime: process.env.NEXT_PUBLIC_BUILD_TIME ?? 'unknown',
  /** 是否生产环境 */
  isProduction: process.env.NODE_ENV === 'production',
  /** 是否开发环境 */
  isDevelopment: process.env.NODE_ENV === 'development',
} as const;

// ==================== 区块：导出 ====================
export default iGM_Env;
