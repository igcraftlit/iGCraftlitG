/**
 * 文件路径：apps/web/src/iGM_Pages/G_Resources/iGM_ResourcesPage.tsx
 * 所属层：前端 / 页面层
 * 路由：/G_Resources
 * 模块：G_Resources
 * 作用：第三方资源库旧入口重定向——第三方资源已并入 Minecraft 资源主界面
 * 内容：客户端重定向至 /G_Minecraft?source=thirdparty（保持当前语言前缀）
 * 说明：纯静态 SSG 无法服务端 302，使用路由 replace 保持历史记录干净
 */

// 导入依赖 //
"use client";

import { useEffect } from "react";
import { LoaderCircle, Package } from "lucide-react";
import { iGM_UseLocaleRouter } from "../../iGM_i18n/iGM_UseLocaleRouter";

// 类型定义 //
// （无外部属性）

// 核心逻辑 //
/** 跳转至 Minecraft 资源分区的第三方资源来源（保留当前语言前缀） */
export function iGM_ResourcesPage() {
  const { replace } = iGM_UseLocaleRouter();

  useEffect(() => {
    replace("/G_Minecraft?source=thirdparty");
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
      <Package size={16} strokeWidth={1.8} />
      <LoaderCircle size={16} className="igm-spin" />
    </div>
  );
}

// 导出 //
export default iGM_ResourcesPage;