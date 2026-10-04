/**
 * 文件路径：apps/web/src/iGM_Providers/iGM_Providers.tsx
 * 所属层：前端 / Provider 层
 * 路由：全局
 * 模块：iGM_Providers
 * 作用：聚合全站客户端 Provider（主题 + 语言 + 认证）与全局浮层组件
 * 内容：统一在根布局中包裹一次，避免布局文件堆叠多层 Provider；
 *       认证层内挂载令牌失效提示条（模块二十一，401 优雅提示）
 *       与 AI 助手悬浮窗（AI 赋能系统模块一，右下角收起/展开；
 *       模块五按 userId 强制重挂载，杜绝换号后组件状态串号）
 */

// 导入依赖 //
"use client";

import type { ReactNode } from "react";
import { iGM_ThemeProvider as IGM_ThemeProvider } from "./iGM_ThemeProvider";
import { iGM_LocaleProvider as IGM_LocaleProvider } from "./iGM_LocaleProvider";
import {
  iGM_AuthProvider as IGM_AuthProvider,
  iGM_UseAuth,
} from "./iGM_AuthProvider";
import { iGM_WebSocketProvider as IGM_WebSocketProvider } from "./iGM_WebSocketProvider";
import { iGM_SessionExpiredToast as IGM_SessionExpiredToast } from "../iGM_Components/iGM_SessionExpiredToast/iGM_SessionExpiredToast";
import { iGM_AIChatWidget as IGM_AIChatWidget } from "../iGM_Components/iGM_AIChatWidget/iGM_AIChatWidget";

// 类型定义 //
interface iGM_ProvidersProps {
  children: ReactNode;
  /** 由 [locale] 路由布局注入的初始语言 */
  initialLocale?: string;
}

// 核心逻辑 //
/** AI 助手宿主：登录账号 id 变化时用 key 强制重挂载悬浮窗（含登出切换为 anonymous） */
function iGM_AIChatHost() {
  const { user } = iGM_UseAuth();
  return <IGM_AIChatWidget key={user?.id ?? "anonymous"} />;
}

/** JSX 别名：组件名须大写开头才能被 JSX 识别（项目约定） */
const IGM_AIChatHost = iGM_AIChatHost;

/** 全站 Provider 聚合组件：外层主题、中层语言、内层认证与实时通信 */
export function iGM_Providers({ children, initialLocale }: iGM_ProvidersProps) {
  return (
    <IGM_ThemeProvider>
      <IGM_LocaleProvider initialLocale={initialLocale}>
        <IGM_AuthProvider>
          <IGM_SessionExpiredToast />
          <IGM_AIChatHost />
          <IGM_WebSocketProvider>{children}</IGM_WebSocketProvider>
        </IGM_AuthProvider>
      </IGM_LocaleProvider>
    </IGM_ThemeProvider>
  );
}

// 导出 //
export default iGM_Providers;
