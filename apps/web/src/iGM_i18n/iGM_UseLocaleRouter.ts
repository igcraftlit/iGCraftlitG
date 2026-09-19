/**
 * 文件路径：apps/web/src/iGM_i18n/iGM_UseLocaleRouter.ts
 * 所属层：前端 / 国际化基础层
 * 路由：全局
 * 模块：iGM_UseLocaleRouter
 * 作用：语言感知的编程式导航 Hook（模块五多语言路由改造）
 * 内容：包装 next/navigation 的 useRouter，push/replace 自动拼装
 *       当前语言前缀；外链与锚点原样透传
 */

// 导入依赖 //
"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { iGM_UseLocale } from "../iGM_Providers/iGM_LocaleProvider";
import { iGM_LocalePath } from "./iGM_LocalePath";

// 类型定义 //
interface iGM_LocaleRouter {
  push(path: string): void;
  replace(path: string): void;
}

// 核心逻辑 //
/** 返回自动携带语言前缀的 push/replace 导航方法 */
export function iGM_UseLocaleRouter(): iGM_LocaleRouter {
  const router = useRouter();
  const { locale } = iGM_UseLocale();

  const push = useCallback(
    (path: string) => {
      router.push(iGM_LocalePath(path, locale));
    },
    [router, locale],
  );

  const replace = useCallback(
    (path: string) => {
      router.replace(iGM_LocalePath(path, locale));
    },
    [router, locale],
  );

  return { push, replace };
}

// 导出 //
export default iGM_UseLocaleRouter;
