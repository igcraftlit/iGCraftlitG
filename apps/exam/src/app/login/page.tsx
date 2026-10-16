/**
 * 文件路径：apps/exam/src/app/login/page.tsx
 * 所属层：前端 / 路由壳层
 * 路由：/login
 * 模块：G_Login
 * 作用：微软式授权登录页的 Next.js 路由壳
 * 说明：仅负责挂 E_Login 页面组件；
 *       布局、认证 Provider、主题、刊头/页脚由根 layout.tsx 提供
 */

// 导入依赖 //
import { E_Login } from "../../iGM_Pages/E_Login";

// 路由组件 //
export default function Page() {
  return <E_Login />;
}
