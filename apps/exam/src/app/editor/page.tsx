/**
 * 文件路径：apps/exam/src/app/editor/page.tsx
 * 所属层：前端 / 路由层（Next.js App Router 框架必需文件）
 * 路由：E_QuestionEditor（/editor）
 * 模块：iGM_Question_RouteEditor
 * 作用：命题管理路由壳，挂载 E_QuestionEditor 页面，并为使用 useSearchParams 的页面提供 Suspense 边界
 * 内容：Suspense 包裹 + 语言包加载占位
 * 说明：占位文案随当前语言切换，故路由壳为客户端组件；支持 ?tab=pending 直达待审核题目
 */

// 导入依赖 //
"use client";

import { Suspense } from "react";
import { E_QuestionEditor as QuestionEditor } from "../../iGM_Pages/E_QuestionEditor";
import { useI18n } from "../../iGM_i18n/iGM_I18nContext";

// 核心逻辑 //
/**
 * 加载占位（读取当前语言）。
 * 注意：JSX 组件标识符首字母必须大写，否则会被当作原生标签，故此处用 IGM_ 形式。
 */
function IGM_Question_EditorFallback() {
  const { t } = useI18n();
  return (
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
      {t("editorLoading")}
    </main>
  );
}

/** 命题管理路由 */
export default function iGM_Question_RouteEditor() {
  return (
    <Suspense fallback={<IGM_Question_EditorFallback />}>
      <QuestionEditor />
    </Suspense>
  );
}
