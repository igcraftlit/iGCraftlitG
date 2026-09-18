/**
 * 文件路径：apps/web/next.config.ts
 * 所属层：前端 / 构建配置层
 * 路由：全局
 * 模块：iGM_NextConfig
 * 作用：Next.js 纯静态 SSG 构建配置
 * 内容：output export、图片关闭优化、构建期环境变量注入
 */

// 导入依赖 //
import type { NextConfig } from "next";

// 核心逻辑 //
const iGM_NextConfig: NextConfig = {
  // 纯静态导出：部署目标为 Cloudflare Pages，禁止任何服务端能力
  output: "export",
  // 静态导出不支持 Next 图片优化器
  images: {
    unoptimized: true,
  },
  // 构建期注入：前端版本号与构建时间（健康检查页使用）
  env: {
    NEXT_PUBLIC_IGM_VERSION: "0.1.0",
    NEXT_PUBLIC_IGM_BUILD_TIME: new Date().toISOString(),
  },
};

// 导出 //
export default iGM_NextConfig;
