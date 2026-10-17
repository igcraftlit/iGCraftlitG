/**
 * 文件路径：apps/shell/src/iGM_LauncherV2_Ipc.ts
 * 所属层：桌面外壳 / 进程间通信层
 * 路由：全局
 * 模块：iGM_LauncherV2_Ipc
 * 作用：主进程与界面之间的宿主消息契约与解析/回推工具
 * 内容：界面经 Electrobun 预加载脚本注入的 window.__electrobunSendToHost 发送指令，
 *       主进程经 webview 的 host-message 事件接收；
 *       主进程经 webview.queueHostMessageToWebview 回推状态
 *       （其内部执行页面侧 window.__electrobun.receiveMessageFromHost）；
 *       解析兼容 data.detail、detail 与已解析对象三种事件形态
 */

// 导入依赖 //
import type { BrowserWindow } from "electrobun/main";

// 类型定义 //

/** 界面发往外壳的指令 */
export type iGM_LauncherV2_OutboundMessage =
  | { type: "window:minimize" }
  | { type: "window:toggle-maximize" }
  | { type: "window:close" }
  | { type: "auth:status" }
  | { type: "auth:login" }
  | { type: "auth:logout" }
  | { type: "core:ping" };

/** 社区账号登录状态 */
export type iGM_LauncherV2_AuthState = "logged-out" | "pending" | "logged-in";

/** 已登录的社区账号公开视图（不含任何令牌） */
export interface iGM_LauncherV2_AuthUser {
  uid: string;
  nickname: string;
  avatar: string;
}

/** 外壳回推给界面的状态消息 */
export type iGM_LauncherV2_InboundMessage =
  | {
      type: "auth:state";
      state: iGM_LauncherV2_AuthState;
      user: iGM_LauncherV2_AuthUser | null;
      message?: string;
    }
  | {
      type: "core:status";
      state: "ok" | "unavailable";
      detail: string;
      version?: string;
    };

// 核心逻辑 //

/** 校验载荷是否形如宿主消息 */
function iGM_LauncherV2_Normalize(value: unknown): iGM_LauncherV2_OutboundMessage | null {
  if (typeof value === "string") {
    try {
      return iGM_LauncherV2_Normalize(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (value && typeof value === "object") {
    const candidate = value as { type?: unknown };
    if (typeof candidate.type === "string") {
      return value as iGM_LauncherV2_OutboundMessage;
    }
  }
  return null;
}

/**
 * 解析 webview 上报的宿主消息。
 * Electrobun 的 webview 事件把消息体放在 data.detail 上
 * （事件构造为 new ElectrobunEvent("host-message", { detail })），
 * 故依次尝试 data.detail、detail 与顶层对象，全部失败返回 null 由调用方忽略。
 */
export function iGM_LauncherV2_ParseHostMessage(
  payload: unknown,
): iGM_LauncherV2_OutboundMessage | null {
  if (!payload || typeof payload !== "object") return null;

  const data = (payload as { data?: unknown }).data;
  if (data && typeof data === "object" && "detail" in data) {
    const fromData = iGM_LauncherV2_Normalize((data as { detail: unknown }).detail);
    if (fromData) return fromData;
  }

  if ("detail" in payload) {
    const fromDetail = iGM_LauncherV2_Normalize((payload as { detail: unknown }).detail);
    if (fromDetail) return fromDetail;
  }

  return iGM_LauncherV2_Normalize(payload);
}

/** 把状态消息回推给界面；窗口已销毁时静默跳过 */
export function iGM_LauncherV2_Push(
  window: BrowserWindow,
  message: iGM_LauncherV2_InboundMessage,
): void {
  // 官方通道：queueHostMessageToWebview 内部即执行
  // window.__electrobun.receiveMessageFromHost(...)，预加载脚本会缓存未就绪的消息
  window.webview?.queueHostMessageToWebview(message);
}

/** 生成一个回推函数（绑定到某个窗口），便于向各模块注入而不暴露窗口对象 */
export function iGM_LauncherV2_Pusher(
  window: BrowserWindow,
): (message: iGM_LauncherV2_InboundMessage) => void {
  return (message) => iGM_LauncherV2_Push(window, message);
}

// 导出 //
export default iGM_LauncherV2_ParseHostMessage;
