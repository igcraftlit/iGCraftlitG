/**
 * 文件路径：apps/web/src/app/G_Auth/verify-email/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_Auth/verify-email
 * 模块：G_Auth
 * 作用：邮箱验证页路由入口，实际页面见 iGM_Pages/G_Auth/iGM_VerifyEmailPage
 */

// 导入依赖 //
import { iGM_VerifyEmailPage as IGM_VerifyEmailPage } from "../../../iGM_Pages/G_Auth/iGM_VerifyEmailPage";

// 导出 //
export default function G_AuthVerifyEmailPage() {
  return <IGM_VerifyEmailPage />;
}
