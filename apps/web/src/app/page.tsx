/**
 * 文件路径：apps/web/src/app/page.tsx
 * 所属层：前端 / 根路由（Next.js App Router 框架必需文件）
 * 路由：/
 * 模块：G_Home
 * 作用：根路径入口，纯静态下客户端跳转到 /G_Home
 * 说明：本文件为 Next.js 强制命名的框架入口，实际逻辑见 iGM_Pages/iGM_RootRedirect
 */

// 导入依赖 //
import { iGM_RootRedirect as IGM_RootRedirect } from "../iGM_Pages/iGM_RootRedirect";

// 导出 //
export default function iGM_RootPage() {
  return <IGM_RootRedirect />;
}
