/**
 * 文件路径：apps/launcher-ui/next.config.ts
 * 所属层：前端 / 构建配置层
 * 路由：全局
 * 模块：iGM_Launcher_NextConfig
 * 作用：iGM Launcher 界面 Next.js 纯静态 SSG 构建配置
 * 内容：output export（只产出一个入口页）、图片关闭优化、构建期版本号注入；
 *       界面为 SPA 单页，页面切换由客户端状态完成，故不再使用目录式多页路由
 */

// 导入依赖 //
import type { NextConfig } from "next";

// 核心逻辑 //
const iGM_Launcher_NextConfig: NextConfig = {
  // 纯静态导出：由 Electrobun 桌面外壳加载，禁止任何服务端能力
  output: "export",
  // 工作区共享包以 TS 源码发布，需交由 Next 转译
  transpilePackages: ["@igm-launcher/shared"],
  // 静态导出不支持 Next 图片优化器
  images: {
    unoptimized: true,
  },
  // 构建期注入：界面版本号（状态栏与关于页使用）
  env: {
    NEXT_PUBLIC_IGM_LAUNCHER_VERSION: "26.3.0 official version",
  },
};

// 导出 //
export default iGM_Launcher_NextConfig;
