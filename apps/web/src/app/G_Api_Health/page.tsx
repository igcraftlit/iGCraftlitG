/**
 * 文件路径：apps/web/src/app/G_Api_Health/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_Api_Health
 * 模块：G_Api_Health
 * 作用：健康检查页路由入口，实际页面见 iGM_Pages/G_Api_Health
 */

// 导入依赖 //
import { G_Api_Health } from "../../iGM_Pages/G_Api_Health";

// 导出 //
export default function G_Api_HealthPage() {
  return <G_Api_Health />;
}
