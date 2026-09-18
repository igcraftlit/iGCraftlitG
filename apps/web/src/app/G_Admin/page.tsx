/**
 * 文件路径：apps/web/src/app/G_Admin/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_Admin
 * 模块：G_Admin / G_Auth
 * 作用：管理后台骨架页路由入口，模块二起要求 admin 角色
 * 说明：角色控制仅为体验层，真正的安全边界是后端 iGM_AuthGuard
 */

// 导入依赖 //
import { iGM_PlaceholderPage as IGM_PlaceholderPage } from "../../iGM_Pages/iGM_PlaceholderPage";
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";

// 导出 //
export default function G_AdminPage() {
  return (
    <IGM_RequireAuth role="admin">
      <IGM_PlaceholderPage pageId="admin" href="/G_Admin" />
    </IGM_RequireAuth>
  );
}
