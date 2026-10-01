/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_HostBridge/iGM_Launcher_HostBridge.ts
 * 所属层：前端 / 宿主桥接层
 * 路由：全局
 * 模块：iGM_Launcher_HostBridge
 * 作用：把界面上的窗口控制动作转成 Electrobun 宿主消息
 * 内容：Electrobun 的预加载脚本默认向每个 webview 注入 window.__electrobunSendToHost，
 *       它在主进程侧触发 host-message 事件（见 apps/shell/src/iGM_Launcher_Main.ts）；
 *       普通浏览器（next dev）中该函数不存在，窗口控件自动隐藏
 */

// 导入依赖 //
"use client";

import { useEffect, useState } from "react";
import type {
  iGM_Installer_HostMessage,
  iGM_Launcher_HostMessage,
} from "@igm-launcher/shared";

// 类型定义 //
/**
 * 界面可用的窗口控制桥接。
 * 仅做单向事件投递，不暴露任何特权 RPC，静态界面可安全引用。
 */
export interface iGM_Launcher_Bridge {
  /** 固定为 true，供界面区分桌面外壳与普通浏览器 */
  readonly isShell: true;
  /** 最小化窗口 */
  minimize: () => void;
  /** 在最大化与还原之间切换 */
  toggleMaximize: () => void;
  /** 请求关闭窗口 */
  close: () => void;
}

declare global {
  interface Window {
    /**
     * Electrobun 预加载脚本注入的宿主消息通道，仅桌面外壳内存在。
     * 模块七起同时承载启动器窗口控制与安装向导 installer:* 指令，故取二者联合类型。
     */
    __electrobunSendToHost?: (
      message: iGM_Launcher_HostMessage | iGM_Installer_HostMessage,
    ) => void;
  }
}

// 核心逻辑 //
/**
 * 挂载后探测宿主通道：
 * - 桌面外壳内返回桥接对象，窗口控制按钮显示
 * - 普通浏览器内返回 null，窗口控制按钮不渲染
 * 仅在 effect 中更新，避免静态首帧与客户端渲染不一致
 */
export function iGM_Launcher_UseHostBridge(): iGM_Launcher_Bridge | null {
  const [bridge, setBridge] = useState<iGM_Launcher_Bridge | null>(null);

  useEffect(() => {
    const sendToHost = window.__electrobunSendToHost;
    if (typeof sendToHost !== "function") {
      setBridge(null);
      return;
    }

    setBridge({
      isShell: true,
      minimize: () => sendToHost({ type: "window:minimize" }),
      toggleMaximize: () => sendToHost({ type: "window:toggle-maximize" }),
      close: () => sendToHost({ type: "window:close" }),
    });
  }, []);

  return bridge;
}

// 导出 //
export default iGM_Launcher_UseHostBridge;