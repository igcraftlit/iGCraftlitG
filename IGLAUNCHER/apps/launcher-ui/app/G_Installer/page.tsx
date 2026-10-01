/**
 * 文件路径：apps/launcher-ui/app/G_Installer/page.tsx
 * 所属层：前端 / 路由层
 * 路由：G_Installer
 * 模块：iGM_Installer_Route
 * 作用：安装程序界面的静态入口页，渲染四步安装向导
 * 内容：由 apps/installer 打包为 views://installer/G_Installer.html；
 *       与启动器共用根布局的语言 / 主题 Provider，但不套用启动器骨架（AppShell 已下移到首页）
 */

// 导入依赖 //
import { iGM_Installer_Wizard as IGM_Installer_Wizard } from "@/components/iGM_Installer/iGM_Installer_Wizard";

// 核心逻辑 //
export default function iGM_Installer_Route() {
  return <IGM_Installer_Wizard />;
}

// 导出 //
/* 默认导出即为本模块对外接口 */