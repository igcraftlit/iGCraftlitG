/**
 * 文件路径：apps/shell/src/iGM_LauncherV2_Constants.ts
 * 所属层：桌面外壳 / 常量层
 * 路由：全局
 * 模块：iGM_LauncherV2_Constants
 * 作用：外壳侧常量：应用元信息、窗口与资源目录、iGCraftLit 社区 OAuth 端点
 * 内容：版本号 26.4.0；界面开发地址 3211（避开旧启动器 3210 与主站 3000）；
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
export const IGM_LAUNCHERV2_VERSION = "26.4.0";

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

/** 本地数据目录名（位于系统用户主目录下） */
export const IGM_LAUNCHERV2_DATA_DIR_NAME = ".igm-craftceon-launcher-v2";

/** 社区账号令牌落盘文件名 */
export const IGM_LAUNCHERV2_AUTH_FILE = "auth.json";

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

/** 本地回调地址（与主站注册的回调地址保持一致） */
export const IGM_LAUNCHERV2_REDIRECT_URI = `http://localhost:${IGM_LAUNCHERV2_CALLBACK_PORT}${IGM_LAUNCHERV2_CALLBACK_PATH}`;

/** 等待浏览器完成授权的超时时间 */
export const IGM_LAUNCHERV2_AUTH_WAIT_MS = 5 * 60 * 1000;

/** Rust 核心 ping 响应超时时间 */
export const IGM_LAUNCHERV2_CORE_PING_TIMEOUT_MS = 4000;

// 导出 //
/* 常量均已在上方命名导出 */
