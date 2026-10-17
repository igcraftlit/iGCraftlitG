/**
 * 文件路径：apps/launcher-ui/components/iGM_LauncherV2_HostBridge/iGM_LauncherV2_HostBridge.ts
 * 所属层：前端 / 宿主桥接层
 * 路由：全局
 * 模块：iGM_LauncherV2_HostBridge
 * 作用：界面与 Electrobun 外壳之间的双向宿主通道封装
 * 内容：界面经预加载脚本注入的 window.__electrobunSendToHost 发送窗口控制与授权指令；
 *       外壳经 webview.queueHostMessageToWebview 回推，页面侧对应
 *       window.__electrobun.receiveMessageFromHost，此处按官方做法接管该入口
 *       并排空预加载脚本在接管前缓存的消息；
 *       普通浏览器（next dev）中不存在宿主通道，所有指令静默忽略，界面退化为纯静态展示
 * 说明：对外只暴露单向指令投递与只读状态订阅，不暴露任何特权 RPC
 */

// 导入依赖 //
"use client";

import { useEffect, useSyncExternalStore } from "react";
import type {
  iGM_LauncherV2_AuthState,
  iGM_LauncherV2_AuthUser,
  iGM_LauncherV2_InboundMessage,
  iGM_LauncherV2_OutboundMessage,
} from "@/lib/iGM_LauncherV2_Constants";
import { IGM_LAUNCHERV2_REDIRECT_URI } from "@/lib/iGM_LauncherV2_Constants";

// 类型定义 //

/** 授权状态快照 */
export interface iGM_LauncherV2_AuthSnapshot {
  state: iGM_LauncherV2_AuthState;
  user: iGM_LauncherV2_AuthUser | null;
  /** 最近一次失败原因（授权失败或后端拒绝时展示） */
  message: string;
}

/** Rust 核心连通性快照 */
export interface iGM_LauncherV2_CoreSnapshot {
  state: "ok" | "unavailable" | "pending";
  detail: string;
  version: string;
}

type iGM_LauncherV2_Listener = () => void;

// 核心逻辑 //

/** 固定引用的初始快照，供服务端渲染与首帧复用 */
const IGM_AUTH_INITIAL: iGM_LauncherV2_AuthSnapshot = {
  state: "logged-out",
  user: null,
  message: "",
};

const IGM_CORE_INITIAL: iGM_LauncherV2_CoreSnapshot = {
  state: "pending",
  detail: "",
  version: "",
};

/** 模块级单例状态：多组件订阅同一份快照，避免各自重复拉取 */
let iGM_AuthSnapshot: iGM_LauncherV2_AuthSnapshot = IGM_AUTH_INITIAL;
let iGM_CoreSnapshot: iGM_LauncherV2_CoreSnapshot = IGM_CORE_INITIAL;
const iGM_Listeners = new Set<iGM_LauncherV2_Listener>();

let iGM_ReceiverInstalled = false;

function iGM_Emit(): void {
  for (const listener of iGM_Listeners) listener();
}

/** 判定当前是否运行在 Electrobun 外壳内 */
export function iGM_LauncherV2_IsShell(): boolean {
  if (typeof window === "undefined") return false;
  return typeof window.__electrobunSendToHost === "function";
}

/** 向外壳发送一条指令；浏览器环境下返回 false 且不产生任何副作用 */
export function iGM_LauncherV2_SendHost(message: iGM_LauncherV2_OutboundMessage): boolean {
  if (typeof window === "undefined") return false;
  const send = window.__electrobunSendToHost;
  if (typeof send !== "function") return false;
  send(message);
  return true;
}

/** 解析外壳回推载荷：兼容字符串 JSON、已解析对象与仅含 detail 的包装形态 */
function iGM_NormalizeInbound(payload: unknown): iGM_LauncherV2_InboundMessage | null {
  const unwrap = (value: unknown): iGM_LauncherV2_InboundMessage | null => {
    if (typeof value === "string") {
      try {
        return unwrap(JSON.parse(value));
      } catch {
        return null;
      }
    }
    if (value && typeof value === "object") {
      const candidate = value as { type?: unknown };
      if (typeof candidate.type === "string") {
        return value as iGM_LauncherV2_InboundMessage;
      }
    }
    return null;
  };

  if (payload && typeof payload === "object" && "detail" in payload) {
    const fromDetail = unwrap((payload as { detail: unknown }).detail);
    if (fromDetail) return fromDetail;
  }
  return unwrap(payload);
}

/** 处理一条外壳回推消息：更新快照并通知订阅者 */
function iGM_HandleInbound(payload: unknown): void {
  const message = iGM_NormalizeInbound(payload);
  if (!message) return;

  if (message.type === "auth:state") {
    iGM_AuthSnapshot = {
      state: message.state,
      user: message.user ?? null,
      message: message.message ?? "",
    };
    iGM_Emit();
    return;
  }

  if (message.type === "core:status") {
    iGM_CoreSnapshot = {
      state: message.state,
      detail: message.detail,
      version: message.version ?? "",
    };
    iGM_Emit();
  }
}

/**
 * 接管宿主消息接收器（仅外壳内生效）。
 * 与 Electrobun 官方 Electroview 的做法一致：覆盖 receiveMessageFromHost，
 * 并排空预加载脚本在接管前缓存的消息。
 */
function iGM_InstallReceiver(): void {
  if (typeof window === "undefined" || iGM_ReceiverInstalled) return;

  const channel = window.__electrobun;
  if (!channel) return;

  iGM_ReceiverInstalled = true;

  const handle = (payload: unknown) => iGM_HandleInbound(payload);
  channel.receiveMessageFromHost = handle;
  channel.receiveMessageFromBun = handle;

  const buffered = window.__electrobunPendingHostMessages;
  if (Array.isArray(buffered)) {
    window.__electrobunPendingHostMessages = [];
    buffered.forEach(handle);
  }
}

function iGM_Subscribe(listener: iGM_LauncherV2_Listener): () => void {
  iGM_Listeners.add(listener);
  return () => {
    iGM_Listeners.delete(listener);
  };
}

function iGM_GetAuthSnapshot(): iGM_LauncherV2_AuthSnapshot {
  return iGM_AuthSnapshot;
}

function iGM_GetCoreSnapshot(): iGM_LauncherV2_CoreSnapshot {
  return iGM_CoreSnapshot;
}

// 导出 //

/**
 * 社区授权状态订阅。
 * 挂载即向外壳询问当前登录状态；外壳会回推 auth:state。
 */
export function iGM_LauncherV2_UseAuth(): iGM_LauncherV2_AuthSnapshot & {
  isShell: boolean;
  login: () => void;
  logout: () => void;
} {
  const snapshot = useSyncExternalStore(
    iGM_Subscribe,
    iGM_GetAuthSnapshot,
    () => IGM_AUTH_INITIAL,
  );

  useEffect(() => {
    iGM_InstallReceiver();
    iGM_LauncherV2_SendHost({ type: "auth:status" });
  }, []);

  return {
    ...snapshot,
    isShell: iGM_LauncherV2_IsShell(),
    login: () => {
      iGM_AuthSnapshot = { ...iGM_AuthSnapshot, state: "pending", message: "" };
      iGM_Emit();
      iGM_LauncherV2_SendHost({ type: "auth:login" });
    },
    logout: () => iGM_LauncherV2_SendHost({ type: "auth:logout" }),
  };
}

/** Rust 核心连通性订阅。挂载即向外壳发起一次 ping。 */
export function iGM_LauncherV2_UseCoreStatus(): iGM_LauncherV2_CoreSnapshot {
  const snapshot = useSyncExternalStore(
    iGM_Subscribe,
    iGM_GetCoreSnapshot,
    () => IGM_CORE_INITIAL,
  );

  useEffect(() => {
    iGM_InstallReceiver();
    iGM_LauncherV2_SendHost({ type: "core:ping" });
  }, []);

  return snapshot;
}

/** 窗口控制：最小化 / 最大化切换 / 关闭；浏览器中为无操作 */
export const iGM_LauncherV2_WindowControls = {
  minimize: () => iGM_LauncherV2_SendHost({ type: "window:minimize" }),
  toggleMaximize: () => iGM_LauncherV2_SendHost({ type: "window:toggle-maximize" }),
  close: () => iGM_LauncherV2_SendHost({ type: "window:close" }),
};

/** 社区授权本地回调地址（供界面展示，便于用户核对） */
export const IGM_LAUNCHERV2_HOST_REDIRECT_URI = IGM_LAUNCHERV2_REDIRECT_URI;

export default iGM_LauncherV2_SendHost;
