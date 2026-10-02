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
  IGM_LAUNCHER_API_THIRD_PARTY_TIMEOUT_MS,
  IGM_LAUNCHER_BRIDGE_FAILED,
  IGM_LAUNCHER_BRIDGE_TIMEOUT_MS,
  IGM_LAUNCHER_DIALOG_TIMEOUT_MS,
  IGM_LAUNCHER_DOWNLOAD_PROGRESS_CHANNEL,
  type iGM_Launcher_BridgeDataMap,
  type iGM_Launcher_BridgeMethod,
  type iGM_Launcher_BridgeParams,
  type iGM_Launcher_BridgeReply,
  type iGM_Launcher_BridgeResponse,
  type iGM_Launcher_DownloadProgressEvent,
  type iGM_Launcher_HostMessage,
} from "@igm-launcher/shared";
import { iGM_Launcher_LocalBackend_Call } from "./iGM_Launcher_LocalBackend";

// 类型定义 //
/** 待回包请求的兑现函数 */
type iGM_Launcher_BridgeResolver = (response: iGM_Launcher_BridgeResponse) => void;

/** 独立下载进度窗口宿主事件的订阅者 */
type iGM_Launcher_DownloadProgressListener = (event: iGM_Launcher_DownloadProgressEvent) => void;

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

/** 请求编号 -> 兑现函数 */
const iGM_Launcher_BridgePending = new Map<string, iGM_Launcher_BridgeResolver>();

/**
 * 独立下载进度窗口宿主事件的订阅者集合。
 * 进度窗口与主窗口共用同一条宿主消息通道，非回包消息统一在此分发，
 * 使进度窗口无需轮询任务列表即可实时刷新进度。
 */
const iGM_Launcher_DownloadProgressListeners = new Set<iGM_Launcher_DownloadProgressListener>();

/**
 * 按方法解析单次调用的等待超时（毫秒）。
 * 统一 8 秒会把需要等待用户操作或回源上游的方法误判为超时：
 * - minecraft:pick-dir / installer 目录选择器等原生弹窗需等待用户浏览；
 * - thirdParty:* 首次回源 Modrinth 拉版本、创建下载任务耗时高于普通接口。
 */
function iGM_Launcher_ResolveBridgeTimeout(method: iGM_Launcher_BridgeMethod): number {
  if (method === "minecraft:pick-dir") return IGM_LAUNCHER_DIALOG_TIMEOUT_MS;
  if (method.startsWith("thirdParty:")) return IGM_LAUNCHER_API_THIRD_PARTY_TIMEOUT_MS;
  return IGM_LAUNCHER_BRIDGE_TIMEOUT_MS;
}

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

/** 校验并拆解主进程回推的下载进度窗口事件 */
function iGM_Launcher_ParseDownloadProgressEvent(
  message: unknown,
): iGM_Launcher_DownloadProgressEvent | null {
  if (!message || typeof message !== "object") return null;
  const candidate = message as Partial<iGM_Launcher_DownloadProgressEvent>;
  if (candidate.channel !== IGM_LAUNCHER_DOWNLOAD_PROGRESS_CHANNEL) return null;
  if (candidate.type !== "init" && candidate.type !== "progress") return null;
  return candidate as iGM_Launcher_DownloadProgressEvent;
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
    // 1) 桥接回包：按请求编号兑现
    const reply = iGM_Launcher_ParseBridgeReply(message);
    if (reply) {
      const resolve = iGM_Launcher_BridgePending.get(reply.id);
      if (!resolve) return;
      iGM_Launcher_BridgePending.delete(reply.id);
      resolve(reply.response);
      return;
    }
    // 2) 下载进度窗口事件：分发给订阅者（主窗口无订阅者时为空操作）
    const event = iGM_Launcher_ParseDownloadProgressEvent(message);
    if (event) {
      iGM_Launcher_DownloadProgressListeners.forEach((listener) => listener(event));
    }
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
    }, iGM_Launcher_ResolveBridgeTimeout(method));

    iGM_Launcher_BridgePending.set(id, (response) => {
      window.clearTimeout(timer);
      resolve(response as iGM_Launcher_BridgeResponse<iGM_Launcher_BridgeDataMap[M]>);
    });

    sendToHost(message);
  });
}

// 导出 //

/**
 * 直接向主进程发送一条宿主消息。
 * 供独立下载进度窗口做就绪握手（downloadProgress:init）与窗口控制使用；
 * 非外壳环境（浏览器预览）返回 false，调用方据此忽略。
 */
export function iGM_Launcher_SendHostMessage(message: iGM_Launcher_HostMessage): boolean {
  const sendToHost = typeof window === "undefined" ? undefined : window.__electrobunSendToHost;
  if (typeof sendToHost !== "function") return false;
  sendToHost(message);
  return true;
}

/**
 * 订阅独立下载进度窗口的宿主事件（init / progress）。
 * 返回取消订阅函数；调用时会顺带接管宿主消息接收器，避免消息落到预加载默认处理器。
 */
export function iGM_Launcher_SubscribeDownloadProgress(
  listener: iGM_Launcher_DownloadProgressListener,
): () => void {
  iGM_Launcher_EnsureBridgeReceiver();
  iGM_Launcher_DownloadProgressListeners.add(listener);
  return () => {
    iGM_Launcher_DownloadProgressListeners.delete(listener);
  };
}

export default iGM_Launcher_BridgeCall;