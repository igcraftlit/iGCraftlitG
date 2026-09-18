/**
 * 文件路径：apps/web/src/iGM_Pages/iGM_RootRedirect.tsx
 * 所属层：前端 / 页面层
 * 路由：/（根路径）
 * 模块：G_Home
 * 作用：纯静态环境下将根路径客户端跳转到 /G_Home
 * 内容：挂载后 replace 到首页，跳转前仅展示极简品牌文本
 */

// 导入依赖 //
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// 类型定义 //
// （根跳转页无属性输入）

// 核心逻辑 //
/** 根路径占位组件：立即跳转 G_Home */
export function iGM_RootRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/G_Home");
  }, [router]);

  return (
    <div
      style={{
        minHeight: "40vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--igm-text-subtle)",
        fontSize: "13px",
      }}
    >
      iGCraftLit Community
    </div>
  );
}

// 导出 //
export default iGM_RootRedirect;
