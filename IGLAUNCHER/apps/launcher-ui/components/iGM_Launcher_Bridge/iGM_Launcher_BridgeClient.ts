/**
 * 文件路径：apps/launcher-ui/components/iGM_Launcher_Bridge/iGM_Launcher_BridgeClient.ts
 * 所属层：前端 / 桥接客户端层
 * 路由：全局
 * 模块：iGM_Launcher_BridgeClient
 * 作用：界面调用桥接层的唯一入口，屏蔽“桌面外壳 / 普通浏览器”的差异
 * 内容：外壳内经 Electrobun 宿主消息通道把 bridge:call 发给主进程并等待回包；
 *       浏览器内直接走 iGM_Launcher_LocalBackend 的 localStorage 回退实现；
 *       两种路径都返回统一的 { success, code, message, data }
 *
 * 说明：界面不引入 electrobun SDK，只使用预加载脚本注入的全局通道：
 *       发送 window.__electrobunSendToHost，接收 window.__electrobun.receiveMessageFromHost。
 */

// 导入依赖 //
import {
  IGM_LAUNCHER_BRIDGE_FAILED,
  type iGM_Launcher_BridgeDataMap,
  type iGM_Launcher_BridgeMethod,
  type iGM_Launcher_BridgeParams,
  type iGM_Launcher_BridgeReply,
  type iGM_Launcher_BridgeResponse,
  type iGM_Launcher_HostMessage,
} from "@igm-launcher/shared";
import { iGM_Launcher_LocalBackend_Call } from "./iGM_Launcher_LocalBackend";

// 类型定义 //
/** 待回包请求的兑现函数 */
type iGM_Launcher_BridgeResolver = (response: iGM_Launcher_BridgeResponse) => void;

declare global {
  interface Window {
    /** Electrobun 预加载脚本注入的宿主消息接收器（界面侧可接管） */
    __electrobun?: {
      receiveMessageFromHost?: (message: unknown) => void;
      receiveMessageFromBun?: (message: unknown) => void;
    };
    /** 预加载脚本缓存的早期宿主消息（接管接收器后排空） */
    __electrobunPendingHostMessages?: unknown[];
  }
}

// 核心逻辑 //

/** 桥接层回包通道标识（与 apps/shell/src/iGM_Launcher_Ipc.ts 保持一致） */
const IGM_LAUNCHER_BRIDGE_CHANNEL = "iGM_Launcher_Bridge";

/** 单次桥接调用超时（毫秒），超时按失败处理，避免界面永久等待 */
const IGM_LAUNCHER_BRIDGE_TIMEOUT_MS = 8000;

/** 请求编号 -> 兑现函数 */
const iGM_Launcher_BridgePending = new Map<string, iGM_Launcher_BridgeResolver>();

let iGM_Launcher_BridgeReceiverInstalled = false;

/** 判断当前是否运行在 Electrobun 桌面外壳内 */
export function iGM_Launcher_IsShellHost(): boolean {
  if (typeof window === "undefined") return false;
  return typeof window.__electrobunSendToHost === "function";
}

/** 校验并拆解主进程回包 */
function iGM_Launcher_ParseBridgeReply(message: unknown): iGM_Launcher_BridgeReply | null {
  if (!message || typeof message !== "object") return null;
  const candidate = message as Partial<iGM_Launcher_BridgeReply>;
  if (candidate.channel !== IGM_LAUNCHER_BRIDGE_CHANNEL) return null;
  if (typeof candidate.id !== "string" || !candidate.response) return null;
  return candidate as iGM_Launcher_BridgeReply;
}

/**
 * 接管宿主消息接收器（仅外壳内调用一次）。
 * 与 Electrobun 官方 Electroview 的做法一致：覆盖 receiveMessageFromHost，
 * 并排空预加载脚本在接管前缓存的消息。
 */
function iGM_Launcher_EnsureBridgeReceiver(): void {
  if (iGM_Launcher_BridgeReceiverInstalled) return;
  const channel = typeof window === "undefined" ? undefined : window.__electrobun;
  if (!channel) return;

  iGM_Launcher_BridgeReceiverInstalled = true;

  const handle = (message: unknown) => {
    const reply = iGM_Launcher_ParseBridgeReply(message);
    if (!reply) return;
    const resolve = iGM_Launcher_BridgePending.get(reply.id);
    if (!resolve) return;
    iGM_Launcher_BridgePending.delete(reply.id);
    resolve(reply.response);
  };

  channel.receiveMessageFromHost = handle;
  channel.receiveMessageFromBun = handle;

  const buffered = window.__electrobunPendingHostMessages;
  if (Array.isArray(buffered)) {
    window.__electrobunPendingHostMessages = [];
    buffered.forEach(handle);
  }
}

/** 生成请求编号 */
function iGM_Launcher_NewRequestId(): string {
  return `req-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * 统一桥接调用。
 * 外壳内走 IPC，浏览器内走本地回退，返回值结构完全一致。
 */
export async function iGM_Launcher_BridgeCall<M extends iGM_Launcher_BridgeMethod>(
  method: M,
  params?: iGM_Launcher_BridgeParams,
): Promise<iGM_Launcher_BridgeResponse<iGM_Launcher_BridgeDataMap[M]>> {
  const sendToHost = typeof window === "undefined" ? undefined : window.__electrobunSendToHost;
  if (typeof sendToHost !== "function") {
    return (await iGM_Launcher_LocalBackend_Call(
      method,
      params,
    )) as iGM_Launcher_BridgeResponse<iGM_Launcher_BridgeDataMap[M]>;
  }

  iGM_Launcher_EnsureBridgeReceiver();

  const id = iGM_Launcher_NewRequestId();
  const message: iGM_Launcher_HostMessage = {
    type: "bridge:call",
    id,
    method,
    params,
  };

  return new Promise<iGM_Launcher_BridgeResponse<iGM_Launcher_BridgeDataMap[M]>>((resolve) => {
    const timer = window.setTimeout(() => {
      iGM_Launcher_BridgePending.delete(id);
      resolve({
        success: false,
        code: IGM_LAUNCHER_BRIDGE_FAILED,
        message: "桥接层响应超时",
        data: null,
      });
    }, IGM_LAUNCHER_BRIDGE_TIMEOUT_MS);

    iGM_Launcher_BridgePending.set(id, (response) => {
      window.clearTimeout(timer);
      resolve(response as iGM_Launcher_BridgeResponse<iGM_Launcher_BridgeDataMap[M]>);
    });

    sendToHost(message);
  });
}

// 导出 //
export default iGM_Launcher_BridgeCall;