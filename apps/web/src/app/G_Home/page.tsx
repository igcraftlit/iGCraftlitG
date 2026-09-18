/**
 * 文件路径：apps/web/src/app/G_Home/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_Home
 * 模块：G_Home
 * 作用：首页路由入口，实际页面见 iGM_Pages/G_Home
 */

// 导入依赖 //
import { G_Home } from "../../iGM_Pages/G_Home";

// 导出 //
export default function G_HomePage() {
  return <G_Home />;
}
