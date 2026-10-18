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
 *       普通浏览器（next dev）中不存在宿主通道，所有指令静默忽略，界面退化为纯静态展示；
 *       并提供环境感知的整页跳转 iGM_LauncherV2_Navigate，供各页面统一使用
 * 说明：对外只暴露单向指令投递与只读状态订阅，不暴露任何特权 RPC
 */

// 导入依赖 //
"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type {
  iGM_LauncherV2_AccountKind,
  iGM_LauncherV2_AppearancePatch,
  iGM_LauncherV2_AppearanceState,
  iGM_LauncherV2_AuthState,
  iGM_LauncherV2_AuthUser,
  iGM_LauncherV2_DownloadChannel,
  iGM_LauncherV2_DownloadTask,
  iGM_LauncherV2_GameCandidate,
  iGM_LauncherV2_GameState,
  iGM_LauncherV2_Horizon,
  iGM_LauncherV2_HorizonNode,
  iGM_LauncherV2_InboundMessage,
  iGM_LauncherV2_JavaRuntime,
  iGM_LauncherV2_LaunchLogEntry,
  iGM_LauncherV2_LaunchProgress,
  iGM_LauncherV2_LoaderEntry,
  iGM_LauncherV2_MarketCategory,
  iGM_LauncherV2_MarketDetail,
  iGM_LauncherV2_MarketItem,
  iGM_LauncherV2_MarketLoader,
  iGM_LauncherV2_MarketSource,
  iGM_LauncherV2_MsaAccount,
  iGM_LauncherV2_MsaDeviceCode,
  iGM_LauncherV2_OfflineAccount,
  iGM_LauncherV2_OutboundMessage,
  iGM_LauncherV2_PathsSnapshot,
  iGM_LauncherV2_SettingsView,
  iGM_LauncherV2_ServerEntry,
  iGM_LauncherV2_ServerListSource,
  iGM_LauncherV2_ServerStatus,
  iGM_LauncherV2_PeerMode,
  iGM_LauncherV2_SkinEntry,
  iGM_LauncherV2_SkinProfile,
  iGM_LauncherV2_UpdateState,
  iGM_LauncherV2_VersionDetail,
  iGM_LauncherV2_VersionEntry,
  iGM_LauncherV2_VersionSource,
  iGM_LauncherV2_WorldEntry,
} from "@/lib/iGM_LauncherV2_Constants";
import { IGM_LAUNCHERV2_REDIRECT_URI, IGM_LAUNCHERV2_VERSION } from "@/lib/iGM_LauncherV2_Constants";

// 类型定义 //

/** 授权状态快照 */
export interface iGM_LauncherV2_AuthSnapshot {
  state: iGM_LauncherV2_AuthState;
  user: iGM_LauncherV2_AuthUser | null;
  /** 最近一次失败原因（授权失败或后端拒绝时展示） */
  message: string;
}

/** 历史社区账号快照（来自本地 accounts.json，不含任何令牌） */
export interface iGM_LauncherV2_RememberedSnapshot {
  /** 曾登录过的社区账号公开信息；null 表示本地无记录 */
  user: iGM_LauncherV2_AuthUser | null;
  /** 是否已完成一次读取 */
  loaded: boolean;
}

/** Rust 核心连通性快照 */
export interface iGM_LauncherV2_CoreSnapshot {
  state: "ok" | "unavailable" | "pending";
  detail: string;
  version: string;
}

/** 本地 Java 环境快照 */
export interface iGM_LauncherV2_JavaSnapshot {
  items: iGM_LauncherV2_JavaRuntime[];
  defaultId: string;
  /** 扫描进行中 */
  scanning: boolean;
  /** 最近一次扫描 / 操作的可读结论文案 */
  message: string;
}

/** 微软正版账号快照 */
export interface iGM_LauncherV2_MsaSnapshot {
  state: iGM_LauncherV2_AuthState;
  account: iGM_LauncherV2_MsaAccount | null;
  message: string;
  /** 设备代码流待用户确认的信息；null 表示当前没有进行中的授权 */
  device: iGM_LauncherV2_MsaDeviceCode | null;
}

/** 离线账号快照 */
export interface iGM_LauncherV2_OfflineSnapshot {
  items: iGM_LauncherV2_OfflineAccount[];
  currentId: string;
}

/** 皮肤库快照 */
export interface iGM_LauncherV2_SkinSnapshot {
  items: iGM_LauncherV2_SkinEntry[];
  /** 最近一次导入 / 删除 / 应用的结果提示 */
  message: string;
  /** 皮肤库是否已从外壳取回过一次数据 */
  loaded: boolean;
}

/** 正版档案快照（纹理为 data URL 形式，规避 WebView 跨域限制） */
export interface iGM_LauncherV2_ProfileSnapshot {
  profile: iGM_LauncherV2_SkinProfile | null;
  /** 皮肤 / 披风纹理的 data URL；取回失败为空串 */
  skinDataUrl: string;
  capeDataUrl: string;
  message: string;
  /** 是否已完成一次取回（含失败） */
  loaded: boolean;
}

/** 路径与设置快照 */
export interface iGM_LauncherV2_SettingsSnapshot {
  paths: iGM_LauncherV2_PathsSnapshot | null;
  settings: iGM_LauncherV2_SettingsView | null;
  /** 是否已完成一次取回 */
  loaded: boolean;
}

/** 游戏目录扫描快照 */
export interface iGM_LauncherV2_GameScanSnapshot {
  candidates: iGM_LauncherV2_GameCandidate[];
  currentGameRoot: string;
  matrixRoot: string;
  message: string;
  loaded: boolean;
}

/** 视界列表快照 */
export interface iGM_LauncherV2_HorizonSnapshot {
  items: iGM_LauncherV2_Horizon[];
  currentId: string;
  horizonsRoot: string;
  message: string;
  loaded: boolean;
}

/** 版本列表快照（资源中心） */
export interface iGM_LauncherV2_VersionSnapshot {
  versions: iGM_LauncherV2_VersionEntry[];
  sources: iGM_LauncherV2_VersionSource[];
  activeSourceId: string;
  activeSourceLabel: string;
  message: string;
  /** 是否正在拉取 */
  loading: boolean;
  /** 是否已完成一次拉取 */
  loaded: boolean;
}

/** 加载器列表快照 */
export interface iGM_LauncherV2_LoaderSnapshot {
  gameVersion: string;
  loaders: iGM_LauncherV2_LoaderEntry[];
  message: string;
  loading: boolean;
}

/** 已下载版本快照（新建视界时选择本地已下载版本用） */
export interface iGM_LauncherV2_InstalledSnapshot {
  /** 本地 versions/ 下已完整落盘的版本 id（新版在前） */
  versions: string[];
  loading: boolean;
}

/** 下载任务快照 */
export interface iGM_LauncherV2_DownloadSnapshot {
  tasks: iGM_LauncherV2_DownloadTask[];
  /** 最近一次下载相关的独立提示（清单解析失败等） */
  notice: string;
  /** 是否处于游戏运行限速联动状态 */
  throttled: boolean;
  /** 限速上限（字节/秒）；0 表示不限速 */
  throttleBps: number;
  /** 限速提示文案（任务管理器顶部展示） */
  throttleMessage: string;
  /** 是否已从外壳取回一次任务列表 */
  loaded: boolean;
}

/** 外观配置快照 */
export interface iGM_LauncherV2_AppearanceSnapshot {
  appearance: iGM_LauncherV2_AppearanceState;
  loaded: boolean;
}

/** 自动更新快照 */
export interface iGM_LauncherV2_UpdateSnapshot {
  state: iGM_LauncherV2_UpdateState;
  loaded: boolean;
}

/** 游戏启动状态快照 */
export interface iGM_LauncherV2_GameSnapshot {
  state: iGM_LauncherV2_GameState | null;
}

/** 启动日志快照（错误控制台） */
export interface iGM_LauncherV2_LaunchLogSnapshot {
  /** 逐行日志（新版在后），上限由外壳环形缓冲决定 */
  entries: iGM_LauncherV2_LaunchLogEntry[];
  /** 是否已完成一次取回（含空结果） */
  loaded: boolean;
}

/** 游戏启动进度快照（启动遮罩） */
export interface iGM_LauncherV2_LaunchProgressSnapshot {
  percent: number;
  stage: string;
  failed: boolean;
  /** 是否已从外壳取回一次（含 0% 初始态） */
  loaded: boolean;
}

/** 资源市场列表快照 */
export interface iGM_LauncherV2_MarketSnapshot {
  items: iGM_LauncherV2_MarketItem[];
  /** 命中总数 */
  total: number;
  /** 最近一次请求的分页偏移 */
  offset: number;
  message: string;
  loading: boolean;
  loaded: boolean;
  /** 最近一次请求上下文，供界面丢弃过期响应 */
  source: iGM_LauncherV2_MarketSource;
  category: iGM_LauncherV2_MarketCategory;
  loader: iGM_LauncherV2_MarketLoader;
  query: string;
}

/** 资源市场详情快照 */
export interface iGM_LauncherV2_MarketDetailSnapshot {
  detail: iGM_LauncherV2_MarketDetail | null;
  message: string;
  loading: boolean;
}

/** 单个版本详情快照 */
export interface iGM_LauncherV2_VersionDetailSnapshot {
  versionId: string;
  detail: iGM_LauncherV2_VersionDetail | null;
  loading: boolean;
}

/** 服务器大厅快照（公开列表来自第三方接口或本地缓存，并含内置主流服与用户自定义项） */
export interface iGM_LauncherV2_ServerLobbySnapshot {
  items: iGM_LauncherV2_ServerEntry[];
  /** 列表来源：远端公开接口 / 本地缓存 / 空结果 */
  source: iGM_LauncherV2_ServerListSource;
  message: string;
  /** 是否正在拉取列表 */
  loading: boolean;
  /** 是否已完成一次拉取 */
  loaded: boolean;
  /** 按服务器 id 归位的实时状态；值为 null 表示该条正在查询 */
  statuses: Record<string, iGM_LauncherV2_ServerStatus | null>;
  /** 最近一次增删 / 进服的结果提示 */
  notice: string;
  /** 是否正在批量刷新实时状态（用于按在线人数排序） */
  refreshing: boolean;
}

/** 联机大厅（P2P）快照 */
export interface iGM_LauncherV2_PeerLobbySnapshot {
  /** 当前连接模式：未连接 / 连接中 / 主站高速节点 / 公共联机节点 */
  mode: iGM_LauncherV2_PeerMode;
  /** 状态文案（由外壳给出，界面直接展示） */
  status: string;
  /** 当前房间码；不在房间时为空串 */
  roomCode: string;
  /** 是否为房主 */
  host: boolean;
  /** 房间内人数 */
  peers: number;
  /** 附加提示 */
  message: string;
  /** 是否已完成一次状态同步 */
  loaded: boolean;
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

const IGM_JAVA_INITIAL: iGM_LauncherV2_JavaSnapshot = {
  items: [],
  defaultId: "",
  scanning: false,
  message: "",
};

const IGM_MSA_INITIAL: iGM_LauncherV2_MsaSnapshot = {
  state: "logged-out",
  account: null,
  message: "",
  device: null,
};

const IGM_REMEMBERED_INITIAL: iGM_LauncherV2_RememberedSnapshot = {
  user: null,
  loaded: false,
};

const IGM_SERVER_LOBBY_INITIAL: iGM_LauncherV2_ServerLobbySnapshot = {
  items: [],
  source: "empty",
  message: "",
  loading: false,
  loaded: false,
  statuses: {},
  notice: "",
  refreshing: false,
};

const IGM_PEER_LOBBY_INITIAL: iGM_LauncherV2_PeerLobbySnapshot = {
  mode: "idle",
  status: "尚未连接联机节点",
  roomCode: "",
  host: false,
  peers: 0,
  message: "",
  loaded: false,
};

const IGM_OFFLINE_INITIAL: iGM_LauncherV2_OfflineSnapshot = {
  items: [],
  currentId: "",
};

const IGM_SKIN_INITIAL: iGM_LauncherV2_SkinSnapshot = {
  items: [],
  message: "",
  loaded: false,
};

const IGM_PROFILE_INITIAL: iGM_LauncherV2_ProfileSnapshot = {
  profile: null,
  skinDataUrl: "",
  capeDataUrl: "",
  message: "",
  loaded: false,
};

const IGM_SETTINGS_INITIAL: iGM_LauncherV2_SettingsSnapshot = {
  paths: null,
  settings: null,
  loaded: false,
};

const IGM_GAMESCAN_INITIAL: iGM_LauncherV2_GameScanSnapshot = {
  candidates: [],
  currentGameRoot: "",
  matrixRoot: "",
  message: "",
  loaded: false,
};

const IGM_HORIZON_INITIAL: iGM_LauncherV2_HorizonSnapshot = {
  items: [],
  currentId: "",
  horizonsRoot: "",
  message: "",
  loaded: false,
};

const IGM_VERSION_INITIAL: iGM_LauncherV2_VersionSnapshot = {
  versions: [],
  sources: [],
  activeSourceId: "",
  activeSourceLabel: "",
  message: "",
  loading: false,
  loaded: false,
};

const IGM_LOADER_INITIAL: iGM_LauncherV2_LoaderSnapshot = {
  gameVersion: "",
  loaders: [],
  message: "",
  loading: false,
};

const IGM_INSTALLED_INITIAL: iGM_LauncherV2_InstalledSnapshot = {
  versions: [],
  loading: false,
};

const IGM_DOWNLOAD_INITIAL: iGM_LauncherV2_DownloadSnapshot = {
  tasks: [],
  notice: "",
  throttled: false,
  throttleBps: 0,
  throttleMessage: "",
  loaded: false,
};

const IGM_APPEARANCE_INITIAL: iGM_LauncherV2_AppearanceSnapshot = {
  appearance: {
    background: "cloud",
    cloud: "purple",
    solid: "dark",
    blur: 14,
    theme: "indigo",
  },
  loaded: false,
};

const IGM_UPDATE_INITIAL: iGM_LauncherV2_UpdateSnapshot = {
  state: {
    status: "idle",
    currentVersion: IGM_LAUNCHERV2_VERSION,
    latestVersion: "",
    notes: "",
    fileName: "",
    filePath: "",
    progress: 0,
    message: "",
  },
  loaded: false,
};

const IGM_GAME_INITIAL: iGM_LauncherV2_GameSnapshot = {
  state: null,
};

const IGM_LAUNCH_LOG_INITIAL: iGM_LauncherV2_LaunchLogSnapshot = {
  entries: [],
  loaded: false,
};

const IGM_LAUNCH_PROGRESS_INITIAL: iGM_LauncherV2_LaunchProgressSnapshot = {
  percent: 0,
  stage: "",
  failed: false,
  loaded: false,
};

const IGM_MARKET_INITIAL: iGM_LauncherV2_MarketSnapshot = {
  items: [],
  total: 0,
  offset: 0,
  message: "",
  loading: false,
  loaded: false,
  source: "modrinth",
  category: "mods",
  loader: "all",
  query: "",
};

const IGM_MARKET_DETAIL_INITIAL: iGM_LauncherV2_MarketDetailSnapshot = {
  detail: null,
  message: "",
  loading: false,
};

/** 启动日志界面保留条数上限（与外壳环形缓冲保持一致） */
const IGM_LAUNCH_LOG_LIMIT = 300;

const IGM_VERSION_DETAIL_INITIAL: iGM_LauncherV2_VersionDetailSnapshot = {
  versionId: "",
  detail: null,
  loading: false,
};

/** 模块级单例状态：多组件订阅同一份快照，避免各自重复拉取 */
let iGM_AuthSnapshot: iGM_LauncherV2_AuthSnapshot = IGM_AUTH_INITIAL;
let iGM_CoreSnapshot: iGM_LauncherV2_CoreSnapshot = IGM_CORE_INITIAL;
let iGM_JavaSnapshot: iGM_LauncherV2_JavaSnapshot = IGM_JAVA_INITIAL;
let iGM_MsaSnapshot: iGM_LauncherV2_MsaSnapshot = IGM_MSA_INITIAL;
let iGM_RememberedSnapshot: iGM_LauncherV2_RememberedSnapshot = IGM_REMEMBERED_INITIAL;
let iGM_ServerLobbySnapshot: iGM_LauncherV2_ServerLobbySnapshot = IGM_SERVER_LOBBY_INITIAL;
let iGM_PeerLobbySnapshot: iGM_LauncherV2_PeerLobbySnapshot = IGM_PEER_LOBBY_INITIAL;
let iGM_OfflineSnapshot: iGM_LauncherV2_OfflineSnapshot = IGM_OFFLINE_INITIAL;
let iGM_SkinSnapshot: iGM_LauncherV2_SkinSnapshot = IGM_SKIN_INITIAL;
let iGM_ProfileSnapshot: iGM_LauncherV2_ProfileSnapshot = IGM_PROFILE_INITIAL;
let iGM_SettingsSnapshot: iGM_LauncherV2_SettingsSnapshot = IGM_SETTINGS_INITIAL;
let iGM_GameScanSnapshot: iGM_LauncherV2_GameScanSnapshot = IGM_GAMESCAN_INITIAL;
let iGM_HorizonSnapshot: iGM_LauncherV2_HorizonSnapshot = IGM_HORIZON_INITIAL;
let iGM_VersionSnapshot: iGM_LauncherV2_VersionSnapshot = IGM_VERSION_INITIAL;
let iGM_LoaderSnapshot: iGM_LauncherV2_LoaderSnapshot = IGM_LOADER_INITIAL;
let iGM_InstalledSnapshot: iGM_LauncherV2_InstalledSnapshot = IGM_INSTALLED_INITIAL;
let iGM_DownloadSnapshot: iGM_LauncherV2_DownloadSnapshot = IGM_DOWNLOAD_INITIAL;
let iGM_AppearanceSnapshot: iGM_LauncherV2_AppearanceSnapshot = IGM_APPEARANCE_INITIAL;
let iGM_UpdateSnapshot: iGM_LauncherV2_UpdateSnapshot = IGM_UPDATE_INITIAL;
let iGM_GameSnapshot: iGM_LauncherV2_GameSnapshot = IGM_GAME_INITIAL;
let iGM_LaunchLogSnapshot: iGM_LauncherV2_LaunchLogSnapshot = IGM_LAUNCH_LOG_INITIAL;
let iGM_LaunchProgressSnapshot: iGM_LauncherV2_LaunchProgressSnapshot = IGM_LAUNCH_PROGRESS_INITIAL;
let iGM_MarketSnapshot: iGM_LauncherV2_MarketSnapshot = IGM_MARKET_INITIAL;
let iGM_MarketDetailSnapshot: iGM_LauncherV2_MarketDetailSnapshot = IGM_MARKET_DETAIL_INITIAL;
let iGM_VersionDetailSnapshot: iGM_LauncherV2_VersionDetailSnapshot = IGM_VERSION_DETAIL_INITIAL;
const iGM_Listeners = new Set<iGM_LauncherV2_Listener>();

/** 视界目录树请求回调：按视界标识归位结果 */
const iGM_HorizonTreeListeners = new Map<
  string,
  Set<(nodes: iGM_LauncherV2_HorizonNode[]) => void>
>();

/** 视界世界列表请求回调：按视界标识归位结果 */
const iGM_HorizonWorldsListeners = new Map<
  string,
  Set<(worlds: iGM_LauncherV2_WorldEntry[]) => void>
>();

let iGM_ReceiverInstalled = false;

/** 安装向导目录选择回调订阅集合 */
const iGM_FolderListeners = new Set<(path: string) => void>();

/** 通用目录选择回调订阅集合（dialog:picked） */
const iGM_DialogFolderListeners = new Set<(path: string) => void>();

/** 新建视界结果回调订阅集合（horizon:result） */
const iGM_HorizonResultListeners = new Set<
  (result: Extract<iGM_LauncherV2_InboundMessage, { type: "horizon:result" }>) => void
>();

/** 皮肤纹理请求回调：按请求地址归位结果，并发请求互不干扰 */
const iGM_TextureListeners = new Map<string, Set<(dataUrl: string, message: string) => void>>();

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
    return;
  }

  if (message.type === "installer:path") {
    for (const listener of iGM_FolderListeners) listener(message.path);
    return;
  }

  if (message.type === "dialog:picked") {
    for (const listener of iGM_DialogFolderListeners) listener(message.path);
    return;
  }

  if (message.type === "java:list") {
    iGM_JavaSnapshot = {
      items: message.items,
      defaultId: message.defaultId,
      scanning: message.scanning,
      message: message.message,
    };
    iGM_Emit();
    return;
  }

  if (message.type === "msa:state") {
    iGM_MsaSnapshot = {
      state: message.state,
      account: message.account ?? null,
      message: message.message ?? "",
      // 账号状态变化不影响进行中的设备代码展示
      device: iGM_MsaSnapshot.device,
    };
    iGM_Emit();
    return;
  }

  if (message.type === "msa:device-code") {
    iGM_MsaSnapshot = { ...iGM_MsaSnapshot, device: message.device };
    iGM_Emit();
    return;
  }

  if (message.type === "auth:remembered") {
    iGM_RememberedSnapshot = { user: message.user ?? null, loaded: true };
    iGM_Emit();
    return;
  }

  if (message.type === "server:list") {
    iGM_ServerLobbySnapshot = {
      ...iGM_ServerLobbySnapshot,
      items: message.items,
      source: message.source,
      message: message.message,
      loading: false,
      loaded: true,
    };
    iGM_Emit();
    return;
  }

  if (message.type === "server:status") {
    iGM_ServerLobbySnapshot = {
      ...iGM_ServerLobbySnapshot,
      statuses: { ...iGM_ServerLobbySnapshot.statuses, [message.id]: message.status },
      notice: message.message,
    };
    iGM_Emit();
    return;
  }

  if (message.type === "server:statuses") {
    // 批量状态：一次性覆盖全部条目，界面据此按在线人数降序排列
    const statuses: Record<string, iGM_LauncherV2_ServerStatus | null> = {
      ...iGM_ServerLobbySnapshot.statuses,
    };
    for (const item of message.items) statuses[item.id] = item.status;
    iGM_ServerLobbySnapshot = {
      ...iGM_ServerLobbySnapshot,
      statuses,
      notice: message.message,
      refreshing: false,
    };
    iGM_Emit();
    return;
  }

  if (message.type === "peer:state") {
    iGM_PeerLobbySnapshot = {
      mode: message.state.mode,
      status: message.state.status,
      roomCode: message.state.roomCode,
      host: message.state.host,
      peers: message.state.peers,
      message: message.state.message,
      loaded: true,
    };
    iGM_Emit();
    return;
  }

  if (message.type === "server:result") {
    iGM_ServerLobbySnapshot = {
      ...iGM_ServerLobbySnapshot,
      notice: message.message,
    };
    iGM_Emit();
    return;
  }

  if (message.type === "offline:list") {
    iGM_OfflineSnapshot = { items: message.items, currentId: message.currentId };
    iGM_Emit();
    return;
  }

  if (message.type === "skin:library") {
    iGM_SkinSnapshot = { items: message.items, message: message.message, loaded: true };
    iGM_Emit();
    return;
  }

  if (message.type === "skin:applied") {
    // 应用结果只更新提示文案，列表本身由外壳随后回推的 offline:list 刷新
    iGM_SkinSnapshot = {
      ...iGM_SkinSnapshot,
      message: message.message,
      loaded: true,
    };
    iGM_Emit();
    return;
  }

  if (message.type === "skin:texture") {
    const listeners = iGM_TextureListeners.get(message.url);
    if (listeners) {
      for (const listener of listeners) listener(message.dataUrl, message.message);
    }
    return;
  }

  if (message.type === "profile:result") {
    const profile = message.profile ?? null;
    // 纹理经外壳取回为 data URL，逐项归位到档案快照
    iGM_ProfileSnapshot = {
      ...iGM_ProfileSnapshot,
      profile,
      message: message.message ?? "",
      loaded: true,
    };
    iGM_Emit();

    if (profile) {
      const request = async (url: string): Promise<string> => {
        if (!url) return "";
        const result = await iGM_LauncherV2_RequestTexture(url);
        return result.dataUrl;
      };
      void (async () => {
        const [skinDataUrl, capeDataUrl] = await Promise.all([
          request(profile.skinUrl),
          request(profile.capeUrl),
        ]);
        iGM_ProfileSnapshot = { ...iGM_ProfileSnapshot, profile, skinDataUrl, capeDataUrl };
        iGM_Emit();
      })();
    }
    return;
  }

  if (message.type === "settings:paths") {
    iGM_SettingsSnapshot = {
      paths: message.paths,
      settings: message.settings,
      loaded: true,
    };
    iGM_Emit();
    return;
  }

  if (message.type === "game:scan") {
    iGM_GameScanSnapshot = {
      candidates: message.result.candidates,
      currentGameRoot: message.result.currentGameRoot,
      matrixRoot: message.result.matrixRoot,
      message: message.result.message,
      loaded: true,
    };
    iGM_Emit();
    return;
  }

  if (message.type === "horizon:result") {
    for (const listener of iGM_HorizonResultListeners) listener(message);
    return;
  }

  if (message.type === "horizon:list") {
    iGM_HorizonSnapshot = {
      items: message.items,
      currentId: message.currentId,
      horizonsRoot: message.horizonsRoot,
      message: message.message,
      loaded: true,
    };
    iGM_Emit();
    return;
  }

  if (message.type === "versions:list") {
    iGM_VersionSnapshot = {
      versions: message.versions,
      sources: message.sources,
      activeSourceId: message.activeSourceId,
      activeSourceLabel: message.activeSourceLabel,
      message: message.message,
      loading: false,
      loaded: true,
    };
    iGM_Emit();
    return;
  }

  if (message.type === "version:installed") {
    iGM_InstalledSnapshot = { versions: message.versions, loading: false };
    iGM_Emit();
    return;
  }

  if (message.type === "loaders:list") {
    iGM_LoaderSnapshot = {
      gameVersion: message.gameVersion,
      loaders: message.loaders,
      message: message.message,
      loading: false,
    };
    iGM_Emit();
    return;
  }

  if (message.type === "download:list") {
    iGM_DownloadSnapshot = { ...iGM_DownloadSnapshot, tasks: message.tasks, loaded: true };
    iGM_Emit();
    return;
  }

  if (message.type === "download:throttle") {
    iGM_DownloadSnapshot = {
      ...iGM_DownloadSnapshot,
      throttled: message.active,
      throttleBps: message.bps,
      throttleMessage: message.message,
    };
    iGM_Emit();
    return;
  }

  if (message.type === "appearance:state") {
    iGM_AppearanceSnapshot = { appearance: message.appearance, loaded: true };
    iGM_Emit();
    return;
  }

  if (message.type === "update:state") {
    iGM_UpdateSnapshot = { state: message.state, loaded: true };
    iGM_Emit();
    return;
  }

  if (message.type === "download:progress") {
    const tasks = iGM_DownloadSnapshot.tasks.map((item) =>
      item.id === message.task.id ? message.task : item,
    );
    iGM_DownloadSnapshot = { ...iGM_DownloadSnapshot, tasks };
    iGM_Emit();
    return;
  }

  if (message.type === "download:notice") {
    iGM_DownloadSnapshot = { ...iGM_DownloadSnapshot, notice: message.message };
    iGM_Emit();
    return;
  }

  if (message.type === "horizon:tree") {
    const listeners = iGM_HorizonTreeListeners.get(message.horizonId);
    if (listeners) {
      for (const listener of listeners) listener(message.nodes);
    }
    return;
  }

  if (message.type === "horizon:worlds") {
    const listeners = iGM_HorizonWorldsListeners.get(message.horizonId);
    if (listeners) {
      for (const listener of listeners) listener(message.worlds);
    }
    return;
  }

  if (message.type === "game:state") {
    iGM_GameSnapshot = { state: message.state };
    iGM_Emit();
    return;
  }

  if (message.type === "launch:log") {
    // 保留上限与外壳环形缓冲一致，避免界面无限增长
    const entries = [...iGM_LaunchLogSnapshot.entries, message.entry];
    iGM_LaunchLogSnapshot = {
      entries: entries.length > IGM_LAUNCH_LOG_LIMIT ? entries.slice(-IGM_LAUNCH_LOG_LIMIT) : entries,
      loaded: true,
    };
    iGM_Emit();
    return;
  }

  if (message.type === "launch:logs") {
    iGM_LaunchLogSnapshot = { entries: message.entries, loaded: true };
    iGM_Emit();
    return;
  }

  if (message.type === "launch:progress") {
    iGM_LaunchProgressSnapshot = { ...message.progress, loaded: true };
    iGM_Emit();
    return;
  }

  if (message.type === "market:result") {
    iGM_MarketSnapshot = {
      items: message.items,
      total: message.total,
      offset: message.offset,
      message: message.message,
      loading: false,
      loaded: true,
      source: message.source,
      category: message.category,
      loader: message.loader,
      query: message.query,
    };
    iGM_Emit();
    return;
  }

  if (message.type === "market:detail") {
    iGM_MarketDetailSnapshot = {
      detail: message.detail ?? null,
      message: message.message,
      loading: false,
    };
    iGM_Emit();
    return;
  }

  if (message.type === "version:detail") {
    iGM_VersionDetailSnapshot = {
      versionId: message.detail.versionId,
      detail: message.detail,
      loading: false,
    };
    iGM_Emit();
    return;
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

function iGM_GetJavaSnapshot(): iGM_LauncherV2_JavaSnapshot {
  return iGM_JavaSnapshot;
}

function iGM_GetMsaSnapshot(): iGM_LauncherV2_MsaSnapshot {
  return iGM_MsaSnapshot;
}

function iGM_GetRememberedSnapshot(): iGM_LauncherV2_RememberedSnapshot {
  return iGM_RememberedSnapshot;
}

function iGM_GetServerLobbySnapshot(): iGM_LauncherV2_ServerLobbySnapshot {
  return iGM_ServerLobbySnapshot;
}

function iGM_GetPeerLobbySnapshot(): iGM_LauncherV2_PeerLobbySnapshot {
  return iGM_PeerLobbySnapshot;
}

function iGM_GetOfflineSnapshot(): iGM_LauncherV2_OfflineSnapshot {
  return iGM_OfflineSnapshot;
}

function iGM_GetSkinSnapshot(): iGM_LauncherV2_SkinSnapshot {
  return iGM_SkinSnapshot;
}

function iGM_GetProfileSnapshot(): iGM_LauncherV2_ProfileSnapshot {
  return iGM_ProfileSnapshot;
}

function iGM_GetSettingsSnapshot(): iGM_LauncherV2_SettingsSnapshot {
  return iGM_SettingsSnapshot;
}

function iGM_GetGameScanSnapshot(): iGM_LauncherV2_GameScanSnapshot {
  return iGM_GameScanSnapshot;
}

function iGM_GetHorizonSnapshot(): iGM_LauncherV2_HorizonSnapshot {
  return iGM_HorizonSnapshot;
}

function iGM_GetVersionSnapshot(): iGM_LauncherV2_VersionSnapshot {
  return iGM_VersionSnapshot;
}

function iGM_GetLoaderSnapshot(): iGM_LauncherV2_LoaderSnapshot {
  return iGM_LoaderSnapshot;
}

function iGM_GetDownloadSnapshot(): iGM_LauncherV2_DownloadSnapshot {
  return iGM_DownloadSnapshot;
}

function iGM_GetGameSnapshot(): iGM_LauncherV2_GameSnapshot {
  return iGM_GameSnapshot;
}

function iGM_GetLaunchLogSnapshot(): iGM_LauncherV2_LaunchLogSnapshot {
  return iGM_LaunchLogSnapshot;
}

function iGM_GetLaunchProgressSnapshot(): iGM_LauncherV2_LaunchProgressSnapshot {
  return iGM_LaunchProgressSnapshot;
}

function iGM_GetMarketSnapshot(): iGM_LauncherV2_MarketSnapshot {
  return iGM_MarketSnapshot;
}

function iGM_GetMarketDetailSnapshot(): iGM_LauncherV2_MarketDetailSnapshot {
  return iGM_MarketDetailSnapshot;
}

function iGM_GetVersionDetailSnapshot(): iGM_LauncherV2_VersionDetailSnapshot {
  return iGM_VersionDetailSnapshot;
}

function iGM_GetAppearanceSnapshot(): iGM_LauncherV2_AppearanceSnapshot {
  return iGM_AppearanceSnapshot;
}

function iGM_GetUpdateSnapshot(): iGM_LauncherV2_UpdateSnapshot {
  return iGM_UpdateSnapshot;
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

  // isShell 依赖 window，只能在客户端挂载后判定：
  // 首帧固定为 false，保证静态导出 HTML 与客户端首次渲染一致（避免 hydration #418），
  // 挂载后再按真实环境更新。
  const [isShell, setShell] = useState(false);

  useEffect(() => {
    setShell(iGM_LauncherV2_IsShell());
    iGM_InstallReceiver();
    iGM_LauncherV2_SendHost({ type: "auth:status" });
  }, []);

  return {
    ...snapshot,
    isShell,
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

/** 本地 Java 环境订阅。挂载即向外壳请求当前列表；扫描需显式触发。 */
export function iGM_LauncherV2_UseJava(): iGM_LauncherV2_JavaSnapshot & {
  scan: () => void;
  browse: () => void;
  remove: (id: string) => void;
  setDefault: (id: string) => void;
} {
  const snapshot = useSyncExternalStore(
    iGM_Subscribe,
    iGM_GetJavaSnapshot,
    () => IGM_JAVA_INITIAL,
  );

  useEffect(() => {
    iGM_InstallReceiver();
    iGM_LauncherV2_SendHost({ type: "java:list" });
  }, []);

  return {
    ...snapshot,
    scan: () => {
      // 仅在外壳内才置为扫描态：浏览器预览下指令会被丢弃，避免停在「扫描中」
      if (!iGM_LauncherV2_SendHost({ type: "java:scan" })) return;
      iGM_JavaSnapshot = { ...iGM_JavaSnapshot, scanning: true };
      iGM_Emit();
    },
    browse: () => iGM_LauncherV2_SendHost({ type: "java:browse" }),
    remove: (id) => iGM_LauncherV2_SendHost({ type: "java:remove", id }),
    setDefault: (id) => iGM_LauncherV2_SendHost({ type: "java:set-default", id }),
  };
}

/** 微软正版账号订阅。挂载即向外壳询问绑定状态。 */
export function iGM_LauncherV2_UseMsa(): iGM_LauncherV2_MsaSnapshot & {
  login: () => void;
  cancel: () => void;
  openVerification: () => void;
  logout: () => void;
  /** 打开正版更换皮肤官网（正版皮肤不支持本地一键应用） */
  openOfficial: () => void;
} {
  const snapshot = useSyncExternalStore(
    iGM_Subscribe,
    iGM_GetMsaSnapshot,
    () => IGM_MSA_INITIAL,
  );

  useEffect(() => {
    iGM_InstallReceiver();
    iGM_LauncherV2_SendHost({ type: "msa:status" });
  }, []);

  return {
    ...snapshot,
    login: () => {
      // 同上：浏览器预览下不进入等待授权态
      if (!iGM_LauncherV2_SendHost({ type: "msa:login" })) return;
      iGM_MsaSnapshot = { ...iGM_MsaSnapshot, state: "pending", message: "", device: null };
      iGM_Emit();
    },
    // 取消进行中的设备代码授权；浏览器预览下同样置空展示
    cancel: () => {
      iGM_MsaSnapshot = { ...iGM_MsaSnapshot, state: "logged-out", message: "", device: null };
      iGM_Emit();
      iGM_LauncherV2_SendHost({ type: "msa:cancel" });
    },
    // 用系统默认浏览器打开微软验证页输入用户代码
    openVerification: () => iGM_LauncherV2_SendHost({ type: "msa:open-verification" }),
    logout: () => iGM_LauncherV2_SendHost({ type: "msa:logout" }),
    openOfficial: () => iGM_LauncherV2_SendHost({ type: "skin:open-official" }),
  };
}

/** 历史社区账号订阅（登录界面展示头像 / 昵称与【一键登录社区账号】入口） */
export function iGM_LauncherV2_UseRememberedAccount(): iGM_LauncherV2_RememberedSnapshot & {
  refresh: () => void;
  quickLogin: () => void;
} {
  const snapshot = useSyncExternalStore(
    iGM_Subscribe,
    iGM_GetRememberedSnapshot,
    () => IGM_REMEMBERED_INITIAL,
  );

  useEffect(() => {
    iGM_InstallReceiver();
    iGM_LauncherV2_SendHost({ type: "auth:remembered" });
  }, []);

  return {
    ...snapshot,
    refresh: () => iGM_LauncherV2_SendHost({ type: "auth:remembered" }),
    quickLogin: () => {
      // 直接复用本地长效令牌恢复登录态；置为等待态由外壳回推最终结果
      iGM_AuthSnapshot = { ...iGM_AuthSnapshot, state: "pending", message: "" };
      iGM_Emit();
      iGM_LauncherV2_SendHost({ type: "auth:quick-login" });
    },
  };
}

/**
 * 服务器大厅订阅。
 * 挂载即向外壳请求一次列表；列表与实时状态均由外壳请求第三方公开接口得到，
 * 界面不内置任何服务器数据，断网时外壳回推本地缓存并置 source 为 cache。
 */
export function iGM_LauncherV2_UseServerLobby(): iGM_LauncherV2_ServerLobbySnapshot & {
  refresh: () => void;
  refreshStatuses: () => void;
  add: (input: { name: string; ip: string; port: number; site: string }) => void;
  remove: (id: string) => void;
  queryStatus: (id: string) => void;
  join: (id: string) => void;
  dismissNotice: () => void;
} {
  const snapshot = useSyncExternalStore(
    iGM_Subscribe,
    iGM_GetServerLobbySnapshot,
    () => IGM_SERVER_LOBBY_INITIAL,
  );

  useEffect(() => {
    iGM_InstallReceiver();
    iGM_LauncherV2_SendHost({ type: "server:list" });
  }, []);

  return {
    ...snapshot,
    refresh: () => {
      if (!iGM_LauncherV2_SendHost({ type: "server:list" })) {
        // 浏览器预览下无外壳：立即结束加载态并给出明确说明
        iGM_ServerLobbySnapshot = {
          ...iGM_ServerLobbySnapshot,
          loading: false,
          loaded: true,
          message: "浏览器预览下不提供服务器大厅数据",
        };
        iGM_Emit();
        return;
      }
      iGM_ServerLobbySnapshot = { ...iGM_ServerLobbySnapshot, loading: true, message: "正在拉取服务器列表…" };
      iGM_Emit();
    },
    refreshStatuses: () => {
      if (!iGM_LauncherV2_SendHost({ type: "server:statuses" })) {
        iGM_ServerLobbySnapshot = {
          ...iGM_ServerLobbySnapshot,
          refreshing: false,
          notice: "浏览器预览下无法刷新服务器状态",
        };
        iGM_Emit();
        return;
      }
      iGM_ServerLobbySnapshot = {
        ...iGM_ServerLobbySnapshot,
        refreshing: true,
        notice: "正在刷新全部服务器状态…",
      };
      iGM_Emit();
    },
    add: (input) => {
      if (!iGM_LauncherV2_SendHost({ type: "server:add", ...input })) {
        iGM_ServerLobbySnapshot = { ...iGM_ServerLobbySnapshot, notice: "浏览器预览下不支持添加服务器" };
        iGM_Emit();
      }
    },
    remove: (id) => {
      if (!iGM_LauncherV2_SendHost({ type: "server:remove", id })) {
        iGM_ServerLobbySnapshot = { ...iGM_ServerLobbySnapshot, notice: "浏览器预览下不支持删除服务器" };
        iGM_Emit();
      }
    },
    queryStatus: (id) => {
      if (!iGM_LauncherV2_SendHost({ type: "server:status", id })) {
        iGM_ServerLobbySnapshot = { ...iGM_ServerLobbySnapshot, notice: "浏览器预览下无法查询服务器状态" };
        iGM_Emit();
        return;
      }
      // 置空表示该条正在查询，避免与上一次结果混淆
      iGM_ServerLobbySnapshot = {
        ...iGM_ServerLobbySnapshot,
        statuses: { ...iGM_ServerLobbySnapshot.statuses, [id]: null },
        notice: "正在查询服务器状态…",
      };
      iGM_Emit();
    },
    join: (id) => {
      if (!iGM_LauncherV2_SendHost({ type: "server:join", id })) {
        iGM_ServerLobbySnapshot = { ...iGM_ServerLobbySnapshot, notice: "浏览器预览下无法进入服务器" };
        iGM_Emit();
      }
    },
    dismissNotice: () => {
      iGM_ServerLobbySnapshot = { ...iGM_ServerLobbySnapshot, notice: "" };
      iGM_Emit();
    },
  };
}

/**
 * 联机大厅（P2P）订阅。
 * 挂载即向外壳请求一次联机状态；连接模式由外壳决定：
 * 主站高速节点可用时为 community（绿色状态），不可用时自动降级为 public（黄色状态）。
 */
export function iGM_LauncherV2_UsePeerLobby(): iGM_LauncherV2_PeerLobbySnapshot & {
  refresh: () => void;
  connect: () => void;
  create: () => void;
  join: (code: string) => void;
  leave: () => void;
} {
  const snapshot = useSyncExternalStore(
    iGM_Subscribe,
    iGM_GetPeerLobbySnapshot,
    () => IGM_PEER_LOBBY_INITIAL,
  );

  useEffect(() => {
    iGM_InstallReceiver();
    iGM_LauncherV2_SendHost({ type: "peer:status" });
  }, []);

  return {
    ...snapshot,
    refresh: () => {
      if (!iGM_LauncherV2_SendHost({ type: "peer:status" })) {
        iGM_PeerLobbySnapshot = {
          ...iGM_PeerLobbySnapshot,
          loaded: true,
          message: "浏览器预览下不提供联机大厅数据",
        };
        iGM_Emit();
      }
    },
    connect: () => {
      if (!iGM_LauncherV2_SendHost({ type: "peer:connect" })) {
        iGM_PeerLobbySnapshot = {
          ...iGM_PeerLobbySnapshot,
          loaded: true,
          message: "浏览器预览下无法连接联机节点",
        };
        iGM_Emit();
        return;
      }
      // 先本地置为连接中，给出即时反馈
      iGM_PeerLobbySnapshot = {
        ...iGM_PeerLobbySnapshot,
        mode: "connecting",
        status: "正在连接联机节点…",
        loaded: true,
        message: "",
      };
      iGM_Emit();
    },
    create: () => {
      if (!iGM_LauncherV2_SendHost({ type: "peer:create" })) {
        iGM_PeerLobbySnapshot = { ...iGM_PeerLobbySnapshot, message: "浏览器预览下无法创建房间" };
        iGM_Emit();
      }
    },
    join: (code) => {
      if (!iGM_LauncherV2_SendHost({ type: "peer:join", code })) {
        iGM_PeerLobbySnapshot = { ...iGM_PeerLobbySnapshot, message: "浏览器预览下无法加入房间" };
        iGM_Emit();
      }
    },
    leave: () => {
      if (!iGM_LauncherV2_SendHost({ type: "peer:leave" })) {
        iGM_PeerLobbySnapshot = { ...iGM_PeerLobbySnapshot, message: "浏览器预览下无法退出房间" };
        iGM_Emit();
      }
    },
  };
}

/** 离线账号订阅。挂载即向外壳请求当前列表。 */
export function iGM_LauncherV2_UseOffline(): iGM_LauncherV2_OfflineSnapshot & {
  add: (name: string) => void;
  remove: (id: string) => void;
  select: (id: string) => void;
} {
  const snapshot = useSyncExternalStore(
    iGM_Subscribe,
    iGM_GetOfflineSnapshot,
    () => IGM_OFFLINE_INITIAL,
  );

  useEffect(() => {
    iGM_InstallReceiver();
    iGM_LauncherV2_SendHost({ type: "offline:list" });
  }, []);

  return {
    ...snapshot,
    add: (name) => iGM_LauncherV2_SendHost({ type: "offline:add", name }),
    remove: (id) => iGM_LauncherV2_SendHost({ type: "offline:remove", id }),
    select: (id) => iGM_LauncherV2_SendHost({ type: "offline:select", id }),
  };
}

/** 重新同步社区资料（头像在社区侧修改后回到启动器调用） */
export function iGM_LauncherV2_RefreshCommunityProfile(): boolean {
  return iGM_LauncherV2_SendHost({ type: "auth:refresh" });
}

/** 打开社区资料设置页以更换头像 */
export function iGM_LauncherV2_ChangeCommunityAvatar(): boolean {
  return iGM_LauncherV2_SendHost({ type: "auth:change-avatar" });
}

/**
 * 皮肤库订阅。挂载即向外壳请求当前列表。
 * 导入 / 删除经外壳回推 skin:library 刷新，浏览器预览下保持空列表不报错。
 */
export function iGM_LauncherV2_UseSkinLibrary(): iGM_LauncherV2_SkinSnapshot & {
  import: (name: string, dataBase64: string) => void;
  remove: (id: string) => void;
  apply: (params: { id?: string; skinUrl?: string }) => void;
} {
  const snapshot = useSyncExternalStore(
    iGM_Subscribe,
    iGM_GetSkinSnapshot,
    () => IGM_SKIN_INITIAL,
  );

  useEffect(() => {
    iGM_InstallReceiver();
    iGM_LauncherV2_SendHost({ type: "skin:library" });
  }, []);

  return {
    ...snapshot,
    import: (name, dataBase64) =>
      iGM_LauncherV2_SendHost({ type: "skin:import", name, dataBase64 }),
    remove: (id) => iGM_LauncherV2_SendHost({ type: "skin:remove", id }),
    apply: (params) =>
      iGM_LauncherV2_SendHost({ type: "skin:apply", id: params.id, skinUrl: params.skinUrl }),
  };
}

/**
 * 正版档案订阅。挂载即向外壳请求当前正版账号的皮肤 / 披风纹理。
 * 纹理由外壳取回后转 data URL 下发，界面据此渲染 3D 模型。
 */
export function iGM_LauncherV2_UseSkinProfile(): iGM_LauncherV2_ProfileSnapshot & {
  refresh: () => void;
  openOfficial: () => void;
} {
  const snapshot = useSyncExternalStore(
    iGM_Subscribe,
    iGM_GetProfileSnapshot,
    () => IGM_PROFILE_INITIAL,
  );

  useEffect(() => {
    iGM_InstallReceiver();
    iGM_LauncherV2_SendHost({ type: "profile:fetch" });
  }, []);

  return {
    ...snapshot,
    refresh: () => iGM_LauncherV2_SendHost({ type: "profile:fetch" }),
    openOfficial: () => iGM_LauncherV2_SendHost({ type: "skin:open-official" }),
  };
}

/**
 * 请求外壳取回一张皮肤纹理（转 data URL）。
 * 浏览器预览下返回空结果，调用方据此退化为不渲染纹理。
 */
export function iGM_LauncherV2_RequestTexture(
  url: string,
): Promise<{ dataUrl: string; message: string }> {
  if (!url) return Promise.resolve({ dataUrl: "", message: "" });
  if (!iGM_LauncherV2_SendHost({ type: "skin:texture", url })) {
    return Promise.resolve({ dataUrl: "", message: "" });
  }

  return new Promise((resolve) => {
    const listeners = iGM_TextureListeners.get(url) ?? new Set();
    const listener = (dataUrl: string, message: string): void => {
      listeners.delete(listener);
      if (listeners.size === 0) iGM_TextureListeners.delete(url);
      resolve({ dataUrl, message });
    };
    listeners.add(listener);
    iGM_TextureListeners.set(url, listeners);
  });
}

/**
 * 路径与设置订阅。挂载即向外壳请求路径与设置快照。
 * 根目录选择复用外壳原生目录选择器；下载通道由用户显式设置，外壳不做降级。
 */
export function iGM_LauncherV2_UseSettings(): iGM_LauncherV2_SettingsSnapshot & {
  browseRoot: () => void;
  setRoot: (path: string) => void;
  setChannel: (channel: iGM_LauncherV2_DownloadChannel) => void;
} {
  const snapshot = useSyncExternalStore(
    iGM_Subscribe,
    iGM_GetSettingsSnapshot,
    () => IGM_SETTINGS_INITIAL,
  );

  useEffect(() => {
    iGM_InstallReceiver();
    iGM_LauncherV2_SendHost({ type: "settings:paths" });
  }, []);

  return {
    ...snapshot,
    browseRoot: () =>
      iGM_LauncherV2_SendHost({
        type: "settings:root-browse",
        current: iGM_SettingsSnapshot.paths?.userRoot ?? "",
      }),
    setRoot: (path) => iGM_LauncherV2_SendHost({ type: "settings:root-set", path }),
    setChannel: (channel) => iGM_LauncherV2_SendHost({ type: "settings:channel-set", channel }),
  };
}

/**
 * 游戏目录扫描订阅。挂载即请求一次扫描；外壳启动时也会主动回推一次。
 * 完整性判定口径：同时存在 assets / libraries / versions 判为完整。
 */
export function iGM_LauncherV2_UseGameScan(): iGM_LauncherV2_GameScanSnapshot & {
  scan: () => void;
  browse: () => void;
  use: (path: string) => void;
  remove: (path: string) => void;
  generate: () => void;
} {
  const snapshot = useSyncExternalStore(
    iGM_Subscribe,
    iGM_GetGameScanSnapshot,
    () => IGM_GAMESCAN_INITIAL,
  );

  useEffect(() => {
    iGM_InstallReceiver();
    iGM_LauncherV2_SendHost({ type: "game:scan" });
  }, []);

  return {
    ...snapshot,
    scan: () => iGM_LauncherV2_SendHost({ type: "game:scan" }),
    browse: () => iGM_LauncherV2_SendHost({ type: "game:browse" }),
    use: (path) => iGM_LauncherV2_SendHost({ type: "game:use", path }),
    remove: (path) => iGM_LauncherV2_SendHost({ type: "game:delete", path }),
    generate: () => iGM_LauncherV2_SendHost({ type: "game:generate" }),
  };
}

/**
 * 视界订阅。挂载即向外壳请求视界列表。
 * 视界取代原「实例」概念：一个视界 = horizons/ 下的一整套隔离目录，
 * 切换视界只改设置中的当前标识，启动游戏时 gameDir 指向该视界物理路径。
 */
export function iGM_LauncherV2_UseHorizons(): iGM_LauncherV2_HorizonSnapshot & {
  refresh: () => void;
  create: (name: string, versionId?: string, loaderLabel?: string) => void;
  select: (id: string) => void;
  remove: (id: string) => void;
} {
  const snapshot = useSyncExternalStore(
    iGM_Subscribe,
    iGM_GetHorizonSnapshot,
    () => IGM_HORIZON_INITIAL,
  );

  useEffect(() => {
    iGM_InstallReceiver();
    iGM_LauncherV2_SendHost({ type: "horizon:list" });
  }, []);

  return {
    ...snapshot,
    refresh: () => iGM_LauncherV2_SendHost({ type: "horizon:list" }),
    create: (name, versionId, loaderLabel) =>
      iGM_LauncherV2_SendHost({ type: "horizon:create", name, versionId, loaderLabel }),
    select: (id) => iGM_LauncherV2_SendHost({ type: "horizon:select", id }),
    remove: (id) => iGM_LauncherV2_SendHost({ type: "horizon:delete", id }),
  };
}

/**
 * 订阅新建视界的处理结果；返回取消订阅函数。
 * 外壳无论成功失败都会回推一条 horizon:result，界面据此给出明确反馈，
 * 不依赖列表提示文案的推断，避免「点击后毫无反应」。
 */
export function iGM_LauncherV2_OnHorizonResult(
  listener: (result: Extract<iGM_LauncherV2_InboundMessage, { type: "horizon:result" }>) => void,
): () => void {
  iGM_InstallReceiver();
  iGM_HorizonResultListeners.add(listener);
  return () => {
    iGM_HorizonResultListeners.delete(listener);
  };
}

/**
 * 游戏启动订阅。挂载即向外壳查询当前启动状态；
 * launch 触发外壳按视界拼装启动命令并拉起游戏进程，状态经 game:state 回推。
 */
export function iGM_LauncherV2_UseLaunch(): iGM_LauncherV2_GameSnapshot & {
  launch: (horizonId: string) => void;
} {
  const snapshot = useSyncExternalStore(
    iGM_Subscribe,
    iGM_GetGameSnapshot,
    () => IGM_GAME_INITIAL,
  );

  useEffect(() => {
    iGM_InstallReceiver();
    iGM_LauncherV2_SendHost({ type: "game:state" });
  }, []);

  return {
    ...snapshot,
    launch: (horizonId) => iGM_LauncherV2_SendHost({ type: "game:launch", horizonId }),
  };
}

/**
 * 启动日志订阅（错误控制台）。
 * 挂载即向外壳取回一次完整日志缓冲；随后外壳在游戏进程存活期间实时推送 launch:log。
 * 浏览器预览下无任何日志，界面展示空状态即可。
 */
export function iGM_LauncherV2_UseLaunchLogs(): iGM_LauncherV2_LaunchLogSnapshot & {
  reload: () => void;
  clear: () => void;
} {
  const snapshot = useSyncExternalStore(
    iGM_Subscribe,
    iGM_GetLaunchLogSnapshot,
    () => IGM_LAUNCH_LOG_INITIAL,
  );

  useEffect(() => {
    iGM_InstallReceiver();
    iGM_LauncherV2_SendHost({ type: "launch:logs" });
  }, []);

  return {
    ...snapshot,
    reload: () => iGM_LauncherV2_SendHost({ type: "launch:logs" }),
    clear: () => {
      // 清空仅作用于界面缓冲；外壳缓冲由下次 game:launch 前重新加载刷新
      iGM_LaunchLogSnapshot = { entries: [], loaded: true };
      iGM_Emit();
    },
  };
}

/**
 * 切换全局当前账号。
 * 离线账号走离线模块（其内部同步 currentAccount），正版直接写设置；
 * 浏览器预览下指令被丢弃，界面本地高亮以快照为准，不会产生副作用。
 */
export function iGM_LauncherV2_SelectAccount(kind: iGM_LauncherV2_AccountKind, id: string): boolean {
  if (kind !== "msa" && kind !== "offline") return false;
  return iGM_LauncherV2_SendHost({ type: "account:select", kind, id });
}

/** 注册一条视界目录树请求回调；返回取消订阅函数 */
function iGM_OnHorizonTree(
  horizonId: string,
  listener: (nodes: iGM_LauncherV2_HorizonNode[]) => void,
): () => void {
  iGM_InstallReceiver();
  const listeners = iGM_HorizonTreeListeners.get(horizonId) ?? new Set();
  listeners.add(listener);
  iGM_HorizonTreeListeners.set(horizonId, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) iGM_HorizonTreeListeners.delete(horizonId);
  };
}

/** 注册一条视界世界列表请求回调；返回取消订阅函数 */
function iGM_OnHorizonWorlds(
  horizonId: string,
  listener: (worlds: iGM_LauncherV2_WorldEntry[]) => void,
): () => void {
  iGM_InstallReceiver();
  const listeners = iGM_HorizonWorldsListeners.get(horizonId) ?? new Set();
  listeners.add(listener);
  iGM_HorizonWorldsListeners.set(horizonId, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) iGM_HorizonWorldsListeners.delete(horizonId);
  };
}

/**
 * 视界目录树订阅。horizonId 变化即重新请求；
 * 仅返回该视界文件夹（horizons/<名称>/）内部的结构。
 */
export function iGM_LauncherV2_UseHorizonTree(horizonId: string): {
  nodes: iGM_LauncherV2_HorizonNode[];
  loading: boolean;
  reload: () => void;
} {
  const [nodes, setNodes] = useState<iGM_LauncherV2_HorizonNode[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    if (!horizonId) {
      setNodes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    if (!iGM_LauncherV2_SendHost({ type: "horizon:tree", id: horizonId })) setLoading(false);
  }, [horizonId]);

  useEffect(() => {
    const off = iGM_OnHorizonTree(horizonId, (list) => {
      setNodes(list);
      setLoading(false);
    });
    load();
    return off;
  }, [horizonId, load]);

  return { nodes, loading, reload: load };
}

/**
 * 视界世界列表订阅。仅读取该视界 saves/ 目录下的存档。
 */
export function iGM_LauncherV2_UseHorizonWorlds(horizonId: string): {
  worlds: iGM_LauncherV2_WorldEntry[];
  loading: boolean;
  reload: () => void;
} {
  const [worlds, setWorlds] = useState<iGM_LauncherV2_WorldEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    if (!horizonId) {
      setWorlds([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    if (!iGM_LauncherV2_SendHost({ type: "horizon:worlds", id: horizonId })) setLoading(false);
  }, [horizonId]);

  useEffect(() => {
    const off = iGM_OnHorizonWorlds(horizonId, (list) => {
      setWorlds(list);
      setLoading(false);
    });
    load();
    return off;
  }, [horizonId, load]);

  return { worlds, loading, reload: load };
}

/**
 * 版本列表订阅（资源中心）。挂载即请求全量版本列表；
 * 外壳会先对三个源做测速再择优拉取，并回推各源延迟供界面展示。
 */
export function iGM_LauncherV2_UseVersions(): iGM_LauncherV2_VersionSnapshot & {
  refresh: () => void;
  loadLoaders: (gameVersion: string) => void;
} {
  const snapshot = useSyncExternalStore(
    iGM_Subscribe,
    iGM_GetVersionSnapshot,
    () => IGM_VERSION_INITIAL,
  );

  useEffect(() => {
    iGM_InstallReceiver();
    iGM_LauncherV2_SendHost({ type: "versions:list" });
  }, []);

  return {
    ...snapshot,
    refresh: () => {
      iGM_VersionSnapshot = { ...iGM_VersionSnapshot, loading: true, message: "正在测速并获取版本列表…" };
      iGM_Emit();
      iGM_LauncherV2_SendHost({ type: "versions:list" });
    },
    loadLoaders: (gameVersion) => {
      iGM_LoaderSnapshot = { gameVersion, loaders: [], message: "正在获取加载器列表…", loading: true };
      iGM_Emit();
      iGM_LauncherV2_SendHost({ type: "loaders:list", gameVersion });
    },
  };
}

/** 加载器列表订阅 */
export function iGM_LauncherV2_UseLoaders(): iGM_LauncherV2_LoaderSnapshot {
  return useSyncExternalStore(iGM_Subscribe, iGM_GetLoaderSnapshot, () => IGM_LOADER_INITIAL);
}

/**
 * 已下载版本订阅（新建视界时选择本地版本）。
 * 挂载即向外壳请求一次本地已完整落盘的版本 id 列表；支持手动刷新。
 */
export function iGM_LauncherV2_UseInstalledVersions(): iGM_LauncherV2_InstalledSnapshot & {
  reload: () => void;
} {
  const snapshot = useSyncExternalStore(
    iGM_Subscribe,
    () => iGM_InstalledSnapshot,
    () => IGM_INSTALLED_INITIAL,
  );

  const reload = useCallback(() => {
    iGM_InstalledSnapshot = { ...iGM_InstalledSnapshot, loading: true };
    iGM_Emit();
    if (!iGM_LauncherV2_SendHost({ type: "version:installed" })) {
      iGM_InstalledSnapshot = { ...iGM_InstalledSnapshot, loading: false };
      iGM_Emit();
    }
  }, []);

  useEffect(() => {
    iGM_InstallReceiver();
    reload();
  }, [reload]);

  return { ...snapshot, reload };
}

/**
 * 下载任务订阅。挂载即取一次任务快照。
 * 下载源由外壳后台自动测速择优，界面不提供选择，也不做任何自动降级或换源提示。
 */
export function iGM_LauncherV2_UseDownloads(): iGM_LauncherV2_DownloadSnapshot & {
  refresh: () => void;
  start: (input: {
    versionId: string;
    /** 加载器展示名，仅用于任务命名 */
    loaderLabel?: string;
    /** 用户填写的视界名称；下载成功后据此创建视界 */
    horizonName: string;
    /** 用户选定的存放根目录；与当前根目录不同时外壳先切换根目录再下载 */
    rootPath: string;
  }) => void;
  cancel: (id: string) => void;
  pause: (id: string) => void;
  resume: (id: string) => void;
  clear: (id: string) => void;
  dismissNotice: () => void;
} {
  const snapshot = useSyncExternalStore(
    iGM_Subscribe,
    iGM_GetDownloadSnapshot,
    () => IGM_DOWNLOAD_INITIAL,
  );

  useEffect(() => {
    iGM_InstallReceiver();
    iGM_LauncherV2_SendHost({ type: "download:list" });
    // 限速状态不随任务列表回推，需单独取一次（游戏运行中启动界面时也能立即看到提示）
    iGM_LauncherV2_SendHost({ type: "download:throttle" });
  }, []);

  return {
    ...snapshot,
    refresh: () => iGM_LauncherV2_SendHost({ type: "download:list" }),
    start: (input) => iGM_LauncherV2_SendHost({ type: "download:start", ...input }),
    cancel: (id) => iGM_LauncherV2_SendHost({ type: "download:cancel", id }),
    pause: (id) => iGM_LauncherV2_SendHost({ type: "download:pause", id }),
    resume: (id) => iGM_LauncherV2_SendHost({ type: "download:resume", id }),
    clear: (id) => iGM_LauncherV2_SendHost({ type: "download:clear", id }),
    dismissNotice: () => {
      iGM_DownloadSnapshot = { ...iGM_DownloadSnapshot, notice: "" };
      iGM_Emit();
    },
  };
}

/**
 * 版本详情订阅。
 * 发起请求时先把 loading 置位，外壳回推后自动清空。
 */
export function iGM_LauncherV2_UseVersionDetail(): iGM_LauncherV2_VersionDetailSnapshot & {
  load: (versionId: string) => void;
} {
  const snapshot = useSyncExternalStore(
    iGM_Subscribe,
    iGM_GetVersionDetailSnapshot,
    () => IGM_VERSION_DETAIL_INITIAL,
  );

  return {
    ...snapshot,
    load: (versionId: string) => {
      iGM_VersionDetailSnapshot = { versionId, detail: null, loading: true };
      iGM_Emit();
      iGM_LauncherV2_SendHost({ type: "version:detail", versionId });
    },
  };
}

/**
 * 游戏启动进度订阅（启动遮罩）。
 * 挂载即向外壳查询一次当前进度，随后外壳按 10 / 30 / 50 / 70 / 100 实时推送；
 * 命中严重错误时 progress.failed 置位，界面据此弹出红色错误日志并中止进度。
 */
export function iGM_LauncherV2_UseLaunchProgress(): iGM_LauncherV2_LaunchProgressSnapshot & {
  reset: () => void;
} {
  const snapshot = useSyncExternalStore(
    iGM_Subscribe,
    iGM_GetLaunchProgressSnapshot,
    () => IGM_LAUNCH_PROGRESS_INITIAL,
  );

  useEffect(() => {
    iGM_InstallReceiver();
    iGM_LauncherV2_SendHost({ type: "launch:progress" });
  }, []);

  return {
    ...snapshot,
    reset: () => {
      iGM_LaunchProgressSnapshot = IGM_LAUNCH_PROGRESS_INITIAL;
      iGM_Emit();
    },
  };
}

/**
 * 资源市场检索订阅。
 * search 传入分类 / 加载器 / 关键词与偏移，外壳按数据源拼装请求并回推 market:result；
 * 界面据快照中的请求上下文与入参比对，丢弃过期响应。
 */
export function iGM_LauncherV2_UseMarket(): iGM_LauncherV2_MarketSnapshot & {
  search: (input: {
    source: iGM_LauncherV2_MarketSource;
    category: iGM_LauncherV2_MarketCategory;
    loader: iGM_LauncherV2_MarketLoader;
    query: string;
    offset?: number;
  }) => void;
} {
  const snapshot = useSyncExternalStore(iGM_Subscribe, iGM_GetMarketSnapshot, () => IGM_MARKET_INITIAL);

  useEffect(() => {
    iGM_InstallReceiver();
  }, []);

  return {
    ...snapshot,
    search: (input) => {
      const offset = input.offset ?? 0;
      iGM_MarketSnapshot = {
        ...iGM_MarketSnapshot,
        loading: true,
        message: "正在检索…",
        source: input.source,
        category: input.category,
        loader: input.loader,
        query: input.query,
        offset,
        items: offset > 0 ? iGM_MarketSnapshot.items : [],
      };
      iGM_Emit();
      if (
        !iGM_LauncherV2_SendHost({
          type: "market:search",
          source: input.source,
          category: input.category,
          loader: input.loader,
          query: input.query,
          offset,
        })
      ) {
        // 浏览器预览下无外壳：立即结束加载态并给出提示
        iGM_MarketSnapshot = { ...iGM_MarketSnapshot, loading: false, loaded: true, message: "浏览器预览下不提供资源市场检索" };
        iGM_Emit();
      }
    },
  };
}

/** 资源市场详情订阅（一卡式下载弹窗打开时按需加载） */
export function iGM_LauncherV2_UseMarketDetail(): iGM_LauncherV2_MarketDetailSnapshot & {
  load: (
    source: iGM_LauncherV2_MarketSource,
    id: string,
    category: iGM_LauncherV2_MarketCategory,
  ) => void;
  clear: () => void;
} {
  const snapshot = useSyncExternalStore(
    iGM_Subscribe,
    iGM_GetMarketDetailSnapshot,
    () => IGM_MARKET_DETAIL_INITIAL,
  );

  useEffect(() => {
    iGM_InstallReceiver();
  }, []);

  return {
    ...snapshot,
    load: (source, id, category) => {
      iGM_MarketDetailSnapshot = { detail: null, message: "正在拉取详情…", loading: true };
      iGM_Emit();
      if (!iGM_LauncherV2_SendHost({ type: "market:detail", source, id, category })) {
        iGM_MarketDetailSnapshot = {
          detail: null,
          message: "浏览器预览下不提供资源详情",
          loading: false,
        };
        iGM_Emit();
      }
    },
    clear: () => {
      iGM_MarketDetailSnapshot = IGM_MARKET_DETAIL_INITIAL;
      iGM_Emit();
    },
  };
}

/**
 * 发起资源市场下载（双通道 + 落盘模式）。
 * 通道 A（sdk）由外壳后端代理转发，通道 B（direct）由下载引擎直连目标地址并自动调度源；
 * 落盘模式由安装确认对话框决定：horizon 装入指定视界（horizonId 为空表示当前视界），
 * folder 仅下载文件到用户自选目录（folderPath）。两条通道的任务统一进入右下角下载任务管理器。
 */
export function iGM_LauncherV2_StartMarketDownload(input: {
  name: string;
  category: iGM_LauncherV2_MarketCategory;
  url: string;
  fileName: string;
  size: number;
  channel: iGM_LauncherV2_DownloadChannel;
  mode: "horizon" | "folder";
  horizonId?: string;
  folderPath?: string;
}): boolean {
  return iGM_LauncherV2_SendHost({
    type: "market:download",
    horizonId: "",
    folderPath: "",
    ...input,
  });
}

/**
 * 外观配置订阅。
 * 挂载即向外壳取一次当前外观；修改后由外壳回推 appearance:state。
 */
export function iGM_LauncherV2_UseAppearance(): iGM_LauncherV2_AppearanceSnapshot & {
  set: (patch: iGM_LauncherV2_AppearancePatch) => void;
} {
  const snapshot = useSyncExternalStore(
    iGM_Subscribe,
    iGM_GetAppearanceSnapshot,
    () => IGM_APPEARANCE_INITIAL,
  );

  useEffect(() => {
    iGM_InstallReceiver();
    iGM_LauncherV2_SendHost({ type: "appearance:get" });
  }, []);

  return {
    ...snapshot,
    set: (patch) => iGM_LauncherV2_SendHost({ type: "appearance:set", patch }),
  };
}

/**
 * 自动更新订阅。
 * 外壳在启动时静默检查并回推 update:state；界面据此在右下角弹出更新提示，
 * 用户确认后走后台下载与「立即重启并更新」。
 */
export function iGM_LauncherV2_UseUpdate(): iGM_LauncherV2_UpdateSnapshot & {
  check: () => void;
  download: () => void;
  install: () => void;
} {
  const snapshot = useSyncExternalStore(
    iGM_Subscribe,
    iGM_GetUpdateSnapshot,
    () => IGM_UPDATE_INITIAL,
  );

  useEffect(() => {
    iGM_InstallReceiver();
  }, []);

  return {
    ...snapshot,
    check: () => iGM_LauncherV2_SendHost({ type: "update:check" }),
    download: () => iGM_LauncherV2_SendHost({ type: "update:download" }),
    install: () => iGM_LauncherV2_SendHost({ type: "update:install" }),
  };
}

/** 用系统默认浏览器打开外部链接（版本更新日志等）；浏览器预览下退化为新标签页 */
export function iGM_LauncherV2_OpenLink(url: string): void {
  if (!iGM_LauncherV2_SendHost({ type: "link:open", url })) window.open(url, "_blank");
}

/** 窗口控制：最小化 / 最大化切换 / 关闭；浏览器中为无操作 */
export const iGM_LauncherV2_WindowControls = {
  minimize: () => iGM_LauncherV2_SendHost({ type: "window:minimize" }),
  toggleMaximize: () => iGM_LauncherV2_SendHost({ type: "window:toggle-maximize" }),
  close: () => iGM_LauncherV2_SendHost({ type: "window:close" }),
};

/**
 * 安装向导：请求外壳打开原生目录选择器。
 * 外壳选定目录后经 installer:path 回推，由 iGM_LauncherV2_OnFolderPicked 订阅接收。
 * 浏览器预览下返回 false，界面可退化为手动输入路径。
 */
export function iGM_LauncherV2_BrowseFolder(current: string): boolean {
  return iGM_LauncherV2_SendHost({ type: "installer:browse", current });
}

/**
 * 通用目录选择器：请求外壳打开原生目录选择器并返回用户选定的目录路径。
 * 与安装向导的 BrowseFolder 不同，本接口不改动任何启动器设置，仅回传选择结果；
 * 用户取消时原生选择器不回报，Promise 不会 resolve，调用方可忽略；
 * 浏览器预览下立即返回空串。
 */
export function iGM_LauncherV2_PickFolder(current: string): Promise<string> {
  if (!iGM_LauncherV2_SendHost({ type: "dialog:pick-folder", current })) {
    return Promise.resolve("");
  }
  return new Promise((resolve) => {
    const listener = (path: string): void => {
      iGM_DialogFolderListeners.delete(listener);
      resolve(path);
    };
    iGM_DialogFolderListeners.add(listener);
  });
}

/** 订阅外壳回推的目录选择结果；返回取消订阅函数 */
export function iGM_LauncherV2_OnFolderPicked(listener: (path: string) => void): () => void {
  iGM_InstallReceiver();
  iGM_FolderListeners.add(listener);
  return () => {
    iGM_FolderListeners.delete(listener);
  };
}

/** 安装向导：通知外壳安装完成（写入标记并进入主界面）；浏览器中为无操作 */
export function iGM_LauncherV2_CompleteInstall(): boolean {
  return iGM_LauncherV2_SendHost({ type: "installer:complete" });
}

/**
 * 环境感知的页面跳转（整页跳转，不依赖 Next 客户端路由）。
 * 外壳（Electrobun）环境下界面由 views:// 自定义协议提供，客户端路由读取 RSC 负载
 * 在自定义协议下不可用，会出现点击后页面毫无反应的情况；因此这里统一改为整页跳转，
 * 并在外壳内把路由地址补全为静态导出产物（/G_Login -> G_Login.html），保证切换一定发生。
 */
export function iGM_LauncherV2_Navigate(route: string): void {
  if (typeof window === "undefined") return;

  if (iGM_LauncherV2_IsShell()) {
    const file = route === "/" ? "index.html" : `${route.replace(/^\/+/, "")}.html`;
    window.location.assign(new URL(file, window.location.href).toString());
    return;
  }

  window.location.assign(route);
}

/** 社区授权本地回调地址（供界面展示，便于用户核对） */
export const IGM_LAUNCHERV2_HOST_REDIRECT_URI = IGM_LAUNCHERV2_REDIRECT_URI;

export default iGM_LauncherV2_SendHost;
