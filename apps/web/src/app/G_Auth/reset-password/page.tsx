/**
 * 文件路径：apps/web/src/app/G_Auth/reset-password/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_Auth/reset-password
 * 模块：G_Auth
 * 作用：重置密码页路由入口，实际页面见 iGM_Pages/G_Auth/iGM_ResetPasswordPage
 * 说明：页面使用 useSearchParams 读取 token，静态导出要求 Suspense 边界
 */

// 导入依赖 //
import { Suspense } from "react";
import { iGM_ResetPasswordPage as IGM_ResetPasswordPage } from "../../../iGM_Pages/G_Auth/iGM_ResetPasswordPage";

// 导出 //
export default function G_AuthResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <IGM_ResetPasswordPage />
    </Suspense>
  );
}
