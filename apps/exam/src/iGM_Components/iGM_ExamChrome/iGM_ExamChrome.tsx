/**
 * 文件路径：apps/exam/src/iGM_Components/iGM_ExamChrome/iGM_ExamChrome.tsx
 * 所属层：前端 / 通用组件层
 * 路由：全局（/login 独立授权页除外均渲染刊头与页脚）
 * 模块：iGM_ExamChrome
 * 作用：按当前路由决定是否渲染刊头与页脚，使独立授权登录页成为无干扰全屏页
 * 内容：usePathname 判定裸页路由（/login 及其子路径），裸页仅渲染 children，
 *       其余路由渲染「刊头 + children + 页脚」
 * 说明：纯静态导出下每个路由各自预渲染，usePathname 于构建期即为确定值，
 *       /login 的静态 HTML 不含刊头/页脚；客户端组件，须包裹在
 *       iGM_ExamI18nProvider / iGM_ExamAuthProvider 内使用
 */

// 导入依赖 //
"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { iGM_ExamMasthead as IGM_ExamMasthead } from "../iGM_ExamMasthead/iGM_ExamMasthead";
import { iGM_ExamFooter as IGM_ExamFooter } from "../iGM_ExamFooter/iGM_ExamFooter";

// 类型定义 //
interface iGM_ExamChromeProps {
  children: ReactNode;
}

// 核心逻辑 //
/** 不渲染刊头/页脚的裸页路由前缀（独立授权登录页） */
const iGM_Exam_BareRoutePrefixes = ["/login"] as const;

/** 站点外壳：按路由切换刊头/页脚 */
export function iGM_ExamChrome({ children }: iGM_ExamChromeProps) {
  const pathname = usePathname();
  const bare = iGM_Exam_BareRoutePrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (bare) {
    return <>{children}</>;
  }

  return (
    <>
      <IGM_ExamMasthead />
      {children}
      <IGM_ExamFooter />
    </>
  );
}

// 导出 //
export default iGM_ExamChrome;
