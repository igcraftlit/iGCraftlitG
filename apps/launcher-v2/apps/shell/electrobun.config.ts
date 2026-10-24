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
 *       公开配置（client_id 等）同步到 iGM_LauncherV2_Assets/iGM_LauncherV2_Config.env
 *       并打包到主进程同级目录，供主进程在打包环境下读取；
 *       Windows 应用图标取自 iGM_LauncherV2_Assets/iGM_LauncherV2_Icon.ico
 *       （多尺寸 ICO，窗口左上角与任务栏共用；缺失时不影响构建）
 */

// 导入依赖 //
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ElectrobunConfig } from "electrobun";

// 核心逻辑 //
const iGM_LauncherV2_AssetsDir = join(import.meta.dir, "iGM_LauncherV2_Assets");
const iGM_LauncherV2_IconPath = join(iGM_LauncherV2_AssetsDir, "iGM_LauncherV2_Icon.ico");

const iGM_LauncherV2_ElectrobunConfig = {
  app: {
    name: "iGM CraftCeon Launcher",
    identifier: "com.igcraftlit.launcher.v2",
    version: "26.5.7",
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
      // 公开配置落在主进程（bun/）上一级，即 Resources/app 根，便于 import.meta.dir 定位
      "iGM_LauncherV2_Assets/iGM_LauncherV2_Config.env": "iGM_LauncherV2_Config.env",
    },
    // Windows（WebView2）构建选项：应用图标（多尺寸 ICO，窗口左上角与任务栏共用）
    win: existsSync(iGM_LauncherV2_IconPath)
      ? { icon: "iGM_LauncherV2_Assets/iGM_LauncherV2_Icon.ico" }
      : undefined,
  },
  runtime: {
    // 最后一个窗口关闭即退出应用
    exitOnLastWindowClosed: true,
  },
} satisfies ElectrobunConfig;

// 导出 //
export default iGM_LauncherV2_ElectrobunConfig;
