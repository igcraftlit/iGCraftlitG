/**
 * 文件路径：apps/installer/electrobun.config.ts
 * 所属层：安装程序 / 构建配置层
 * 路由：全局（Electrobun/Hutch 构建期）
 * 模块：iGM_Installer_ElectrobunConfig
 * 作用：Electrobun 2.x 构建描述，声明安装程序元信息、主进程入口与静态产物拷贝
 * 内容：主进程使用 Bun 运行时；安装向导静态产物由 scripts/iGM_Installer_SyncUi.ts
 *       同步到 iGM_Installer_Assets/installer，经 build.copy 打包为 views://installer；
 *       待安装的启动器整包由 scripts/iGM_Installer_SyncPayload.ts 同步到
 *       iGM_Installer_Assets/payload，经 build.copy 打包为 views://payload
 */

// 导入依赖 //
import type { ElectrobunConfig } from "electrobun";

// 核心逻辑 //
const iGM_Installer_ElectrobunConfig = {
  app: {
    name: "iGM Installer",
    identifier: "com.igcraftlit.installer",
    // 安装程序版本与启动器保持 26.3.1 一致（版本号只取数字部分）
    version: "26.3.1",
    description: "iGCraftLit launcher installer",
  },
  build: {
    mainProcess: "bun",
    bun: {
      entrypoint: "src/iGM_Installer_Main.ts",
      minify: false,
      sourcemap: "linked",
    },
    // 键为项目相对源路径，值为包内 views 目标路径
    copy: {
      "iGM_Installer_Assets/installer": "views/installer",
      "iGM_Installer_Assets/payload": "views/payload",
    },
    win: {
      icon: "iGM_Installer_Assets/icon.ico",
    },
  },
  runtime: {
    exitOnLastWindowClosed: true,
  },
} satisfies ElectrobunConfig;

// 导出 //
export default iGM_Installer_ElectrobunConfig;