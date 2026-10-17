/**
 * 文件路径：apps/launcher-ui/app/G_Login/page.tsx
 * 所属层：前端 / 路由层
 * 路由：G_Login（/G_Login）
 * 模块：iGM_LauncherV2_LoginRoute
 * 作用：社区授权登录页路由入口
 * 内容：供 Next 静态导出为 G_Login.html，欢迎页与主界面按登录状态跳转至此
 */

// 导入依赖 //
import { iGM_LauncherV2_Login as IGM_LauncherV2_Login } from "@/components/iGM_LauncherV2_Login/iGM_LauncherV2_Login";

// 核心逻辑 //
export default function iGM_LauncherV2_LoginRoute() {
  return <IGM_LauncherV2_Login />;
}

// 导出 //
/* 默认导出即为本路由对外接口 */
