/**
 * 文件路径：apps/web/src/app/G_Post/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_Post
 * 模块：G_Post
 * 作用：帖子骨架页路由入口，实际页面见 iGM_Pages/iGM_PlaceholderPage
 */

// 导入依赖 //
import { iGM_PlaceholderPage as IGM_PlaceholderPage } from "../../iGM_Pages/iGM_PlaceholderPage";

// 导出 //
export default function G_PostPage() {
  return <IGM_PlaceholderPage pageId="post" href="/G_Post" />;
}
