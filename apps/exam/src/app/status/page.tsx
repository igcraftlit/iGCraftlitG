/**
 * 文件路径：apps/exam/src/app/status/page.tsx
 * 所属层：前端 / 路由层（Next.js App Router 框架必需文件）
 * 路由：E_Examiner_Status（/status）
 * 模块：iGM_Exam_RouteStatus
 * 作用：命题创作者申请状态路由壳，挂载 E_Examiner_Status 页面
 * 内容：单一页面组件挂载
 */

// 导入依赖 //
import { E_ExaminerStatus as ExaminerStatus } from "../../iGM_Pages/E_Examiner_Status";

// 核心逻辑 //
/** 命题创作者申请状态路由 */
export default function iGM_Exam_RouteStatus() {
  return <ExaminerStatus />;
}
