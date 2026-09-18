/**
 * 文件路径：apps/web/src/app/G_User/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_User
 * 模块：G_User
 * 作用：个人主页骨架页路由入口，实际页面见 iGM_Pages/iGM_PlaceholderPage
 */

// 导入依赖 //
import { iGM_PlaceholderPage as IGM_PlaceholderPage } from "../../iGM_Pages/iGM_PlaceholderPage";

// 导出 //
export default function G_UserPage() {
  return <IGM_PlaceholderPage pageId="profile" href="/G_User" />;
}
