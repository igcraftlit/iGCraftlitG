/**
 * 文件路径：apps/web/src/app/G_Notification/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_Notification
 * 模块：G_Notification
 * 作用：通知骨架页路由入口，实际页面见 iGM_Pages/iGM_PlaceholderPage
 */

// 导入依赖 //
import { iGM_PlaceholderPage as IGM_PlaceholderPage } from "../../iGM_Pages/iGM_PlaceholderPage";

// 导出 //
export default function G_NotificationPage() {
  return <IGM_PlaceholderPage pageId="notification" href="/G_Notification" />;
}
