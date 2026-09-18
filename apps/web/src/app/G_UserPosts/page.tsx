/**
 * 文件路径：apps/web/src/app/G_UserPosts/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_UserPosts
 * 模块：G_UserPosts
 * 作用：我的帖子页面路由入口（仅登录用户）
 */

// 导入依赖 //
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_MyPostsPage as IGM_MyPostsPage } from "../../iGM_Pages/G_UserPosts/iGM_MyPostsPage";

// 导出 //
export default function G_UserPostsRoute() {
  return (
    <IGM_RequireAuth>
      <IGM_MyPostsPage />
    </IGM_RequireAuth>
  );
}
