/**
 * 文件：apps/web/src/app/[locale]/[...rest]/page.tsx
 * 所属层：前端（App Router 全捕获路由）
 * 路由：语言段内任意未匹配路径（如 /zh-CN/任意不存在路径）
 * 模块：iGM_CatchAllPage
 * 作用：把语言段内的未匹配 URL 抛给最近的 [locale]/not-found 边界，
 *       保证 404 页面在完整的语言 Provider 上下文中渲染（文案全部来自语言包）
 * 内容：单页组件，直接调用 notFound()
 */
// ==================== 区块：导入依赖 ====================
import { notFound } from 'next/navigation';

// ==================== 区块：全捕获页面 ====================
export default function iGM_CatchAllPage() {
  // 触发 [locale]/not-found.tsx 渲染，并返回 404 状态码
  notFound();
}
