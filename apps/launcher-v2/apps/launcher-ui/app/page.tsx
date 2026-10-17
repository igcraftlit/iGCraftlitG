/**
 * 文件路径：apps/launcher-ui/app/page.tsx
 * 所属层：前端 / 路由层
 * 路由：G_Welcome（/）
 * 模块：iGM_LauncherV2_WelcomeRoute
 * 作用：欢迎首页路由入口
 * 内容：Electrobun 打包后以 views:// 精确文件路径加载静态产物，
 *       index.html 即欢迎首页；页面切换由 Next 客户端路由完成
 */

// 导入依赖 //
import { iGM_LauncherV2_Welcome as IGM_LauncherV2_Welcome } from "@/components/iGM_LauncherV2_Welcome/iGM_LauncherV2_Welcome";

// 核心逻辑 //
export default function iGM_LauncherV2_WelcomeRoute() {
  return <IGM_LauncherV2_Welcome />;
}

// 导出 //
/* 默认导出即为本路由对外接口 */
