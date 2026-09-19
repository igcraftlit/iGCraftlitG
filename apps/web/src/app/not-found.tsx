/**
 * 文件路径：apps/web/src/app/not-found.tsx
 * 所属层：前端 / 根级 404（Next.js App Router 框架必需文件）
 * 路由：全局未匹配路径（含未知语言段）
 * 模块：iGM_NotFound
 * 作用：根级 404 兜底页——不依赖任何 Provider（根布局仅提供 HTML 外壳），
 *       纯静态双语文案，返回首页链接交由根跳转页按语言偏好重定向
 * 内容：404 编号、双语提示与返回入口；样式内联避免依赖全局 CSS 类名约定
 * 说明：app/[locale]/not-found.tsx 为语言前缀路径下的本地化 404 版本
 */

// 导入依赖 //
import Link from "next/link";

// 类型定义 //
// （静态页面无属性输入）

// 导出 //
/** 根级 404：无 Hook、无 Provider 依赖，任何未匹配路径均可安全渲染 */
export default function iGM_NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        textAlign: "center",
        padding: 24,
      }}
    >
      <span style={{ fontFamily: "var(--font-cinzel), serif", fontSize: 48 }}>
        404
      </span>
      <p style={{ margin: 0, opacity: 0.8 }}>页面不存在 / Page not found</p>
      <Link href="/" style={{ opacity: 0.9 }}>
        返回首页 / Back home
      </Link>
    </main>
  );
}
