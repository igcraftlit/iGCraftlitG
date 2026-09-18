/**
 * 文件：apps/web/next.config.ts
 * 所属层：前端（构建配置）
 * 路由：全局
 * 模块：iGM_NextConfig
 * 作用：Next.js 构建配置，接入 next-intl 插件并在构建期注入版本号与构建时间
 * 内容：next-intl 插件初始化、NEXT_PUBLIC_APP_VERSION / NEXT_PUBLIC_BUILD_TIME 环境变量注入
 */
// ==================== 区块：导入依赖 ====================
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { readFileSync } from 'node:fs';

// ==================== 区块：构建期常量 ====================
// 读取 package.json 版本号，作为前端版本号来源
const iGM_Pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

// next-intl 插件，指定 i18n 请求配置文件路径
const withNextIntl = createNextIntlPlugin('./src/i18n/iGM_RequestConfig.ts');

// ==================== 区块：Next.js 配置 ====================
const nextConfig: NextConfig = {
  // 构建期静态注入：健康检查页读取前端版本号与构建时间
  env: {
    NEXT_PUBLIC_APP_VERSION: iGM_Pkg.version,
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
  },
};

// ==================== 区块：导出 ====================
export default withNextIntl(nextConfig);
