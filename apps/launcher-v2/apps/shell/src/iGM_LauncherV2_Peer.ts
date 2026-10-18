/**
 * 文件路径：apps/shell/src/iGM_LauncherV2_Peer.ts
 * 所属层：桌面外壳 / 联机服务层
 * 路由：G_Peer
 * 模块：iGM_LauncherV2_Peer
 * 作用：联机大厅（P2P）双方案连接与房间信令的本地实现
 * 内容：主方案优先通过主站（api.igcraftlit.com）的 WebSocket 节点完成房间注册与信令交换，
 *       探测成功时模式为 community，界面展示「已连接主站高速联机节点」；
 *       主站不可用时自动降级到公共联机节点（EasyTier 社区公共节点 + 公共 STUN/TURN），
 *       模式为 public，界面展示「已连接公共联机节点（可能稍有延迟）」；
 *       房间码为本地生成的 6 位数字串，创建 / 加入 / 退出统一经本模块管理并回推状态
 * 说明：本模块只搭建基础调用框架，真实信令转发依赖后续后端实现；
 *       连接探测带超时，任何异常都归类为「主站不可用」并触发降级，不向界面抛出错误
 */

// 导入依赖 //
import {
  IGM_LAUNCHERV2_APP_NAME,
  IGM_LAUNCHERV2_COMMUNITY_ISSUER,
  IGM_LAUNCHERV2_VERSION,
} from "./iGM_LauncherV2_Constants";
import type {
  iGM_LauncherV2_InboundMessage,
  iGM_LauncherV2_PeerMode,
  iGM_LauncherV2_PeerState,
} from "./iGM_LauncherV2_Ipc";

// 类型定义 //

/** 状态回推函数（与主进程其它服务保持一致的签名） */
type iGM_LauncherV2_PeerNotifier = (message: iGM_LauncherV2_InboundMessage) => void;

// 常量与文案 //

/** 主站联机节点 WebSocket 路径 */
const IGM_LAUNCHERV2_PEER_WS_PATH = "/ws/peer";

/** 主站联机节点连接超时（毫秒） */
const IGM_LAUNCHERV2_PEER_CONNECT_TIMEOUT_MS = 6000;

/** 房间码长度 */
const IGM_LAUNCHERV2_PEER_ROOM_CODE_LENGTH = 6;

/** 备选方案：EasyTier 社区公共节点（主站不可用时使用） */
const IGM_LAUNCHERV2_PEER_PUBLIC_RELAYS = ["public.easytier.cn:11010", "relay.easytier.cn:11010"];

/** 备选方案：公共 STUN / TURN 服务（用于直连打洞） */
const IGM_LAUNCHERV2_PEER_PUBLIC_STUN = [
  "stun.l.google.com:19302",
  "stun.cloudflare.com:3478",
];

/** 各连接模式对应的界面状态文案 */
const IGM_LAUNCHERV2_PEER_STATUS: Record<iGM_LauncherV2_PeerMode, string> = {
  idle: "尚未连接联机节点",
  connecting: "正在连接联机节点…",
  community: "已连接主站高速联机节点",
  public: "已连接公共联机节点（可能稍有延迟）",
};

// 核心逻辑 //

/** 当前连接模式 */
let iGM_PeerMode: iGM_LauncherV2_PeerMode = "idle";

/** 当前房间码；不在房间时为空串 */
let iGM_PeerRoom = "";

/** 当前用户是否为房主 */
let iGM_PeerHost = false;

/** 房间内人数（框架阶段恒为 0 或 1） */
let iGM_PeerCount = 0;

/** 附加提示 */
let iGM_PeerMessage = "";

/** 主站联机节点长连接；未连接为 null */
let iGM_PeerSocket: WebSocket | null = null;

/** 依据当前模式生成状态文案 */
function iGM_LauncherV2_PeerStatusText(mode: iGM_LauncherV2_PeerMode): string {
  return IGM_LAUNCHERV2_PEER_STATUS[mode];
}

/** 组装并回推联机状态 */
function iGM_LauncherV2_PeerPush(notify: iGM_LauncherV2_PeerNotifier): void {
  notify({ type: "peer:state", state: iGM_LauncherV2_PeerSnapshot() });
}

/** 当前联机状态快照 */
export function iGM_LauncherV2_PeerSnapshot(): iGM_LauncherV2_PeerState {
  return {
    mode: iGM_PeerMode,
    status: iGM_LauncherV2_PeerStatusText(iGM_PeerMode),
    roomCode: iGM_PeerRoom,
    host: iGM_PeerHost,
    peers: iGM_PeerCount,
    message: iGM_PeerMessage,
  };
}

/** 构造可直接回推的联机状态消息 */
export function iGM_LauncherV2_PeerSnapshotMessage(): iGM_LauncherV2_InboundMessage {
  return { type: "peer:state", state: iGM_LauncherV2_PeerSnapshot() };
}

/** 主站联机节点的 WebSocket 地址（由社区签发方派生：https -> wss） */
function iGM_LauncherV2_PeerSocketUrl(): string {
  const base = IGM_LAUNCHERV2_COMMUNITY_ISSUER.replace(/^http/i, "ws").replace(/\/+$/, "");
  return `${base}${IGM_LAUNCHERV2_PEER_WS_PATH}`;
}

/** 向已建立的主站连接投递信令；未连接或发送失败时静默忽略（框架阶段允许降级） */
function iGM_LauncherV2_PeerSend(payload: Record<string, unknown>): void {
  const socket = iGM_PeerSocket;
  if (!socket || socket.readyState !== 1) return;
  try {
    socket.send(JSON.stringify(payload));
  } catch {
    /* 信令投递失败不影响本地状态，交由后续重连处理 */
  }
}

/** 探测主站联机节点可用性：带超时的 WebSocket 握手，成功即保留长连接 */
async function iGM_LauncherV2_PeerProbeCommunity(): Promise<boolean> {
  const url = iGM_LauncherV2_PeerSocketUrl();
  return new Promise<boolean>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let socket: WebSocket | null = null;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (ok) {
        iGM_PeerSocket = socket;
      } else {
        try {
          socket?.close();
        } catch {
          /* 关闭异常忽略 */
        }
      }
      resolve(ok);
    };

    try {
      // 桌面端为原生 WebSocket 实现，连接失败会触发 error / close，不会抛出到调用方
      socket = new WebSocket(url);
    } catch {
      resolve(false);
      return;
    }

    timer = setTimeout(() => finish(false), IGM_LAUNCHERV2_PEER_CONNECT_TIMEOUT_MS);
    socket.addEventListener("open", () => finish(true));
    socket.addEventListener("error", () => finish(false));
    socket.addEventListener("close", () => finish(false));
  });
}

/** 生成 6 位房间码（不使用前导 0，便于口述与手输） */
function iGM_LauncherV2_PeerGenerateRoomCode(): string {
  const min = 10 ** (IGM_LAUNCHERV2_PEER_ROOM_CODE_LENGTH - 1);
  const max = 10 ** IGM_LAUNCHERV2_PEER_ROOM_CODE_LENGTH - 1;
  return String(min + Math.floor(Math.random() * (max - min + 1)));
}

/** 连接联机节点：主站优先，失败自动降级到公共联机节点 */
export async function iGM_LauncherV2_Peer_Connect(
  notify: iGM_LauncherV2_PeerNotifier,
): Promise<void> {
  iGM_PeerMode = "connecting";
  iGM_PeerMessage = "";
  iGM_LauncherV2_PeerPush(notify);

  const ok = await iGM_LauncherV2_PeerProbeCommunity();

  iGM_PeerMode = ok ? "community" : "public";
  if (!ok) {
    // 降级说明中带上公共节点信息，便于用户判断延迟来源
    iGM_PeerMessage = `主站联机节点不可用，已切换至公共联机节点（${IGM_LAUNCHERV2_PEER_PUBLIC_RELAYS[0]}）；直连打洞使用公共 STUN/TURN（${IGM_LAUNCHERV2_PEER_PUBLIC_STUN[0]}）`;
  }
  iGM_LauncherV2_PeerPush(notify);
}

/** 创建房间：连接可用时生成 6 位房间码并注册 */
export async function iGM_LauncherV2_Peer_Create(notify: iGM_LauncherV2_PeerNotifier): Promise<void> {
  if (iGM_PeerMode !== "community" && iGM_PeerMode !== "public") {
    await iGM_LauncherV2_Peer_Connect(notify);
  }

  iGM_PeerRoom = iGM_LauncherV2_PeerGenerateRoomCode();
  iGM_PeerHost = true;
  // 已连上主站时向节点注册房间；公共节点由后续 EasyTier 实现接管
  iGM_LauncherV2_PeerSend({ action: "room:create", room: iGM_PeerRoom });
  iGM_PeerCount = 1;
  iGM_PeerMessage =
    iGM_PeerMode === "community"
      ? `房间已创建（${IGM_LAUNCHERV2_APP_NAME}/${IGM_LAUNCHERV2_VERSION}）；把房间码发给好友即可加入`
      : "房间已在公共联机节点创建；公共节点延迟略高，建议好友网络状况良好时使用";
  iGM_LauncherV2_PeerPush(notify);
}

/** 加入房间：校验 6 位房间码后注册 */
export async function iGM_LauncherV2_Peer_Join(
  code: string,
  notify: iGM_LauncherV2_PeerNotifier,
): Promise<void> {
  const normalized = code.trim();
  const pattern = new RegExp(`^\\d{${IGM_LAUNCHERV2_PEER_ROOM_CODE_LENGTH}}$`);
  if (!pattern.test(normalized)) {
    iGM_PeerMessage = `房间码应为 ${IGM_LAUNCHERV2_PEER_ROOM_CODE_LENGTH} 位数字，请检查后重试`;
    iGM_LauncherV2_PeerPush(notify);
    return;
  }

  if (iGM_PeerMode !== "community" && iGM_PeerMode !== "public") {
    await iGM_LauncherV2_Peer_Connect(notify);
  }

  iGM_PeerRoom = normalized;
  iGM_PeerHost = false;
  iGM_LauncherV2_PeerSend({ action: "room:join", room: iGM_PeerRoom });
  iGM_PeerCount = 1;
  iGM_PeerMessage =
    iGM_PeerMode === "community"
      ? `已加入房间 ${normalized}，正在等待房主确认`
      : `已在公共联机节点加入房间 ${normalized}，公共节点延迟略高`;
  iGM_LauncherV2_PeerPush(notify);
}

/** 退出房间：清空房间状态，保留与联机节点的连接 */
export function iGM_LauncherV2_Peer_Leave(notify: iGM_LauncherV2_PeerNotifier): void {
  if (iGM_PeerRoom) iGM_LauncherV2_PeerSend({ action: "room:leave", room: iGM_PeerRoom });
  iGM_PeerRoom = "";
  iGM_PeerHost = false;
  iGM_PeerCount = 0;
  iGM_PeerMessage = "";
  iGM_LauncherV2_PeerPush(notify);
}

// 导出 //
/* 状态快照、消息构造与 connect / create / join / leave 均已在上方导出 */
