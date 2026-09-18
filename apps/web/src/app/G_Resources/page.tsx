/**
 * 文件路径：apps/web/src/app/G_Resources/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_Resources
 * 模块：G_Resources
 * 作用：资源库骨架页路由入口，实际页面见 iGM_Pages/iGM_PlaceholderPage
 */

// 导入依赖 //
import { iGM_PlaceholderPage as IGM_PlaceholderPage } from "../../iGM_Pages/iGM_PlaceholderPage";

// 导出 //
export default function G_ResourcesPage() {
  return <IGM_PlaceholderPage pageId="resources" href="/G_Resources" />;
}
