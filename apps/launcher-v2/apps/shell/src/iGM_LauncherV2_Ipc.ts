/**
 * 文件路径：apps/shell/src/iGM_LauncherV2_Ipc.ts
 * 所属层：桌面外壳 / 进程间通信层
 * 路由：全局
 * 模块：iGM_LauncherV2_Ipc
 * 作用：主进程与界面之间的宿主消息契约与解析/回推工具
 * 内容：契约覆盖窗口控制、社区授权、Java 环境、微软正版、离线账号、皮肤库与正版档案、
 *       版本下载（含暂停 / 继续 / 取消与全局限速状态）、游戏启动与资源市场检索、
 *       外观与主题自定义、启动器自动更新；
 *       界面经 Electrobun 预加载脚本注入的 window.__electrobunSendToHost 发送指令，
 *       主进程经 webview 的 host-message 事件接收；
 *       主进程经 webview.queueHostMessageToWebview 回推状态
 *       （其内部执行页面侧 window.__electrobun.receiveMessageFromHost）；
 *       解析兼容 data.detail、detail 与已解析对象三种事件形态
 */

// 导入依赖 //
import type { BrowserWindow } from "electrobun/main";
import type {
  iGM_LauncherV2_AppearancePatch,
  iGM_LauncherV2_AppearanceState,
} from "./iGM_LauncherV2_Appearance";
import type { iGM_LauncherV2_GameCandidate } from "./iGM_LauncherV2_GameScan";
import type {
  iGM_LauncherV2_Horizon,
  iGM_LauncherV2_HorizonNode,
  iGM_LauncherV2_WorldEntry,
} from "./iGM_LauncherV2_Horizon";
import type {
  iGM_LauncherV2_GameState,
  iGM_LauncherV2_LaunchLogEntry,
  iGM_LauncherV2_LaunchProgress,
} from "./iGM_LauncherV2_Launch";
import type {
  iGM_LauncherV2_MarketCategory,
  iGM_LauncherV2_MarketDetail,
  iGM_LauncherV2_MarketItem,
  iGM_LauncherV2_MarketLoader,
  iGM_LauncherV2_MarketSource,
} from "./iGM_LauncherV2_Market";
import type {
  iGM_LauncherV2_DownloadTask,
} from "./iGM_LauncherV2_Download";
import type {
  iGM_LauncherV2_DownloadSource,
  iGM_LauncherV2_LoaderEntry,
  iGM_LauncherV2_VersionDetail,
  iGM_LauncherV2_VersionEntry,
  iGM_LauncherV2_VersionSource,
} from "./iGM_LauncherV2_Versions";
import type {
  iGM_LauncherV2_CurrentAccount,
  iGM_LauncherV2_DownloadChannel,
  iGM_LauncherV2_PathsSnapshot,
} from "./iGM_LauncherV2_Paths";
import type { iGM_LauncherV2_UpdateState } from "./iGM_LauncherV2_Update";

// 类型再导出 //
/** 资源市场相关类型经契约层转出，便于其它模块单一入口引用 */
export type {
  iGM_LauncherV2_MarketCategory,
  iGM_LauncherV2_MarketDetail,
  iGM_LauncherV2_MarketItem,
  iGM_LauncherV2_MarketLoader,
  iGM_LauncherV2_MarketSource,
} from "./iGM_LauncherV2_Market";

// 类型定义 //

/** 界面发往外壳的指令 */
export type iGM_LauncherV2_OutboundMessage =
  | { type: "window:minimize" }
  | { type: "window:toggle-maximize" }
  | { type: "window:close" }
  | { type: "auth:status" }
  | { type: "auth:login" }
  | { type: "auth:logout" }
  | { type: "auth:refresh" }
  | { type: "auth:change-avatar" }
  | { type: "auth:remembered" }
  | { type: "auth:quick-login" }
  | { type: "core:ping" }
  | { type: "installer:browse"; current: string }
  | { type: "installer:complete" }
  | { type: "java:list" }
  | { type: "java:scan" }
  | { type: "java:browse" }
  | { type: "java:add"; path: string }
  | { type: "java:remove"; id: string }
  | { type: "java:set-default"; id: string }
  | { type: "msa:status" }
  | { type: "msa:login" }
  | { type: "msa:cancel" }
  | { type: "msa:open-verification" }
  | { type: "msa:logout" }
  | { type: "offline:list" }
  | { type: "offline:add"; name: string }
  | { type: "offline:remove"; id: string }
  | { type: "offline:select"; id: string }
  | { type: "skin:library" }
  | { type: "skin:import"; name: string; dataBase64: string }
  | { type: "skin:remove"; id: string }
  | { type: "skin:apply"; id?: string; skinUrl?: string; name?: string }
  | { type: "skin:texture"; url: string }
  | { type: "profile:fetch" }
  | { type: "skin:open-official" }
  | { type: "settings:paths" }
  | { type: "settings:root-browse"; current: string }
  | { type: "settings:root-set"; path: string }
  | { type: "settings:channel-set"; channel: iGM_LauncherV2_DownloadChannel }
  | { type: "game:scan" }
  | { type: "game:browse" }
  | { type: "game:use"; path: string }
  | { type: "game:delete"; path: string }
  | { type: "game:generate" }
  | { type: "horizon:list" }
  | {
      type: "horizon:create";
      name: string;
      /** 所选已下载版本 id；留空则由视界名称推导 */
      versionId?: string;
      /** 加载器展示名，仅用于记录与展示 */
      loaderLabel?: string;
    }
  | { type: "horizon:select"; id: string }
  | { type: "horizon:delete"; id: string }
  | { type: "horizon:tree"; id: string }
  | { type: "horizon:worlds"; id: string }
  | { type: "game:launch"; horizonId: string }
  | { type: "game:state" }
  | {
      /** 切换全局当前激活账号（正版或离线），外壳落盘后回推最新路径与设置快照 */
      type: "account:select";
      kind: "msa" | "offline";
      id: string;
    }
  | { type: "launch:logs" }
  | { type: "launch:progress" }
  | { type: "versions:list" }
  | { type: "version:installed" }
  | { type: "loaders:list"; gameVersion: string }
  | { type: "version:detail"; versionId: string }
  | { type: "link:open"; url: string }
  | { type: "dialog:pick-folder"; current: string }
  | {
      type: "download:start";
      versionId: string;
      /** 加载器展示名，仅用于任务命名 */
      loaderLabel?: string;
      /** 用户填写的视界名称；下载成功后据此创建视界 */
      horizonName: string;
      /** 用户选定的存放根目录；与当前根目录不同时先切换根目录再下载 */
      rootPath: string;
    }
  | { type: "download:list" }
  | { type: "download:cancel"; id: string }
  | { type: "download:pause"; id: string }
  | { type: "download:resume"; id: string }
  | { type: "download:clear"; id: string }
  | { type: "download:throttle" }
  | {
      /** 资源市场检索：按数据源 / 分类 / 加载器 / 关键词与分页偏移 */
      type: "market:search";
      source: iGM_LauncherV2_MarketSource;
      category: iGM_LauncherV2_MarketCategory;
      loader: iGM_LauncherV2_MarketLoader;
      query: string;
      offset: number;
    }
  | {
      /** 资源市场详情：返回简介与首选下载文件 */
      type: "market:detail";
      source: iGM_LauncherV2_MarketSource;
      id: string;
      category: iGM_LauncherV2_MarketCategory;
    }
  | {
      /**
       * 资源市场下载：通道 A（sdk）走后端代理，通道 B（direct）引擎直连。
       * mode 决定落盘位置：horizon 装入指定视界（horizonId 为空则装入当前视界），
       * folder 仅下载文件到用户自选目录（folderPath）。
       */
      type: "market:download";
      name: string;
      category: iGM_LauncherV2_MarketCategory;
      url: string;
      fileName: string;
      size: number;
      channel: iGM_LauncherV2_DownloadChannel;
      mode: "horizon" | "folder";
      horizonId: string;
      folderPath: string;
    }
  | { type: "appearance:get" }
  | { type: "appearance:set"; patch: iGM_LauncherV2_AppearancePatch }
  | { type: "update:check" }
  | { type: "update:download" }
  | { type: "update:install" }
  | { type: "server:list" }
  | { type: "server:add"; name: string; ip: string; port: number; site: string }
  | { type: "server:remove"; id: string }
  | { type: "server:status"; id: string }
  | { type: "server:statuses" }
  | { type: "server:join"; id: string }
  | { type: "peer:status" }
  | { type: "peer:connect" }
  | { type: "peer:create" }
  | { type: "peer:join"; code: string }
  | { type: "peer:leave" };

/** 社区账号登录状态 */
export type iGM_LauncherV2_AuthState = "logged-out" | "pending" | "logged-in";

/** 已登录的社区账号公开视图（不含任何令牌） */
export interface iGM_LauncherV2_AuthUser {
  uid: string;
  nickname: string;
  avatar: string;
}

/** 本地 Java 运行环境条目 */
export interface iGM_LauncherV2_JavaRuntime {
  /** 唯一标识：可执行文件绝对路径（小写归一后作为键） */
  id: string;
  /** javaw.exe 绝对路径 */
  path: string;
  /** 主版本号字符串（形如 17.0.9），探测失败为空串 */
  version: string;
  /** 供应商标识（由安装目录关键字推导） */
  vendor: string;
  /** 来源：系统扫描或用户手动添加 */
  source: "scanned" | "manual";
}

/** 离线账号条目（UUID 由 OfflinePlayer:<昵称> 的 MD5 推导） */
export interface iGM_LauncherV2_OfflineAccount {
  id: string;
  name: string;
  uuid: string;
  /** 已应用的皮肤文件名（位于本地 skins 目录内）；未应用时为空 */
  skin?: string;
}

/** 微软正版账号公开视图（不含任何令牌） */
export interface iGM_LauncherV2_MsaAccount {
  uuid: string;
  name: string;
  avatar: string;
}

/** 设备代码流待用户确认的信息 */
export interface iGM_LauncherV2_MsaDeviceCode {
  /** 用户在验证页输入的用户代码（形如 ABCD-EFGH） */
  userCode: string;
  /** 验证链接（浏览器打开后输入用户代码） */
  verificationUri: string;
  /** 设备代码有效期（秒） */
  expiresIn: number;
  /** 建议轮询间隔（秒） */
  interval: number;
}

/** 服务器大厅列表来源：远端公开接口 / 本地缓存 / 空结果 */
export type iGM_LauncherV2_ServerListSource = "remote" | "cache" | "empty";

/** 服务器大厅条目（远端公开数据或用户自定义添加） */
export interface iGM_LauncherV2_ServerEntry {
  /** 稳定标识：自定义为 my:<ip>:<port>，远端为 net:<ip>:<port> */
  id: string;
  /** 展示名称 */
  name: string;
  /** 主机名或 IP */
  ip: string;
  /** 端口，默认 25565 */
  port: number;
  /** 官网链接；无则为空串 */
  site: string;
  /** 在线人数；未知为 -1 */
  players: number;
  /** 最大人数；未知为 -1 */
  maxPlayers: number;
  /** 版本名；未知为空串 */
  version: string;
  /** 图标地址；无则为空串 */
  icon: string;
  /** 是否用户自定义添加（界面优先展示） */
  custom: boolean;
}

/** 单台服务器实时状态（由本地进程请求 mcsrvstat.us 得到） */
export interface iGM_LauncherV2_ServerStatus {
  /** 是否在线 */
  online: boolean;
  /** 在线人数；未知为 -1 */
  players: number;
  /** 最大人数；未知为 -1 */
  maxPlayers: number;
  /** 版本名；未知为空串 */
  version: string;
  /** 服务器描述（MOTD 纯文本） */
  motd: string;
  /** 往返延迟（毫秒）；失败为 -1 */
  latency: number;
}

/** 联机大厅连接模式：未连接 / 连接中 / 主站高速节点 / 公共联机节点 */
export type iGM_LauncherV2_PeerMode = "idle" | "connecting" | "community" | "public";

/** 联机大厅会话状态（由本地进程维护并回推界面） */
export interface iGM_LauncherV2_PeerState {
  /** 当前连接模式 */
  mode: iGM_LauncherV2_PeerMode;
  /** 状态文案（直接用于界面展示，例如「已连接主站高速联机节点」） */
  status: string;
  /** 当前所在房间的 6 位房间码；不在房间时为空串 */
  roomCode: string;
  /** 当前用户是否为房主 */
  host: boolean;
  /** 房间内当前人数；未知为 0 */
  peers: number;
  /** 附加提示（错误原因或操作说明） */
  message: string;
}

/** 皮肤库条目（本地导入并经 Mineskin 换取永久地址） */
export interface iGM_LauncherV2_SkinEntry {
  /** 条目唯一标识（同时作为本地皮肤文件名） */
  id: string;
  /** 展示名称 */
  name: string;
  /** 远程皮肤纹理地址；上传失败（无密钥或网络异常）时为空串 */
  remoteUrl: string;
  /** Mineskin 皮肤标识；未上传时为空串 */
  mineskinId: string;
  /** 皮肤模型：slim 为 Alex 细手臂，classic 为 Steve 粗手臂 */
  model: "classic" | "slim";
  /** 来源：经 Mineskin 上传成功或仅有本地文件 */
  source: "mineskin" | "local";
  /** 入库时间（ISO 字符串） */
  createdAt: string;
}

/** 正版档案纹理视图（皮肤 / 披风 / 模型） */
export interface iGM_LauncherV2_SkinProfile {
  /** 正版游戏名 */
  name: string;
  /** 标准化 8-4-4-4-12 UUID */
  uuid: string;
  model: "classic" | "slim";
  /** 皮肤纹理地址；缺失时为空串 */
  skinUrl: string;
  /** 披风纹理地址；未佩戴披风时为空串 */
  capeUrl: string;
}

/** 启动器设置公开视图（供界面渲染与修改） */
export interface iGM_LauncherV2_SettingsView {
  /** 用户选定的下载通道 */
  downloadChannel: iGM_LauncherV2_DownloadChannel;
  /** 用户选定的下载源 */
  downloadSource: iGM_LauncherV2_DownloadSource;
  /** 当前选中的视界标识 */
  horizonId: string;
  /** 用户保存的自定义扫描路径 */
  customScanPaths: string[];
  /** 全局当前激活账号（启动游戏严格以此为准） */
  currentAccount: iGM_LauncherV2_CurrentAccount;
}

/** 游戏目录扫描结果视图 */
export interface iGM_LauncherV2_GameScanView {
  candidates: iGM_LauncherV2_GameCandidate[];
  /** 当前游戏根目录 */
  currentGameRoot: string;
  /** 总目录绝对路径 */
  matrixRoot: string;
  /** 结果提示文案（采用 / 删除 / 生成后携带） */
  message: string;
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
      /** 历史社区账号记录（来自本地 accounts.json）；null 表示无历史记录 */
      type: "auth:remembered";
      user: iGM_LauncherV2_AuthUser | null;
    }
  | {
      type: "core:status";
      state: "ok" | "unavailable";
      detail: string;
      version?: string;
    }
  | {
      /** 安装向导：用户在原生目录选择器中选定的安装路径 */
      type: "installer:path";
      path: string;
    }
  | {
      /** 通用目录选择器结果（dialog:pick-folder 的回应） */
      type: "dialog:picked";
      path: string;
    }
  | {
      /** Java 环境列表（扫描中也会回推一次，scanning 为 true） */
      type: "java:list";
      items: iGM_LauncherV2_JavaRuntime[];
      defaultId: string;
      scanning: boolean;
      /** 本次扫描 / 操作的可读结论文案；无结论时为空串 */
      message: string;
    }
  | {
      /** Java 文件选择器结果（已由外壳完成版本探测与落库） */
      type: "java:path";
      path: string;
    }
  | {
      /** 微软正版账号状态 */
      type: "msa:state";
      state: iGM_LauncherV2_AuthState;
      account: iGM_LauncherV2_MsaAccount | null;
      message?: string;
    }
  | {
      /** 离线账号列表 */
      type: "offline:list";
      items: iGM_LauncherV2_OfflineAccount[];
      currentId: string;
    }
  | {
      /** 设备代码流：device 为 null 表示当前没有进行中的授权 */
      type: "msa:device-code";
      device: iGM_LauncherV2_MsaDeviceCode | null;
    }
  | {
      /** 皮肤库列表（导入 / 删除后回推最新列表，message 携带结果提示） */
      type: "skin:library";
      items: iGM_LauncherV2_SkinEntry[];
      message: string;
    }
  | {
      /** 皮肤应用结果（写入本地皮肤目录并更新离线账号配置） */
      type: "skin:applied";
      applied: boolean;
      /** 应用目标：离线账号昵称 */
      target: string;
      message: string;
    }
  | {
      /** 皮肤纹理取回结果：url 为请求地址，dataUrl 为可直接渲染的数据地址 */
      type: "skin:texture";
      url: string;
      dataUrl: string;
      message: string;
    }
  | {
      /** 正版档案纹理（皮肤 / 披风 / 模型）；profile 为 null 表示不可用 */
      type: "profile:result";
      profile: iGM_LauncherV2_SkinProfile | null;
      message: string;
    }
  | {
      /** 路径与设置快照（根目录变更、通道切换后回推） */
      type: "settings:paths";
      paths: iGM_LauncherV2_PathsSnapshot;
      settings: iGM_LauncherV2_SettingsView;
    }
  | {
      /** 游戏目录扫描结果 */
      type: "game:scan";
      result: iGM_LauncherV2_GameScanView;
    }
  | {
      /** 视界列表结果 */
      type: "horizon:list";
      items: iGM_LauncherV2_Horizon[];
      currentId: string;
      horizonsRoot: string;
      message: string;
    }
  | {
      /** 视界目录树（仅该视界文件夹内部） */
      type: "horizon:tree";
      horizonId: string;
      nodes: iGM_LauncherV2_HorizonNode[];
    }
  | {
      /** 视界 saves 目录下的世界列表 */
      type: "horizon:worlds";
      horizonId: string;
      worlds: iGM_LauncherV2_WorldEntry[];
    }
  | {
      /** 游戏启动状态（启动与进程退出后回推） */
      type: "game:state";
      state: iGM_LauncherV2_GameState;
    }
  | {
      /** 单条启动日志（游戏进程运行期间实时推送，供界面错误控制台展示） */
      type: "launch:log";
      entry: iGM_LauncherV2_LaunchLogEntry;
    }
  | {
      /** 启动日志缓冲全量（界面打开控制台时拉取一次） */
      type: "launch:logs";
      entries: iGM_LauncherV2_LaunchLogEntry[];
    }
  | {
      /** 游戏启动进度（10 / 30 / 50 / 70 / 100 或失败中止） */
      type: "launch:progress";
      progress: iGM_LauncherV2_LaunchProgress;
    }
  | {
      /** 全量版本列表（含各源测速结果与当前采用源） */
      type: "versions:list";
      versions: iGM_LauncherV2_VersionEntry[];
      sources: iGM_LauncherV2_VersionSource[];
      activeSourceId: string;
      activeSourceLabel: string;
      message: string;
    }
  | {
      /** 已下载（本地已完整落盘）的版本 id 列表 */
      type: "version:installed";
      versions: string[];
    }
  | {
      /** 新建视界的处理结果（无论成功失败都会回推，界面据此给出明确反馈） */
      type: "horizon:result";
      ok: boolean;
      /** 成功时为新建视界的标识；失败为空串 */
      id: string;
      message: string;
    }
  | {
      /** 指定游戏版本的加载器列表 */
      type: "loaders:list";
      gameVersion: string;
      loaders: iGM_LauncherV2_LoaderEntry[];
      message: string;
    }
  | {
      /** 单个版本的详情（发布时间、客户端 JAR 大小） */
      type: "version:detail";
      detail: iGM_LauncherV2_VersionDetail;
    }
  | {
      /** 下载任务列表快照 */
      type: "download:list";
      tasks: iGM_LauncherV2_DownloadTask[];
    }
  | {
      /** 单个下载任务的进度更新 */
      type: "download:progress";
      task: iGM_LauncherV2_DownloadTask;
    }
  | {
      /** 下载相关的独立提示（清单解析失败等） */
      type: "download:notice";
      message: string;
    }
  | {
      /**
       * 全局限速状态（游戏运行期间自动限速）。
       * active 为 true 表示当前已限速，bps 为上限字节数/秒，message 为可读提示文案。
       */
      type: "download:throttle";
      active: boolean;
      bps: number;
      message: string;
    }
  | {
      /** 外观配置下发（读取、修改、换图后回推） */
      type: "appearance:state";
      appearance: iGM_LauncherV2_AppearanceState;
    }
  | {
      /** 自动更新状态（检查 / 下载 / 安装的各阶段） */
      type: "update:state";
      state: iGM_LauncherV2_UpdateState;
    }
  | {
      /** 资源市场检索结果（携带请求上下文，便于界面丢弃过期响应） */
      type: "market:result";
      source: iGM_LauncherV2_MarketSource;
      category: iGM_LauncherV2_MarketCategory;
      loader: iGM_LauncherV2_MarketLoader;
      query: string;
      offset: number;
      items: iGM_LauncherV2_MarketItem[];
      total: number;
      message: string;
    }
  | {
      /** 资源市场详情结果；detail 为 null 表示拉取失败 */
      type: "market:detail";
      detail: iGM_LauncherV2_MarketDetail | null;
      message: string;
    }
  | {
      /** 服务器大厅列表结果（远端公开接口或本地缓存） */
      type: "server:list";
      items: iGM_LauncherV2_ServerEntry[];
      source: iGM_LauncherV2_ServerListSource;
      message: string;
    }
  | {
      /** 单台服务器实时状态；status 为 null 表示查询失败 */
      type: "server:status";
      id: string;
      status: iGM_LauncherV2_ServerStatus | null;
      message: string;
    }
  | {
      /** 自定义服务器增删结果 */
      type: "server:result";
      ok: boolean;
      message: string;
    }
  | {
      /** 全部服务器实时状态（批量查询，供界面按在线人数排序） */
      type: "server:statuses";
      items: { id: string; status: iGM_LauncherV2_ServerStatus | null }[];
      message: string;
    }
  | {
      /** 联机大厅状态（连接模式、房间码、人数与提示） */
      type: "peer:state";
      state: iGM_LauncherV2_PeerState;
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
