/**
 * 文件路径：apps/exam/src/app/admin/upload/page.tsx
 * 所属层：前端 / 路由层（Next.js App Router 框架必需文件）
 * 路由：E_Admin_Upload（/admin/upload）
 * 模块：iGM_Exam_RouteAdminUpload
 * 作用：试卷上传路由壳，挂载 E_Admin_Upload 页面
 * 内容：单一页面组件挂载
 */

// 导入依赖 //
import { iGM_ExamUploadPage as ExamUpload } from "../../../iGM_Pages/E_Admin_Upload";

// 核心逻辑 //
/** 试卷上传路由 */
export default function iGM_Exam_RouteAdminUpload() {
  return <ExamUpload />;
}