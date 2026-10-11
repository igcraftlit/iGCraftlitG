/**
 * 文件路径：apps/exam/src/app/bank/page.tsx
 * 所属层：前端 / 路由层（Next.js App Router 框架必需文件）
 * 路由：E_QuestionBank（/bank）
 * 模块：iGM_Question_RouteBank
 * 作用：题库路由壳，挂载 E_QuestionBank 页面
 * 内容：单一页面组件挂载
 */

// 导入依赖 //
import { E_QuestionBank as QuestionBank } from "../../iGM_Pages/E_QuestionBank";

// 核心逻辑 //
/** 题库路由 */
export default function iGM_Question_RouteBank() {
  return <QuestionBank />;
}
