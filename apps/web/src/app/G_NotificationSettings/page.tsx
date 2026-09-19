/**
 * 文件路径：apps/web/src/app/G_NotificationSettings/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_NotificationSettings
 * 模块：G_NotificationSettings
 * 作用：通知偏好设置路由入口，纯静态壳 + 客户端加载偏好
 * 说明：Suspense 包裹以满足 Next.js 静态导出对客户端 hooks 的要求
 */

// 导入依赖 //
import { Suspense } from "react";
import { LoaderCircle } from "lucide-react";
import { iGM_NotificationSettingsPage as IGM_NotificationSettingsPage } from "../../iGM_Pages/G_NotificationSettings/iGM_NotificationSettingsPage";

// 导出 //
export default function G_NotificationSettingsRoute() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            minHeight: "40vh",
            color: "var(--igm-text-muted)",
            fontSize: 13,
          }}
        >
          <LoaderCircle size={16} className="igm-spin" />
        </div>
      }
    >
      <IGM_NotificationSettingsPage />
    </Suspense>
  );
}
