/**
 * 文件路径：apps/launcher-ui/app/page.tsx
 * 所属层：前端 / 路由层
 * 路由：G_Home（/），SPA 唯一入口
 * 模块：iGM_Launcher_RootRoute
 * 作用：SPA 唯一路由入口，渲染启动器骨架与当前激活页面
 * 内容：Electrobun 打包后以 views:// 协议按精确文件路径读取静态产物、不解析目录路由，
 *       故启动器只保留一个入口页，五个页面由 iGM_Launcher_ActivePage 按 AppShell
 *       的客户端状态切换；模块七把 AppShell 收拢到本入口，使安装向导路由
 *       G_Installer 不继承启动器骨架
 */

// 导入依赖 //
import { iGM_Launcher_AppShell as IGM_Launcher_AppShell } from "@/components/iGM_Launcher_AppShell/iGM_Launcher_AppShell";
import { iGM_Launcher_ActivePage as IGM_Launcher_ActivePage } from "@/components/iGM_Launcher_Pages/iGM_Launcher_ActivePage";

// 核心逻辑 //
export default function iGM_Launcher_RootRoute() {
  return (
    <IGM_Launcher_AppShell>
      <IGM_Launcher_ActivePage />
    </IGM_Launcher_AppShell>
  );
}

// 导出 //
/* 默认导出即为本模块对外接口 */