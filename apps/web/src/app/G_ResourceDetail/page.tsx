/**
 * 文件路径：apps/web/src/app/G_ResourceDetail/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_ResourceDetail?resourceId=xxx
 * 模块：G_ResourceDetail
 * 作用：资源详情路由入口，纯静态壳 + 客户端按查询参数加载数据
 * 说明：useSearchParams 必须包在 Suspense 内，以满足 Next.js 静态导出要求
 */

// 导入依赖 //
import { Suspense } from "react";
import { LoaderCircle } from "lucide-react";
import { iGM_ResourceDetailPage as IGM_ResourceDetailPage } from "../../iGM_Pages/G_ResourceDetail/iGM_ResourceDetailPage";

// 导出 //
export default function G_ResourceDetailRoute() {
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
      <IGM_ResourceDetailPage />
    </Suspense>
  );
}
