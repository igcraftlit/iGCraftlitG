/**
 * 文件路径：apps/launcher-ui/app/G_DownloadProgress/page.tsx
 * 所属层：前端 / 路由层
 * 路由：G_DownloadProgress
 * 模块：iGM_Launcher_DownloadProgressRoute
 * 作用：独立下载进度窗口的静态入口页，渲染窄窗进度界面
 * 内容：由 apps/shell 打包为 views://launcher/G_DownloadProgress.html；
 *       与启动器共用根布局的语言 / 主题 Provider，但不套用启动器骨架
 */

// 导入依赖 //
import { iGM_Launcher_DownloadProgressWindow as IGM_Launcher_DownloadProgressWindow } from "@/components/iGM_Launcher_Pages/iGM_Launcher_DownloadProgressWindow";

// 核心逻辑 //
export default function iGM_Launcher_DownloadProgressRoute() {
  return <IGM_Launcher_DownloadProgressWindow />;
}

// 导出 //
/* 默认导出即为本模块对外接口 */