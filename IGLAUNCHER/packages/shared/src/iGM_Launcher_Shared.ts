/**
 * 文件路径：packages/shared/src/iGM_Launcher_Shared.ts
 * 所属层：共享层 / 类型与常量
 * 路由：全局
 * 模块：iGM_Launcher_Shared
 * 作用：主进程（Electrobun/Bun）、Zig 核心桥接层与 Next.js 静态界面
 *       共同引用的常量与类型契约，纯类型与常量、零运行时副作用
 * 内容：应用元信息、窗口尺寸、语言定义、导航标识、宿主桥接消息类型；
 *       模块三追加 Minecraft 正版绑定（MSA 认证链、绑定记录、令牌镜像）类型与端点常量；
 *       模块五追加离线角色 UUID、本机游戏目录扫描、版本库同步的类型与常量；
 *       模块六追加共享根目录、已安装版本与加载器、实例名校验与 gameDir 规则的类型与常量；
 *       模块八追加离线启动（Java 进程）状态类型、启动相关常量与桥接方法；
 *       模块二十追加第三方资源（Modrinth / Fabric）资源、版本与下载任务类型，
 *       以及 thirdParty:* 桥接方法、接口前缀与分页 / 轮询常量
 */

// 导入依赖 //
/* （本文件无外部依赖） */

// 类型定义 //

/** 支持的界面语言（模块一仅简体中文与英语） */
export type iGM_Launcher_Locale = "zh-CN" | "en";

/** 明暗主题模式 */
export type iGM_Launcher_ThemeMode = "light" | "dark" | "system";

/** 侧边栏导航项标识（G_ 路由命名在界面层的对应物） */
export type iGM_Launcher_NavId =
  | "home"
  | "instances"
  | "java"
  | "downloads"
  | "library"
  | "account"
  | "settings"
  | "about";

/**
 * Webview 发送给主进程的宿主消息（经由 Electrobun
 * window.__electrobunSendToHost 公共事件通道，界面无需引入 electrobun SDK）。
 * type 采用 domain:action 命名，后续模块在此扩展，禁止破坏既有成员。
 */
export type iGM_Launcher_HostMessage =
  | { type: "window:minimize" }
  | { type: "window:toggle-maximize" }
  | { type: "window:close" }
  | {
      /** 界面 -> 桥接层的统一调用请求（见第七节 Bun 桥接层） */
      type: "bridge:call";
      /** 请求编号，由界面生成，主进程按原值回填 */
      id: string;
      method: iGM_Launcher_BridgeMethod;
      params?: iGM_Launcher_BridgeParams;
    };

/**
 * 安装程序（apps/installer）界面与主进程之间的宿主消息。
 * 与启动器共用同一条 window.__electrobunSendToHost 通道，但类型独立声明，
 * 使安装程序不必引入启动器的实例 / 版本库等无关语义。
 */
export type iGM_Installer_HostMessage =
  | { type: "window:minimize" }
  | { type: "window:toggle-maximize" }
  | { type: "window:close" }
  /** 向导就绪：主进程回推默认安装目录与已选语言 */
  | { type: "installer:init" }
  /** 打开系统目录选择器挑安装目录 */
  | { type: "installer:pick-dir"; current?: string }
  /** 开始安装：携带语言选择与安装目录 */
  | { type: "installer:begin"; locale: iGM_Launcher_Locale; dir: string }
  /** 安装完成后打开启动器 */
  | { type: "installer:open-launcher"; dir: string }
  /** 完成并关闭安装程序 */
  | { type: "installer:finish" };

/** 安装阶段（主进程回执给安装程序界面） */
export type iGM_Installer_Phase = "prepare" | "copy" | "shortcut" | "done" | "failed";

/**
 * 安装程序主进程回推给界面的事件。
 * 主进程经 webview.executeJavascript 调用页面注册的 window.__igmInstallerHost，
 * 因此事件形态固定为单个对象参数。
 */
export type iGM_Installer_HostEvent =
  /** 向导就绪：默认安装目录与安装程序当前记录的语言 */
  | { type: "installer:ready"; defaultDir: string; locale: iGM_Launcher_Locale }
  /** 目录选择器回执：取消时为 null */
  | { type: "installer:dir-picked"; dir: string | null }
  /** 安装进度 */
  | { type: "installer:progress"; progress: iGM_Installer_Progress };

/** 主进程回执给安装程序界面的进度消息（经 executeJavascript 推送到页面） */
export interface iGM_Installer_Progress {
  phase: iGM_Installer_Phase;
  /** 总体进度百分比 0-100 */
  percent: number;
  /** 已复制文件数（copy 阶段有效） */
  copiedFiles?: number;
  /** 待复制文件总数（copy 阶段有效） */
  totalFiles?: number;
  /** 当前处理的文件相对路径（copy 阶段有效） */
  currentFile?: string;
  /** 失败原因（failed 阶段有效） */
  message?: string;
}

/** Zig 核心下载任务状态（占位，模块二以后细化） */
export type iGM_Launcher_DownloadState = "idle" | "running" | "done" | "error";

/** 下载任务信息结构体（Zig 侧同形占位的 TS 镜像，暂不跨 FFI 传递） */
export interface iGM_Launcher_DownloadTaskInfo {
  /** 任务编号，-1 表示占位实现未启用 */
  id: number;
  /** 资源来源 URL */
  url: string;
  /** 当前状态 */
  state: iGM_Launcher_DownloadState;
}

/** 原生核心运行状态（模块一恒为占位值） */
export interface iGM_Launcher_CoreLibrary {
  /** Zig 动态库是否成功加载 */
  loaded: boolean;
  /** 核心版本号，未加载时取占位版本 */
  version: string;
  /** 初始化返回值，0 表示成功 */
  initResult: number;
}

// 类型定义（模块二：实例管理 / Java 运行时 / 账户） //

/** 加载器类型（Minecraft 术语保留英文原名，禁止改写为中文） */
export type iGM_Launcher_LoaderType =
  | "vanilla"
  | "forge"
  | "fabric"
  | "neoforge"
  | "quilt";

/** 实例图标标识，界面侧映射为 lucide 图标（禁止 emoji） */
export type iGM_Launcher_InstanceIconId =
  | "folder"
  | "cube"
  | "pickaxe"
  | "sword"
  | "leaf"
  | "flame"
  | "gem"
  | "compass";

/** 实例记录（模块二以 JSON 落盘于 data/instances/instances.json） */
export interface iGM_Launcher_InstanceRecord {
  /** 实例唯一标识 */
  id: string;
  /** 实例名称 */
  name: string;
  /** 实例图标标识 */
  icon: iGM_Launcher_InstanceIconId;
  /** 备注 */
  note: string;
  /** Minecraft 版本（模块二取自占位版本列表） */
  minecraftVersion: string;
  /** 加载器类型 */
  loader: iGM_Launcher_LoaderType;
  /** 加载器版本（vanilla 为空字符串） */
  loaderVersion: string;
  /** 实例目录（默认隔离目录，可自定义） */
  directory: string;
  /** 指定 Java 运行时 id，null 表示使用全局默认 Java */
  javaId: string | null;
  /** 最大内存（MB） */
  maxMemoryMb: number;
  /** 最小内存（MB） */
  minMemoryMb: number;
  /** 窗口宽度 */
  windowWidth: number;
  /** 窗口高度 */
  windowHeight: number;
  /** JVM 参数 */
  jvmArgs: string;
  /** 游戏参数 */
  gameArgs: string;
  /** 创建时间（ISO 字符串） */
  createdAt: string;
  /** 最后修改时间（ISO 字符串） */
  updatedAt: string;
  /** 上次游玩时间（ISO 字符串），null 表示尚未游玩 */
  lastPlayedAt: string | null;
}

/** 实例新建 / 更新入参（时间戳与 id 由桥接层维护） */
export type iGM_Launcher_InstanceInput = Omit<
  iGM_Launcher_InstanceRecord,
  "id" | "createdAt" | "updatedAt" | "lastPlayedAt"
>;

/** Java 发行版标识 */
export type iGM_Launcher_JavaVendor =
  | "adoptium"
  | "zulu"
  | "liberica"
  | "oracle"
  | "unknown";

/** Java 来源：系统检测 / 手动添加 */
export type iGM_Launcher_JavaSource = "system" | "manual";

/** Java 运行时记录（模块二以 JSON 落盘于 data/java/java.json） */
export interface iGM_Launcher_JavaRuntime {
  /** 运行时唯一标识 */
  id: string;
  /** 自定义名称 */
  name: string;
  /** 可执行文件路径 */
  path: string;
  /** 主版本号字符串，如 "17" */
  version: string;
  /** 发行版 */
  vendor: iGM_Launcher_JavaVendor;
  /** 架构，如 x64 */
  arch: string;
  /** 来源 */
  source: iGM_Launcher_JavaSource;
  /** 添加时间（ISO 字符串） */
  addedAt: string;
  /** 最近一次可用性测试结果 */
  available: boolean;
}

/** 手动添加 Java 的入参 */
export interface iGM_Launcher_JavaInput {
  name: string;
  path: string;
  version?: string;
  vendor?: iGM_Launcher_JavaVendor;
}

/** 账户认证组织标识 */
export type iGM_Launcher_AccountOrg = "igcraftlit" | "muoceon";

/** 账户会话（真实登录后落盘于 data/account/session.json） */
export interface iGM_Launcher_AccountSession {
  /** 是否已登录 */
  signedIn: boolean;
  /** 是否为离线模式（未登录也可使用启动器） */
  offline: boolean;
  /** 用户名 */
  userName: string;
  /** iGMUid（真实登录时直接取自主站用户数据，与官网保持一致） */
  uid: string;
  /** 邮箱 */
  email: string;
  /** 角色 */
  role: string;
  /** 注册时间（ISO 字符串） */
  registeredAt: string;
  /** 已认证组织 */
  orgs: iGM_Launcher_AccountOrg[];
  /** 主站会话凭证（Set-Cookie 中的会话 Cookie，用于 /G_Auth/me 同步） */
  token: string;
  /**
   * 离线模式本地生成的角色 UUID（与正版绑定 UUID 区分，仅离线单机 / 局域网使用）。
   * 登录社区账号后有值也为空串，避免与正版身份混淆。
   */
  offlineUuid: string;
  /** 离线模式使用的游戏内名称（默认 Player，可在账户页查看） */
  offlineName: string;
  /**
   * 社区头像地址（取自主站用户数据 iGM_Avatar，未设置为空串）。
   * 启动器只做展示，不缓存图片文件，加载失败时由界面回退为图标占位。
   */
  avatar: string;
}

/** 主站认证组织徽标（与主站 iGM_OrgBadgeDto 字段一致） */
export interface iGM_Launcher_SiteOrgBadge {
  id: string;
  name: string;
  slug: string;
  /** 是否为该组织负责人 */
  isOwner?: boolean;
}

/**
 * 主站用户 DTO 的启动器镜像。
 * 只声明启动器需要的字段，字段名与主站 iGM_UserDto 严格一致，
 * 避免因主站新增字段导致启动器解析失败。
 */
export interface iGM_Launcher_SiteUser {
  id: string;
  username: string;
  email: string;
  role: string;
  status: string;
  uid: string;
  createdAt: string;
  /** 社区头像地址（与主站 iGM_UserDto.avatar 一致，未设置为 null） */
  avatar?: string | null;
  verifiedOrg: iGM_Launcher_SiteOrgBadge | null;
}

/** 主站统一响应包（与主站 { success, code, message, data } 一致） */
export interface iGM_Launcher_SiteEnvelope<T> {
  success: boolean;
  code: number;
  message: string;
  data: T | null;
}

/** 启动器本地数据集合（桥接层一次读写的完整快照） */
export interface iGM_Launcher_LocalData {
  instances: iGM_Launcher_InstanceRecord[];
  javas: iGM_Launcher_JavaRuntime[];
  /** 全局默认 Java id */
  defaultJavaId: string | null;
  account: iGM_Launcher_AccountSession;
  /** 已绑定的 Minecraft 正版账号（仅含非敏感字段，令牌始终留在主进程） */
  mcBindings: iGM_Launcher_MCBinding[];
  /** 模块五：本机已识别的 Minecraft 游戏目录 */
  gameDirs: iGM_Launcher_GameDir[];
  /** 模块五：版本库本地缓存（首帧不联网，仅读缓存） */
  versionLibrary: iGM_Launcher_VersionLibrary;
}

// 类型定义（模块三：Minecraft 正版绑定 / MSA 认证链） //

/**
 * Minecraft 正版账号绑定记录（渲染进程可见的非敏感视图）。
 * 令牌类字段一律不进入该结构：refresh_token / access_token / XSTS 仅存于主进程内存与加密文件。
 */
export interface iGM_Launcher_MCBinding {
  /** 本地绑定唯一标识 */
  id: string;
  /** 归属的社区账号 iGMUid（一个社区账号可绑定多个正版账号） */
  communityUid: string;
  /** Minecraft UUID（标准带连字符格式） */
  uuid: string;
  /** Minecraft 玩家名 */
  name: string;
  /** Xbox XUID */
  xuid: string;
  /** 是否已通过 Minecraft Java 版拥有权校验 */
  ownsJava: boolean;
  /** 是否为该社区账号下的默认启动账号 */
  isDefault: boolean;
  /** 微软 refresh token 到期时间（ISO 字符串） */
  refreshExpiresAt: string;
  /** Minecraft 访问令牌到期时间（ISO 字符串） */
  accessExpiresAt: string;
  /** 皮肤纹理地址，无则为空字符串 */
  skinUrl: string;
  /** 披风纹理地址，无则为空字符串 */
  capeUrl: string;
  /** 绑定时间（ISO 字符串） */
  addedAt: string;
  /** 最近一次令牌刷新时间（ISO 字符串） */
  refreshedAt: string;
}

/** 绑定记录 + 敏感令牌（仅写入加密文件，绝不回传渲染进程） */
export interface iGM_Launcher_MCBindingSecret {
  binding: iGM_Launcher_MCBinding;
  /** 微软长期 refresh token */
  msaRefreshToken: string;
  /** Minecraft 访问令牌（启动游戏时注入） */
  minecraftAccessToken: string;
  /** XSTS 令牌 */
  xstsToken: string;
  /** XSTS userHash */
  xstsUserHash: string;
}

/** Minecraft 皮肤 / 披风条目（profile 返回结构镜像） */
export interface iGM_Launcher_MinecraftTexture {
  id: string;
  state: string;
  url: string;
  /** 皮肤变体：classic / slim，披风为空 */
  variant: string;
}

/** Minecraft 玩家档案（api.minecraftservices.com/minecraft/profile） */
export interface iGM_Launcher_MinecraftProfile {
  uuid: string;
  name: string;
  skins: iGM_Launcher_MinecraftTexture[];
  capes: iGM_Launcher_MinecraftTexture[];
}

/** 认证链阶段标识（界面按阶段展示进度） */
export type iGM_Launcher_McAuthStage =
  | "msa"
  | "xbox"
  | "xsts"
  | "minecraft"
  | "profile"
  | "entitlements";

/** 设备代码流程起始结果（渲染进程可见部分，不含任何令牌） */
export interface iGM_Launcher_MsaDeviceCode {
  /** 流程编号，后续轮询与分步调用凭此引用主进程内的令牌上下文 */
  flowId: string;
  /** 展示给用户的验证码 */
  userCode: string;
  /** 用户在浏览器打开的验证地址 */
  verificationUri: string;
  /** 验证码有效期（秒） */
  expiresIn: number;
  /** 建议轮询间隔（秒） */
  interval: number;
  /** 微软返回的提示文案（中英由界面语言决定，此处仅作兜底） */
  message: string;
}

/** 浏览器授权流程起始结果 */
export interface iGM_Launcher_BrowserAuthStart {
  flowId: string;
  /** 需要打开的授权地址（含 PKCE challenge） */
  authorizeUrl: string;
}

/** 轮询状态：pending 等待用户授权，done 已完成绑定，其余为终止态 */
export type iGM_Launcher_MsaPollStatus =
  | "pending"
  | "slow-down"
  | "expired"
  | "done"
  | "failed";

/** 轮询 / 完成结果 */
export interface iGM_Launcher_MsaFlowResult {
  status: iGM_Launcher_MsaPollStatus;
  /** 当前推进到的认证阶段 */
  stage: iGM_Launcher_McAuthStage;
  /** 已完成的认证阶段（用于界面逐步打勾） */
  completed: iGM_Launcher_McAuthStage[];
  /** status 为 done 时返回新绑定 */
  binding: iGM_Launcher_MCBinding | null;
  /** 失败时的错误码（XSTS 错误码或 HTTP 状态码） */
  errorCode: number;
  /** 失败提示键或原始文案 */
  errorMessage: string;
}

/* ---- MSA 认证链令牌镜像（与 Zig 侧结构体一一对应，不跨 FFI 传递敏感值） ---- */

/** 微软 OAuth 令牌 */
export interface iGM_Launcher_MsaToken {
  accessToken: string;
  refreshToken: string;
  /** 授权范围 */
  scope: string;
  /** access_token 有效期（秒） */
  expiresIn: number;
}

/** Xbox Live 令牌 */
export interface iGM_Launcher_XboxToken {
  token: string;
  /** 用户哈希（构造 XSTS identity 时使用） */
  userHash: string;
  /** 令牌到期时间（ISO 字符串） */
  notAfter: string;
}

/** XSTS 授权令牌 */
export interface iGM_Launcher_XstsToken {
  token: string;
  userHash: string;
  notAfter: string;
}

/** Minecraft 服务令牌（identityToken / XSTS 换取） */
export interface iGM_Launcher_MinecraftToken {
  accessToken: string;
  /** Minecraft 令牌有效期（秒） */
  expiresIn: number;
}

/* ---- 模块五：离线游戏 / 本机游戏目录扫描 / 版本库同步 ---- */

/** Minecraft 版本类型（与主站 iGM_GameVersionType 取值一致） */
export type iGM_Launcher_VersionType =
  | "release"
  | "snapshot"
  | "old_beta"
  | "old_alpha"
  | "unknown";

/** 游戏目录来源：自动扫描发现 / 用户手动指定 */
export type iGM_Launcher_GameDirSource = "auto" | "manual";

/** 本机已识别的 Minecraft 游戏目录（落盘于 data/minecraft/game_dirs.json） */
export interface iGM_Launcher_GameDir {
  /** 目录唯一标识 */
  id: string;
  /** 目录绝对路径（即 .minecraft 根目录） */
  path: string;
  /** 来源 */
  source: iGM_Launcher_GameDirSource;
  /** 是否为当前默认游戏目录 */
  isDefault: boolean;
  /** 识别到的版本数量 */
  versionCount: number;
  /** 是否存在 versions/ 目录 */
  hasVersions: boolean;
  /** 是否存在 libraries/ 目录 */
  hasLibraries: boolean;
  /** 是否存在 assets/ 目录 */
  hasAssets: boolean;
  /** 最近一次扫描时间（ISO 字符串） */
  scannedAt: string;
}

/** 从 versions/<name>/<name>.json 解析出的已安装版本 */
export interface iGM_Launcher_ScannedVersion {
  /** 版本目录名（versions 下的子目录名） */
  id: string;
  /** 解析出的版本号，如 1.20.1 */
  version: string;
  /** 版本类型 */
  type: iGM_Launcher_VersionType;
  /** 加载器类型（由版本 id 与 json 的 inheritsFrom 推断） */
  loader: iGM_Launcher_LoaderType;
  /** 加载器版本，无法识别时为空字符串 */
  loaderVersion: string;
  /** 版本 json 的绝对路径 */
  jsonPath: string;
}

/** 单个游戏目录的扫描结果 */
export interface iGM_Launcher_GameDirScanResult {
  path: string;
  /** 目录是否真实存在 */
  exists: boolean;
  hasVersions: boolean;
  hasLibraries: boolean;
  hasAssets: boolean;
  versions: iGM_Launcher_ScannedVersion[];
}

/** 版本库条目（与网站版本资料库同步；不含任何本地磁盘路径） */
export interface iGM_Launcher_VersionLibraryEntry {
  id: string;
  version: string;
  type: iGM_Launcher_VersionType;
  releaseTime: string | null;
  /** 完整大小（字节），尚未计算时为 null */
  totalSize: number | null;
  /** 本地是否已安装（来自扫描结果与已导入实例） */
  installed: boolean;
}

/** 版本库快照（远端同步结果或本地缓存） */
export interface iGM_Launcher_VersionLibrary {
  entries: iGM_Launcher_VersionLibraryEntry[];
  /** 最近一次成功同步时间（ISO 字符串），null 表示从未同步 */
  syncedAt: string | null;
  /** 数据来源：remote 远端同步成功 / cache 本地缓存 / empty 无缓存无网络 */
  source: "remote" | "cache" | "empty";
  /** 远端返回的总条数 */
  total: number;
}

/* ---- 模块六：下载安装位置 / 实例创建联动 ---- */

/** 已安装加载器（由已安装版本列表聚合而来，供实例创建页的加载器下拉使用） */
export interface iGM_Launcher_InstalledLoader {
  /** 加载器类型 */
  loader: iGM_Launcher_LoaderType;
  /** 该加载器下已安装的版本目录数量 */
  count: number;
  /** 该加载器已安装的加载器版本（去重，vanilla 为空数组） */
  loaderVersions: string[];
}

/**
 * 共享根目录（.minecraft 根）解析结果。
 * 下载与实例共用同一份 versions / libraries / assets，只存一份。
 */
export interface iGM_Launcher_RootDirInfo {
  /** 根目录绝对路径（即 .minecraft 根目录） */
  path: string;
  /** 目录当前是否真实存在，false 表示确认安装时按该路径自动创建 */
  exists: boolean;
  /** 是否为当前生效的默认根目录 */
  isDefault: boolean;
  /** 来源：已登记目录 / 系统默认候选且已存在 / 系统默认候选且待创建 */
  source: "registered" | "existing-default" | "system-default";
}

/** 实例名校验结果 */
export interface iGM_Launcher_InstanceNameCheck {
  /** 是否可用 */
  valid: boolean;
  /** 判定原因：ok 通过 / empty 为空 / invalid 含非法字符或超长 / duplicate 重名 */
  reason: "ok" | "empty" | "invalid" | "duplicate";
}

/* ---- 模块七：真实下载安装 ---- */

/**
 * 下载阶段。
 * resolving 解析版本清单 / version-json 写入版本 json / client 下载客户端 jar /
 * libraries 下载依赖库 / assets 下载资源对象 / loader 下载加载器依赖 /
 * finalizing 收尾校验 / done 完成 / failed 失败 / cancelled 已取消。
 */
export type iGM_Launcher_DownloadStage =
  | "idle"
  | "resolving"
  | "version-json"
  | "client"
  | "libraries"
  | "assets"
  | "loader"
  | "finalizing"
  | "done"
  | "failed"
  | "cancelled";

/**
 * 下载进度快照。
 * 由主进程在内存中维护，界面按 taskId 轮询获取；不落盘、不伪造结果。
 */
export interface iGM_Launcher_DownloadProgress {
  /** 任务编号 */
  taskId: string;
  /** 目标 Minecraft 版本号，如 1.20.1 */
  version: string;
  /** 加载器类型 */
  loader: iGM_Launcher_LoaderType;
  /** 加载器版本（原版为空字符串） */
  loaderVersion: string;
  /** 版本目录名：原版 <version>，加载器 <version>-<loader> */
  versionId: string;
  /** 安装到的共享根目录（.minecraft 根） */
  rootDir: string;
  /** 当前阶段 */
  stage: iGM_Launcher_DownloadStage;
  /** 计划下载文件总数 */
  filesTotal: number;
  /** 已完成文件数（含已存在而跳过的） */
  filesDone: number;
  /** 计划下载总字节数（未知大小的文件按 0 计） */
  bytesTotal: number;
  /** 已完成字节数 */
  bytesDone: number;
  /** 当前正在下载的文件（相对根目录的路径） */
  currentFile: string;
  /** 开始时间（ISO 字符串） */
  startedAt: string;
  /** 结束时间（ISO 字符串），未结束为 null */
  finishedAt: string | null;
  /** 失败原因，未失败为空字符串 */
  error: string;
}

/* ---- 模块八：启动（离线 / 正版） ---- */

/**
 * 启动登录方式。
 * offline：使用本地离线角色身份（不校验正版拥有权，仅可单机与局域网）；
 * official：使用已绑定的微软正版账号身份（注入真实访问令牌，可进入正版验证服务器）。
 */
export type iGM_Launcher_LaunchMode = "offline" | "official";

/**
 * 启动阶段（用于独立启动进度页的进度条展示）。
 * preparing 解析实例与共享根目录 / java 选取 Java 运行时 / building 构建启动参数并校验文件 /
 * spawning 拉起 Java 进程 / running 游戏进程已运行 / failed 启动失败。
 */
export type iGM_Launcher_LaunchStage =
  | "preparing"
  | "java"
  | "building"
  | "spawning"
  | "running"
  | "failed";

/** 启动阶段对应的进度百分比（引擎与界面共用，保证展示与真实阶段一致） */
export function iGM_Launcher_LaunchStageProgress(stage: iGM_Launcher_LaunchStage): number {
  switch (stage) {
    case "preparing":
      return 10;
    case "java":
      return 30;
    case "building":
      return 60;
    case "spawning":
      return 85;
    case "running":
      return 100;
    default:
      return 0;
  }
}

/**
 * 启动状态。
 * starting 正在拉起进程 / running 进程存活 / exited 进程已退出 / failed 启动失败。
 */
export type iGM_Launcher_LaunchState = "starting" | "running" | "exited" | "failed";

/**
 * 启动状态快照。
 * 由主进程内存维护（重启启动器后清空），界面按实例 id 查询；
 * 失败原因与日志路径如实回传，绝不伪造「已启动」。
 */
export interface iGM_Launcher_LaunchStatus {
  /** 实例 id */
  instanceId: string;
  /** 实例名称 */
  instanceName: string;
  /** 版本目录名（versions 下的子目录名） */
  versionId: string;
  /** 本次启动使用的登录方式 */
  mode: iGM_Launcher_LaunchMode;
  /** 当前启动阶段 */
  stage: iGM_Launcher_LaunchStage;
  /** 当前阶段进度百分比（0-100，与 stage 一一对应） */
  progress: number;
  /** 当前阶段的说明文案键（如 stage_preparing），便于界面本地化展示 */
  stageMessage: string;
  /** 离线角色名 / 正版玩家名（写入 --username） */
  playerName: string;
  /** 游戏进程编号，未拉起时为 0 */
  pid: number;
  /** 当前状态 */
  state: iGM_Launcher_LaunchState;
  /** 实际使用的 Java 可执行文件路径 */
  javaPath: string;
  /** 实例 gameDir（进程工作目录） */
  gameDir: string;
  /** 游戏输出日志文件绝对路径 */
  logPath: string;
  /** 启动时间（ISO 字符串） */
  startedAt: string;
  /** 结束时间（ISO 字符串），未结束为 null */
  exitedAt: string | null;
  /** 退出码，未结束为 null */
  exitCode: number | null;
  /** 失败原因，未失败为空字符串 */
  error: string;
}

/* ---- 模块二十：第三方资源（Modrinth / Fabric） ---- */

/**
 * 第三方资源类型。
 * 当前仅对接 Modrinth 平台、面向 Fabric 加载器；CurseForge 等其他平台不做。
 */
export type iGM_Launcher_ThirdPartyResourceType =
  | "mod"
  | "shader"
  | "resourcepack"
  | "map"
  | "datapack";

/**
 * 第三方下载任务状态。
 * pending 排队 / downloading 下载中 / paused 已暂停 / completed 已完成 /
 * failed 失败 / canceled 已取消。
 */
export type iGM_Launcher_ThirdPartyTaskStatus =
  | "pending"
  | "downloading"
  | "paused"
  | "completed"
  | "failed"
  | "canceled";

/** 第三方资源条目（搜索列表 / 资源详情共用） */
export interface iGM_Launcher_ThirdPartyResource {
  /** 资源 id（主站内唯一，任务与版本均以其关联） */
  id: string;
  /** 来源平台标识（当前固定为 modrinth） */
  source: string;
  /** 来源平台内的资源标识 */
  sourceId: string;
  /** 资源短链名（slug） */
  slug: string;
  /** 资源名称 */
  name: string;
  /** 资源类型 */
  type: iGM_Launcher_ThirdPartyResourceType;
  /** 资源简介 */
  description: string;
  /** 作者 */
  author: string;
  /** 封面图地址 */
  coverUrl: string;
  /** 累计下载量 */
  downloads: number;
  /** 最近更新时间（ISO 字符串） */
  updatedAt: string;
}

/**
 * 第三方资源版本的发布类型（对应 Modrinth 的 version_type）。
 * release 正式版 / beta 测试版 / alpha 早期测试版；界面据此区分展示。
 */
export type iGM_Launcher_ThirdPartyVersionType = "release" | "beta" | "alpha";

/** 第三方资源的单个可下载版本（Fabric 场景按游戏版本与加载器筛选） */
export interface iGM_Launcher_ThirdPartyVersion {
  /** 版本 id（发起下载时使用） */
  id: string;
  /** 版本号 */
  version: string;
  /** 支持的游戏版本列表，如 1.20.1 */
  gameVersions: string[];
  /** 支持的加载器列表（当前仅 fabric） */
  loaders: string[];
  /** 版本发布类型：正式版 / 测试版 / 早期测试版 */
  versionType: iGM_Launcher_ThirdPartyVersionType;
  /** 下载地址 */
  downloadUrl: string;
  /** 文件名 */
  filename: string;
  /** 文件大小（字节） */
  size: number;
  /** 文件 sha1 校验值 */
  sha1: string;
  /** 发布时间（ISO 字符串） */
  publishedAt: string;
}

/**
 * 第三方资源下载任务快照。
 * 任务由主站后端统一管理（与网站下载中心共用同一套任务），
 * 启动器只负责展示与转发操作，不做任何进度伪造。
 */
export interface iGM_Launcher_ThirdPartyTask {
  /** 任务编号 */
  id: string;
  /** 资源 id */
  resourceId: string;
  /** 版本 id */
  versionId: string;
  /** 来源平台标识 */
  source: string;
  /** 资源名称 */
  name: string;
  /** 资源类型 */
  type: iGM_Launcher_ThirdPartyResourceType;
  /** 版本号 */
  version: string;
  /** 下载地址 */
  downloadUrl: string;
  /** 文件名 */
  filename: string;
  /** 文件大小（字节） */
  size: number;
  /** 文件 sha1 校验值 */
  sha1: string;
  /** 当前状态 */
  status: iGM_Launcher_ThirdPartyTaskStatus;
  /** 已下载字节数 */
  downloaded: number;
  /** 进度百分比 0-100 */
  progress: number;
  /** 当前速度（字节/秒） */
  speed: number;
  /** 预计剩余秒数，未知为 0 */
  eta: number;
  /** 失败原因，未失败为空字符串 */
  error: string;
  /** 目标目录（绝对路径） */
  targetDir: string;
  /** 落盘文件绝对路径 */
  filePath: string;
  /** 创建时间（ISO 字符串） */
  createdAt: string;
  /** 最近更新时间（ISO 字符串） */
  updatedAt: string;
}

/* ---- 模块二十补充：实例内已安装资源（仅启动器端可查看） ---- */

/** 实例内单个资源文件 */
export interface iGM_Launcher_InstanceResourceFile {
  /** 文件名（含扩展名） */
  name: string;
  /** 文件绝对路径 */
  path: string;
  /** 文件大小（字节） */
  size: number;
  /** 最近修改时间（ISO 字符串）；无法取得时为空串 */
  modifiedAt: string;
}

/**
 * 实例内某一类资源的目录分组。
 * key 与 IGM_LAUNCHER_THIRD_PARTY_INSTANCE_SUBDIRS 的取值保持一致：
 * mods / shaderpacks / resourcepacks / datapacks。
 */
export interface iGM_Launcher_InstanceResourceGroup {
  key: string;
  /** 目录绝对路径 */
  dir: string;
  /** 目录是否存在（不存在或不可读时为 false） */
  exists: boolean;
  files: iGM_Launcher_InstanceResourceFile[];
}

/** 实例内已安装资源扫描结果 */
export interface iGM_Launcher_InstanceResources {
  /** 扫描的实例目录绝对路径 */
  dir: string;
  groups: iGM_Launcher_InstanceResourceGroup[];
  /** 全部资源文件总数 */
  total: number;
}

// 类型定义（Bun 桥接层协议） //

/**
 * 桥接层方法名。
 * 命名与 Zig 核心预留函数一一对应：
 *   instance:* -> iGM_Launcher_Instance_*
 *   java:*     -> iGM_Launcher_Java_*
 *   account:*  -> iGM_Launcher_Account_*
 *   mc:*       -> iGM_Launcher_MSA_* / iGM_Launcher_Xbox_* /
 *                 iGM_Launcher_XSTS_* / iGM_Launcher_Minecraft_*
 *
 * 模块三安全约束：敏感令牌（refresh_token / access_token / XSTS）只在主进程内流转，
 * 分步方法一律通过 flowId 引用主进程内的令牌上下文，绝不把令牌回传渲染进程。
 */
export type iGM_Launcher_BridgeMethod =
  | "app:load"
  /** 模块七：读取安装程序写入的语言选择（无安装记录时返回 null） */
  | "app:locale"
  | "core:status"
  | "instance:list"
  | "instance:get"
  | "instance:create"
  | "instance:update"
  | "instance:delete"
  | "java:list"
  | "java:detect"
  | "java:add"
  | "java:remove"
  | "java:test"
  | "java:download"
  | "java:set-default"
  | "account:get-current"
  | "account:login"
  | "account:logout"
  | "account:sync"
  | "account:restore-session"
  | "mc:start-device-code"
  | "mc:poll-device-code"
  | "mc:start-browser-auth"
  | "mc:complete-browser-auth"
  | "mc:authenticate-xbox"
  | "mc:authorize-xsts"
  | "mc:authenticate-minecraft"
  | "mc:get-profile"
  | "mc:check-entitlements"
  | "mc:refresh-token"
  | "mc:bind-to-community"
  | "mc:unbind"
  | "mc:list-bindings"
  | "mc:set-default-binding"
  /* 模块五：离线游戏 / 本机游戏目录扫描 / 版本库同步
     （命名与 Zig 核心预留函数一一对应：
       minecraft:scan-dirs     -> iGM_Launcher_ScanMinecraftDirs
       minecraft:parse-version -> iGM_Launcher_ParseVersionJson
       minecraft:import-instance -> iGM_Launcher_ImportInstance
       minecraft:sync-versions -> iGM_Launcher_SyncVersionLibrary） */
  | "minecraft:scan-dirs"
  | "minecraft:parse-version"
  | "minecraft:import-instance"
  | "minecraft:sync-versions"
  | "minecraft:library"
  | "minecraft:add-dir"
  | "minecraft:remove-dir"
  | "minecraft:set-default-dir"
  /* 模块六：下载安装位置与实例创建联动
     （命名与 Zig 核心预留函数一一对应：
       minecraft:installed-versions  -> iGM_Launcher_ScanInstalledVersions
       minecraft:installed-loaders   -> iGM_Launcher_ScanInstalledLoaders
       minecraft:default-root-dir    -> iGM_Launcher_GetDefaultRootDir
       minecraft:create-instance-dir -> iGM_Launcher_CreateInstanceDir
       minecraft:validate-instance-name -> iGM_Launcher_ValidateInstanceName） */
  | "minecraft:installed-versions"
  | "minecraft:installed-loaders"
  | "minecraft:default-root-dir"
  | "minecraft:create-instance-dir"
  | "minecraft:validate-instance-name"
  /* 模块七：真实下载安装（Mojang 官方清单 + Fabric 官方元数据）
     （命名与 Zig 核心预留函数一一对应：
       minecraft:download-loader-versions -> iGM_Launcher_ListLoaderVersions
       minecraft:download-start           -> iGM_Launcher_StartDownload
       minecraft:download-status          -> iGM_Launcher_DownloadStatus
       minecraft:download-cancel          -> iGM_Launcher_CancelDownload） */
  | "minecraft:download-loader-versions"
  | "minecraft:download-start"
  | "minecraft:download-status"
  | "minecraft:download-cancel"
  /* 模块七补充：打开系统目录选择器，让用户把前置目录放到任意磁盘（不限于系统盘）
     （命名与 Zig 核心预留函数对应：minecraft:pick-dir -> iGM_Launcher_PickDirectory） */
  | "minecraft:pick-dir"
  /* 模块八：启动实例（离线或正版），用已下载版本真实拉起 Minecraft Java 进程
     （命名与 Zig 核心预留函数一一对应：
       instance:launch        -> iGM_Launcher_LaunchInstance
       instance:launch-status -> iGM_Launcher_LaunchStatus） */
  | "instance:launch"
  | "instance:launch-status"
  /* 模块二十补充：扫描实例目录，列出已安装的模组 / 光影 / 材质包 / 数据包
     （仅启动器端可查看，网站端不暴露该能力） */
  | "instance:resources"
  /* 模块二十：第三方资源（Modrinth / Fabric）
     命名与主站 /G_ThirdParty 接口一一对应，任务由主站后端统一管理
     （与网站下载中心共用同一套任务；启动器只做转发与展示，绝不伪造进度） */
  | "thirdParty:search"
  | "thirdParty:resource"
  | "thirdParty:download-start"
  | "thirdParty:download-status"
  | "thirdParty:download-list"
  | "thirdParty:download-cancel"
  | "thirdParty:download-pause"
  | "thirdParty:download-retry"
  | "thirdParty:download-remove"
  | "thirdParty:download-clear-completed"
  /* 模块二十补充：在系统文件管理器中打开下载文件所在目录
     （主进程原生能力，浏览器回退层如实拒绝） */
  | "shell:open-path";

/** 桥接层调用入参（按方法取用，未使用的键忽略） */
export interface iGM_Launcher_BridgeParams {
  id?: string;
  name?: string;
  path?: string;
  version?: string;
  vendor?: iGM_Launcher_JavaVendor;
  major?: number;
  /** 登录账号：邮箱或用户名（与主站 /G_Auth/login 的 account 字段一致） */
  account?: string;
  password?: string;
  offline?: boolean;
  instance?: iGM_Launcher_InstanceInput;
  patch?: Partial<iGM_Launcher_InstanceRecord>;
  /** 认证流程编号（设备代码 / 浏览器授权流程，令牌上下文留在主进程） */
  flowId?: string;
  /** 绑定记录 id（档案、拥有权、刷新、解绑、设为默认） */
  bindingId?: string;
  /** 浏览器授权回调地址（默认取环境变量 IGM_MSA_REDIRECT_URI） */
  redirectUri?: string;
  /* ---- 模块五：游戏目录与版本库 ---- */
  /** 目录绝对路径（扫描目标 / 手动指定目录） */
  dirPath?: string;
  /** 版本 json 绝对路径（解析单个版本 / 导入实例） */
  jsonPath?: string;
  /** 已登记游戏目录 id（移除 / 设为默认） */
  dirId?: string;
  /** 导入实例时的自定义名称，缺省取版本号 */
  importName?: string;
  /* ---- 模块六：下载安装位置与实例创建联动 ---- */
  /** 共享根目录（.minecraft 根）路径：扫描已安装版本 / 创建实例目录的目标根 */
  rootDir?: string;
  /** 实例名（创建实例目录的目录名 / 实例名校验的校验对象） */
  instanceName?: string;
  /** 加载器类型（聚合已安装加载器时可选按加载器过滤） */
  loader?: iGM_Launcher_LoaderType;
  /* ---- 模块七：真实下载安装 ---- */
  /** 加载器版本（Fabric 加载器版本号，缺省取最新稳定版） */
  loaderVersion?: string;
  /** 下载任务编号（查询进度 / 取消任务），缺省取最近一次任务 */
  taskId?: string;
  /* ---- 模块八：启动登录方式 ---- */
  /** 启动登录方式：offline 离线 / official 正版（缺省按离线处理） */
  mode?: iGM_Launcher_LaunchMode;
  /* ---- 模块二十补充：实例内已安装资源 ---- */
  /** 待扫描的实例目录绝对路径（instance:resources） */
  instanceDir?: string;
  /* ---- 模块二十：第三方资源（Modrinth / Fabric） ---- */
  /** 搜索关键字（搜索接口 q 参数） */
  query?: string;
  /** 资源类型（搜索筛选；取值见 IGM_LAUNCHER_THIRD_PARTY_TYPES） */
  resourceType?: iGM_Launcher_ThirdPartyResourceType;
  /** 第三方资源 id（资源详情 / 发起下载） */
  resourceId?: string;
  /** 第三方资源版本 id（发起下载） */
  versionId?: string;
  /** 下载目标目录（绝对路径） */
  target?: string;
  /** 分页页码（搜索，缺省 1） */
  page?: number;
  /** 分页条数（搜索，缺省 IGM_LAUNCHER_THIRD_PARTY_PAGE_SIZE） */
  pageSize?: number;
  /** 任务状态筛选（下载列表，缺省返回全部） */
  status?: iGM_Launcher_ThirdPartyTaskStatus;
  /** 暂停 / 继续（true 暂停，false 继续） */
  paused?: boolean;
  /** 取消任务时是否同时删除已下载文件 */
  purge?: boolean;
  /** 需要在系统文件管理器中打开的文件或目录绝对路径（shell:open-path） */
  openPath?: string;
}

/** 统一响应结构（第五节、第六节约定的 { success, code, message, data }） */
export interface iGM_Launcher_BridgeResponse<T = unknown> {
  success: boolean;
  code: number;
  message: string;
  data: T | null;
}

/** 主进程回填给界面的桥接响应包（经 webview 消息通道下发） */
export interface iGM_Launcher_BridgeReply {
  channel: "iGM_Launcher_Bridge";
  id: string;
  response: iGM_Launcher_BridgeResponse;
}

/** 桥接层各方法的返回数据形状（供界面侧断言，避免 any） */
export interface iGM_Launcher_BridgeDataMap {
  "app:load": { data: iGM_Launcher_LocalData };
  "app:locale": { locale: iGM_Launcher_Locale | null };
  "core:status": { core: iGM_Launcher_CoreLibrary };
  "instance:list": { instances: iGM_Launcher_InstanceRecord[] };
  "instance:get": { instance: iGM_Launcher_InstanceRecord };
  "instance:create": {
    instance: iGM_Launcher_InstanceRecord;
    instances: iGM_Launcher_InstanceRecord[];
  };
  "instance:update": {
    instance: iGM_Launcher_InstanceRecord;
    instances: iGM_Launcher_InstanceRecord[];
  };
  "instance:delete": { instances: iGM_Launcher_InstanceRecord[] };
  "java:list": {
    javas: iGM_Launcher_JavaRuntime[];
    defaultJavaId: string | null;
  };
  "java:detect": {
    javas: iGM_Launcher_JavaRuntime[];
    defaultJavaId: string | null;
    added: iGM_Launcher_JavaRuntime[];
  };
  "java:add": {
    javas: iGM_Launcher_JavaRuntime[];
    defaultJavaId: string | null;
  };
  "java:remove": {
    javas: iGM_Launcher_JavaRuntime[];
    defaultJavaId: string | null;
  };
  "java:test": {
    javas: iGM_Launcher_JavaRuntime[];
    runtime: iGM_Launcher_JavaRuntime;
  };
  "java:download": { javas: iGM_Launcher_JavaRuntime[] };
  "java:set-default": {
    javas: iGM_Launcher_JavaRuntime[];
    defaultJavaId: string | null;
  };
  "account:get-current": { account: iGM_Launcher_AccountSession };
  "account:login": { account: iGM_Launcher_AccountSession };
  "account:logout": { account: iGM_Launcher_AccountSession };
  "account:sync": { account: iGM_Launcher_AccountSession };
  "account:restore-session": { account: iGM_Launcher_AccountSession };
  "mc:start-device-code": { deviceCode: iGM_Launcher_MsaDeviceCode };
  "mc:poll-device-code": { result: iGM_Launcher_MsaFlowResult };
  "mc:start-browser-auth": { browserAuth: iGM_Launcher_BrowserAuthStart };
  "mc:complete-browser-auth": { result: iGM_Launcher_MsaFlowResult };
  "mc:authenticate-xbox": { flow: iGM_Launcher_MsaFlowResult };
  "mc:authorize-xsts": { flow: iGM_Launcher_MsaFlowResult };
  "mc:authenticate-minecraft": { flow: iGM_Launcher_MsaFlowResult };
  "mc:get-profile": { profile: iGM_Launcher_MinecraftProfile };
  "mc:check-entitlements": { binding: iGM_Launcher_MCBinding };
  "mc:refresh-token": { binding: iGM_Launcher_MCBinding };
  "mc:bind-to-community": { binding: iGM_Launcher_MCBinding };
  "mc:unbind": { mcBindings: iGM_Launcher_MCBinding[] };
  "mc:list-bindings": { mcBindings: iGM_Launcher_MCBinding[] };
  "mc:set-default-binding": { mcBindings: iGM_Launcher_MCBinding[] };
  /* ---- 模块五：游戏目录与版本库 ---- */
  "minecraft:scan-dirs": {
    gameDirs: iGM_Launcher_GameDir[];
    results: iGM_Launcher_GameDirScanResult[];
  };
  "minecraft:parse-version": { version: iGM_Launcher_ScannedVersion };
  "minecraft:import-instance": {
    instance: iGM_Launcher_InstanceRecord;
    instances: iGM_Launcher_InstanceRecord[];
  };
  "minecraft:sync-versions": { library: iGM_Launcher_VersionLibrary };
  "minecraft:library": { library: iGM_Launcher_VersionLibrary };
  "minecraft:add-dir": {
    gameDirs: iGM_Launcher_GameDir[];
    result: iGM_Launcher_GameDirScanResult;
  };
  "minecraft:remove-dir": { gameDirs: iGM_Launcher_GameDir[] };
  "minecraft:set-default-dir": { gameDirs: iGM_Launcher_GameDir[] };
  /* ---- 模块六：下载安装位置与实例创建联动 ---- */
  "minecraft:installed-versions": {
    /** 生效的共享根目录 */
    rootDir: string;
    /** 该根目录 versions/ 下已安装的版本 */
    versions: iGM_Launcher_ScannedVersion[];
  };
  "minecraft:installed-loaders": { loaders: iGM_Launcher_InstalledLoader[] };
  "minecraft:default-root-dir": { rootDir: iGM_Launcher_RootDirInfo };
  "minecraft:create-instance-dir": {
    /** 实例 gameDir（<根目录>/instances/<实例名>） */
    gameDir: string;
    /** 目录是否本轮新建 */
    created: boolean;
  };
  "minecraft:validate-instance-name": { check: iGM_Launcher_InstanceNameCheck };
  /* ---- 模块七：真实下载安装 ---- */
  "minecraft:download-loader-versions": { loaderVersions: string[] };
  "minecraft:download-start": { progress: iGM_Launcher_DownloadProgress };
  "minecraft:download-status": { progress: iGM_Launcher_DownloadProgress | null };
  "minecraft:download-cancel": { progress: iGM_Launcher_DownloadProgress | null };
  /* 目录选择器：path 为空串表示用户取消选择 */
  "minecraft:pick-dir": { path: string };
  /* 模块八：启动（离线 / 正版） */
  "instance:launch": {
    /** 本次启动的状态快照 */
    status: iGM_Launcher_LaunchStatus;
    /** 更新后的实例记录（已写入上次游玩时间） */
    instance: iGM_Launcher_InstanceRecord;
    instances: iGM_Launcher_InstanceRecord[];
  };
  "instance:launch-status": { status: iGM_Launcher_LaunchStatus | null };
  "instance:resources": { resources: iGM_Launcher_InstanceResources };
  /* ---- 模块二十：第三方资源（Modrinth / Fabric） ---- */
  "thirdParty:search": {
    items: iGM_Launcher_ThirdPartyResource[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  "thirdParty:resource": {
    resource: iGM_Launcher_ThirdPartyResource;
    versions: iGM_Launcher_ThirdPartyVersion[];
  };
  "thirdParty:download-start": { task: iGM_Launcher_ThirdPartyTask };
  "thirdParty:download-status": { task: iGM_Launcher_ThirdPartyTask | null };
  "thirdParty:download-list": { items: iGM_Launcher_ThirdPartyTask[] };
  "thirdParty:download-cancel": { task: iGM_Launcher_ThirdPartyTask };
  "thirdParty:download-pause": { task: iGM_Launcher_ThirdPartyTask };
  "thirdParty:download-retry": { task: iGM_Launcher_ThirdPartyTask };
  "thirdParty:download-remove": { removed: boolean };
  "thirdParty:download-clear-completed": { removed: number };
  /* 打开文件 / 目录：opened 为 false 表示系统未接管（界面回退展示路径文本） */
  "shell:open-path": { opened: boolean };
}

// 核心逻辑（常量） //

/** 应用显示名称 */
export const IGM_LAUNCHER_APP_NAME = "iGM Launcher";

/** 应用反向域名标识 */
export const IGM_LAUNCHER_IDENTIFIER = "com.igcraftlit.launcher";

/** 应用版本（界面关于页、窗口标题与启动参数统一显示该值） */
export const IGM_LAUNCHER_VERSION = "26.2.4 official version";

/** 窗口标题：应用名称 + 版本号，供原生窗口标题栏与界面标题统一引用 */
export const IGM_LAUNCHER_APP_TITLE = `${IGM_LAUNCHER_APP_NAME} ${IGM_LAUNCHER_VERSION}`;

/** Zig 核心动态库未编译时对外暴露的占位版本号 */
export const IGM_LAUNCHER_CORE_PLACEHOLDER_VERSION = "0.1.0-placeholder";

/** Zig 核心下载任务占位返回值：-1 表示未实现 */
export const IGM_LAUNCHER_CORE_PLACEHOLDER_TASK_ID = -1;

/** 默认窗口尺寸 */
export const IGM_LAUNCHER_DEFAULT_SIZE = {
  width: 1280,
  height: 800,
} as const;

/* ---- 模块七常量：独立安装程序（apps/installer + 安装向导界面） ---- */

/** 安装程序显示名称 */
export const IGM_INSTALLER_APP_NAME = "iGM Installer";

/** 安装程序反向域名标识 */
export const IGM_INSTALLER_IDENTIFIER = "com.igcraftlit.installer";

/** 安装程序版本：与启动器保持一致 */
export const IGM_INSTALLER_VERSION = IGM_LAUNCHER_VERSION;

/** 安装程序窗口标题 */
export const IGM_INSTALLER_APP_TITLE = `${IGM_INSTALLER_APP_NAME} ${IGM_INSTALLER_VERSION}`;

/** 安装程序窗口尺寸（向导为单列窄窗） */
export const IGM_INSTALLER_WINDOW_SIZE = {
  width: 900,
  height: 660,
} as const;

/** 安装程序界面在打包产物中的入口（由 build.copy 映射为 views://installer） */
export const IGM_INSTALLER_PACKAGED_ENTRY = "views://installer/G_Installer.html";

/**
 * 安装程序界面开发模式地址。
 * 安装向导与启动器界面同属 apps/launcher-ui 的静态导出，故复用其 3210 开发端口，
 * 仅路由指向 G_Installer。
 */
export const IGM_INSTALLER_DEV_URL = "http://localhost:3210/G_Installer";

/**
 * 安装程序落盘的安装配置文件名（位于启动器数据根目录 IGM_LAUNCHER_DATA_ROOT）。
 * 启动器首启通过桥接方法 app:locale 读取该文件，从而与安装程序语言选择一致。
 */
export const IGM_INSTALLER_CONFIG_FILE = "installer.json";

/** 安装程序写入的安装配置 */
export interface iGM_Launcher_InstallerConfig {
  /** 安装向导中选择的语言 */
  locale: iGM_Launcher_Locale;
  /** 启动器安装目录（内含 bin/launcher.exe） */
  installDir: string;
  /** 写入时间（ISO 字符串） */
  installedAt: string;
}

/** 安装程序嵌入的启动器载荷目录名（build.copy 到 views/payload） */
export const IGM_INSTALLER_PAYLOAD_DIR = "iGMLauncher";

/** 安装目录默认位置（相对 %LOCALAPPDATA%） */
export const IGM_INSTALLER_DEFAULT_SUBDIR = "iGM Launcher";

/** 安装完成后创建的快捷方式名称 */
export const IGM_INSTALLER_SHORTCUT_NAME = "iGM Launcher";

/** 启动器可执行文件在安装目录中的相对路径 */
export const IGM_INSTALLER_LAUNCHER_RELATIVE_EXE = "bin/launcher.exe";

/** 最小窗口尺寸 */
export const IGM_LAUNCHER_MIN_SIZE = {
  width: 1024,
  height: 640,
} as const;

/**
 * 本地开发时 Next.js 静态界面 dev server 地址。
 * 刻意避开主站 igcraftlit.com 使用的 3000 端口，避免两套前端互相抢占。
 */
export const IGM_LAUNCHER_DEV_URL = "http://localhost:3210";

/** localStorage 语言键 */
export const IGM_LAUNCHER_LOCALE_STORAGE_KEY = "iGM_Launcher_Locale";

/** localStorage 主题键（与 next-themes storageKey 保持一致） */
export const IGM_LAUNCHER_THEME_STORAGE_KEY = "iGM_Launcher_Theme";

/**
 * localStorage 玻璃背景键。
 * 取值写入 html[data-igm-glass]，仅启动器端读取，网站端不使用。
 */
export const IGM_LAUNCHER_GLASS_STORAGE_KEY = "iGM_Launcher_Glass";

/** 玻璃背景可选预设（none 表示关闭），与 iGM_Globals.css 中的选择器一一对应 */
export const IGM_LAUNCHER_GLASS_PRESETS = [
  "none",
  "ice",
  "warm",
  "mint",
  "violet",
] as const;

/** 玻璃背景预设类型 */
export type iGM_Launcher_GlassPreset = (typeof IGM_LAUNCHER_GLASS_PRESETS)[number];

/** 模块一支持的语言清单（仅 zh-CN / en） */
export const IGM_LAUNCHER_LOCALES: readonly {
  value: iGM_Launcher_Locale;
  /** 该语言的自称，用于切换器按钮显示 */
  label: string;
}[] = [
  { value: "zh-CN", label: "中文" },
  { value: "en", label: "English" },
] as const;

/* ---- 模块二常量：本地数据位置 ---- */

/** 启动器本地数据根目录（模块二占位，落盘逻辑后续模块细化） */
export const IGM_LAUNCHER_DATA_ROOT = "D:/IGLAUNCHER/data";

/** 实例数据文件（相对 IGM_LAUNCHER_DATA_ROOT） */
export const IGM_LAUNCHER_INSTANCES_FILE = "instances/instances.json";

/** Java 数据文件（相对 IGM_LAUNCHER_DATA_ROOT） */
export const IGM_LAUNCHER_JAVA_FILE = "java/java.json";

/** 账户会话文件（相对 IGM_LAUNCHER_DATA_ROOT） */
export const IGM_LAUNCHER_SESSION_FILE = "account/session.json";

/** iGCraftLit 主站地址（忘记密码等外链跳转目标） */
export const IGM_LAUNCHER_SITE_URL = "https://igcraftlit.com";

/* ---- 模块二常量：主站后端 API（登录 / 账户同步） ---- */

/**
 * 主站后端 API 基址。
 * 说明：由 Bun 桥接层直接发起请求（不经浏览器，无跨域限制），
 * 线上为主站 cloudflared 命名隧道暴露的 api 子域；
 * 本机联调可用环境变量 IGM_LAUNCHER_API_BASE 覆盖为 http://localhost:3001。
 */
export const IGM_LAUNCHER_API_BASE = "https://api.igcraftlit.com";

/** 主站会话 Cookie 名称（与主站 iGM_Config.auth.cookieName 一致） */
export const IGM_LAUNCHER_API_SESSION_COOKIE = "iGM_SID";

/** 主站登录接口路径 */
export const IGM_LAUNCHER_API_LOGIN_PATH = "/G_Auth/login";

/** 主站登出接口路径 */
export const IGM_LAUNCHER_API_LOGOUT_PATH = "/G_Auth/logout";

/** 主站当前用户接口路径（需携带会话 Cookie） */
export const IGM_LAUNCHER_API_ME_PATH = "/G_Auth/me";

/** 主站 API 请求超时（毫秒） */
export const IGM_LAUNCHER_API_TIMEOUT_MS = 8000;

/**
 * 主站第三方资源接口超时（毫秒）。
 * 说明：第三方资源首次访问需回源 Modrinth 拉取版本清单，创建下载任务时
 *       也要等后端建单，耗时明显高于普通接口，故单独放宽，避免误报超时。
 */
export const IGM_LAUNCHER_API_THIRD_PARTY_TIMEOUT_MS = 30000;

/**
 * 界面侧单次桥接调用超时（毫秒），按方法区分：
 * - 系统目录选择器等原生弹窗需等待用户操作，给足 10 分钟；
 * - thirdParty:* 回源耗时较长，给 30 秒；
 * - 其余普通方法沿用 IGM_LAUNCHER_API_TIMEOUT_MS。
 */
export const IGM_LAUNCHER_DIALOG_TIMEOUT_MS = 600000;

/** 桥接层单次调用默认超时（毫秒） */
export const IGM_LAUNCHER_BRIDGE_TIMEOUT_MS = 8000;

/** 浏览器开发模式下模拟落盘所用的 localStorage 键 */
export const IGM_LAUNCHER_LOCAL_DATA_STORAGE_KEY = "iGM_Launcher_LocalData";

/* ---- 模块二常量：桥接层响应码 ---- */

export const IGM_LAUNCHER_BRIDGE_OK = 0;
export const IGM_LAUNCHER_BRIDGE_INVALID = 400;
/** 主站拒绝认证：账号或密码错误 */
export const IGM_LAUNCHER_BRIDGE_UNAUTHORIZED = 401;
export const IGM_LAUNCHER_BRIDGE_FORBIDDEN = 403;
export const IGM_LAUNCHER_BRIDGE_NOT_FOUND = 404;
export const IGM_LAUNCHER_BRIDGE_FAILED = 500;
export const IGM_LAUNCHER_BRIDGE_NOT_IMPLEMENTED = 501;
/** 主站 API 不可达（网络异常、超时或跨域被拦截） */
export const IGM_LAUNCHER_BRIDGE_UNREACHABLE = 503;

/* ---- 模块二常量：实例选项 ---- */

/** 加载器选项（Minecraft 术语保留英文原名） */
export const IGM_LAUNCHER_LOADER_OPTIONS: readonly {
  value: iGM_Launcher_LoaderType;
  label: string;
}[] = [
  { value: "vanilla", label: "Vanilla" },
  { value: "forge", label: "Forge" },
  { value: "fabric", label: "Fabric" },
  { value: "neoforge", label: "NeoForge" },
  { value: "quilt", label: "Quilt" },
] as const;

/** Minecraft 版本占位列表（真实版本清单后续模块由下载中心提供） */
export const IGM_LAUNCHER_MINECRAFT_VERSIONS: readonly string[] = [
  "1.21.4",
  "1.21.1",
  "1.20.6",
  "1.20.1",
  "1.19.4",
  "1.18.2",
  "1.16.5",
  "1.12.2",
  "1.8.9",
] as const;

/** 各加载器的版本占位列表（vanilla 无加载器版本） */
export const IGM_LAUNCHER_LOADER_VERSIONS: Record<iGM_Launcher_LoaderType, readonly string[]> = {
  vanilla: [],
  forge: ["47.2.20", "47.1.3", "43.3.0"],
  fabric: ["0.16.9", "0.15.11", "0.14.24"],
  neoforge: ["21.1.72", "20.6.119", "20.4.237"],
  quilt: ["0.27.1", "0.26.4", "0.25.0"],
};

/** 实例图标可选项 */
export const IGM_LAUNCHER_INSTANCE_ICONS: readonly iGM_Launcher_InstanceIconId[] = [
  "folder",
  "cube",
  "pickaxe",
  "sword",
  "leaf",
  "flame",
  "gem",
  "compass",
] as const;

/** 实例默认内存（MB） */
export const IGM_LAUNCHER_INSTANCE_MEMORY_DEFAULT = { min: 1024, max: 4096 } as const;

/** 实例默认窗口尺寸 */
export const IGM_LAUNCHER_INSTANCE_WINDOW_DEFAULT = { width: 854, height: 480 } as const;

/** 实例默认 JVM 参数 */
export const IGM_LAUNCHER_INSTANCE_JVM_ARGS_DEFAULT = "-XX:+UseG1GC";

/* ---- 模块二常量：Java 选项 ---- */

/** Java 下载可选主版本（占位） */
export const IGM_LAUNCHER_JAVA_MAJORS: readonly number[] = [8, 11, 17, 21] as const;

/** Java 发行版选项 */
export const IGM_LAUNCHER_JAVA_VENDORS: readonly {
  value: iGM_Launcher_JavaVendor;
  label: string;
}[] = [
  { value: "adoptium", label: "Adoptium" },
  { value: "zulu", label: "Zulu" },
  { value: "liberica", label: "Liberica" },
] as const;

/**
 * 系统 Java 扫描根目录。
 * 模块二原为硬编码 java.exe 路径的占位候选（恒标为可用），已替换为扫描根目录：
 * 真实扫描由桌面外壳的 iGM_Launcher_Java.ts 执行，逐层查找 bin/java(.exe)。
 * 元素支持 %ProgramFiles% / %ProgramFiles(x86)% / %LOCALAPPDATA% / %APPDATA% /
 * %USERPROFILE% 占位，由扫描器展开；不存在的根目录直接跳过。
 * 覆盖 Oracle、Eclipse Adoptium（Temurin）、Eclipse Foundation、Microsoft、
 * Amazon Corretto、Azul Zulu、BellSoft Liberica、AdoptOpenJDK、IntelliJ 自带 JDK，
 * 以及官方启动器自带的 java-runtime（旧版 .minecraft/runtime 与微软商店版目录）。
 */
export const IGM_LAUNCHER_JAVA_SEARCH_ROOTS: readonly string[] = [
  "%ProgramFiles%/Java",
  "%ProgramFiles%/Eclipse Adoptium",
  "%ProgramFiles%/Eclipse Foundation",
  "%ProgramFiles%/Microsoft",
  "%ProgramFiles%/Amazon Corretto",
  "%ProgramFiles%/Zulu",
  "%ProgramFiles%/BellSoft",
  "%ProgramFiles%/AdoptOpenJDK",
  "%ProgramFiles%/Common Files/Oracle/Java",
  "%ProgramFiles(x86)%/Java",
  "%ProgramFiles(x86)%/Eclipse Adoptium",
  "%ProgramFiles(x86)%/Zulu",
  "%LOCALAPPDATA%/Programs/Eclipse Adoptium",
  "%LOCALAPPDATA%/Programs/Microsoft",
  "%USERPROFILE%/.jdks",
  "%APPDATA%/.minecraft/runtime",
  "%LOCALAPPDATA%/Packages/Microsoft.4297127D64EC6_8wekyb3d8bbwe/LocalCache/Local/runtime",
  "%LOCALAPPDATA%/Packages/Microsoft.4297127D64EC6_8wekyb3d8bbwe/LocalCache/Roaming/.minecraft/runtime",
  // 非 Windows 平台：同一套扫描逻辑无需分支，路径不存在时自动跳过
  "/usr/lib/jvm",
  "/Library/Java/JavaVirtualMachines",
] as const;

/* ---- 模块三常量：Minecraft 正版绑定与 MSA 认证链 ---- */

/** Minecraft 绑定文件（相对 IGM_LAUNCHER_DATA_ROOT，整体加密后落盘） */
export const IGM_LAUNCHER_MC_BINDINGS_FILE = "account/mc_bindings.json";

/** 令牌保险库密钥文件（DPAPI 不可用时的回退加密所用设备密钥） */
export const IGM_LAUNCHER_TOKEN_VAULT_KEY_FILE = "account/vault.key";

/** MSA Client ID 环境变量名（Azure 应用，需提交 Minecraft 官方审批） */
export const IGM_LAUNCHER_MSA_CLIENT_ID_ENV = "IGM_MSA_CLIENT_ID";

/**
 * 内置默认 MSA Client ID（Azure 应用的公开客户端标识）。
 *
 * 为什么必须内置：打包分发后主进程的工作目录是安装目录，仓库内的 .env.local
 * 不会随应用一起分发，仅依赖环境变量会导致安装版「未配置 IGM_MSA_CLIENT_ID」，
 * 正版验证完全不可用。
 *
 * 安全性说明：本应用是「公共客户端」（设备代码流与 PKCE，均不使用客户端密钥），
 * 该标识不是机密，微软官方示例同样明文分发；可用 IGM_MSA_CLIENT_ID 环境变量覆盖。
 */
export const IGM_LAUNCHER_MSA_DEFAULT_CLIENT_ID = "d35adfb9-6158-4875-aa4a-dfd42402dbc5";

/** 重定向 URI 环境变量名（浏览器授权流程的本地回调地址） */
export const IGM_LAUNCHER_MSA_REDIRECT_URI_ENV = "IGM_MSA_REDIRECT_URI";

/** 默认重定向 URI（Azure 本地回调约定端口） */
export const IGM_LAUNCHER_MSA_DEFAULT_REDIRECT_URI = "http://localhost:38271/callback";

/** 授权范围：Xbox Live 登录 + 长期刷新 */
export const IGM_LAUNCHER_MSA_SCOPE = "XboxLive.signin offline_access";

/** 微软消费者租户端点（个人账户） */
export const IGM_LAUNCHER_MSA_TENANT = "consumers";

/** MSA / Xbox / Minecraft 认证链端点（全部 HTTPS） */
export const IGM_LAUNCHER_MSA_ENDPOINTS = {
  /** 设备代码申请 */
  deviceCode: `https://login.microsoftonline.com/${IGM_LAUNCHER_MSA_TENANT}/oauth2/v2.0/devicecode`,
  /** 令牌换取与刷新 */
  token: `https://login.microsoftonline.com/${IGM_LAUNCHER_MSA_TENANT}/oauth2/v2.0/token`,
  /** 浏览器授权页（Authorization Code + PKCE） */
  authorize: `https://login.microsoftonline.com/${IGM_LAUNCHER_MSA_TENANT}/oauth2/v2.0/authorize`,
  /** Xbox Live 用户认证 */
  xboxLive: "https://user.auth.xboxlive.com/user/authenticate",
  /** XSTS 授权 */
  xsts: "https://xsts.auth.xboxlive.com/xsts/authorize",
  /** Minecraft 登录（XBL3.0 identityToken 换取 MC 令牌） */
  minecraftLogin: "https://api.minecraftservices.com/authentication/login_with_xbox",
  /** Minecraft 玩家档案 */
  minecraftProfile: "https://api.minecraftservices.com/minecraft/profile",
  /** Minecraft 拥有权（Java 版） */
  minecraftEntitlements: "https://api.minecraftservices.com/entitlements/mcstore",
} as const;

/** 认证链调用超时（毫秒），微软与 Minecraft 服务偶有抖动，故略长于主站接口 */
export const IGM_LAUNCHER_MSA_TIMEOUT_MS = 12000;

/** 认证链阶段顺序（界面按此顺序展示进度） */
export const IGM_LAUNCHER_MC_AUTH_STAGES: readonly iGM_Launcher_McAuthStage[] = [
  "msa",
  "xbox",
  "xsts",
  "minecraft",
  "profile",
  "entitlements",
] as const;

/**
 * XSTS 常见错误码到界面提示键的映射（第十节）。
 * 未列出的错误码返回 null，由调用方回退到通用失败提示。
 */
export const IGM_LAUNCHER_XSTS_ERROR_KEYS: Record<number, string> = {
  /** 账号已被 Xbox Live 封禁 */
  2148916227: "xstsBanned",
  /** 该微软账号尚未创建 Xbox 账号 */
  2148916233: "xstsNoXboxAccount",
  /** 该地区不支持 Xbox Live */
  2148916235: "xstsUnavailable",
  /** 需要完成年龄验证（成人确认） */
  2148916236: "xstsAgeVerification",
  /** 儿童账号需要加入家庭组 */
  2148916237: "xstsChildAccount",
} as const;

/** Minecraft 拥有权错误码（自定义，区别于微软与 HTTP 状态码） */
export const IGM_LAUNCHER_MC_NOT_OWNED = 4001;

/** 桥接层：认证流程编号不存在或已过期 */
export const IGM_LAUNCHER_MC_FLOW_EXPIRED = 4002;

/** 桥接层：未配置 IGM_MSA_CLIENT_ID，真实微软链路不可用，绑定一律拒绝 */
export const IGM_LAUNCHER_MC_CLIENT_ID_MISSING = 4003;

/* ---- 模块五常量：离线游戏 / 游戏目录扫描 / 版本库同步 ---- */

/** 离线模式默认游戏内名称（Minecraft 用户名须为 ASCII，故不随界面语言变化） */
export const IGM_LAUNCHER_OFFLINE_DEFAULT_NAME = "Player";

/** 已识别游戏目录文件（相对 IGM_LAUNCHER_DATA_ROOT） */
export const IGM_LAUNCHER_GAME_DIRS_FILE = "minecraft/game_dirs.json";

/** 版本库本地缓存文件（相对 IGM_LAUNCHER_DATA_ROOT） */
export const IGM_LAUNCHER_VERSION_LIBRARY_FILE = "minecraft/version_library.json";

/**
 * 主站版本资料库接口路径。
 * 主站路由统一使用 G_Xxxxx 命名，本体版本列表实际路径为 /G_Minecraft/versions，
 * 因此启动器按真实路径调用（不使用 /api/ 前缀）。
 */
export const IGM_LAUNCHER_API_MC_VERSIONS_PATH = "/G_Minecraft/versions";

/** 版本库单页拉取条数（一次拉全量，便于按年份分组展示） */
export const IGM_LAUNCHER_VERSION_LIBRARY_PAGE_SIZE = 500;

/** 版本库自动定时同步间隔（毫秒），默认 6 小时 */
export const IGM_LAUNCHER_VERSION_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** 版本库缓存视为过期的时间（毫秒），首帧超过该时长则后台自动同步 */
export const IGM_LAUNCHER_VERSION_SYNC_STALE_MS = 60 * 60 * 1000;

/** 游戏目录扫描时跳过的目录名（避免遍历缓存与日志） */
export const IGM_LAUNCHER_GAME_DIR_SKIP_NAMES: readonly string[] = [
  "crash-reports",
  "logs",
  "screenshots",
  "saves",
] as const;

/* ---- 模块六常量：下载安装位置与实例创建联动 ---- */

/** 共享根目录（.minecraft 根）的目录名，系统默认候选均以其结尾 */
export const IGM_LAUNCHER_MC_ROOT_DIR_NAME = ".minecraft";

/** 实例隔离目录名：实例 gameDir 统一位于 <根目录>/instances/<实例名> */
export const IGM_LAUNCHER_INSTANCES_DIR_NAME = "instances";

/**
 * 下载安装后共享的目录（所有实例共用同一份，只存一份，不重复下载）。
 * 与 versions/ 共同构成官方目录结构。
 */
export const IGM_LAUNCHER_SHARED_SUBDIRS: readonly string[] = [
  "versions",
  "libraries",
  "assets",
] as const;

/** 每个实例独立持有的子目录（通过 --gameDir 指向，避免模组与存档冲突） */
export const IGM_LAUNCHER_INSTANCE_SUBDIRS: readonly string[] = [
  "mods",
  "config",
  "saves",
  "resourcepacks",
  "shaderpacks",
] as const;

/** 实例名长度上限（含扩展名前的文件名长度，兼顾 Windows 路径限制） */
export const IGM_LAUNCHER_INSTANCE_NAME_MAX_LEN = 48;

/**
 * 实例名允许的字符：字母数字、中文、下划线、连字符、点与空格。
 * 点号必须允许：默认建议名即 <版本>-<加载器>（如 1.20.1-fabric），版本号本身含点。
 */
export const IGM_LAUNCHER_INSTANCE_NAME_PATTERN = /^[\w\u4e00-\u9fa5 .-]+$/;

/**
 * 实例版本下拉中「未安装版本」灰显的最大条数（按版本号倒序取最新若干条），
 * 避免一次渲染上千条禁用项拖慢下拉；其余未安装版本统一走「前往下载」入口。
 */
export const IGM_LAUNCHER_INSTANCE_VERSION_OPTION_LIMIT = 60;

/* ---- 模块七：真实下载安装 ---- */

/** Mojang 官方版本清单（与官网启动器同源，piston-meta 镜像） */
export const IGM_LAUNCHER_MOJANG_MANIFEST_URL =
  "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

/** Minecraft 资源对象 CDN 前缀：<前缀>/<sha1 前两位>/<sha1> */
export const IGM_LAUNCHER_ASSET_BASE_URL = "https://resources.download.minecraft.net";

/** Fabric 官方元数据接口前缀（加载器列表与加载器 profile） */
export const IGM_LAUNCHER_FABRIC_META_URL = "https://meta.fabricmc.net/v2";

/** 下载并发数：资源对象数量多，采用小并发避免被识别为异常流量 */
export const IGM_LAUNCHER_DOWNLOAD_CONCURRENCY = 16;

/** 单个文件的下载重试次数（网络抖动时按指数退避重试） */
export const IGM_LAUNCHER_DOWNLOAD_RETRY = 3;

/** 网络请求超时（毫秒） */
export const IGM_LAUNCHER_DOWNLOAD_TIMEOUT_MS = 30_000;

/**
 * 版本目录名：原版取版本号，加载器取 <版本号>-<加载器>。
 * 与模块六的目录规则一致（1.20.1 与 1.20.1-fabric 各自独立，共享 libraries 与 assets）。
 */
export function iGM_Launcher_VersionDirName(
  version: string,
  loader: iGM_Launcher_LoaderType,
): string {
  const trimmed = version.trim();
  return loader === "vanilla" ? trimmed : `${trimmed}-${loader}`;
}

/* ---- 模块八：离线启动 ---- */

/** 实例 natives 解压目录名（位于实例 gameDir 下，作为 -Djava.library.path） */
export const IGM_LAUNCHER_LAUNCH_NATIVES_DIR_NAME = "natives";

/** 游戏输出日志文件（相对实例 gameDir） */
export const IGM_LAUNCHER_LAUNCH_LOG_RELATIVE = "logs/iGM_Launcher_Launch.log";

/** 启动时注入的 user_type 取值（离线会话沿用官方 legacy 形态） */
export const IGM_LAUNCHER_LAUNCH_USER_TYPE = "legacy";

/** 正版启动时注入的 user_type 取值（微软账号会话） */
export const IGM_LAUNCHER_LAUNCH_USER_TYPE_OFFICIAL = "msa";

/**
 * 离线启动使用的角色名兜底：Minecraft 用户名只接受 3-16 位 ASCII 字母数字与下划线，
 * 故对离线名与社区用户名统一做安全过滤，过滤后长度不足时回退默认名 Player。
 */
export function iGM_Launcher_SafePlayerName(raw: string): string {
  const cleaned = (raw ?? "").replace(/[^0-9A-Za-z_]/g, "").slice(0, 16);
  return cleaned.length >= 3 ? cleaned : IGM_LAUNCHER_OFFLINE_DEFAULT_NAME;
}

/* ---- 模块二十常量：第三方资源（Modrinth / Fabric） ---- */

/**
 * 第三方资源接口前缀。
 * 主站路由统一使用 G_Xxxxx 命名，第三方资源接口实际路径为 /G_ThirdParty，
 * 因此启动器按真实路径调用（不使用 /api/ 前缀）。
 */
export const IGM_LAUNCHER_API_THIRD_PARTY_PATH = "/G_ThirdParty";

/** 第三方资源类型筛选项（标签由界面 i18n 提供，此处只声明取值顺序） */
export const IGM_LAUNCHER_THIRD_PARTY_TYPES: readonly iGM_Launcher_ThirdPartyResourceType[] = [
  "mod",
  "shader",
  "resourcepack",
  "map",
  "datapack",
] as const;

/** 第三方资源搜索默认分页条数 */
export const IGM_LAUNCHER_THIRD_PARTY_PAGE_SIZE = 20;

/** 第三方下载任务列表轮询间隔（毫秒），仅在有进行中任务时轮询 */
export const IGM_LAUNCHER_THIRD_PARTY_POLL_MS = 1000;

/** 第三方下载任务处于进行中的状态集合（界面据此决定是否轮询） */
export const IGM_LAUNCHER_THIRD_PARTY_ACTIVE_STATUS: readonly iGM_Launcher_ThirdPartyTaskStatus[] =
  ["pending", "downloading"] as const;

/**
 * 资源类型 -> 实例内目标子目录名。
 * 供「安装到实例」的提示文案使用：mods / shaderpacks / resourcepacks / saves / datapacks，
 * 与 IGM_LAUNCHER_INSTANCE_SUBDIRS 的目录规则保持一致。
 */
export const IGM_LAUNCHER_THIRD_PARTY_INSTANCE_SUBDIRS: Record<
  iGM_Launcher_ThirdPartyResourceType,
  string
> = {
  mod: "mods",
  shader: "shaderpacks",
  resourcepack: "resourcepacks",
  map: "saves",
  datapack: "datapacks",
};

// 核心逻辑（模块二纯函数：Bun 桥接层与界面本地回退共用） //

/** 生成短标识（实例 / Java 运行时 / 令牌使用） */
export function iGM_Launcher_NewId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** 名称转目录片段：仅保留字母数字与连字符，避免非法路径字符 */
export function iGM_Launcher_Slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug.slice(0, 40) : "instance";
}

/**
 * 由表单入参构造实例记录：
 * 目录留空时按名称生成默认隔离目录 data/instances/<slug>-<短标识>，
 * 短标识取自新实例 id，保证复制出的副本与原实例目录不冲突。
 */
export function iGM_Launcher_BuildInstanceRecord(
  input: iGM_Launcher_InstanceInput,
  now: string = new Date().toISOString(),
): iGM_Launcher_InstanceRecord {
  const id = iGM_Launcher_NewId("inst");
  return {
    ...input,
    id,
    directory:
      input.directory && input.directory.trim().length > 0
        ? input.directory
        : `${IGM_LAUNCHER_DATA_ROOT}/instances/${iGM_Launcher_Slugify(input.name)}-${id.replace(
            /^inst-/,
            "",
          )}`,
    createdAt: now,
    updatedAt: now,
    lastPlayedAt: null,
  };
}

/** 未登录的初始会话（离线模式，未登录也可使用启动器） */
export function iGM_Launcher_CreateGuestSession(): iGM_Launcher_AccountSession {
  return {
    signedIn: false,
    offline: true,
    userName: "",
    uid: "",
    email: "",
    role: "",
    registeredAt: "",
    orgs: [],
    token: "",
    // 离线角色：本地生成 UUID，与正版绑定 UUID 区分
    offlineUuid: iGM_Launcher_MakeOfflineUuid(),
    offlineName: IGM_LAUNCHER_OFFLINE_DEFAULT_NAME,
    avatar: "",
  };
}

/**
 * 生成离线角色 UUID。
 * 采用标准 8-4-4-4-12 小写十六进制格式，第 3 组首位固定为 3（name-based），
 * 与微软正版账号的 v4 UUID 形态可区分；随机源为浏览器 / Bun 通用的 crypto。
 */
export function iGM_Launcher_MakeOfflineUuid(): string {
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  // 版本位固定为 3（name-based），变体位固定为 6 个合法取值之一
  bytes[6] = (bytes[6] & 0x0f) | 0x30;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20)}`;
}

/**
 * 把主站用户 DTO 映射为启动器账户会话。
 * iGMUid、用户名、邮箱、角色、注册时间与组织认证全部取自主站返回值，
 * 保证启动器展示的 iGMUid 与官网完全一致（不再由邮箱推导）。
 */
export function iGM_Launcher_MapSiteUser(
  user: iGM_Launcher_SiteUser,
  cookie: string,
): iGM_Launcher_AccountSession {
  const slug = user.verifiedOrg?.slug;
  const orgs: iGM_Launcher_AccountOrg[] =
    slug === "igcraftlit" || slug === "muoceon" ? [slug] : [];
  return {
    signedIn: true,
    offline: false,
    userName: user.username,
    uid: user.uid,
    email: user.email,
    role: user.role,
    registeredAt: user.createdAt,
    orgs,
    token: cookie,
    // 已登录：正版身份走绑定记录，离线角色字段留空以示区分
    offlineUuid: "",
    offlineName: "",
    // 头像取自主站用户数据，未设置为空串（界面回退为图标占位）
    avatar: typeof user.avatar === "string" ? user.avatar : "",
  };
}

// 核心逻辑（模块五纯函数：Bun 桥接层与界面共用） //

/** 空版本库快照（无缓存且未同步时使用），避免各处重复构造字面量 */
export function iGM_Launcher_EmptyVersionLibrary(): iGM_Launcher_VersionLibrary {
  return { entries: [], syncedAt: null, source: "empty", total: 0 };
}

/** 归一化主站版本类型取值，未收录时返回 unknown */
export function iGM_Launcher_NormalizeVersionType(raw: unknown): iGM_Launcher_VersionType {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (
    value === "release" ||
    value === "snapshot" ||
    value === "old_beta" ||
    value === "old_alpha"
  ) {
    return value;
  }
  return "unknown";
}

/**
 * 从版本目录名与版本 json 推断加载器：
 * 目录名含 fabric 或 json 带 inheritsFrom 时判为 Fabric（本模块只支持原版与 Fabric），
 * 其余一律归为 vanilla。
 */
export function iGM_Launcher_DetectLoader(
  dirName: string,
  inheritsFrom: string | null,
): { loader: iGM_Launcher_LoaderType; loaderVersion: string } {
  const lower = dirName.toLowerCase();
  if (lower.includes("fabric") || Boolean(inheritsFrom)) {
    return { loader: "fabric", loaderVersion: iGM_Launcher_ExtractLoaderVersion(dirName) };
  }
  return { loader: "vanilla", loaderVersion: "" };
}

/**
 * 从 Fabric 版本目录名提取加载器版本，如 1.20.1-fabric0.16.9 -> 0.16.9；
 * 无法识别时返回空串。
 */
export function iGM_Launcher_ExtractLoaderVersion(dirName: string): string {
  const matched =
    dirName.match(/fabric[-_]?loader[-_]?(\d+[.\d]*)/i) ?? dirName.match(/fabric[-_]?(\d+[.\d]*)/i);
  return matched ? matched[1] : "";
}

/**
 * 从版本 json 的 libraries 中提取 Fabric 加载器版本。
 * 实例目录名统一为 <版本>-<加载器>（如 1.20.1-fabric，不含加载器版本），
 * 目录名推断此时失效，故以 libraries 中 net.fabricmc:fabric-loader:<版本> 为准；
 * 未命中时返回空串，由调用方保留原值。
 */
export function iGM_Launcher_ExtractFabricLoaderVersion(libraries: unknown): string {
  if (!Array.isArray(libraries)) return "";
  for (const entry of libraries) {
    if (!entry || typeof entry !== "object") continue;
    const name = (entry as { name?: unknown }).name;
    if (typeof name !== "string") continue;
    const matched = name.match(/^net\.fabricmc:fabric-loader:([^:@]+)/i);
    if (matched) return matched[1];
  }
  return "";
}

/**
 * 版本库条目按年份分组（年份倒序、组内版本号倒序），与网站版本资料库排版一致。
 * 无发布时间的历史版本统一归入「未知」分组并排在末尾。
 */
export function iGM_Launcher_GroupVersionsByYear(
  entries: iGM_Launcher_VersionLibraryEntry[],
): { year: string; entries: iGM_Launcher_VersionLibraryEntry[] }[] {
  const groups = new Map<string, iGM_Launcher_VersionLibraryEntry[]>();
  for (const entry of entries) {
    const year = entry.releaseTime ? entry.releaseTime.slice(0, 4) : "—";
    const bucket = groups.get(year);
    if (bucket) bucket.push(entry);
    else groups.set(year, [entry]);
  }
  return Array.from(groups.entries())
    .map(([year, items]) => ({
      year,
      entries: [...items].sort((a, b) => b.version.localeCompare(a.version, "en")),
    }))
    .sort((a, b) => b.year.localeCompare(a.year, "en"));
}

/**
 * 格式化字节数为可读体积；null 表示尚未计算，返回空串由界面显示占位文案。
 */
export function iGM_Launcher_FormatSize(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 100 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

// 核心逻辑（模块六纯函数：Bun 桥接层与界面共用） //

/** 跨平台拼接路径片段（统一使用正斜杠，兼容浏览器与主进程） */
export function iGM_Launcher_JoinPath(...segments: string[]): string {
  const parts: string[] = [];
  for (const segment of segments) {
    const trimmed = segment.trim().replace(/[\\/]+$/, "");
    if (trimmed) parts.push(trimmed);
  }
  return parts.join("/");
}

/**
 * 本机常见 Minecraft 根目录候选（按平台给出官方启动器默认位置）。
 * 纯函数形式便于主进程与浏览器回退层共用，路径统一使用正斜杠。
 */
export function iGM_Launcher_DefaultRootDirCandidates(
  platform: string,
  appData: string | undefined,
  home: string,
): string[] {
  if (platform === "win32") {
    const base = appData?.trim();
    return base ? [iGM_Launcher_JoinPath(base, IGM_LAUNCHER_MC_ROOT_DIR_NAME)] : [];
  }
  if (platform === "darwin") {
    return [iGM_Launcher_JoinPath(home, "Library", "Application Support", "minecraft")];
  }
  return [iGM_Launcher_JoinPath(home, IGM_LAUNCHER_MC_ROOT_DIR_NAME)];
}

/** 实例 gameDir：<根目录>/instances/<实例名> */
export function iGM_Launcher_BuildGameDir(rootDir: string, instanceName: string): string {
  return iGM_Launcher_JoinPath(rootDir, IGM_LAUNCHER_INSTANCES_DIR_NAME, instanceName.trim());
}

/**
 * 由实例 gameDir 反推共享根目录。
 * gameDir 形如 <根目录>/instances/<实例名> 时返回根目录，否则返回 null
 * （旧结构或手工指定的目录不做猜测，交由调用方回退到当前根目录）。
 */
export function iGM_Launcher_RootDirOfInstance(gameDir: string): string | null {
  const normalized = gameDir.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  const marker = `/${IGM_LAUNCHER_INSTANCES_DIR_NAME}/`;
  const index = normalized.lastIndexOf(marker);
  if (index <= 0) return null;
  return normalized.slice(0, index);
}

/**
 * 由用户选择的前置目录解析共享 .minecraft 根目录。
 * 目录规则要求游戏目录固定为 <前置目录>/.minecraft：用户可把前置目录放在任意磁盘
 * （不限于系统盘），此处统一补齐 .minecraft 段；已以 .minecraft 结尾时保持原样，
 * 保证同一路径反复解析结果一致（幂等）。
 */
export function iGM_Launcher_McRootOfParent(parentDir: string): string {
  const normalized = parentDir.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (!normalized) return "";
  const segment = normalized.slice(normalized.lastIndexOf("/") + 1);
  if (segment.toLowerCase() === IGM_LAUNCHER_MC_ROOT_DIR_NAME) return normalized;
  return iGM_Launcher_JoinPath(normalized, IGM_LAUNCHER_MC_ROOT_DIR_NAME);
}

/**
 * 由共享 .minecraft 根目录反推前置目录，供界面把输入框回填为「前置目录」，
 * 与 iGM_Launcher_McRootOfParent 互为逆运算。根目录不以 .minecraft 结尾
 * （用户自定义命名）时原样返回，避免丢失用户输入。
 */
export function iGM_Launcher_McParentOfRoot(rootDir: string): string {
  const normalized = rootDir.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (!normalized) return "";
  const index = normalized.lastIndexOf("/");
  const segment = index >= 0 ? normalized.slice(index + 1) : normalized;
  if (segment.toLowerCase() !== IGM_LAUNCHER_MC_ROOT_DIR_NAME) return normalized;
  if (index < 0) return "";
  const parent = normalized.slice(0, index);
  // 盘符根（C:/.minecraft）反推为 C:/，其余直接返回父级
  return parent.length === 2 && parent.endsWith(":") ? `${parent}/` : parent;
}

/**
 * 校验实例名：非空、字符合法、长度合规且不与既有实例重名。
 * existingNames 传入除自身以外的实例名集合（编辑时需排除当前实例）。
 */
export function iGM_Launcher_CheckInstanceName(
  name: string,
  existingNames: readonly string[],
): iGM_Launcher_InstanceNameCheck {
  const trimmed = name.trim();
  if (!trimmed) return { valid: false, reason: "empty" };
  if (
    trimmed.length > IGM_LAUNCHER_INSTANCE_NAME_MAX_LEN ||
    !IGM_LAUNCHER_INSTANCE_NAME_PATTERN.test(trimmed)
  ) {
    return { valid: false, reason: "invalid" };
  }
  const lower = trimmed.toLowerCase();
  if (existingNames.some((item) => item.trim().toLowerCase() === lower)) {
    return { valid: false, reason: "duplicate" };
  }
  return { valid: true, reason: "ok" };
}

/** 实例名默认建议：<版本>-<加载器>，原版仅保留版本号 */
export function iGM_Launcher_SuggestInstanceName(
  version: string,
  loader: iGM_Launcher_LoaderType,
): string {
  const trimmed = version.trim();
  if (!trimmed) return "";
  return loader === "vanilla" ? trimmed : `${trimmed}-${loader}`;
}

/**
 * 聚合已安装加载器：由已安装版本列表统计各加载器的版本数与加载器版本，
 * 结果按 IGM_LAUNCHER_LOADER_OPTIONS 的固定顺序排列，便于界面稳定展示。
 */
export function iGM_Launcher_AggregateInstalledLoaders(
  versions: readonly iGM_Launcher_ScannedVersion[],
): iGM_Launcher_InstalledLoader[] {
  const grouped = new Map<iGM_Launcher_LoaderType, { count: number; loaderVersions: Set<string> }>();
  for (const version of versions) {
    const bucket = grouped.get(version.loader) ?? { count: 0, loaderVersions: new Set<string>() };
    bucket.count += 1;
    if (version.loaderVersion) bucket.loaderVersions.add(version.loaderVersion);
    grouped.set(version.loader, bucket);
  }
  return IGM_LAUNCHER_LOADER_OPTIONS.map((option) => option.value)
    .filter((loader) => grouped.has(loader))
    .map((loader) => {
      const bucket = grouped.get(loader)!;
      return {
        loader,
        count: bucket.count,
        loaderVersions: Array.from(bucket.loaderVersions).sort((a, b) =>
          b.localeCompare(a, "en"),
        ),
      };
    });
}

// 核心逻辑（模块三纯函数：Bun 桥接层与界面本地回退共用） //

/**
 * 把 32 位无连字符 UUID 规范化为标准带连字符形式；
 * 已是标准形式或长度不符时原样返回，避免破坏服务端返回值。
 */
export function iGM_Launcher_FormatUuid(raw: string): string {
  const value = (raw ?? "").trim();
  if (value.length !== 32) return value;
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(
    16,
    20,
  )}-${value.slice(20)}`;
}

/** XSTS 错误码 -> 界面提示键；未收录时返回 null */
export function iGM_Launcher_MapXstsErrorKey(code: number): string | null {
  return IGM_LAUNCHER_XSTS_ERROR_KEYS[code] ?? null;
}

/**
 * 归一化绑定列表的默认标记：确保同一社区账号下最多一个默认绑定，
 * 并保证至少有一个默认（列表非空时把首个置为默认）。
 */
export function iGM_Launcher_NormalizeDefaultBinding(
  bindings: iGM_Launcher_MCBinding[],
  preferredId?: string,
): iGM_Launcher_MCBinding[] {
  if (bindings.length === 0) return bindings;

  const targetId =
    preferredId && bindings.some((item) => item.id === preferredId)
      ? preferredId
      : (bindings.find((item) => item.isDefault)?.id ?? bindings[0].id);

  return bindings.map((item) => ({
    ...item,
    isDefault: item.id === targetId,
  }));
}

// 导出 //
export default {};
