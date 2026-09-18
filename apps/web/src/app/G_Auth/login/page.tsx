/**
 * 文件路径：apps/web/src/app/G_Auth/login/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_Auth/login
 * 模块：G_Auth
 * 作用：登录页路由入口，实际页面见 iGM_Pages/G_Auth/iGM_LoginPage
 * 说明：useSearchParams 用于读取 redirect 回跳参数，以 Suspense 包裹满足静态导出
 */

// 导入依赖 //
import { Suspense } from "react";
import { iGM_LoginPage as IGM_LoginPage } from "../../../iGM_Pages/G_Auth/iGM_LoginPage";

// 导出 //
export default function G_AuthLoginPage() {
  return (
    <Suspense fallback={null}>
      <IGM_LoginPage />
    </Suspense>
  );
}
