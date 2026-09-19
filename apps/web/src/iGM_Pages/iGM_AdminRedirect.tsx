/**
 * 文件路径：apps/web/src/iGM_Pages/iGM_AdminRedirect.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_Admin（由路由壳引用）
 * 模块：iGM_AdminRedirect
 * 作用：/G_Admin 旧入口跳转至 /G_AdminDashboard（模块五起管理后台拆分为六个子页）
 * 内容：客户端重定向（保持当前语言前缀），静态导出下仍为纯客户端行为
 * 说明：纯静态 SSG 无法服务端 302，使用路由 replace 保持历史记录干净
 */

// 导入依赖 //
"use client";

import { useEffect } from "react";
import { LoaderCircle, Shield } from "lucide-react";
import { iGM_UseLocaleRouter } from "../iGM_i18n/iGM_UseLocaleRouter";

// 类型定义 //
// （无外部属性）

// 核心逻辑 //
/** 跳转至管理后台概览页（保留当前语言前缀） */
export function iGM_AdminRedirect() {
  const { replace } = iGM_UseLocaleRouter();

  useEffect(() => {
    replace("/G_AdminDashboard");
  }, [replace]);

  return (
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
      <Shield size={16} strokeWidth={1.8} />
      <LoaderCircle size={16} className="igm-spin" />
    </div>
  );
}

// 导出 //
export default iGM_AdminRedirect;
