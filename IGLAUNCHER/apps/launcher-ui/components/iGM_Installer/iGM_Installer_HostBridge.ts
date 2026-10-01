/**
 * 文件路径：apps/launcher-ui/components/iGM_Installer/iGM_Installer_HostBridge.ts
 * 所属层：前端 / 安装向导桥接层
 * 路由：G_Installer
 * 模块：iGM_Installer_HostBridge
 * 作用：安装向导与安装程序主进程之间的宿主通道封装
 * 内容：向导经 window.__electrobunSendToHost 发送 installer:* 指令；
 *       主进程经 webview.executeJavascript 调用页面注册的 window.__igmInstallerHost
 *       回推进度与目录选择结果；普通浏览器中无宿主通道，指令一律静默忽略
 */

// 导入依赖 //
"use client";

import { useEffect, useState } from "react";
import type {
  iGM_Installer_HostEvent,
  iGM_Installer_HostMessage,
  iGM_Installer_Progress,
} from "@igm-launcher/shared";

// 类型定义 //
/** 目录选择与就绪信息的回执集合 */
export interface iGM_Installer_HostState {
  /** 是否运行在安装程序外壳内 */
  isHost: boolean;
  /** 主进程给出的默认安装目录 */
  defaultDir: string | null;
  /** 用户经系统目录选择器挑中的目录（取消时为 null） */
  pickedDir: string | null;
  /** 安装程序当前记录的语言（未选择时为 null） */
  locale: string | null;
  /** 最近一次安装进度 */
  progress: iGM_Installer_Progress | null;
}

declare global {
  interface Window {
    /** 安装程序主进程经 executeJavascript 调用的回推入口 */
    __igmInstallerHost?: (event: unknown) => void;
  }
}

// 核心逻辑 //

/** 向安装程序主进程发送指令；无宿主通道（浏览器）时返回 false */
export function iGM_Installer_SendHost(message: iGM_Installer_HostMessage): boolean {
  if (typeof window === "undefined") return false;
  const sendToHost = window.__electrobunSendToHost;
  if (typeof sendToHost !== "function") return false;
  sendToHost(message);
  return true;
}

/** 判断当前是否运行在安装程序外壳内 */
export function iGM_Installer_IsHost(): boolean {
  if (typeof window === "undefined") return false;
  return typeof window.__electrobunSendToHost === "function";
}

/**
 * 订阅主进程回推事件。
 * 挂载即注册 window.__igmInstallerHost，卸载时移除，避免热更新后重复绑定。
 */
export function iGM_Installer_UseHostState(): iGM_Installer_HostState {
  const [state, setState] = useState<iGM_Installer_HostState>({
    isHost: false,
    defaultDir: null,
    pickedDir: null,
    locale: null,
    progress: null,
  });

  useEffect(() => {
    setState((current) => ({ ...current, isHost: iGM_Installer_IsHost() }));

    const handle = (event: unknown) => {
      if (!event || typeof event !== "object") return;
      const typed = event as iGM_Installer_HostEvent;
      switch (typed.type) {
        case "installer:ready":
          setState((current) => ({
            ...current,
            defaultDir: typed.defaultDir,
            locale: typed.locale,
          }));
          break;
        case "installer:dir-picked":
          setState((current) => ({ ...current, pickedDir: typed.dir }));
          break;
        case "installer:progress":
          setState((current) => ({ ...current, progress: typed.progress }));
          break;
        default:
          break;
      }
    };

    window.__igmInstallerHost = handle;
    return () => {
      if (window.__igmInstallerHost === handle) window.__igmInstallerHost = undefined;
    };
  }, []);

  return state;
}

// 导出 //
export default iGM_Installer_UseHostState;