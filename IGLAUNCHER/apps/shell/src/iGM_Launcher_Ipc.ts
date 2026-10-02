/**
 * 文件路径：apps/shell/src/iGM_Launcher_Ipc.ts
 * 所属层：桌面外壳 / IPC 层
 * 路由：全局
 * 模块：iGM_Launcher_Ipc
 * 作用：承接界面经宿主消息通道发来的 bridge:call 请求，转交桥接层并把响应回填给 webview
 * 内容：请求 -> iGM_Launcher_Bridge_Call -> window.webview.queueHostMessageToWebview
 *
 * 说明：界面侧不引入 electrobun SDK，只使用预加载脚本注入的两个全局通道：
 *       发送 window.__electrobunSendToHost（主进程侧 host-message 事件），
 *       接收 window.__electrobun.receiveMessageFromHost（主进程侧 queueHostMessageToWebview），
 *       与模块一窗口控制的实现方式保持一致。
 */

// 导入依赖 //
import type { BrowserWindow } from "electrobun/main";
import type { iGM_Launcher_BridgeReply, iGM_Launcher_HostMessage } from "@igm-launcher/shared";
import { iGM_Launcher_Bridge_Call } from "./iGM_Launcher_Bridge";

// 类型定义 //
/** 界面发来的桥接调用消息（宿主消息联合类型的子集） */
interface iGM_Launcher_IpcCallMessage {
  type: "bridge:call";
  id: string;
  method: Parameters<typeof iGM_Launcher_Bridge_Call>[0];
  params?: Parameters<typeof iGM_Launcher_Bridge_Call>[1];
}

// 核心逻辑 //

/**
 * 解析 webview 上报的宿主消息。
 * Electrobun 的 webview 事件把消息体放在事件对象的 data.detail 上
 * （事件构造为 new ElectrobunEvent("host-message", { detail })），
 * 因此优先读取 data.detail，并兼容仅暴露 detail 的旧形态与已解析对象，
 * 解析失败一律返回 null 并由调用方忽略。
 * 主窗口与下载进度窗口共用本函数，避免两处解析口径不一致。
 */
export function iGM_Launcher_Ipc_ParseHostMessage(payload: unknown): iGM_Launcher_HostMessage | null {
  const normalize = (value: unknown): iGM_Launcher_HostMessage | null => {
    if (typeof value === "string") {
      try {
        return normalize(JSON.parse(value));
      } catch {
        return null;
      }
    }
    if (value && typeof value === "object") {
      const candidate = value as { type?: unknown };
      if (typeof candidate.type === "string") {
        return value as iGM_Launcher_HostMessage;
      }
    }
    return null;
  };

  if (!payload || typeof payload !== "object") return null;

  const data = (payload as { data?: unknown }).data;
  if (data && typeof data === "object" && "detail" in data) {
    const fromData = normalize((data as { detail: unknown }).detail);
    if (fromData) return fromData;
  }

  if ("detail" in payload) {
    const fromDetail = normalize((payload as { detail: unknown }).detail);
    if (fromDetail) return fromDetail;
  }

  return normalize(payload);
}

/** 判断是否为桥接调用消息 */
export function iGM_Launcher_Ipc_IsCallMessage(
  message: unknown,
): message is iGM_Launcher_IpcCallMessage {
  if (!message || typeof message !== "object") return false;
  const candidate = message as { type?: unknown; id?: unknown; method?: unknown };
  return (
    candidate.type === "bridge:call" &&
    typeof candidate.id === "string" &&
    typeof candidate.method === "string"
  );
}

/** 把响应回填给指定窗口的 webview；窗口已销毁时静默忽略 */
function iGM_Launcher_Ipc_Reply(window: BrowserWindow, reply: iGM_Launcher_BridgeReply): void {
  window.webview?.queueHostMessageToWebview(reply);
}

/**
 * 处理一条桥接调用消息。
 * 返回 true 表示已接管该消息（调用方无需再走窗口控制分支）。
 */
export function iGM_Launcher_Ipc_HandleMessage(
  window: BrowserWindow,
  message: unknown,
): boolean {
  if (!iGM_Launcher_Ipc_IsCallMessage(message)) return false;

  void iGM_Launcher_Bridge_Call(message.method, message.params).then(
    (response) => {
      iGM_Launcher_Ipc_Reply(window, {
        channel: "iGM_Launcher_Bridge",
        id: message.id,
        response,
      });
    },
    (error: unknown) => {
      // 桥接层内部已兜底，此处仅防 Promise 意外拒绝导致无响应
      iGM_Launcher_Ipc_Reply(window, {
        channel: "iGM_Launcher_Bridge",
        id: message.id,
        response: {
          success: false,
          code: 500,
          message: error instanceof Error ? error.message : "桥接层调用异常",
          data: null,
        },
      });
    },
  );

  return true;
}

// 导出 //
export default iGM_Launcher_Ipc_HandleMessage;