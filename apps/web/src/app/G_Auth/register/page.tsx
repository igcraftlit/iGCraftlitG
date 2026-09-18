/**
 * 文件路径：apps/web/src/app/G_Auth/register/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_Auth/register
 * 模块：G_Auth
 * 作用：注册页路由入口，实际页面见 iGM_Pages/G_Auth/iGM_RegisterPage
 */

// 导入依赖 //
import { iGM_RegisterPage as IGM_RegisterPage } from "../../../iGM_Pages/G_Auth/iGM_RegisterPage";

// 导出 //
export default function G_AuthRegisterPage() {
  return <IGM_RegisterPage />;
}
