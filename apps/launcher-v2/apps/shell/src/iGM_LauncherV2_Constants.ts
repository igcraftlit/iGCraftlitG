/**
 * 文件路径：apps/shell/src/iGM_LauncherV2_Constants.ts
 * 所属层：桌面外壳 / 常量层
 * 路由：全局
 * 模块：iGM_LauncherV2_Constants
 * 作用：外壳侧常量：应用元信息、窗口与资源目录、iGCraftLit 社区 OAuth 端点
 * 内容：版本号 26.5.7；界面开发地址 3211（避开旧启动器 3210 与主站 3000）；
 *       社区 OAuth 端点默认取 api.igcraftlit.com，可用
 *       IGM_LAUNCHER_V2_COMMUNITY_ISSUER 覆盖以便本地联调
 * 说明：桌面端为公开客户端，本文件与 .env 均不得出现 client_secret
 */

// 导入依赖 //
import { iGM_LauncherV2_EnvGet } from "./iGM_LauncherV2_Env";

// 类型定义 //
/* （本文件仅导出常量） */

// 核心逻辑 //

/** 应用显示名称 */
export const IGM_LAUNCHERV2_APP_NAME = "iGM CraftCeon Launcher";

/** 应用版本号 */
export const IGM_LAUNCHERV2_VERSION = "26.5.7";

/** 应用反向域名标识 */
export const IGM_LAUNCHERV2_IDENTIFIER = "com.igcraftlit.launcher.v2";

/** 原生窗口标题 */
export const IGM_LAUNCHERV2_APP_TITLE = `${IGM_LAUNCHERV2_APP_NAME} ${IGM_LAUNCHERV2_VERSION}`;

/** 默认窗口尺寸（最小尺寸由界面层 CSS 兜底，Electrobun 2.0.1 无 minWidth/minHeight 字段） */
export const IGM_LAUNCHERV2_WINDOW_SIZE = {
  width: 1180,
  height: 760,
} as const;

/** 界面开发服务器地址（需显式设置 IGM_LAUNCHER_V2_DEV=1 启用） */
export const IGM_LAUNCHERV2_DEV_URL = "http://localhost:3211";

/** 打包模式下静态界面入口（build.copy 将 launcher 目录映射为 views://launcher） */
export const IGM_LAUNCHERV2_PACKAGED_ENTRY = "views://launcher/index.html";

/** 打包模式下的安装向导入口（首次运行且未标记安装完成时加载） */
export const IGM_LAUNCHERV2_PACKAGED_INSTALLER_ENTRY = "views://launcher/G_Installer.html";

/** 安装完成标记文件名（写入本地数据目录，存在即视为已安装，跳过安装向导） */
export const IGM_LAUNCHERV2_INSTALL_FLAG_FILE = "iGM_LauncherV2_Installed.flag";

/** 账号会话落盘文件名（位于 launcher_data 内） */
export const IGM_LAUNCHERV2_AUTH_FILE = "accounts.json";

/* ---- 游客（未登录社区账号）模式限制 ---- */

/**
 * 游客可创建的本地视界上限。
 * 达到上限后再创建视界会被拒绝，并提示登录社区账号解除限制。
 */
export const IGM_LAUNCHERV2_GUEST_HORIZON_LIMIT = 2;

/* ---- iGCraftLit 社区 OAuth（OAuth 2.0 + OpenID Connect，公开客户端 PKCE） ---- */

/** 社区签发方：线路上后端位于 api.igcraftlit.com，可用环境变量覆盖便于本地联调 */
export const IGM_LAUNCHERV2_COMMUNITY_ISSUER =
  iGM_LauncherV2_EnvGet("IGM_LAUNCHER_V2_COMMUNITY_ISSUER") ?? "https://api.igcraftlit.com";

/** 授权端点 */
export const IGM_LAUNCHERV2_COMMUNITY_AUTHORIZE_URL = `${IGM_LAUNCHERV2_COMMUNITY_ISSUER}/oauth/authorize`;

/** 令牌端点 */
export const IGM_LAUNCHERV2_COMMUNITY_TOKEN_URL = `${IGM_LAUNCHERV2_COMMUNITY_ISSUER}/oauth/token`;

/** 用户信息端点（Bearer） */
export const IGM_LAUNCHERV2_COMMUNITY_USERINFO_URL = `${IGM_LAUNCHERV2_COMMUNITY_ISSUER}/oauth/userinfo`;

/** 请求的 scope：openid 提供 sub（社区 UID），profile 提供昵称与头像 */
export const IGM_LAUNCHERV2_COMMUNITY_SCOPE = "openid profile";

/** 社区应用 client_id 的 .env 键名 */
export const IGM_LAUNCHERV2_ENV_CLIENT_ID = "IGCRAFTLIT_CLIENT_ID";

/** 本地回调监听端口与路径 */
export const IGM_LAUNCHERV2_CALLBACK_PORT = 8080;
export const IGM_LAUNCHERV2_CALLBACK_PATH = "/callback";

/**
 * 本地回调监听主机列表（双栈）。
 * 浏览器访问 http://localhost:8080/callback 时，部分系统解析为 IPv6 回环 ::1，
 * 若只绑 IPv4 的 127.0.0.1 就会出现「拒绝连接」；
 * 因此同时绑定 IPv4 与 IPv6 回环，任一形式都能访问。
 */
export const IGM_LAUNCHERV2_CALLBACK_HOSTS = ["127.0.0.1", "::1"] as const;

/** 本地回调地址（与主站注册的回调地址保持一致） */
export const IGM_LAUNCHERV2_REDIRECT_URI = `http://localhost:${IGM_LAUNCHERV2_CALLBACK_PORT}${IGM_LAUNCHERV2_CALLBACK_PATH}`;

/** 等待浏览器完成授权的超时时间 */
export const IGM_LAUNCHERV2_AUTH_WAIT_MS = 5 * 60 * 1000;

/** Rust 核心 ping 响应超时时间 */
export const IGM_LAUNCHERV2_CORE_PING_TIMEOUT_MS = 4000;

/* ---- 本地账号数据文件名（均位于用户主目录数据目录内） ---- */

/** Java 环境列表文件 */
export const IGM_LAUNCHERV2_JAVA_FILE = "java.json";

/** 离线账号列表文件 */
export const IGM_LAUNCHERV2_OFFLINE_FILE = "offline.json";

/** 微软正版账号文件（含刷新令牌，权限 0600） */
export const IGM_LAUNCHERV2_MICROSOFT_FILE = "microsoft.json";

/** 皮肤库目录名（位于数据目录下；离线账号应用后的皮肤亦写入该目录） */
export const IGM_LAUNCHERV2_SKINS_DIR_NAME = "skins";

/** 皮肤库索引文件名（位于皮肤库目录内） */
export const IGM_LAUNCHERV2_SKINS_INDEX_FILE = "index.json";

/** Java 版本探测命令超时时间 */
export const IGM_LAUNCHERV2_JAVA_PROBE_TIMEOUT_MS = 6000;

/* ---- 社区站点（用于“更换头像”跳转社区资料设置页） ---- */

/** 社区站点根地址（可用环境变量覆盖） */
export const IGM_LAUNCHERV2_COMMUNITY_WEB =
  iGM_LauncherV2_EnvGet("IGM_LAUNCHER_V2_COMMUNITY_WEB") ?? "https://igcraftlit.com";

/**
 * 社区个人资料设置路径（头像在此修改，改完返回启动器即可重新同步）。
 * 主站为多语言静态站点，路由位于语言段之下，故需带默认语言前缀。
 */
export const IGM_LAUNCHERV2_COMMUNITY_PROFILE_PATH = "/zh-CN/G_UserSettings";

/* ---- 微软正版验证（OAuth 2.0 设备代码流，公开客户端） ---- */

/**
 * 微软应用 client_id（公开标识，随包分发，非机密）。
 * 默认值与 Azure 应用注册及 .env 一致，缺失时也能直接完成微软正版验证。
 */
export const IGM_LAUNCHERV2_MSA_CLIENT_ID =
  iGM_LauncherV2_EnvGet("MSA_CLIENT_ID") ?? "d35adfb9-6158-4875-aa4a-dfd42402dbc5";

/** 微软租户：consumers 表示仅个人微软账号 */
export const IGM_LAUNCHERV2_MSA_TENANT = iGM_LauncherV2_EnvGet("MSA_TENANT") ?? "consumers";

/** 微软授权 scope：XboxLive.signin 提供 Xbox 登录，offline_access 提供刷新令牌 */
export const IGM_LAUNCHERV2_MSA_SCOPE =
  iGM_LauncherV2_EnvGet("MSA_SCOPE") ?? "XboxLive.signin offline_access";

/**
 * 微软 OAuth 端点基址。
 * 设备代码流不使用 redirect_uri，故无需在 Azure 注册回调地址，
 * 桌面端只依赖「设备代码 + 轮询换取令牌」两步。
 */
const IGM_LAUNCHERV2_MSA_BASE = `https://login.microsoftonline.com/${IGM_LAUNCHERV2_MSA_TENANT}/oauth2/v2.0`;

/** 设备代码端点（申请 user_code 与验证链接） */
export const IGM_LAUNCHERV2_MSA_DEVICE_CODE_URL = `${IGM_LAUNCHERV2_MSA_BASE}/devicecode`;

/** 令牌端点（轮询换取访问令牌，亦用于刷新令牌） */
export const IGM_LAUNCHERV2_MSA_TOKEN_URL = `${IGM_LAUNCHERV2_MSA_BASE}/token`;

/** 设备代码流的授权类型 */
export const IGM_LAUNCHERV2_MSA_DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

/** 设备代码不可用时的兜底验证地址 */
export const IGM_LAUNCHERV2_MSA_FALLBACK_VERIFICATION_URI = "https://microsoft.com/link";

/** 首次轮询间隔（秒）与轮询上限（秒）：响应未给出 interval/expires_in 时使用 */
export const IGM_LAUNCHERV2_MSA_POLL_INTERVAL_SECONDS = 5;
export const IGM_LAUNCHERV2_MSA_DEVICE_EXPIRES_SECONDS = 900;

/* ---- 皮肤库（本地导入 + Mineskin 上传） ---- */

/** Mineskin 上传密钥的 .env 键名（按交付要求随包内置，见 SyncUi 白名单） */
export const IGM_LAUNCHERV2_MINESKIN_ENV_KEY = "MINESKIN_API_KEY";

/** Mineskin 皮肤上传端点（multipart 表单） */
export const IGM_LAUNCHERV2_MINESKIN_UPLOAD_URL = "https://api.mineskin.org/generate/upload";

/** 皮肤 PNG 允许的尺寸：64x64（含 Alex 变体）与 64x32（旧版经典皮肤） */
export const IGM_LAUNCHERV2_SKIN_SIZE_WIDTH = 64;
export const IGM_LAUNCHERV2_SKIN_HEIGHT_FULL = 64;
export const IGM_LAUNCHERV2_SKIN_HEIGHT_LEGACY = 32;

/** 皮肤缩略图尺寸（Minotar 头像请求使用） */
export const IGM_LAUNCHERV2_SKIN_THUMB_SIZE = 64;

/* ---- 正版档案（Mojang 会话服务） ---- */

/** Mojang 会话服务档案端点（返回 base64 编码的 textures 属性，无需鉴权） */
export const IGM_LAUNCHERV2_MOJANG_PROFILE_URL =
  "https://sessionserver.mojang.com/session/minecraft/profile";

/** 正版更换皮肤官网地址（界面「前往官网更换」按钮调起系统浏览器） */
export const IGM_LAUNCHERV2_MOJANG_SKIN_EDIT_URL =
  "https://www.minecraft.net/zh-hans/msaprofile/mygames/editskin";

/* ---- 资源市场（Modrinth / CurseForge 代理检索） ---- */

/** CurseForge API 密钥的 .env 键名（随包分发，见 SyncUi 白名单 IGM_ 前缀） */
export const IGM_LAUNCHERV2_CURSEFORGE_ENV_KEY = "IGM_CURSEFORGE_API_KEY";

/** Modrinth 搜索接口（免密钥） */
export const IGM_LAUNCHERV2_MODRINTH_SEARCH_URL = "https://api.modrinth.com/v2/search";

/** Modrinth 项目详情接口（按 id / slug 查询，含简介与版本） */
export const IGM_LAUNCHERV2_MODRINTH_PROJECT_URL = "https://api.modrinth.com/v2/project";

/** CurseForge 搜索接口（携带 x-api-key） */
export const IGM_LAUNCHERV2_CURSEFORGE_SEARCH_URL = "https://api.curseforge.com/v1/mods/search";

/** CurseForge 项目详情接口（按 modId 查询，含简介与最新文件） */
export const IGM_LAUNCHERV2_CURSEFORGE_MOD_URL = "https://api.curseforge.com/v1/mods";

/** 资源市场请求 UA：Modrinth 要求可识别的 User-Agent */
export const IGM_LAUNCHERV2_MARKET_USER_AGENT = `iGMLLauncher/${IGM_LAUNCHERV2_VERSION} (contact: igcraftlit@outlook.com)`;

/* ---- 启动器自动更新（静默检查 → 提示 → 后台下载 → 重启安装） ---- */

/**
 * 更新清单地址。
 * 该文件随下载站静态导出发布（含最新版本号、更新包直链、校验值与更新说明），
 * 启动器启动时静默请求一次，按版本号比较结果决定是否提示更新。
 */
export const IGM_LAUNCHERV2_UPDATE_MANIFEST_URL =
  iGM_LauncherV2_EnvGet("IGM_LAUNCHER_V2_UPDATE_MANIFEST_URL") ??
  "https://launcher.igcraftlit.com/release.json";

/** 更新包落盘目录名（位于 launcher_data 内） */
export const IGM_LAUNCHERV2_UPDATE_DIR_NAME = "update";

/** 更新清单请求超时（毫秒） */
export const IGM_LAUNCHERV2_UPDATE_TIMEOUT_MS = 12000;

// 导出 //
/* 常量均已在上方命名导出 */
