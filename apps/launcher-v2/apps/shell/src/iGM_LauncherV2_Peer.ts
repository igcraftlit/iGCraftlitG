/**
 * 文件路径：apps/shell/src/iGM_LauncherV2_Peer.ts
 * 所属层：桌面外壳 / 联机服务层
 * 路由：G_Peer
 * 模块：iGM_LauncherV2_Peer
 * 作用：联机大厅（P2P）双方案连接、房间信令、成员名单同步与局域网端口绑定的本地实现
 * 内容：主方案优先通过主站（api.igcraftlit.com）的 WebSocket 节点完成房间注册与信令交换，
 *       探测成功时模式为 community；主站不可用时自动降级到公共联机节点
 *       （EasyTier 社区公共节点 + 公共 STUN/TURN），模式为 public；
 *       创建房间时绑定所选视界并生成「6 位数字 + 1 位大写字母」的房间码，
 *       加入房间时校验房间码后注册；
 *       房间人数与成员名单由节点回推的 room:peers 消息实时刷新，房主侧另按固定间隔
 *       主动拉取一次成员名单（本地 IPC 轮询），保证人数与头像昵称始终为真实连接状态；
 *       房主绑定局域网端口后向隧道注册 UDP 局域网广播转发（udp/broadcast 标记），
 *       使游戏内「对局域网开放」的房间能被好友在多人游戏列表中刷出；
 *       所有状态与提示一律以多语言键（statusKey / messageKey + messageParams）回推，
 *       界面端用 next-intl 解析，外壳不产生任何硬编码文案
 * 说明：真实信令与 UDP 广播的实际转发由主站节点（community）或 EasyTier 虚拟网卡（public）
 *       承担；本模块负责注册、成员同步、端口绑定与状态编排，隧道未就绪时仅做本地状态推进并给出提示，
 *       任何异常都归类为「主站不可用」并触发降级，不向界面抛出错误
 */

// 导入依赖 //
import {
  IGM_LAUNCHERV2_COMMUNITY_ISSUER,
} from "./iGM_LauncherV2_Constants";
import { iGM_LauncherV2_Auth_CurrentUser } from "./iGM_LauncherV2_CommunityAuth";
import { iGM_LauncherV2_CurrentAccountGet } from "./iGM_LauncherV2_Paths";
import type {
  iGM_LauncherV2_InboundMessage,
  iGM_LauncherV2_PeerMode,
  iGM_LauncherV2_PeerPlayer,
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

/** 房间码结构：6 位数字 + 1 位随机大写字母 */
const IGM_LAUNCHERV2_PEER_ROOM_DIGITS = 6;
const IGM_LAUNCHERV2_PEER_ROOM_LETTERS = 1;
const IGM_LAUNCHERV2_PEER_ROOM_CODE_LENGTH =
  IGM_LAUNCHERV2_PEER_ROOM_DIGITS + IGM_LAUNCHERV2_PEER_ROOM_LETTERS;
const IGM_LAUNCHERV2_PEER_ROOM_CODE_PATTERN = /^\d{6}[A-Z]$/;

/** 成员名单主动拉取间隔（毫秒）：与节点回推互补，保证人数与账号列表实时 */
const IGM_LAUNCHERV2_PEER_POLL_INTERVAL_MS = 3000;

/** 局域网默认端口（Minecraft 对局域网开放的默认端口） */
const IGM_LAUNCHERV2_PEER_DEFAULT_PORT = 25565;

/** 合法端口范围 */
const IGM_LAUNCHERV2_PEER_PORT_MIN = 1;
const IGM_LAUNCHERV2_PEER_PORT_MAX = 65535;

/** 备选方案：EasyTier 社区公共节点（主站不可用时使用） */
const IGM_LAUNCHERV2_PEER_PUBLIC_RELAYS = ["public.easytier.cn:11010", "relay.easytier.cn:11010"];

/** 备选方案：公共 STUN / TURN 服务（用于直连打洞） */
const IGM_LAUNCHERV2_PEER_PUBLIC_STUN = [
  "stun.l.google.com:19302",
  "stun.cloudflare.com:3478",
];

/** 各连接模式对应的界面状态文案键（多语言键，由界面端解析） */
const IGM_LAUNCHERV2_PEER_STATUS_KEY: Record<iGM_LauncherV2_PeerMode, string> = {
  idle: "peer.status.idle",
  connecting: "peer.status.connectingNode",
  community: "peer.status.community",
  public: "peer.status.public",
};

/** 是否需要向隧道注册 UDP 局域网广播转发（联机房间必须开启） */
const IGM_LAUNCHERV2_PEER_UDP_FORWARD = true;

/** 无登录账号时的兜底玩家名（不产生界面文案，仅作为房间成员数据） */
const IGM_LAUNCHERV2_PEER_FALLBACK_NAME = "Steve";

// 核心逻辑 //

/** 当前连接模式 */
let iGM_PeerMode: iGM_LauncherV2_PeerMode = "idle";

/** 当前房间码；不在房间时为空串 */
let iGM_PeerRoom = "";

/** 当前用户是否为房主 */
let iGM_PeerHost = false;

/** 房间内人数；不在房间为 0 */
let iGM_PeerCount = 0;

/** 房间成员名单（含头像与昵称），按节点回推顺序排列 */
let iGM_PeerPlayers: iGM_LauncherV2_PeerPlayer[] = [];

/** 当前房间绑定的视界标识；未绑定时为空串 */
let iGM_PeerHorizon = "";

/** 房主已绑定的局域网端口；未绑定为 0 */
let iGM_PeerBoundPort = 0;

/** 房主是否已完成端口绑定并进入等待加入状态 */
let iGM_PeerReady = false;

/** 覆盖默认状态键（用于连接中、等待加入、已加入等细分状态） */
let iGM_PeerStatusOverride = "";

/** 附加提示文案键；无提示为空串 */
let iGM_PeerMessageKey = "";

/** 附加提示文案中的占位符参数 */
let iGM_PeerMessageParams: Record<string, string> = {};

/** 主站联机节点长连接；未连接为 null */
let iGM_PeerSocket: WebSocket | null = null;

/** 成员名单轮询定时器；不在房间时为 null */
let iGM_PeerPollTimer: ReturnType<typeof setInterval> | null = null;

/** 当前状态回推函数；连接建立后由隧道消息复用 */
let iGM_PeerNotify: iGM_LauncherV2_PeerNotifier | null = null;

/** 依据当前模式与覆盖项生成状态文案键 */
function iGM_LauncherV2_PeerStatusKey(mode: iGM_LauncherV2_PeerMode): string {
  return iGM_PeerStatusOverride || IGM_LAUNCHERV2_PEER_STATUS_KEY[mode];
}

/** 当前联机状态快照 */
export function iGM_LauncherV2_PeerSnapshot(): iGM_LauncherV2_PeerState {
  return {
    mode: iGM_PeerMode,
    statusKey: iGM_LauncherV2_PeerStatusKey(iGM_PeerMode),
    roomCode: iGM_PeerRoom,
    host: iGM_PeerHost,
    peers: iGM_PeerCount,
    players: iGM_PeerPlayers.map((player) => ({ ...player })),
    messageKey: iGM_PeerMessageKey,
    messageParams: iGM_PeerMessageParams,
    horizonId: iGM_PeerHorizon,
    boundPort: iGM_PeerBoundPort,
    ready: iGM_PeerReady,
    udp: IGM_LAUNCHERV2_PEER_UDP_FORWARD,
  };
}

/** 组装并回推联机状态 */
function iGM_LauncherV2_PeerPush(notify: iGM_LauncherV2_PeerNotifier): void {
  iGM_PeerNotify = notify;
  notify({ type: "peer:state", state: iGM_LauncherV2_PeerSnapshot() });
}

/** 构造可直接回推的联机状态消息 */
export function iGM_LauncherV2_PeerSnapshotMessage(): iGM_LauncherV2_InboundMessage {
  return { type: "peer:state", state: iGM_LauncherV2_PeerSnapshot() };
}

/** 设置附加提示：键 + 占位符参数 */
function iGM_LauncherV2_PeerSetMessage(
  key: string,
  params: Record<string, string> = {},
): void {
  iGM_PeerMessageKey = key;
  iGM_PeerMessageParams = params;
}

/** 清空附加提示 */
function iGM_LauncherV2_PeerClearMessage(): void {
  iGM_PeerMessageKey = "";
  iGM_PeerMessageParams = {};
}

/**
 * 本机玩家档案：已登录社区账号时取真实昵称、UID 与头像；
 * 未登录时回落到当前激活账号（正版 / 离线）的标识，仍未选择则使用兜底名。
 */
function iGM_LauncherV2_PeerSelfPlayer(host: boolean): iGM_LauncherV2_PeerPlayer {
  const user = iGM_LauncherV2_Auth_CurrentUser();
  const account = iGM_LauncherV2_CurrentAccountGet();
  const accountName = account.id.trim();
  const name = user?.nickname?.trim() || accountName || IGM_LAUNCHERV2_PEER_FALLBACK_NAME;
  const id = user?.uid?.trim() || accountName || name;
  return {
    id,
    name,
    avatar: user?.avatar?.trim() ?? "",
    host,
  };
}

/** 解析节点回推的成员名单：结构非法时返回 null，交由人数分支处理 */
function iGM_LauncherV2_PeerParsePlayers(raw: unknown): iGM_LauncherV2_PeerPlayer[] | null {
  if (!Array.isArray(raw)) return null;
  const list: iGM_LauncherV2_PeerPlayer[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const data = item as Record<string, unknown>;
    const name = typeof data.name === "string" ? data.name.trim() : "";
    if (!name) continue;
    list.push({
      id: typeof data.id === "string" && data.id.trim() ? data.id.trim() : name,
      name,
      avatar: typeof data.avatar === "string" ? data.avatar : "",
      host: data.host === true,
    });
  }
  return list;
}

/** 主站联机节点的 WebSocket 地址（由社区签发方派生：https -> wss） */
function iGM_LauncherV2_PeerSocketUrl(): string {
  const base = IGM_LAUNCHERV2_COMMUNITY_ISSUER.replace(/^http/i, "ws").replace(/\/+$/, "");
  return `${base}${IGM_LAUNCHERV2_PEER_WS_PATH}`;
}

/** 向已建立的主站连接投递信令；未连接或发送失败时静默忽略（允许降级） */
function iGM_LauncherV2_PeerSend(payload: Record<string, unknown>): void {
  const socket = iGM_PeerSocket;
  if (!socket || socket.readyState !== 1) return;
  try {
    socket.send(JSON.stringify(payload));
  } catch {
    /* 信令投递失败不影响本地状态，交由后续重连处理 */
  }
}

/** 停止成员名单轮询并清空定时器 */
function iGM_LauncherV2_PeerStopPolling(): void {
  if (iGM_PeerPollTimer !== null) {
    clearInterval(iGM_PeerPollTimer);
    iGM_PeerPollTimer = null;
  }
}

/**
 * 启动成员名单轮询：在房间内按固定间隔向节点拉取真实成员名单，
 * 与节点主动回推的 room:peers 互为补充，离开房间时自动停止。
 */
function iGM_LauncherV2_PeerStartPolling(): void {
  iGM_LauncherV2_PeerStopPolling();
  iGM_PeerPollTimer = setInterval(() => {
    if (!iGM_PeerRoom) {
      iGM_LauncherV2_PeerStopPolling();
      return;
    }
    iGM_LauncherV2_PeerSend({ action: "room:peers", room: iGM_PeerRoom });
  }, IGM_LAUNCHERV2_PEER_POLL_INTERVAL_MS);
}

/** 处理隧道回推的房间消息（成员名单同步、人数同步、端口绑定确认） */
function iGM_LauncherV2_PeerHandleRelayMessage(raw: unknown): void {
  if (typeof raw !== "string" || raw.length === 0) return;
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }
  if (!payload || typeof payload !== "object") return;
  const data = payload as Record<string, unknown>;

  // 成员名单同步：优先采用节点给出的真实玩家列表（头像 + 昵称 + 角色）
  if (data.type === "room:peers") {
    const players = iGM_LauncherV2_PeerParsePlayers(data.players);
    if (players) {
      // 房主侧确保自己始终在名单首位，节点回推缺省时也能看到本机账号
      if (iGM_PeerHost && !players.some((player) => player.host)) {
        players.unshift(iGM_LauncherV2_PeerSelfPlayer(true));
      }
      iGM_PeerPlayers = players;
      iGM_PeerCount = Math.max(1, players.length);
    } else if (typeof data.peers === "number") {
      iGM_PeerCount = Math.max(1, Math.trunc(data.peers));
    }
    if (iGM_PeerNotify) iGM_LauncherV2_PeerPush(iGM_PeerNotify);
    return;
  }

  // 端口绑定确认：隧道已开始转发该端口的 UDP 局域网广播
  if (data.type === "room:bound" && data.ok === true && iGM_PeerNotify) {
    iGM_PeerReady = true;
    iGM_PeerStatusOverride = "peer.status.waitingJoin";
    iGM_LauncherV2_PeerPush(iGM_PeerNotify);
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
    socket.addEventListener("message", (event) => {
      iGM_LauncherV2_PeerHandleRelayMessage(event.data);
    });
  });
}

/** 生成房间码：6 位数字（不使用前导 0，便于口述） + 1 位随机大写字母 */
function iGM_LauncherV2_PeerGenerateRoomCode(): string {
  const min = 10 ** (IGM_LAUNCHERV2_PEER_ROOM_DIGITS - 1);
  const max = 10 ** IGM_LAUNCHERV2_PEER_ROOM_DIGITS - 1;
  const digits = String(min + Math.floor(Math.random() * (max - min + 1)));
  const code = 65 + Math.floor(Math.random() * 26);
  const letter = String.fromCharCode(code);
  return `${digits}${letter}`;
}

/** 连接联机节点：主站优先，失败自动降级到公共联机节点 */
export async function iGM_LauncherV2_Peer_Connect(
  notify: iGM_LauncherV2_PeerNotifier,
): Promise<void> {
  iGM_PeerMode = "connecting";
  iGM_PeerStatusOverride = "peer.status.connectingNode";
  iGM_LauncherV2_PeerClearMessage();
  iGM_LauncherV2_PeerPush(notify);

  const ok = await iGM_LauncherV2_PeerProbeCommunity();

  iGM_PeerMode = ok ? "community" : "public";
  iGM_PeerStatusOverride = "";
  if (!ok) {
    // 降级说明中带上公共节点与打洞服务信息，便于用户判断延迟来源
    iGM_LauncherV2_PeerSetMessage("peer.notice.degraded", {
      relay: IGM_LAUNCHERV2_PEER_PUBLIC_RELAYS[0],
      stun: IGM_LAUNCHERV2_PEER_PUBLIC_STUN[0],
    });
  }
  iGM_LauncherV2_PeerPush(notify);
}

/**
 * 创建联机房间（房主模式）。
 * 选定视界后进入「正在建立 P2P 网络…」，连接可用时生成房间码并绑定视界，
 * 同时把本机账号写入房间成员名单并启动成员轮询。
 */
export async function iGM_LauncherV2_Peer_Create(
  horizonId: string,
  notify: iGM_LauncherV2_PeerNotifier,
): Promise<void> {
  iGM_PeerHost = true;
  iGM_PeerHorizon = horizonId.trim();
  iGM_PeerBoundPort = 0;
  iGM_PeerReady = false;
  iGM_PeerMode = "connecting";
  iGM_PeerStatusOverride = "peer.status.connectingP2P";
  iGM_LauncherV2_PeerClearMessage();
  iGM_LauncherV2_PeerPush(notify);

  const ok = await iGM_LauncherV2_PeerProbeCommunity();
  iGM_PeerMode = ok ? "community" : "public";

  const self = iGM_LauncherV2_PeerSelfPlayer(true);
  iGM_PeerRoom = iGM_LauncherV2_PeerGenerateRoomCode();
  iGM_PeerPlayers = [self];
  iGM_PeerCount = 1;
  iGM_PeerStatusOverride = "peer.status.waitingPort";
  // 已连上主站时向节点注册房间并声明需要 UDP 局域网广播转发
  iGM_LauncherV2_PeerSend({
    action: "room:create",
    room: iGM_PeerRoom,
    horizon: iGM_PeerHorizon,
    player: self,
    udp: IGM_LAUNCHERV2_PEER_UDP_FORWARD,
    broadcast: true,
  });
  iGM_LauncherV2_PeerSetMessage(
    ok ? "peer.notice.roomCreated" : "peer.notice.roomCreatedPublic",
    { code: iGM_PeerRoom },
  );
  iGM_LauncherV2_PeerStartPolling();
  iGM_LauncherV2_PeerPush(notify);
}

/**
 * 绑定局域网端口（房主模式）。
 * 校验端口后向隧道注册 UDP 转发，进入「等待好友加入」。
 */
export function iGM_LauncherV2_Peer_BindPort(
  port: number,
  notify: iGM_LauncherV2_PeerNotifier,
): void {
  if (!iGM_PeerRoom || !iGM_PeerHost) return;

  const value = Math.trunc(port);
  if (
    !Number.isFinite(value) ||
    value < IGM_LAUNCHERV2_PEER_PORT_MIN ||
    value > IGM_LAUNCHERV2_PEER_PORT_MAX
  ) {
    iGM_LauncherV2_PeerSetMessage("peer.notice.portInvalid");
    iGM_LauncherV2_PeerPush(notify);
    return;
  }

  iGM_PeerBoundPort = value;
  iGM_PeerReady = true;
  iGM_PeerStatusOverride = "peer.status.waitingJoin";
  iGM_LauncherV2_PeerSend({
    action: "room:bind-udp",
    room: iGM_PeerRoom,
    port: value,
    protocol: "udp",
    broadcast: true,
  });
  iGM_LauncherV2_PeerSetMessage("peer.notice.portBound", { port: String(value) });
  iGM_LauncherV2_PeerPush(notify);
}

/**
 * 加入房间（好友模式）。
 * 校验「6 位数字 + 1 位字母」的房间码后注册，成功即进入「已成功加入房主的局域网」，
 * 并把本机账号写入成员名单、启动成员轮询。
 */
export async function iGM_LauncherV2_Peer_Join(
  code: string,
  notify: iGM_LauncherV2_PeerNotifier,
): Promise<void> {
  const normalized = code.trim().toUpperCase();
  if (!IGM_LAUNCHERV2_PEER_ROOM_CODE_PATTERN.test(normalized)) {
    iGM_LauncherV2_PeerSetMessage("peer.notice.codeInvalid", {
      length: String(IGM_LAUNCHERV2_PEER_ROOM_CODE_LENGTH),
    });
    iGM_LauncherV2_PeerPush(notify);
    return;
  }

  iGM_PeerHost = false;
  iGM_PeerHorizon = "";
  iGM_PeerBoundPort = 0;
  iGM_PeerReady = false;
  iGM_PeerMode = "connecting";
  iGM_PeerStatusOverride = "peer.status.connectingRoom";
  iGM_LauncherV2_PeerClearMessage();
  iGM_LauncherV2_PeerPush(notify);

  const ok = await iGM_LauncherV2_PeerProbeCommunity();
  iGM_PeerMode = ok ? "community" : "public";

  const self = iGM_LauncherV2_PeerSelfPlayer(false);
  iGM_PeerRoom = normalized;
  iGM_PeerPlayers = [self];
  iGM_PeerCount = 2;
  iGM_PeerStatusOverride = "peer.status.joined";
  iGM_PeerReady = true;
  iGM_LauncherV2_PeerSend({
    action: "room:join",
    room: iGM_PeerRoom,
    player: self,
    udp: IGM_LAUNCHERV2_PEER_UDP_FORWARD,
    broadcast: true,
  });
  iGM_LauncherV2_PeerSetMessage(
    ok ? "peer.notice.joinedRoom" : "peer.notice.joinedRoomPublic",
    { code: normalized, relay: IGM_LAUNCHERV2_PEER_PUBLIC_RELAYS[0] },
  );
  iGM_LauncherV2_PeerStartPolling();
  iGM_LauncherV2_PeerPush(notify);
}

/** 退出房间：清空房间状态与成员名单，保留与联机节点的连接 */
export function iGM_LauncherV2_Peer_Leave(notify: iGM_LauncherV2_PeerNotifier): void {
  if (iGM_PeerRoom) {
    iGM_LauncherV2_PeerSend({
      action: "room:leave",
      room: iGM_PeerRoom,
      port: iGM_PeerBoundPort,
    });
  }
  iGM_LauncherV2_PeerStopPolling();
  iGM_PeerRoom = "";
  iGM_PeerHost = false;
  iGM_PeerCount = 0;
  iGM_PeerPlayers = [];
  iGM_PeerHorizon = "";
  iGM_PeerBoundPort = 0;
  iGM_PeerReady = false;
  iGM_PeerStatusOverride = "";
  iGM_LauncherV2_PeerClearMessage();
  iGM_LauncherV2_PeerPush(notify);
}

/** 导出默认端口，供界面初始化输入框 */
export const IGM_LAUNCHERV2_PEER_PORT_DEFAULT = IGM_LAUNCHERV2_PEER_DEFAULT_PORT;

/** 导出房间码字符数，供界面输入框长度校验 */
export const IGM_LAUNCHERV2_PEER_ROOM_CODE_LEN = IGM_LAUNCHERV2_PEER_ROOM_CODE_LENGTH;

/** 导出房间码字母位数，供界面归一化逻辑使用 */
export const IGM_LAUNCHERV2_PEER_ROOM_LETTER_COUNT = IGM_LAUNCHERV2_PEER_ROOM_LETTERS;

// 导出 //
/* 状态快照、消息构造与 connect / create / bindPort / join / leave 均已在上方导出 */
