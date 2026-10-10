/**
 * 文件路径：apps/exam/src/app/admin/page.tsx
 * 所属层：前端 / 路由层（Next.js App Router 框架必需文件）
 * 路由：E_Admin_Exam（/admin）
 * 模块：iGM_Exam_RouteAdmin
 * 作用：试卷管理端路由壳，挂载 E_Admin_Exam 页面
 * 内容：单一页面组件挂载
 */

// 导入依赖 //
import { iGM_ExamAdmin as ExamAdmin } from "../../iGM_Pages/E_Admin_Exam";

// 核心逻辑 //
/** 管理端路由 */
export default function iGM_Exam_RouteAdmin() {
  return <ExamAdmin />;
}
