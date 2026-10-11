/**
 * 文件路径：apps/exam/src/app/editor/page.tsx
 * 所属层：前端 / 路由层（Next.js App Router 框架必需文件）
 * 路由：E_QuestionEditor（/editor）
 * 模块：iGM_Question_RouteEditor
 * 作用：命题管理路由壳，挂载 E_QuestionEditor 页面
 * 内容：单一页面组件挂载
 */

// 导入依赖 //
import { E_QuestionEditor as QuestionEditor } from "../../iGM_Pages/E_QuestionEditor";

// 核心逻辑 //
/** 命题管理路由 */
export default function iGM_Question_RouteEditor() {
  return <QuestionEditor />;
}
