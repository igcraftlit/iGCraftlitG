/**
 * 文件路径：apps/web/src/app/G_UserSettings/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_UserSettings
 * 模块：G_UserSettings
 * 作用：个人资料编辑路由入口（仅登录用户）
 */

// 导入依赖 //
import { iGM_RequireAuth as IGM_RequireAuth } from "../../iGM_Components/iGM_RequireAuth/iGM_RequireAuth";
import { iGM_UserSettingsPage as IGM_UserSettingsPage } from "../../iGM_Pages/G_UserSettings/iGM_UserSettingsPage";

// 导出 //
export default function G_UserSettingsRoute() {
  return (
    <IGM_RequireAuth>
      <IGM_UserSettingsPage />
    </IGM_RequireAuth>
  );
}
