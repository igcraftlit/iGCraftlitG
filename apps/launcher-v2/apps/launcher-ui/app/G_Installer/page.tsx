/**
 * 文件路径：apps/launcher-ui/app/G_Installer/page.tsx
 * 所属层：前端 / 路由层
 * 路由：G_Installer（/G_Installer）
 * 模块：iGM_LauncherV2_InstallerRoute
 * 作用：安装向导 UI 路由入口
 * 内容：静态导出为 G_Installer.html；模块一阶段供预览安装程序界面方案
 */

// 导入依赖 //
import { iGM_LauncherV2_Installer as IGM_LauncherV2_Installer } from "@/components/iGM_LauncherV2_Installer/iGM_LauncherV2_Installer";

// 核心逻辑 //
export default function iGM_LauncherV2_InstallerRoute() {
  return <IGM_LauncherV2_Installer />;
}

// 导出 //
/* 默认导出即为本路由对外接口 */
