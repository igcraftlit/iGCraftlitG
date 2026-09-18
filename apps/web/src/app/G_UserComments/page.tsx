/**
 * 文件路径：apps/web/src/app/G_UserComments/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_UserComments
 * 模块：G_UserComments
 * 作用：我的评论页面路由入口（仅登录用户）
 */

// 导入依赖 //
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_MyCommentsPage as IGM_MyCommentsPage } from "../../iGM_Pages/G_UserComments/iGM_MyCommentsPage";

// 导出 //
export default function G_UserCommentsRoute() {
  return (
    <IGM_RequireAuth>
      <IGM_MyCommentsPage />
    </IGM_RequireAuth>
  );
}
