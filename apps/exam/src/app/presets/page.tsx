/**
 * 文件路径：apps/exam/src/app/presets/page.tsx
 * 所属层：前端 / 路由层（Next.js App Router 框架必需文件）
 * 路由：E_Issuer_Presets（/presets）
 * 模块：iGM_Exam_RoutePresets
 * 作用：命题方预设路由壳，挂载 E_Issuer_Presets 页面
 * 内容：单一页面组件挂载
 */

// 导入依赖 //
import { E_IssuerPresets as IssuerPresets } from "../../iGM_Pages/E_Issuer_Presets";

// 核心逻辑 //
/** 命题方预设路由 */
export default function iGM_Exam_RoutePresets() {
  return <IssuerPresets />;
}
