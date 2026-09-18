/**
 * 文件路径：apps/web/src/app/G_Settings/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_Settings
 * 模块：G_Settings / G_Auth
 * 作用：账户设置页路由入口，实际页面见 iGM_Pages/iGM_AccountSettingsPage
 */

// 导入依赖 //
import { iGM_AccountSettingsPage as IGM_AccountSettingsPage } from "../../iGM_Pages/iGM_AccountSettingsPage";

// 导出 //
export default function G_SettingsPage() {
  return <IGM_AccountSettingsPage />;
}
