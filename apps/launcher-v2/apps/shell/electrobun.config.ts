/**
 * 文件路径：apps/shell/electrobun.config.ts
 * 所属层：桌面外壳 / 构建配置层
 * 路由：全局（Electrobun/Hutch 构建期）
 * 模块：iGM_LauncherV2_ElectrobunConfig
 * 作用：Electrobun 2.x 构建描述，声明应用元信息、Bun 主进程入口与静态产物拷贝
 * 内容：主进程使用 Bun 运行时；Next.js 纯静态导出经
 *       scripts/iGM_LauncherV2_SyncUi.ts 同步到 iGM_LauncherV2_Assets/launcher，
 *       再由 build.copy 打包为 views://launcher；Rust 核心二进制同步到
 *       iGM_LauncherV2_Assets/core 并打包为包内 core 目录；
 *       Windows 图标仅在同步脚本已产出时声明（缺失不影响构建）
 */

// 导入依赖 //
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ElectrobunConfig } from "electrobun";

// 核心逻辑 //
const iGM_LauncherV2_AssetsDir = join(import.meta.dir, "iGM_LauncherV2_Assets");
const iGM_LauncherV2_IconPath = join(iGM_LauncherV2_AssetsDir, "icon.ico");

const iGM_LauncherV2_ElectrobunConfig = {
  app: {
    name: "iGM CraftCeon Launcher",
    identifier: "com.igcraftlit.launcher.v2",
    version: "26.4.0",
    description: "iGCraftLit official Minecraft launcher",
  },
  build: {
    // 主进程采用 Bun 运行时（Electrobun + Bun + Rust Sidecar）
    mainProcess: "bun",
    bun: {
      entrypoint: "src/iGM_LauncherV2_Main.ts",
      minify: false,
      sourcemap: "linked",
    },
    // 静态资源由同步脚本生成：键为项目相对源路径，值为包内目标路径
    copy: {
      "iGM_LauncherV2_Assets/launcher": "views/launcher",
      "iGM_LauncherV2_Assets/core": "core",
    },
    // Windows（WebView2）构建选项：图标待资源就绪后再声明
    win: existsSync(iGM_LauncherV2_IconPath)
      ? { icon: "iGM_LauncherV2_Assets/icon.ico" }
      : undefined,
  },
  runtime: {
    // 最后一个窗口关闭即退出应用
    exitOnLastWindowClosed: true,
  },
} satisfies ElectrobunConfig;

// 导出 //
export default iGM_LauncherV2_ElectrobunConfig;
