/**
 * 文件路径：apps/web/src/app/page.tsx
 * 所属层：前端 / 根路由（Next.js App Router 框架必需文件）
 * 路由：/
 * 模块：G_Landing
 * 作用：根路径入口，渲染控制台之前的品牌门户落地页
 * 说明：本文件为 Next.js 强制命名的框架入口，实际逻辑见 iGM_Pages/G_Landing/iGM_LandingPage
 */

// 导入依赖 //
import { iGM_LandingPage as IGM_LandingPage } from "../iGM_Pages/G_Landing/iGM_LandingPage";

// 导出 //
export default function iGM_RootPage() {
  return <IGM_LandingPage />;
}
