/**
 * 文件路径：apps/shell/electrobun.config.ts
 * 所属层：桌面外壳 / 构建配置层
 * 路由：全局（Electrobun/Hutch 构建期）
 * 模块：iGM_Launcher_ElectrobunConfig
 * 作用：Electrobun 2.x 构建描述，声明应用元信息、Bun 主进程入口与静态产物拷贝
 * 内容：主进程使用 Bun 运行时；Next.js 纯静态导出经
 *       scripts/iGM_Launcher_SyncUi.ts 同步到 iGM_Launcher_Assets/launcher，
 *       再由 build.copy 打包为 views://launcher；Windows 图标一并拷贝
 */

// 导入依赖 //
import type { ElectrobunConfig } from "electrobun";

// 核心逻辑 //
const iGM_Launcher_ElectrobunConfig = {
  app: {
    name: "iGM Launcher",
    identifier: "com.igcraftlit.launcher",
    // 版本统一为 26.2.5 official version（版本号只取数字部分）
    version: "26.2.5",
    description: "iGCraftLit official Minecraft launcher",
  },
  build: {
    // 模块一主进程采用 Bun 运行时（与任务约定一致）
    mainProcess: "bun",
    bun: {
      entrypoint: "src/iGM_Launcher_Main.ts",
      minify: false,
      sourcemap: "linked",
    },
    // 静态界面由同步脚本生成，键为项目相对源路径，值为包内 views 目标路径
    copy: {
      "iGM_Launcher_Assets/launcher": "views/launcher",
      // 下载器 SDK 动态库随包分发（由 iGM_Launcher_SyncUi 从 zig 产物同步；未编译时为空目录）
      "iGM_Launcher_Assets/sdk": "sdk",
    },
    // Windows（WebView2）构建选项
    win: {
      icon: "iGM_Launcher_Assets/icon.ico",
    },
  },
  runtime: {
    // 最后一个窗口关闭即退出应用
    exitOnLastWindowClosed: true,
  },
} satisfies ElectrobunConfig;

// 导出 //
export default iGM_Launcher_ElectrobunConfig;
