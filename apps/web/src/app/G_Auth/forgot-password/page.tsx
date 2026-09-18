/**
 * 文件路径：apps/web/src/app/G_Auth/forgot-password/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_Auth/forgot-password
 * 模块：G_Auth
 * 作用：忘记密码页路由入口，实际页面见 iGM_Pages/G_Auth/iGM_ForgotPasswordPage
 */

// 导入依赖 //
import { iGM_ForgotPasswordPage as IGM_ForgotPasswordPage } from "../../../iGM_Pages/G_Auth/iGM_ForgotPasswordPage";

// 导出 //
export default function G_AuthForgotPasswordPage() {
  return <IGM_ForgotPasswordPage />;
}
