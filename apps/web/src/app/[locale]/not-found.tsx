/**
 * 文件路径：apps/web/src/app/[locale]/not-found.tsx
 * 所属层：前端 / 语言段 404（Next.js App Router 框架文件）
 * 路由：/{locale}/**（语言前缀下未匹配路径）
 * 模块：iGM_NotFound
 * 作用：语言前缀路径下的本地化 404 页面（渲染于 [locale] 布局内，Provider 可用）
 * 说明：本文件为 Next.js 强制命名的框架入口，实际内容见 iGM_Pages/iGM_NotFoundPage
 */

// 导入依赖 //
import { iGM_NotFoundPage as IGM_NotFoundPage } from "../../iGM_Pages/iGM_NotFoundPage";

// 导出 //
export default function iGM_NotFound() {
  return <IGM_NotFoundPage />;
}
