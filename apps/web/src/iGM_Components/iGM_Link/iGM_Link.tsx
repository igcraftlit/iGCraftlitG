/**
 * 文件路径：apps/web/src/iGM_Components/iGM_Link/iGM_Link.tsx
 * 所属层：前端 / 通用组件层
 * 路由：全局
 * 模块：iGM_Link
 * 作用：语言感知的站内链接组件（模块五多语言路由改造）
 * 内容：包装 next/link，自动为字符串 href 拼装当前语言前缀；
 *       外链、锚点与已带前缀的路径原样透传
 * 说明：站内跳转统一使用本组件替换 next/link，href 写法保持不变
 */

// 导入依赖 //
"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { iGM_UseLocale } from "../../iGM_Providers/iGM_LocaleProvider";
import { iGM_LocalePath } from "../../iGM_i18n/iGM_LocalePath";

// 类型定义 //
type iGM_LinkProps = ComponentProps<typeof Link>;

// 核心逻辑 //
/** 语言感知 Link：自动携带当前语言前缀 */
export function iGM_Link({ href, ...rest }: iGM_LinkProps) {
  const { locale } = iGM_UseLocale();
  const resolved =
    typeof href === "string" ? iGM_LocalePath(href, locale) : href;
  return <Link href={resolved} {...rest} />;
}

// 导出 //
export default iGM_Link;
