/**
 * 文件路径：apps/web/src/app/[locale]/G_MessageDetail/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_MessageDetail?conversationId= 或 peerId=
 * 模块：G_MessageDetail
 * 作用：私信会话详情路由入口，纯静态壳 + 客户端按查询参数加载数据
 * 说明：useSearchParams 必须包在 Suspense 内，以满足 Next.js 静态导出要求
 */

// 导入依赖 //
import type { Metadata } from "next";
import { Suspense } from "react";
import { LoaderCircle } from "lucide-react";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";
import { iGM_MessageDetailPage as IGM_MessageDetailPage } from "../../../iGM_Pages/G_MessageDetail/iGM_MessageDetailPage";

// 导出 //
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return iGM_BuildPageMetadata({
    locale,
    messageKey: "pages.messageDetail",
    path: "/G_MessageDetail",
  });
}

export default function G_MessageDetailRoute() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "40vh",
          }}
        >
          <LoaderCircle size={16} className="igm-spin" />
        </div>
      }
    >
      <IGM_MessageDetailPage />
    </Suspense>
  );
}
