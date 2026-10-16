/**
 * 文件路径：apps/exam/src/app/apply-creator/page.tsx
 * 所属层：前端 / 路由壳层
 * 路由：/apply-creator
 * 模块：G_CreatorApply
 * 作用：独立命题创作者申请页面的 Next.js 路由壳
 * 说明：仅负责挂 E_CreatorApply 页面组件；
 *       布局、认证 Provider、主题、页头/页脚由根 layout.tsx 提供
 */

// 导入依赖 //
import { E_CreatorApply } from "../../iGM_Pages/E_CreatorApply";

// 路由组件 //
export default function Page() {
  return <E_CreatorApply />;
}
