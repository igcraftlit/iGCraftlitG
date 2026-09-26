/**
 * 文件路径：apps/web/src/app/[locale]/G_Messages/page.tsx
 * 所属层：前端 / 路由入口（Next.js App Router 框架必需文件）
 * 路由：/G_Messages
 * 模块：G_Messages
 * 作用：私信会话列表路由入口，纯静态壳 + 客户端加载数据
 */

// 导入依赖 //
import type { Metadata } from "next";
import { Suspense } from "react";
import { LoaderCircle } from "lucide-react";
import { iGM_BuildPageMetadata } from "../../../iGM_i18n/iGM_PageMetadata";
import { iGM_MessagesPage as IGM_MessagesPage } from "../../../iGM_Pages/G_Messages/iGM_MessagesPage";

// 导出 //
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return iGM_BuildPageMetadata({
    locale,
    messageKey: "pages.messages",
    path: "/G_Messages",
  });
}

export default function G_MessagesRoute() {
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
      <IGM_MessagesPage />
    </Suspense>
  );
}
