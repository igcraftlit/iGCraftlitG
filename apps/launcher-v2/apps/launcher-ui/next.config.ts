/**
 * 文件路径：apps/launcher-ui/next.config.ts
 * 所属层：前端 / 构建配置层
 * 路由：全局
 * 模块：iGM_LauncherV2_NextConfig
 * 作用：iGM CraftCeon Launcher v2 界面 Next.js 纯静态 SSG 构建配置
 * 内容：output export（Electrobun 以 views:// 精确文件路径加载）、图片关闭优化、
 *       构建期注入版本号；禁止任何服务端能力（SSR / ISR / Server Actions）
 */

// 导入依赖 //
import type { NextConfig } from "next";

// 核心逻辑 //
const iGM_LauncherV2_NextConfig: NextConfig = {
  // 纯静态导出：由 Electrobun 桌面外壳加载，禁止任何服务端能力
  output: "export",
  // 静态导出不支持 Next 图片优化器
  images: {
    unoptimized: true,
  },
  // 构建期注入：界面版本号（欢迎页与状态栏使用）
  env: {
    NEXT_PUBLIC_IGM_LAUNCHER_VERSION: "26.5.5",
  },
};

// 导出 //
export default iGM_LauncherV2_NextConfig;
