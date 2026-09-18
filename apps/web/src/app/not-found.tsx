/**
 * 文件路径：apps/web/src/app/not-found.tsx
 * 所属层：前端 / 404 路由（Next.js App Router 框架必需文件）
 * 路由：全局未匹配路径
 * 模块：iGM_NotFoundPage
 * 作用：404 页面框架入口
 * 说明：本文件为 Next.js 强制命名的框架入口，实际内容见 iGM_Pages/iGM_NotFoundPage
 */

// 导入依赖 //
import { iGM_NotFoundPage as IGM_NotFoundPage } from "../iGM_Pages/iGM_NotFoundPage";

// 导出 //
export default function iGM_NotFound() {
  return <IGM_NotFoundPage />;
}
