/**
 * 文件路径：apps/exam/src/app/detail/page.tsx
 * 所属层：前端 / 路由层（Next.js App Router 框架必需文件）
 * 路由：E_ExamDetail（/detail?id=xxx）
 * 模块：iGM_Exam_RouteDetail
 * 作用：试卷详情路由壳，为使用 useSearchParams 的页面提供 Suspense 边界
 * 内容：Suspense 包裹 + 加载占位
 */

// 导入依赖 //
import { Suspense } from "react";
import { E_ExamDetail as ExamDetail } from "../../iGM_Pages/E_ExamDetail";

// 核心逻辑 //
/** 试卷详情路由 */
export default function iGM_Exam_RouteDetail() {
  return (
    <Suspense
      fallback={
        <main
          style={{
            maxWidth: "var(--igm-maxw)",
            margin: "0 auto",
            padding: "80px 28px",
            textAlign: "center",
            fontFamily: "var(--igm-font-mono), monospace",
            fontSize: 12,
            letterSpacing: "0.2em",
            color: "var(--igm-text-muted)",
          }}
        >
          RETRIEVING RECORD…
        </main>
      }
    >
      <ExamDetail />
    </Suspense>
  );
}
