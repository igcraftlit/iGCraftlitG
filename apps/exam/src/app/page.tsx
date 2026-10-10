/**
 * 文件路径：apps/exam/src/app/page.tsx
 * 所属层：前端 / 路由层（Next.js App Router 框架必需文件）
 * 路由：E_ExamList（/）
 * 模块：iGM_Exam_RouteList
 * 作用：试卷索引路由壳，挂载 E_ExamList 页面
 * 内容：单一页面组件挂载
 */

// 导入依赖 //
import { E_ExamList as ExamList } from "../iGM_Pages/E_ExamList";

// 核心逻辑 //
/** 试卷索引路由 */
export default function iGM_Exam_RouteList() {
  return <ExamList />;
}
