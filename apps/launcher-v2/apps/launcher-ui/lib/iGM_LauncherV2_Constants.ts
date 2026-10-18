/**
 * 文件路径：apps/launcher-ui/lib/iGM_LauncherV2_Constants.ts
 * 所属层：前端 / 常量与类型层
 * 路由：全局
 * 模块：iGM_LauncherV2_Constants
 * 作用：界面侧共享常量与宿主消息契约（与 apps/shell 保持一致）
 * 内容：应用名 / 版本号 / 开发地址、宿主消息的收发联合类型、
 *       皮肤库端点模板（Minotar / Mineskin）、内置数据集类型与分页约定
 * 说明：界面不依赖 electrobun SDK，仅通过预加载脚本注入的两个全局通道通信；
 *       Mineskin 密钥属服务端凭据，界面侧不持有，上传由外壳主进程完成
 */

// 导入依赖 //
/* （无外部依赖） */

// 类型定义 //

/** 界面发往外壳的宿主消息 */
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
  | { type: "skin:apply"; id?: string; skinUrl?: string }
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
      /** 切换全局当前激活账号（正版或离线），外壳落盘后回推最新设置快照 */
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
  | { type: "download:start";
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
       * 资源市场下载：通道 A（sdk）走后端代理，通道 B（direct）引擎直连并自动调度源。
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
  | {
      /** 添加自定义服务器；manifest 为「客户端同步清单 URL」（外部托管直链 JSON，可留空） */
      type: "server:add";
      name: string;
      ip: string;
      port: number;
      site: string;
      manifest: string;
    }
  | { type: "server:remove"; id: string }
  | { type: "server:status"; id: string }
  | { type: "server:statuses" }
  | { type: "server:join"; id: string }
  | {
      /** 启动并同步：拉取该服务器外部清单，比对哈希后补齐 mods/config，再拼装参数进服 */
      type: "server:sync";
      id: string;
      horizonId: string;
    }
  | {
      /** 清单工作室：扫描本地服务器目录的 mods / config，回推文件树供勾选 */
      type: "server:scan-tree";
      serverId: string;
    }
  | {
      /**
       * 清单工作室：按勾选的文件生成 manifest.json，并把选中的 mods / config
       * 打包成客户端 ZIP 一并落在服务器目录内，同时回推两个产物的绝对路径
       */
      type: "server:manifest";
      serverId: string;
      /** 服务器名称（用于 ZIP 包命名） */
      name: string;
      /** 勾选收录的相对路径列表（相对服务器目录，以 / 分隔） */
      paths: string[];
    }
  | { type: "server:local-list" }
  | {
      /** 本地开服：选择核心与游戏版本，由外壳下载服务端核心并创建本地服务器目录 */
      type: "server:core-create";
      name: string;
      core: iGM_LauncherV2_ServerCore;
      gameVersion: string;
      /** 加载器版本（Fabric / Forge / NeoForge 适用）；留空使用最新版 */
      loaderVersion: string;
    }
  | { type: "server:local-remove"; id: string }
  | { type: "news:list" }
  | { type: "peer:status" }
  | { type: "peer:connect" }
  | { type: "peer:create"; horizonId: string }
  | { type: "peer:bind-port"; port: number }
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
  id: string;
  path: string;
  version: string;
  vendor: string;
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

/** 微软设备代码流待用户确认的信息 */
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
  /** 客户端同步清单 URL（外部托管直链 JSON）；无则为空串 */
  manifest: string;
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

/** 本地开服可选服务端核心 */
export type iGM_LauncherV2_ServerCore = "vanilla" | "paper" | "fabric" | "forge" | "neoforge";

/** 扫描到的服务器文件节点（path 为相对服务器目录的相对路径，以 / 分隔） */
export interface iGM_LauncherV2_ServerFileNode {
  /** 相对服务器目录的相对路径（如 mods/xxx.jar） */
  path: string;
  /** 字节大小 */
  size: number;
  /** SHA256（小写十六进制） */
  sha256: string;
}

/** 本地服务器条目（由启动器下载核心并创建，位于 servers/<id>） */
export interface iGM_LauncherV2_LocalServer {
  /** 稳定标识（目录名） */
  id: string;
  /** 展示名称 */
  name: string;
  /** 服务端核心 */
  core: iGM_LauncherV2_ServerCore;
  /** 游戏版本 */
  gameVersion: string;
  /** 加载器版本；Vanilla / Paper 为空串 */
  loaderVersion: string;
  /** 服务器目录绝对路径 */
  dir: string;
  /** 创建时间（ISO 字符串） */
  createdAt: string;
}

/** 本地开服创建进度阶段：准备 / 下载核心 / 安装 / 完成 / 失败 */
export type iGM_LauncherV2_ServerCorePhase =
  | "prepare"
  | "download"
  | "install"
  | "done"
  | "error";

/** 本地开服创建进度（由外壳回推，界面仅展示） */
export interface iGM_LauncherV2_ServerCoreState {
  /** 目标服务器标识 */
  id: string;
  /** 展示名称 */
  name: string;
  core: iGM_LauncherV2_ServerCore;
  gameVersion: string;
  phase: iGM_LauncherV2_ServerCorePhase;
  /** 进度 0-100 */
  percent: number;
  /** 提示文案键（多语言键，界面端 next-intl 解析，外壳不产生文案） */
  messageKey: string;
  /** 文案占位符参数 */
  messageParams: Record<string, string>;
  /** 服务器目录绝对路径 */
  dir: string;
}

/** 客户端清单同步阶段：拉取清单 / 比对哈希 / 下载缺失 / 完成 / 失败 */
export type iGM_LauncherV2_ServerSyncPhase = "fetch" | "compare" | "download" | "done" | "error";

/** 服务器「启动并同步」进度（由外壳回推，界面仅展示） */
export interface iGM_LauncherV2_ServerSyncState {
  /** 目标服务器 id */
  id: string;
  phase: iGM_LauncherV2_ServerSyncPhase;
  /** 进度 0-100 */
  percent: number;
  /** 提示文案键（多语言键，界面端 next-intl 解析） */
  messageKey: string;
  /** 文案占位符参数 */
  messageParams: Record<string, string>;
}

/** 首页新闻条目（读取本地 news.json，缺失时由外壳内置默认） */
export interface iGM_LauncherV2_NewsItem {
  id: string;
  title: string;
  body: string;
  /** 发布时间（ISO 或 YYYY-MM-DD） */
  date: string;
  /** 分类标签（原始短标签，如「更新」「公告」；界面按需映射） */
  tag: string;
  /** 外链；无则为空串 */
  url: string;
}

/** 联机大厅连接模式：未连接 / 连接中 / 主站高速节点 / 公共联机节点 */
export type iGM_LauncherV2_PeerMode = "idle" | "connecting" | "community" | "public";

/** 联机大厅会话状态（由本地进程维护并回推界面） */
export interface iGM_LauncherV2_PeerState {
  /** 当前连接模式 */
  mode: iGM_LauncherV2_PeerMode;
  /** 状态文案键（多语言键，界面端用 next-intl 解析） */
  statusKey: string;
  /** 当前所在房间的 6 位房间码；不在房间时为空串 */
  roomCode: string;
  /** 当前用户是否为房主 */
  host: boolean;
  /** 房间内当前人数；未知为 0 */
  peers: number;
  /** 附加提示文案键；无提示为空串 */
  messageKey: string;
  /** 附加提示文案中的占位符参数 */
  messageParams: Record<string, string>;
  /** 房间绑定的视界标识；未绑定时为空串 */
  horizonId: string;
  /** 房主已绑定的局域网端口；未绑定为 0 */
  boundPort: number;
  /** 房主是否已完成端口绑定 / 好友是否已加入房间 */
  ready: boolean;
  /** 隧道是否已开启 UDP 局域网广播转发 */
  udp: boolean;
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

/** 皮肤来源渠道标识 */
export type iGM_LauncherV2_SkinSource = "minotar" | "mineskin" | "local";

/** 下载通道：用户自选，外壳不做优先级与降级推断 */
export type iGM_LauncherV2_DownloadChannel = "sdk" | "direct";

/** 下载源：用户自选，下载任务严格使用所选源，不做自动换源 */
export type iGM_LauncherV2_DownloadSource = "mojang" | "bmclapi" | "backup";

/** 总目录路径快照 */
export interface iGM_LauncherV2_PathsSnapshot {
  platform: string;
  matrixDirName: string;
  userRoot: string;
  matrixRoot: string;
  launcherData: string;
  logs: string;
  gameRoot: string;
  horizons: string;
}

/** 当前激活账号的类型：正版 / 离线；空串表示尚未选择 */
export type iGM_LauncherV2_AccountKind = "" | "msa" | "offline";

/** 全局当前激活账号（启动游戏时外壳严格以此为准） */
export interface iGM_LauncherV2_CurrentAccount {
  /** 账号类型 */
  kind: iGM_LauncherV2_AccountKind;
  /** msa 类型为标准化 UUID；offline 类型为离线账号标识；未选择时为空串 */
  id: string;
}

/** 启动日志条目（游戏进程输出与启动器自身提示） */
export interface iGM_LauncherV2_LaunchLogEntry {
  /** 产生时间（毫秒时间戳） */
  time: number;
  /** 来源：启动器自身提示 / Java 标准输出 / Java 标准错误 */
  stream: "system" | "stdout" | "stderr";
  /** 级别：stderr 与启动器自身错误为 error，其余为 info */
  level: "info" | "error";
  /** 单行文本 */
  line: string;
}

/** 启动器设置公开视图 */
export interface iGM_LauncherV2_SettingsView {
  downloadChannel: iGM_LauncherV2_DownloadChannel;
  /** 用户选定的下载源 */
  downloadSource: iGM_LauncherV2_DownloadSource;
  horizonId: string;
  customScanPaths: string[];
  /** 全局当前激活账号 */
  currentAccount: iGM_LauncherV2_CurrentAccount;
}

/** 游戏启动阶段进度（界面启动遮罩据此渲染） */
export interface iGM_LauncherV2_LaunchProgress {
  /** 当前进度百分比：10 / 30 / 50 / 70 / 100 */
  percent: number;
  /** 阶段说明文案 */
  stage: string;
  /** 是否已判定失败（严重报错导致启动中止） */
  failed: boolean;
}

/** 游戏目录候选结果 */
export interface iGM_LauncherV2_GameCandidate {
  path: string;
  status: "complete" | "incomplete";
  source: "matrix" | "system" | "custom";
  shared: { assets: boolean; libraries: boolean; versions: boolean };
  horizonCount: number;
  current: boolean;
}

/** 视界条目（horizons/ 下的独立游戏目录） */
export interface iGM_LauncherV2_Horizon {
  id: string;
  name: string;
  path: string;
  current: boolean;
  modCount: number;
  createdAt: string;
  /** 绑定的已下载版本 id；未绑定时为空串 */
  versionId?: string;
  /** 加载器展示名（如 Fabric / Vanilla）；未记录时为空串 */
  loaderLabel?: string;
}

/** 视界内单个文件/目录节点（path 为相对视界根目录的相对路径） */
export interface iGM_LauncherV2_HorizonNode {
  /** 条目名称 */
  name: string;
  /** 相对视界根目录的相对路径（以 / 分隔） */
  path: string;
  /** 是否为目录 */
  dir: boolean;
  /** 文件字节数；目录恒为 0 */
  size: number;
  /** 子节点；目录且未超过最大深度时存在 */
  children?: iGM_LauncherV2_HorizonNode[];
}

/** 世界（存档）条目 */
export interface iGM_LauncherV2_WorldEntry {
  /** 存档目录名 */
  name: string;
  /** 存档目录绝对路径 */
  path: string;
  /** level.dat 的字节数；缺失为 0 */
  size: number;
  /** 存档目录最后修改时间（毫秒时间戳） */
  modifiedAt: number;
}

/** 游戏启动状态（由外壳回推） */
export interface iGM_LauncherV2_GameState {
  /** 是否正在运行 */
  running: boolean;
  /** 当前/最近一次启动的视界标识 */
  horizonId: string;
  /** 状态或错误提示 */
  message: string;
  /** 游戏进程 pid；未运行时为 0 */
  pid: number;
}

/** 版本条目 */
export interface iGM_LauncherV2_VersionEntry {
  id: string;
  type: "release" | "snapshot" | "old";
  releaseTime: string;
}

/** 下载源测速结果 */
export interface iGM_LauncherV2_VersionSource {
  id: string;
  label: string;
  ms: number | null;
  ok: boolean;
}

/** 加载器条目 */
export interface iGM_LauncherV2_LoaderEntry {
  id: string;
  label: string;
  kind: "vanilla" | "fabric" | "forge" | "neoforge";
  recommended: boolean;
}

/** 单个版本的详情（发布时间、客户端 JAR 大小） */
export interface iGM_LauncherV2_VersionDetail {
  versionId: string;
  releaseTime: string;
  clientSize: number;
  clientUrl: string;
  message: string;
}

/** 下载任务状态 */
export type iGM_LauncherV2_DownloadState = "running" | "paused" | "done" | "failed" | "canceled";

/** 下载任务视图 */
export interface iGM_LauncherV2_DownloadTask {
  id: string;
  name: string;
  versionId: string;
  horizonId: string;
  /** 用户填写的视界名称；下载成功后据此创建视界 */
  horizonName: string;
  /** 加载器展示名（用于任务命名） */
  loaderLabel: string;
  state: iGM_LauncherV2_DownloadState;
  totalFiles: number;
  doneFiles: number;
  totalBytes: number;
  doneBytes: number;
  speed: number;
  message: string;
  hue: number;
  startedAt: number;
  finishedAt: number;
}

/** 资源市场数据源 */
export type iGM_LauncherV2_MarketSource = "modrinth" | "curseforge";

/** 资源市场分类 */
export type iGM_LauncherV2_MarketCategory =
  | "mods"
  | "shaders"
  | "resourcepacks"
  | "modpacks"
  | "worlds";

/** 资源市场加载器筛选：all 表示不过滤 */
export type iGM_LauncherV2_MarketLoader = "all" | "fabric" | "forge" | "neoforge";

/** 资源市场列表条目 */
export interface iGM_LauncherV2_MarketItem {
  id: string;
  source: iGM_LauncherV2_MarketSource;
  name: string;
  author: string;
  description: string;
  iconUrl: string;
  downloads: number;
  /** 支持的加载器展示标签，如 ["Fabric", "Forge"] */
  loaders: string[];
  /** 适用的 MC 版本（倒序，最多 12 项） */
  gameVersions: string[];
  pageUrl: string;
  categoryTitle: string;
}

/** 市场条目首选下载文件 */
export interface iGM_LauncherV2_MarketFile {
  url: string;
  fileName: string;
  size: number;
  version: string;
}

/** 市场条目详情 */
export interface iGM_LauncherV2_MarketDetail {
  item: iGM_LauncherV2_MarketItem;
  body: string;
  file: iGM_LauncherV2_MarketFile | null;
}

/** 游戏目录扫描结果视图 */
export interface iGM_LauncherV2_GameScanView {
  candidates: iGM_LauncherV2_GameCandidate[];
  currentGameRoot: string;
  matrixRoot: string;
  message: string;
}

/** 皮肤库内置数据集条目 */
export interface iGM_LauncherV2_SkinsDatum {
  /** 条目唯一标识 */
  id: string;
  /** 展示名称（同时作为 Minotar 的用户名标识） */
  name: string;
  /** 作者 */
  author: string;
  /** 下载量（100 - 100000），用于「精选」排序 */
  downloads: number;
  /** 皮肤模型：slim 为 Alex 细手臂，classic 为 Steve 粗手臂 */
  type: "classic" | "slim";
  /** 纹理地址（统一为 Minotar 格式） */
  skinUrl: string;
}

/** 外壳回推给界面的宿主消息 */
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
      /** 安装向导：外壳回推用户在原生目录选择器中选定的安装路径 */
      type: "installer:path";
      path: string;
    }
  | {
      /** 通用目录选择器结果（dialog:pick-folder 的回应） */
      type: "dialog:picked";
      path: string;
    }
  | {
      /** Java 环境列表（scanning 为 true 表示扫描进行中） */
      type: "java:list";
      items: iGM_LauncherV2_JavaRuntime[];
      defaultId: string;
      scanning: boolean;
      /** 本次扫描 / 操作的可读结论文案；无结论时为空串 */
      message: string;
    }
  | {
      /** Java 文件选择器结果 */
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
      /** 路径与设置快照 */
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
      /** 游戏启动状态（由外壳回推） */
      type: "game:state";
      state: iGM_LauncherV2_GameState;
    }
  | {
      /** 单条启动日志（游戏进程运行期间实时推送，供错误控制台展示） */
      type: "launch:log";
      entry: iGM_LauncherV2_LaunchLogEntry;
    }
  | {
      /** 启动日志缓冲全量（打开控制台时拉取一次） */
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
      /** 下载相关的独立提示（通道不可用、清单解析失败等） */
      type: "download:notice";
      message: string;
    }
  | {
      /** 全局限速状态（游戏运行期间自动限速）：active 为 true 时任务管理器顶部展示提示 */
      type: "download:throttle";
      active: boolean;
      bps: number;
      message: string;
    }
  | {
      /** 外观配置下发（读取 / 修改 / 换图后回推） */
      type: "appearance:state";
      appearance: iGM_LauncherV2_AppearanceState;
    }
  | {
      /** 自动更新状态（检查 / 下载 / 安装各阶段） */
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
      /** 全部服务器实时状态（批量查询，供界面按在线人数排序） */
      type: "server:statuses";
      items: { id: string; status: iGM_LauncherV2_ServerStatus | null }[];
      message: string;
    }
  | {
      /** 自定义服务器增删结果 */
      type: "server:result";
      ok: boolean;
      message: string;
    }
  | {
      /** 首页新闻流（来源：本地 news.json / 外壳内置默认），界面按时间倒序展示 */
      type: "news:list";
      items: iGM_LauncherV2_NewsItem[];
      source: "local" | "default";
      message: string;
    }
  | {
      /** 服务器「启动并同步」进度（拉取清单 / 比对哈希 / 下载缺失 / 完成 / 失败） */
      type: "server:sync";
      state: iGM_LauncherV2_ServerSyncState;
    }
  | {
      /**
       * 清单工作室：客户端清单与 ZIP 包生成结果。
       * path 为 manifest.json 落盘绝对路径，zipPath 为客户端 ZIP 包绝对路径
       */
      type: "server:manifest";
      ok: boolean;
      /** manifest.json 绝对路径；失败为空串 */
      path: string;
      /** 客户端 ZIP 包绝对路径；失败为空串 */
      zipPath: string;
      /** 收录文件数量 */
      count: number;
      /** 收录文件总字节数 */
      totalSize: number;
      /** 提示文案键（多语言键，界面端 next-intl 解析） */
      messageKey: string;
      /** 文案占位符参数 */
      messageParams: Record<string, string>;
    }
  | {
      /** 清单工作室：服务器目录扫描结果（files 为 mods / config 下的全部文件） */
      type: "server:tree";
      ok: boolean;
      serverId: string;
      /** 服务器展示名称 */
      serverName: string;
      /** 服务器目录绝对路径 */
      root: string;
      files: iGM_LauncherV2_ServerFileNode[];
      /** 扫描完成时间（毫秒时间戳）；失败为 0 */
      scannedAt: number;
      /** 提示文案键（多语言键，界面端 next-intl 解析） */
      messageKey: string;
      /** 文案占位符参数 */
      messageParams: Record<string, string>;
    }
  | {
      /** 本地服务器列表（创建 / 删除后回推最新列表） */
      type: "server:local-list";
      items: iGM_LauncherV2_LocalServer[];
      message: string;
    }
  | {
      /** 本地开服创建进度（准备 / 下载核心 / 安装 / 完成 / 失败） */
      type: "server:core";
      state: iGM_LauncherV2_ServerCoreState;
    }
  | {
      /** 联机大厅状态（连接模式、房间码、人数与提示） */
      type: "peer:state";
      state: iGM_LauncherV2_PeerState;
    };

declare global {
  interface Window {
    /** Electrobun 预加载脚本注入：界面 -> 外壳的宿主消息通道 */
    __electrobunSendToHost?: (message: iGM_LauncherV2_OutboundMessage) => void;
    /** Electrobun 预加载脚本注入的宿主通道对象（外壳 -> 界面） */
    __electrobun?: {
      receiveMessageFromHost?: (message: unknown) => void;
      receiveMessageFromBun?: (message: unknown) => void;
    };
    /** 预加载脚本在页面接管接收器之前缓存的消息 */
    __electrobunPendingHostMessages?: unknown[];
  }
}

// 核心逻辑 //

/** 应用展示名 */
export const IGM_LAUNCHERV2_APP_NAME = "iGM CraftCeon Launcher";

/** 启动器版本号 */
export const IGM_LAUNCHERV2_VERSION = "26.5.4";

/** 界面开发服务器地址（外壳开发模式加载） */
export const IGM_LAUNCHERV2_DEV_URL = "http://localhost:3211";

/** 社区授权本地回调地址（与 .env 的 IGCRAFTLIT_REDIRECT_URI 一致） */
export const IGM_LAUNCHERV2_REDIRECT_URI = "http://localhost:8080/callback";

/* ---- 游客（未登录社区账号）模式限制 ---- */

/** 游客可创建的本地视界上限（与外壳 iGM_LauncherV2_Constants 保持一致，仅用于界面提示） */
export const IGM_LAUNCHERV2_GUEST_HORIZON_LIMIT = 2;

/* ---- 皮肤库（Minotar 渲染 / Mineskin 托管 + 内置数据集） ---- */

/** 本地皮肤引用前缀：与外壳 iGM_LauncherV2_Skin 约定一致 */
export const IGM_LAUNCHERV2_SKIN_LOCAL_PREFIX = "local:";

/** Minotar 头像端点模板（免密钥，支持任意正版用户名） */
export const IGM_LAUNCHERV2_MINOTAR_HELM = "https://minotar.net/helm/{query}/{size}.png";

/** Minotar 原始皮肤端点模板（免密钥，返回 64x64 皮肤图，供 3D 预览使用） */
export const IGM_LAUNCHERV2_MINOTAR_SKIN = "https://minotar.net/skin/{query}";

/** 正版更换皮肤官网（与外壳常量保持一致，仅作展示） */
export const IGM_LAUNCHERV2_SKIN_EDIT_URL =
  "https://www.minecraft.net/zh-hans/msaprofile/mygames/editskin";

/** 皮肤缩略图尺寸 */
export const IGM_LAUNCHERV2_SKIN_THUMB_SIZE = 64;

/** 皮肤库列表缩略图尺寸（更清晰） */
export const IGM_LAUNCHERV2_SKIN_LIST_THUMB_SIZE = 96;

/** 皮肤库每页卡片数量 */
export const IGM_LAUNCHERV2_SKIN_PAGE_SIZE = 15;

/** 「精选」标签展示数量（按下载量降序取前 N 款） */
export const IGM_LAUNCHERV2_SKIN_FEATURED_COUNT = 50;

/** 换页 / 切换分类的 Loading 演示时长（毫秒），用于先展示骨架屏再渲染新一页 */
export const IGM_LAUNCHERV2_SKIN_PAGE_DEBOUNCE = 300;

/* ---- 资源中心 ---- */

/** 加载器名称使用的艺术字体 CSS 变量名（由根布局以 next/font 注入，区别于启动器名称字体） */
export const IGM_LAUNCHERV2_LOADER_FONT_VAR = "--igm-font-loader";

/**
 * Minecraft Wiki 版本页地址模板（{id} 替换为版本号）。
 * 用于在版本详情页提供「打开官方更新日志」入口。
 */
export const IGM_LAUNCHERV2_WIKI_VERSION_URL = "https://zh.minecraft.wiki/w/Java版{id}";

/* ---- 资源市场（分类 / 加载器 / 数据源筛选） ---- */

/** 市场分类筛选项（label 为 i18n 键，界面侧以 useTranslations 解析） */
export const IGM_LAUNCHERV2_MARKET_CATEGORIES: {
  id: iGM_LauncherV2_MarketCategory;
  label: string;
}[] = [
  { id: "mods", label: "market.categories.mods" },
  { id: "shaders", label: "market.categories.shaders" },
  { id: "resourcepacks", label: "market.categories.resourcepacks" },
  { id: "modpacks", label: "market.categories.modpacks" },
  { id: "worlds", label: "market.categories.worlds" },
];

/** 加载器筛选项：默认「全部加载器」不做过滤（label 为 i18n 键） */
export const IGM_LAUNCHERV2_MARKET_LOADERS: {
  id: iGM_LauncherV2_MarketLoader;
  label: string;
}[] = [
  { id: "all", label: "market.loaders.all" },
  { id: "fabric", label: "market.loaders.fabric" },
  { id: "forge", label: "market.loaders.forge" },
  { id: "neoforge", label: "market.loaders.neoforge" },
];

/** 数据源筛选项（label 为 i18n 键） */
export const IGM_LAUNCHERV2_MARKET_SOURCES: {
  id: iGM_LauncherV2_MarketSource;
  label: string;
}[] = [
  { id: "modrinth", label: "market.sources.modrinth" },
  { id: "curseforge", label: "market.sources.curseforge" },
];

/** 市场列表每页条数（与外壳一致） */
export const IGM_LAUNCHERV2_MARKET_PAGE_SIZE = 20;

/* ---- 外观与主题自定义 ---- */

/** 背景模式：动态云背景 / 纯色背景 */
export type iGM_LauncherV2_BackgroundMode = "cloud" | "solid";

/** 动态云配色方案：经典深紫 / 梦幻冷蓝 / 极光幻粉 */
export type iGM_LauncherV2_CloudPalette = "purple" | "blue" | "pink";

/** 静态渐变背景方案：深邃暗黑 / 明亮浅色 / 古典深咖 / 极光幽绿 */
export type iGM_LauncherV2_SolidPalette = "dark" | "light" | "coffee" | "green";

/** 主题色预设标识 */
export type iGM_LauncherV2_ThemeId = "indigo" | "aurora" | "sakura" | "geek" | "amber";

/**
 * 导航栏底色：三个预设透明色 + 「默认」（跟随玻璃面令牌），
 * 也可存放自定义 16 进制色值（形如 #1a2333）。
 */
export type iGM_LauncherV2_NavColor = "default" | "slate" | "navy" | "violet" | (string & {});

/** 外观下发视图 */
export interface iGM_LauncherV2_AppearanceState {
  background: iGM_LauncherV2_BackgroundMode;
  /** 动态云配色（仅 cloud 模式生效），只改背景色调，不改 UI 主题色 */
  cloud: iGM_LauncherV2_CloudPalette;
  /** 静态渐变背景方案（仅 solid 模式生效） */
  solid: iGM_LauncherV2_SolidPalette;
  /** 毛玻璃模糊度（px），取值区间 0-30 */
  blur: number;
  theme: string;
  /** 导航栏底色：预设标识或自定义 16 进制色值 */
  navColor: iGM_LauncherV2_NavColor;
}

/** 外观修改入参（浅合并，未提供字段保持不变） */
export interface iGM_LauncherV2_AppearancePatch {
  background?: iGM_LauncherV2_BackgroundMode;
  cloud?: iGM_LauncherV2_CloudPalette;
  solid?: iGM_LauncherV2_SolidPalette;
  blur?: number;
  theme?: string;
  navColor?: iGM_LauncherV2_NavColor;
}

/** 背景模式选项（仅两项：动态云 / 纯色；label / hint 为 i18n 键） */
export const IGM_LAUNCHERV2_BACKGROUND_MODES: {
  id: iGM_LauncherV2_BackgroundMode;
  label: string;
  hint: string;
}[] = [
  { id: "cloud", label: "appearance.modes.cloud.label", hint: "appearance.modes.cloud.hint" },
  { id: "solid", label: "appearance.modes.solid.label", hint: "appearance.modes.solid.hint" },
];

/** 动态云配色方案选项（预览渐变与流体云配色保持一致；label / hint 为 i18n 键） */
export const IGM_LAUNCHERV2_CLOUD_PALETTES: {
  id: iGM_LauncherV2_CloudPalette;
  label: string;
  hint: string;
  preview: string;
}[] = [
  {
    id: "purple",
    label: "appearance.cloud.purple.label",
    hint: "appearance.cloud.purple.hint",
    preview: "linear-gradient(135deg, #4d6bfe, #7e4dfe 55%, #0d1465)",
  },
  {
    id: "blue",
    label: "appearance.cloud.blue.label",
    hint: "appearance.cloud.blue.hint",
    preview: "linear-gradient(135deg, #3c8cff, #22d3ee 60%, #0a1f4d)",
  },
  {
    id: "pink",
    label: "appearance.cloud.pink.label",
    hint: "appearance.cloud.pink.hint",
    preview: "linear-gradient(135deg, #8c47eb, #fa73b8 60%, #2a0f57)",
  },
];

/**
 * 静态渐变背景方案选项（preview 为极简静态线性渐变；light 为真时界面文字与面板自动转为深色）。
 * 说明：默认视觉风格改用干净专注的纯色 / 静态渐变，不再默认启用 WebGL 动态云。
 */
export const IGM_LAUNCHERV2_SOLID_PALETTES: {
  id: iGM_LauncherV2_SolidPalette;
  label: string;
  hint: string;
  preview: string;
  light: boolean;
}[] = [
  {
    id: "dark",
    label: "appearance.solid.dark.label",
    hint: "appearance.solid.dark.hint",
    preview: "linear-gradient(160deg, #0e1424 0%, #070a14 55%, #04060c 100%)",
    light: false,
  },
  {
    id: "light",
    label: "appearance.solid.light.label",
    hint: "appearance.solid.light.hint",
    preview: "linear-gradient(160deg, #f6f8fc 0%, #e7ecf4 100%)",
    light: true,
  },
  {
    id: "coffee",
    label: "appearance.solid.coffee.label",
    hint: "appearance.solid.coffee.hint",
    preview: "linear-gradient(160deg, #2c1e15 0%, #1a120c 100%)",
    light: false,
  },
  {
    id: "green",
    label: "appearance.solid.green.label",
    hint: "appearance.solid.green.hint",
    preview: "linear-gradient(160deg, #102c23 0%, #081712 100%)",
    light: false,
  },
];

/**
 * 导航栏底色预设：三项透明色 + 默认（跟随玻璃面令牌）。
 * preview 为该预设叠加到导航栏上的最终色值（保留磨砂玻璃，透明度约 0.72）。
 */
export const IGM_LAUNCHERV2_NAV_COLORS: {
  id: iGM_LauncherV2_NavColor;
  label: string;
  hint: string;
  preview: string;
}[] = [
  {
    id: "default",
    label: "appearance.nav.default.label",
    hint: "appearance.nav.default.hint",
    preview: "rgba(16, 21, 39, 0.74)",
  },
  {
    id: "slate",
    label: "appearance.nav.slate.label",
    hint: "appearance.nav.slate.hint",
    preview: "rgba(24, 27, 33, 0.72)",
  },
  {
    id: "navy",
    label: "appearance.nav.navy.label",
    hint: "appearance.nav.navy.hint",
    preview: "rgba(13, 26, 58, 0.72)",
  },
  {
    id: "violet",
    label: "appearance.nav.violet.label",
    hint: "appearance.nav.violet.hint",
    preview: "rgba(35, 20, 54, 0.72)",
  },
];

/** 导航栏底色不透明度（自定义取色器选色后统一按此透明度叠加，保留磨砂质感） */
export const IGM_LAUNCHERV2_NAV_ALPHA = 0.72;

/** 16 进制色值转带透明度的 rgba（支持 #rgb 与 #rrggbb） */
function iGM_LauncherV2_HexToRgba(hex: string, alpha: number): string {
  let value = hex.replace("#", "");
  if (value.length === 3) {
    value = value
      .split("")
      .map((chunk) => chunk + chunk)
      .join("");
  }
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 解析导航栏底色的最终 CSS 色值：
 * 「default」返回 null（交由 CSS 回落到 --igm-glass 玻璃面令牌）；
 * 预设直接返回预设色；自定义 16 进制按统一透明度转换为 rgba。
 */
export function iGM_LauncherV2_ResolveNavColor(value: string): string | null {
  if (!value || value === "default") return null;
  const preset = IGM_LAUNCHERV2_NAV_COLORS.find((item) => item.id === value);
  if (preset) return preset.preview;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) {
    return iGM_LauncherV2_HexToRgba(value, IGM_LAUNCHERV2_NAV_ALPHA);
  }
  return null;
}

/** 模糊度上下限（px，与外壳一致） */
export const IGM_LAUNCHERV2_APPEARANCE_BLUR_MIN = 0;
export const IGM_LAUNCHERV2_APPEARANCE_BLUR_MAX = 30;

/**
 * 主题色预设。
 * accent 为主题色；accentSoft 为低饱和辅助色（用于渐变与悬浮态）。
 * label 为 i18n 键，界面侧以 useTranslations 解析。
 */
export const IGM_LAUNCHERV2_THEMES: {
  id: iGM_LauncherV2_ThemeId;
  label: string;
  accent: string;
  accentSoft: string;
}[] = [
  { id: "indigo", label: "appearance.themes.indigo", accent: "#5b7cf5", accentSoft: "#8aa2ff" },
  { id: "aurora", label: "appearance.themes.aurora", accent: "#2fd58d", accentSoft: "#7cf0b8" },
  { id: "sakura", label: "appearance.themes.sakura", accent: "#f472b6", accentSoft: "#fba7cd" },
  { id: "geek", label: "appearance.themes.geek", accent: "#8b93a7", accentSoft: "#c2c9d6" },
  { id: "amber", label: "appearance.themes.amber", accent: "#f59e0b", accentSoft: "#fbc76b" },
];

/* ---- 地图站（内嵌第三方种子地图） ---- */

/** 地图站可选地图类型（决定内嵌第三方站点的子应用路径） */
export type iGM_LauncherV2_MapType = "biome" | "slime" | "stronghold";

/** 地图站地图类型选项 */
export const IGM_LAUNCHERV2_MAP_TYPES: {
  id: iGM_LauncherV2_MapType;
  label: string;
}[] = [
  { id: "biome", label: "mapStation.type.biome" },
  { id: "slime", label: "mapStation.type.slime" },
  { id: "stronghold", label: "mapStation.type.stronghold" },
];

/** 地图站可选 Java 游戏版本（仅列出第三方站点支持的常见版本） */
export const IGM_LAUNCHERV2_MAP_VERSIONS: string[] = [
  "1.21.4",
  "1.21.1",
  "1.21",
  "1.20.6",
  "1.20.4",
  "1.20.1",
  "1.20",
  "1.19.4",
  "1.19.2",
  "1.18.2",
  "1.17.1",
  "1.16.5",
];

/** 第三方种子地图站点地址（直连外部，不经过 api.igcraftlit.com） */
export const IGM_LAUNCHERV2_MAP_SITE = "https://www.chunkbase.com";

/** 第三方站点各地图类型对应的子应用路径 */
export const IGM_LAUNCHERV2_MAP_APP_PATHS: Record<iGM_LauncherV2_MapType, string> = {
  biome: "/apps/seed-map",
  slime: "/apps/slime-finder",
  stronghold: "/apps/stronghold-finder",
};

/** 内嵌加载超时（毫秒）：超时未触发 load 即判定被 X-Frame-Options 拦截 */
export const IGM_LAUNCHERV2_MAP_LOAD_TIMEOUT = 5000;

/* ---- 启动器自动更新 ---- */

/** 更新流程状态 */
export type iGM_LauncherV2_UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "latest"
  | "error";

/** 更新状态下发视图 */
export interface iGM_LauncherV2_UpdateState {
  status: iGM_LauncherV2_UpdateStatus;
  currentVersion: string;
  latestVersion: string;
  /** 更新说明（清单 notes / changelog） */
  notes: string;
  fileName: string;
  filePath: string;
  /** 下载进度（0-100） */
  progress: number;
  message: string;
}

// 导出 //
/* 常量与类型已于上方命名导出 */
