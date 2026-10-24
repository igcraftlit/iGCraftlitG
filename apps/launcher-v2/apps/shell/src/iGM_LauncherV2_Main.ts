/**
 * 文件路径：apps/shell/src/iGM_LauncherV2_Main.ts
 * 所属层：桌面外壳 / 主进程
 * 路由：全局
 * 模块：iGM_LauncherV2_Main
 * 作用：iGM CraftCeon Launcher 26.5.7 主进程入口（Electrobun + Bun）
 * 内容：创建无边框主窗口（界面自绘标题栏与窗口控制按钮）；
 *       开发模式加载 3211 端口 dev server，打包模式加载 views://launcher/index.html；
 *       经 host-message 承接界面指令：窗口控制、社区登录状态查询 / 发起授权 / 退出登录、
 *       Java 环境、微软正版、离线账号、皮肤库与正版档案、Rust 核心连通性探测；
 *       版本下载（含暂停 / 继续 / 取消与游戏运行限速联动）、资源市场检索与落盘模式选择、
 *       外观与主题自定义、启动器自动更新；
 *       服务器大厅（第三方公开列表 + 本地缓存 + 内置主流服 + 自定义服务器 + 一键进服 +
 *       「启动并同步」直连外部清单补齐 mods/config）、开服中心（扫描视界生成客户端清单）、
 *       首页新闻流（读取本地 news.json，缺失回退内置默认）；
 *       联机大厅（主站高速节点优先、不可用时降级公共联机节点，含房间创建 / 加入 / 退出）；
 *       本地开服运行（按核心从上游动态拉取全量版本目录、服务端进程启停与实时日志、
 *       就绪后解析局域网 IP 与端口、把客户端清单发布为局域网直链并回填同步大厅）；
 *       启动时静默恢复本地会话并静默检查更新；进程级异常兜底写入崩溃日志
 * 说明：主进程不持有任何界面渲染逻辑，也不向界面下发令牌，只下发登录状态与账号公开信息
 */

// 导入依赖 //
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { BrowserWindow, Utils } from "electrobun/main";
import {
  IGM_LAUNCHERV2_APP_TITLE,
  IGM_LAUNCHERV2_DEV_URL,
  IGM_LAUNCHERV2_GUEST_HORIZON_LIMIT,
  IGM_LAUNCHERV2_PACKAGED_ENTRY,
  IGM_LAUNCHERV2_PACKAGED_INSTALLER_ENTRY,
  IGM_LAUNCHERV2_WINDOW_SIZE,
} from "./iGM_LauncherV2_Constants";
import {
  iGM_LauncherV2_ParseHostMessage,
  iGM_LauncherV2_Pusher,
  type iGM_LauncherV2_InboundMessage,
  type iGM_LauncherV2_LocalServer,
  type iGM_LauncherV2_OfflineAccount,
  type iGM_LauncherV2_OutboundMessage,
} from "./iGM_LauncherV2_Ipc";
import {
  iGM_LauncherV2_Auth_CurrentUser,
  iGM_LauncherV2_Auth_Login,
  iGM_LauncherV2_Auth_Logout,
  iGM_LauncherV2_Auth_OpenProfilePage,
  iGM_LauncherV2_Auth_QuickLogin,
  iGM_LauncherV2_Auth_RememberedSnapshot,
  iGM_LauncherV2_Auth_Refresh,
  iGM_LauncherV2_Auth_Restore,
  iGM_LauncherV2_Auth_Snapshot,
  iGM_LauncherV2_OpenExternal,
} from "./iGM_LauncherV2_CommunityAuth";
import {
  iGM_LauncherV2_Java_Add,
  iGM_LauncherV2_Java_List,
  iGM_LauncherV2_Java_Remove,
  iGM_LauncherV2_Java_Scan,
  iGM_LauncherV2_Java_SetDefault,
  type iGM_LauncherV2_JavaListResult,
} from "./iGM_LauncherV2_Java";
import {
  iGM_LauncherV2_MsaCancel,
  iGM_LauncherV2_MsaLogin,
  iGM_LauncherV2_MsaLogout,
  iGM_LauncherV2_MsaOpenVerification,
  iGM_LauncherV2_MsaRestore,
  iGM_LauncherV2_MsaSnapshot,
} from "./iGM_LauncherV2_MicrosoftAuth";
import {
  iGM_LauncherV2_Offline_Add,
  iGM_LauncherV2_Offline_List,
  iGM_LauncherV2_Offline_Remove,
  iGM_LauncherV2_Offline_Select,
} from "./iGM_LauncherV2_OfflineAccount";
import {
  iGM_LauncherV2_Skin_Apply,
  iGM_LauncherV2_Skin_Import,
  iGM_LauncherV2_Skin_Library,
  iGM_LauncherV2_Skin_OpenOfficial,
  iGM_LauncherV2_Skin_Profile,
  iGM_LauncherV2_Skin_Remove,
  iGM_LauncherV2_Skin_Texture,
} from "./iGM_LauncherV2_Skin";
import {
  iGM_LauncherV2_Core_Ping,
  iGM_LauncherV2_Core_ToMessage,
  iGM_LauncherV2_Core_Dispose,
  iGM_LauncherV2_CoreResolvePath,
} from "./iGM_LauncherV2_Core";
import {
  iGM_LauncherV2_CurrentAccountSet,
  iGM_LauncherV2_LogsPath,
  iGM_LauncherV2_PathsInit,
  iGM_LauncherV2_PathsSnapshot,
  iGM_LauncherV2_SetUserRoot,
  iGM_LauncherV2_SettingsGet,
  iGM_LauncherV2_SettingsSave,
  iGM_LauncherV2_UserRootPath,
} from "./iGM_LauncherV2_Paths";
import { iGM_LauncherV2_InstallFlagExists, iGM_LauncherV2_InstallFlagWrite } from "./iGM_LauncherV2_Store";
import {
  iGM_LauncherV2_GameAddScanPath,
  iGM_LauncherV2_GameDelete,
  iGM_LauncherV2_GameGenerate,
  iGM_LauncherV2_GameScan,
  iGM_LauncherV2_GameUse,
  type iGM_LauncherV2_GameScanResult,
} from "./iGM_LauncherV2_GameScan";
import {
  iGM_LauncherV2_Horizon_Create,
  iGM_LauncherV2_Horizon_Delete,
  iGM_LauncherV2_Horizon_List,
  iGM_LauncherV2_Horizon_Select,
  iGM_LauncherV2_HorizonTree,
  iGM_LauncherV2_HorizonWorlds,
  type iGM_LauncherV2_HorizonListResult,
} from "./iGM_LauncherV2_Horizon";
import {
  iGM_LauncherV2_LaunchLogsSnapshot,
  iGM_LauncherV2_LaunchProgressState,
  iGM_LauncherV2_LaunchStart,
  iGM_LauncherV2_LaunchState,
  iGM_LauncherV2_SetLaunchLogNotify,
  iGM_LauncherV2_SetLaunchProgressNotify,
  type iGM_LauncherV2_GameState,
} from "./iGM_LauncherV2_Launch";
import {
  IGM_DOWNLOAD_GUEST_CONCURRENCY,
  iGM_LauncherV2_Download_Cancel,
  iGM_LauncherV2_Download_Clear,
  iGM_LauncherV2_Download_Pause,
  iGM_LauncherV2_Download_RateLimitGet,
  iGM_LauncherV2_Download_RateLimitSet,
  iGM_LauncherV2_Download_Resume,
  iGM_LauncherV2_Download_SetConcurrencyLimit,
  iGM_LauncherV2_Download_Snapshot,
  iGM_LauncherV2_Download_Start,
  iGM_LauncherV2_Market_Download,
} from "./iGM_LauncherV2_Download";
import {
  iGM_LauncherV2_Servers_Add,
  iGM_LauncherV2_Servers_List,
  iGM_LauncherV2_Servers_Remove,
  iGM_LauncherV2_Servers_Status,
  iGM_LauncherV2_Servers_StatusAll,
  iGM_LauncherV2_Servers_Target,
} from "./iGM_LauncherV2_Servers";
import {
  iGM_LauncherV2_ServerManifest_Generate,
  iGM_LauncherV2_ServerScanTree,
  iGM_LauncherV2_ServerSync_Start,
} from "./iGM_LauncherV2_ServerSync";
import {
  iGM_LauncherV2_LocalServers_Create,
  iGM_LauncherV2_LocalServers_List,
  iGM_LauncherV2_LocalServers_Remove,
} from "./iGM_LauncherV2_LocalServers";
import {
  iGM_LauncherV2_ServerRuntime_List,
  iGM_LauncherV2_ServerRuntime_Logs,
  iGM_LauncherV2_ServerRuntime_Publish,
  iGM_LauncherV2_ServerRuntime_Start,
  iGM_LauncherV2_ServerRuntime_Stop,
} from "./iGM_LauncherV2_ServerRuntime";
import { iGM_LauncherV2_VersionCatalog_List } from "./iGM_LauncherV2_VersionCatalog";
import { iGM_LauncherV2_News_Load } from "./iGM_LauncherV2_News";
import {
  iGM_LauncherV2_PeerSnapshotMessage,
  iGM_LauncherV2_Peer_BindPort,
  iGM_LauncherV2_Peer_Connect,
  iGM_LauncherV2_Peer_Create,
  iGM_LauncherV2_Peer_Join,
  iGM_LauncherV2_Peer_Leave,
} from "./iGM_LauncherV2_Peer";
import {
  iGM_LauncherV2_Appearance_Load,
  iGM_LauncherV2_Appearance_Set,
} from "./iGM_LauncherV2_Appearance";
import {
  iGM_LauncherV2_Update_Check,
  iGM_LauncherV2_Update_Download,
  iGM_LauncherV2_Update_Install,
} from "./iGM_LauncherV2_Update";
import {
  iGM_LauncherV2_Market_Detail,
  iGM_LauncherV2_Market_Search,
} from "./iGM_LauncherV2_Market";
import {
  iGM_LauncherV2_InstalledVersions,
  iGM_LauncherV2_Loaders_List,
  iGM_LauncherV2_Version_Detail,
  iGM_LauncherV2_Versions_List,
} from "./iGM_LauncherV2_Versions";

// 类型定义 //
/** 主进程启动模式 */
type iGM_LauncherV2_RunMode = "dev" | "packaged";

// 核心逻辑 //

/** 当前启动模式（供界面指令处理复用） */
let iGM_LauncherV2_ActiveMode: iGM_LauncherV2_RunMode = "packaged";

/** 开发模式开关：默认按打包产物加载 */
function iGM_LauncherV2_ResolveRunMode(): iGM_LauncherV2_RunMode {
  return process.env.IGM_LAUNCHER_V2_DEV === "1" ? "dev" : "packaged";
}

/**
 * 解析窗口起始地址。
 * 开发模式加载 3211 dev server；打包模式下，首次运行（未标记安装完成）先加载安装向导，
 * 用户完成向导后由 iGM_LauncherV2_HandleHostMessage 跳转到主界面。
 */
function iGM_LauncherV2_ResolveStartUrl(
  mode: iGM_LauncherV2_RunMode,
  installed: boolean,
): string {
  if (mode === "dev") return `${IGM_LAUNCHERV2_DEV_URL}/`;
  return installed ? IGM_LAUNCHERV2_PACKAGED_ENTRY : IGM_LAUNCHERV2_PACKAGED_INSTALLER_ENTRY;
}

/**
 * 按当前登录态同步下载并发上限。
 * 未登录社区账号（游客）时下调到较低上限，已登录时恢复默认上限；
 * 在每次下载任务开工前调用，因此运行中登录状态发生变化也能即时生效。
 */
function iGM_LauncherV2_SyncDownloadLimit(): void {
  iGM_LauncherV2_Download_SetConcurrencyLimit(
    iGM_LauncherV2_Auth_CurrentUser() ? 0 : IGM_DOWNLOAD_GUEST_CONCURRENCY,
  );
}

/**
 * 进程级异常兜底。
 * 打包版主进程 stdout 不被采集，未捕获异常只会让进程静默退出（界面表现为闪退），
 * 故注册 uncaughtException / unhandledRejection：错误追加写入数据目录下的崩溃日志。
 */
function iGM_LauncherV2_InstallCrashGuards(): void {
  const logPath = join(iGM_LauncherV2_LogsPath(), "iGM_LauncherV2_Crash.log");
  const record = (kind: string, error: unknown): void => {
    const detail =
      error instanceof Error
        ? `${error.message}\n${error.stack ?? ""}`
        : typeof error === "string"
          ? error
          : JSON.stringify(error);
    try {
      mkdirSync(iGM_LauncherV2_LogsPath(), { recursive: true });
      appendFileSync(logPath, `[${new Date().toISOString()}] ${kind}: ${detail}\n`, "utf8");
    } catch {
      // 日志写入失败时忽略，绝不因日志问题再次抛出
    }
    console.error(`[iGM CraftCeon Launcher] ${kind}`, error);
  };
  process.on("uncaughtException", (error) => record("uncaughtException", error));
  process.on("unhandledRejection", (reason) => record("unhandledRejection", reason));
}

/** 窗口控制：由界面标题栏按钮经 host-message 触发 */
function iGM_LauncherV2_HandleWindowControl(
  window: BrowserWindow,
  message: iGM_LauncherV2_OutboundMessage,
): boolean {
  switch (message.type) {
    case "window:minimize":
      window.minimize();
      return true;
    case "window:toggle-maximize":
      if (window.isMaximized()) {
        window.unmaximize();
      } else {
        window.maximize();
      }
      return true;
    case "window:close":
      window.close();
      return true;
    default:
      return false;
  }
}

/** 会话恢复任务的引用：界面查询登录态时先等它完成，避免刷新期间误报未登录 */
let iGM_LauncherV2_RestoreTask: Promise<unknown> | null = null;

/** 回推 Java 环境列表（scanning 为 true 表示扫描进行中；message 为可读结论文案） */
function iGM_LauncherV2_PushJavaList(
  push: (message: iGM_LauncherV2_InboundMessage) => void,
  result: iGM_LauncherV2_JavaListResult,
  scanning = false,
): void {
  push({
    type: "java:list",
    items: result.items,
    defaultId: result.defaultId,
    scanning,
    message: result.message ?? "",
  });
}

/** 回推离线账号列表 */
function iGM_LauncherV2_PushOfflineList(
  push: (message: iGM_LauncherV2_InboundMessage) => void,
  result: { items: iGM_LauncherV2_OfflineAccount[]; currentId: string },
): void {
  push({ type: "offline:list", items: result.items, currentId: result.currentId });
}

/** 回推路径与设置快照 */
function iGM_LauncherV2_PushPaths(push: (message: iGM_LauncherV2_InboundMessage) => void): void {
  const settings = iGM_LauncherV2_SettingsGet();
  push({
    type: "settings:paths",
    paths: iGM_LauncherV2_PathsSnapshot(),
    settings: {
      downloadChannel: settings.downloadChannel,
      downloadSource: settings.downloadSource,
      horizonId: settings.horizonId,
      customScanPaths: settings.customScanPaths,
      currentAccount: settings.currentAccount,
    },
  });
}

/** 回推游戏目录扫描结果（动作类调用携带提示文案） */
function iGM_LauncherV2_PushGameScan(
  push: (message: iGM_LauncherV2_InboundMessage) => void,
  result: iGM_LauncherV2_GameScanResult & { message?: string },
): void {
  push({
    type: "game:scan",
    result: {
      candidates: result.candidates,
      currentGameRoot: result.currentGameRoot,
      matrixRoot: result.matrixRoot,
      message: result.message ?? "",
    },
  });
}

/** 回推视界列表 */
function iGM_LauncherV2_PushHorizons(
  push: (message: iGM_LauncherV2_InboundMessage) => void,
  result: iGM_LauncherV2_HorizonListResult,
): void {
  push({
    type: "horizon:list",
    items: result.items,
    currentId: result.currentId,
    horizonsRoot: result.horizonsRoot,
    message: result.message,
  });
}

/** 回推游戏启动状态 */
function iGM_LauncherV2_PushGameState(
  push: (message: iGM_LauncherV2_InboundMessage) => void,
  state: iGM_LauncherV2_GameState,
): void {
  push({ type: "game:state", state });
}

/**
 * 回推本地服务器列表（本地开服）。
 * 列表刷新仅用于同步条目集合；用户可见提示由界面按多语言键自行组织，外壳不产生文案。
 */
function iGM_LauncherV2_PushLocalServers(
  push: (message: iGM_LauncherV2_InboundMessage) => void,
  items: iGM_LauncherV2_LocalServer[],
): void {
  push({ type: "server:local-list", items, message: "" });
}

/**
 * 游戏启动状态的轮询回推定时器。
 * Launch.ts 在独立异步里监听进程退出并更新内存态，但无法主动回推界面，
 * 故启动后由主进程定时轮询状态：进程结束后推送最后状态并停止轮询。
 */
let iGM_LauncherV2_LaunchPollTimer: ReturnType<typeof setInterval> | null = null;

/* ---- 游戏运行限速联动 ---- */

/**
 * 游戏运行期间的全局限速上限（字节/秒）。
 * 取 1MB/s：既保证后台下载任务不中断，又能让出绝大多数带宽，避免游戏加载与联机卡顿。
 */
const IGM_LAUNCHERV2_GAME_RATE_LIMIT_BPS = 1024 * 1024;

/** 限速生效时的任务管理器顶部提示文案 */
const IGM_LAUNCHERV2_GAME_RATE_LIMIT_NOTICE =
  "检测到游戏运行中，已自动为您限制下载速度以防卡顿";

/** 回推全局限速状态（active 为 true 表示当前处于游戏运行限速中） */
function iGM_LauncherV2_PushThrottle(
  push: (message: iGM_LauncherV2_InboundMessage) => void,
): void {
  const bps = iGM_LauncherV2_Download_RateLimitGet();
  push({
    type: "download:throttle",
    active: bps > 0,
    bps,
    message: bps > 0 ? IGM_LAUNCHERV2_GAME_RATE_LIMIT_NOTICE : "",
  });
}

/** 启动状态轮询（仅当当前有运行中的游戏时生效，退出后自动停止并解除限速） */
function iGM_LauncherV2_PollLaunchState(
  push: (message: iGM_LauncherV2_InboundMessage) => void,
): void {
  if (iGM_LauncherV2_LaunchPollTimer) return;
  iGM_LauncherV2_LaunchPollTimer = setInterval(() => {
    const state = iGM_LauncherV2_LaunchState();
    iGM_LauncherV2_PushGameState(push, state);
    if (!state.running && iGM_LauncherV2_LaunchPollTimer) {
      clearInterval(iGM_LauncherV2_LaunchPollTimer);
      iGM_LauncherV2_LaunchPollTimer = null;
      // 游戏进程已退出：解除限速并回推，任务管理器提示随之消失
      iGM_LauncherV2_Download_RateLimitSet(0);
      iGM_LauncherV2_PushThrottle(push);
    }
  }, 2000);
}

/** 处理界面指令 */
function iGM_LauncherV2_HandleHostMessage(
  window: BrowserWindow,
  message: iGM_LauncherV2_OutboundMessage,
): void {
  if (iGM_LauncherV2_HandleWindowControl(window, message)) return;

  const push = iGM_LauncherV2_Pusher(window);

  switch (message.type) {
    case "auth:status":
      void (async () => {
        await iGM_LauncherV2_RestoreTask;
        push(await iGM_LauncherV2_Auth_Snapshot());
      })();
      break;
    case "auth:login":
      void iGM_LauncherV2_Auth_Login(push);
      break;
    case "auth:logout":
      void iGM_LauncherV2_Auth_Logout(push);
      break;
    case "auth:refresh":
      void iGM_LauncherV2_Auth_Refresh(push);
      break;
    case "auth:change-avatar":
      void (async () => {
        // 在社区站点修改头像；用户返回启动器后界面再触发 auth:refresh 完成同步
        const opened = await iGM_LauncherV2_Auth_OpenProfilePage();
        if (!opened) console.warn("[iGM CraftCeon Launcher] 未能打开社区资料设置页");
      })();
      break;
    case "auth:remembered":
      void (async () => {
        push(await iGM_LauncherV2_Auth_RememberedSnapshot());
      })();
      break;
    case "auth:quick-login":
      // 复用本地长效令牌直接恢复登录态；令牌失效时回推未登录并附可读原因
      void iGM_LauncherV2_Auth_QuickLogin(push);
      break;
    case "core:ping":
      void (async () => {
        push(iGM_LauncherV2_Core_ToMessage(await iGM_LauncherV2_Core_Ping()));
      })();
      break;
    case "java:list":
      void (async () => {
        iGM_LauncherV2_PushJavaList(push, await iGM_LauncherV2_Java_List());
      })();
      break;
    case "java:scan":
      void (async () => {
        // 先回推一次带扫描态的现有列表，再执行扫描并回推结果；
        // 扫描整体异常时也必须回推结论文案，避免界面永久停在「扫描中」
        iGM_LauncherV2_PushJavaList(push, await iGM_LauncherV2_Java_List(), true);
        try {
          iGM_LauncherV2_PushJavaList(push, await iGM_LauncherV2_Java_Scan());
        } catch (error) {
          console.warn("[iGM CraftCeon Launcher] 自动扫描 Java 失败：", error);
          const state = await iGM_LauncherV2_Java_List();
          iGM_LauncherV2_PushJavaList(push, {
            ...state,
            message: `自动扫描失败：${
              error instanceof Error ? error.message : "未知错误"
            }。请点击【手动添加 Java 路径】选择 javaw.exe 或 java.exe。`,
          });
        }
      })();
      break;
    case "java:browse":
      void (async () => {
        try {
          const picked = await Utils.openFileDialog({
            startingFolder: "~/",
            allowedFileTypes: "exe",
            canChooseFiles: true,
            canChooseDirectory: false,
            allowsMultipleSelection: false,
          });
          const path = picked[0];
          if (!path) return;
          const result = await iGM_LauncherV2_Java_Add(path);
          iGM_LauncherV2_PushJavaList(push, result);
          push({ type: "java:path", path });
        } catch (error) {
          console.warn("[iGM CraftCeon Launcher] 选择 javaw.exe 失败：", error);
        }
      })();
      break;
    case "java:add":
      void (async () => {
        iGM_LauncherV2_PushJavaList(push, await iGM_LauncherV2_Java_Add(message.path));
      })();
      break;
    case "java:remove":
      void (async () => {
        iGM_LauncherV2_PushJavaList(push, await iGM_LauncherV2_Java_Remove(message.id));
      })();
      break;
    case "java:set-default":
      void (async () => {
        iGM_LauncherV2_PushJavaList(push, await iGM_LauncherV2_Java_SetDefault(message.id));
      })();
      break;
    case "msa:status":
      void (async () => {
        push(await iGM_LauncherV2_MsaSnapshot());
      })();
      break;
    case "msa:login":
      void (async () => {
        await iGM_LauncherV2_MsaLogin(push);
        // 登录成功后正版账号已被设为全局当前账号，回推设置快照供界面高亮
        iGM_LauncherV2_PushPaths(push);
      })();
      break;
    case "msa:cancel":
      iGM_LauncherV2_MsaCancel(push);
      break;
    case "msa:open-verification":
      void (async () => {
        const opened = await iGM_LauncherV2_MsaOpenVerification();
        if (!opened) console.warn("[iGM CraftCeon Launcher] 未能打开微软验证页");
      })();
      break;
    case "msa:logout":
      void (async () => {
        await iGM_LauncherV2_MsaLogout(push);
        // 解绑后全局当前账号已回落，回推设置快照供界面更新高亮
        iGM_LauncherV2_PushPaths(push);
      })();
      break;
    case "offline:list":
      void (async () => {
        iGM_LauncherV2_PushOfflineList(push, await iGM_LauncherV2_Offline_List());
      })();
      break;
    case "offline:add":
      void (async () => {
        iGM_LauncherV2_PushOfflineList(push, await iGM_LauncherV2_Offline_Add(message.name));
        // 新增即设为全局当前账号，回推设置快照供界面高亮
        iGM_LauncherV2_PushPaths(push);
      })();
      break;
    case "offline:remove":
      void (async () => {
        iGM_LauncherV2_PushOfflineList(push, await iGM_LauncherV2_Offline_Remove(message.id));
        iGM_LauncherV2_PushPaths(push);
      })();
      break;
    case "offline:select":
      void (async () => {
        iGM_LauncherV2_PushOfflineList(push, await iGM_LauncherV2_Offline_Select(message.id));
        iGM_LauncherV2_PushPaths(push);
      })();
      break;
    case "skin:library":
      void (async () => {
        const result = await iGM_LauncherV2_Skin_Library();
        push({ type: "skin:library", items: result.items, message: result.message });
      })();
      break;
    case "skin:import":
      void (async () => {
        const result = await iGM_LauncherV2_Skin_Import(message.name, message.dataBase64);
        push({ type: "skin:library", items: result.items, message: result.message });
      })();
      break;
    case "skin:remove":
      void (async () => {
        const result = await iGM_LauncherV2_Skin_Remove(message.id);
        push({ type: "skin:library", items: result.items, message: result.message });
      })();
      break;
    case "skin:apply":
      void (async () => {
        const result = await iGM_LauncherV2_Skin_Apply({
          id: message.id,
          skinUrl: message.skinUrl,
        });
        push({
          type: "skin:applied",
          applied: result.applied,
          target: result.target ?? "",
          message: result.message,
        });
        // 应用成功会更新离线账号的皮肤字段，一并回推最新列表
        if (result.applied) {
          iGM_LauncherV2_PushOfflineList(push, await iGM_LauncherV2_Offline_List());
        }
      })();
      break;
    case "skin:texture":
      void (async () => {
        const result = await iGM_LauncherV2_Skin_Texture(message.url);
        push({
          type: "skin:texture",
          url: result.url,
          dataUrl: result.dataUrl,
          message: result.message,
        });
      })();
      break;
    case "profile:fetch":
      void (async () => {
        const result = await iGM_LauncherV2_Skin_Profile();
        push({
          type: "profile:result",
          profile: result.profile,
          message: result.message,
        });
      })();
      break;
    case "skin:open-official":
      void (async () => {
        const opened = await iGM_LauncherV2_Skin_OpenOfficial();
        if (!opened) console.warn("[iGM CraftCeon Launcher] 未能打开正版更换皮肤官网");
      })();
      break;
    case "settings:paths":
      iGM_LauncherV2_PushPaths(push);
      break;
    case "settings:root-browse":
      void (async () => {
        try {
          const picked = await Utils.openFileDialog({
            startingFolder: message.current || "~/",
            allowedFileTypes: "*",
            canChooseFiles: false,
            canChooseDirectory: true,
            allowsMultipleSelection: false,
          });
          const path = picked[0];
          if (!path) return;
          await iGM_LauncherV2_SetUserRoot(path);
          iGM_LauncherV2_PushPaths(push);
          iGM_LauncherV2_PushGameScan(push, await iGM_LauncherV2_GameScan());
        } catch (error) {
          console.warn("[iGM CraftCeon Launcher] 选择根目录失败：", error);
        }
      })();
      break;
    case "settings:root-set":
      void (async () => {
        try {
          await iGM_LauncherV2_SetUserRoot(message.path);
          iGM_LauncherV2_PushPaths(push);
          iGM_LauncherV2_PushGameScan(push, await iGM_LauncherV2_GameScan());
        } catch (error) {
          console.warn("[iGM CraftCeon Launcher] 设置根目录失败：", error);
        }
      })();
      break;
    case "settings:channel-set":
      void (async () => {
        await iGM_LauncherV2_SettingsSave({ downloadChannel: message.channel });
        iGM_LauncherV2_PushPaths(push);
      })();
      break;
    case "game:scan":
      void (async () => {
        iGM_LauncherV2_PushGameScan(push, await iGM_LauncherV2_GameScan());
      })();
      break;
    case "game:browse":
      void (async () => {
        try {
          const picked = await Utils.openFileDialog({
            startingFolder: "~/",
            allowedFileTypes: "*",
            canChooseFiles: false,
            canChooseDirectory: true,
            allowsMultipleSelection: false,
          });
          const path = picked[0];
          if (!path) return;
          iGM_LauncherV2_PushGameScan(push, await iGM_LauncherV2_GameAddScanPath(path));
        } catch (error) {
          console.warn("[iGM CraftCeon Launcher] 选择扫描目录失败：", error);
        }
      })();
      break;
    case "game:use":
      void (async () => {
        try {
          iGM_LauncherV2_PushGameScan(push, await iGM_LauncherV2_GameUse(message.path));
        } catch (error) {
          iGM_LauncherV2_PushGameScan(push, {
            ...(await iGM_LauncherV2_GameScan()),
            message: error instanceof Error ? error.message : "采用目录失败",
          });
        }
      })();
      break;
    case "game:delete":
      void (async () => {
        try {
          iGM_LauncherV2_PushGameScan(push, await iGM_LauncherV2_GameDelete(message.path));
        } catch (error) {
          iGM_LauncherV2_PushGameScan(push, {
            ...(await iGM_LauncherV2_GameScan()),
            message: error instanceof Error ? error.message : "删除目录失败",
          });
        }
      })();
      break;
    case "game:generate":
      void (async () => {
        try {
          iGM_LauncherV2_PushGameScan(push, await iGM_LauncherV2_GameGenerate());
        } catch (error) {
          iGM_LauncherV2_PushGameScan(push, {
            ...(await iGM_LauncherV2_GameScan()),
            message: error instanceof Error ? error.message : "生成结构失败",
          });
        }
      })();
      break;
    case "horizon:list":
      void (async () => {
        iGM_LauncherV2_PushHorizons(push, await iGM_LauncherV2_Horizon_List());
      })();
      break;
    case "horizon:create":
      void (async () => {
        try {
          // 游客限制：未登录社区账号时最多创建 IGM_LAUNCHERV2_GUEST_HORIZON_LIMIT 个视界
          if (!iGM_LauncherV2_Auth_CurrentUser()) {
            const existing = await iGM_LauncherV2_Horizon_List();
            if (existing.items.length >= IGM_LAUNCHERV2_GUEST_HORIZON_LIMIT) {
              const text = `游客模式最多创建 ${IGM_LAUNCHERV2_GUEST_HORIZON_LIMIT} 个视界，请登录社区账号解除限制`;
              iGM_LauncherV2_PushHorizons(push, { ...existing, message: text });
              push({ type: "horizon:result", ok: false, id: "", message: text });
              return;
            }
          }

          const result = await iGM_LauncherV2_Horizon_Create(message.name, {
            versionId: message.versionId,
            loaderLabel: message.loaderLabel,
          });
          iGM_LauncherV2_PushHorizons(push, result);
          // 无论成功失败都回推结果，界面据此给出明确反馈，杜绝「点击毫无反应」
          push({ type: "horizon:result", ok: true, id: result.currentId, message: result.message });
        } catch (error) {
          const text = error instanceof Error ? error.message : "新建视界失败";
          await iGM_LauncherV2_PushHorizons(push, {
            ...(await iGM_LauncherV2_Horizon_List()),
            message: text,
          });
          push({ type: "horizon:result", ok: false, id: "", message: text });
        }
      })();
      break;
    case "horizon:select":
      void (async () => {
        try {
          iGM_LauncherV2_PushHorizons(push, await iGM_LauncherV2_Horizon_Select(message.id));
        } catch (error) {
          iGM_LauncherV2_PushHorizons(push, {
            ...(await iGM_LauncherV2_Horizon_List()),
            message: error instanceof Error ? error.message : "切换视界失败",
          });
        }
      })();
      break;
    case "horizon:delete":
      void (async () => {
        try {
          iGM_LauncherV2_PushHorizons(push, await iGM_LauncherV2_Horizon_Delete(message.id));
        } catch (error) {
          iGM_LauncherV2_PushHorizons(push, {
            ...(await iGM_LauncherV2_Horizon_List()),
            message: error instanceof Error ? error.message : "删除视界失败",
          });
        }
      })();
      break;
    case "horizon:tree":
      void (async () => {
        push({
          type: "horizon:tree",
          horizonId: message.id,
          nodes: await iGM_LauncherV2_HorizonTree(message.id),
        });
      })();
      break;
    case "horizon:worlds":
      void (async () => {
        push({
          type: "horizon:worlds",
          horizonId: message.id,
          worlds: await iGM_LauncherV2_HorizonWorlds(message.id),
        });
      })();
      break;
    case "game:launch":
      void (async () => {
        // 启动日志实时推送给界面错误控制台（进程存活期间持续回推）
        iGM_LauncherV2_SetLaunchLogNotify((entry) => push({ type: "launch:log", entry }));
        // 启动进度实时推送给界面启动遮罩（10 / 30 / 50 / 70 / 100）
        iGM_LauncherV2_SetLaunchProgressNotify((progress) =>
          push({ type: "launch:progress", progress }),
        );
        const state = await iGM_LauncherV2_LaunchStart(message.horizonId);
        iGM_LauncherV2_PushGameState(push, state);
        // 启动成功后开始轮询，进程退出时把最后状态回推界面
        if (state.running) {
          // Java 进程已成功拉起：立即置全局限速并回推提示，防止后台下载抢占带宽造成卡顿
          iGM_LauncherV2_Download_RateLimitSet(IGM_LAUNCHERV2_GAME_RATE_LIMIT_BPS);
          iGM_LauncherV2_PushThrottle(push);
          iGM_LauncherV2_PollLaunchState(push);
        }
      })();
      break;
    case "game:state":
      iGM_LauncherV2_PushGameState(push, iGM_LauncherV2_LaunchState());
      break;
    case "launch:progress":
      push({ type: "launch:progress", progress: iGM_LauncherV2_LaunchProgressState() });
      break;
    case "account:select":
      void (async () => {
        // 统一切换全局当前账号：离线走离线模块（其内部同步 currentAccount），
        // 正版直接写设置；随后回推最新设置快照供界面高亮当前账号
        try {
          if (message.kind === "offline") {
            iGM_LauncherV2_PushOfflineList(push, await iGM_LauncherV2_Offline_Select(message.id));
          } else {
            await iGM_LauncherV2_CurrentAccountSet("msa", message.id);
          }
          iGM_LauncherV2_PushPaths(push);
        } catch (error) {
          console.warn("[iGM CraftCeon Launcher] 切换当前账号失败：", error);
        }
      })();
      break;
    case "launch:logs":
      push({ type: "launch:logs", entries: iGM_LauncherV2_LaunchLogsSnapshot() });
      break;
    case "versions:list":
      void (async () => {
        push({ type: "versions:list", ...(await iGM_LauncherV2_Versions_List()) });
      })();
      break;
    case "version:installed":
      void (async () => {
        push({ type: "version:installed", versions: await iGM_LauncherV2_InstalledVersions() });
      })();
      break;
    case "loaders:list":
      void (async () => {
        push({ type: "loaders:list", ...(await iGM_LauncherV2_Loaders_List(message.gameVersion)) });
      })();
      break;
    case "version:detail":
      void (async () => {
        push({
          type: "version:detail",
          detail: await iGM_LauncherV2_Version_Detail(message.versionId),
        });
      })();
      break;
    case "link:open":
      void (async () => {
        const opened = await iGM_LauncherV2_OpenExternal(message.url);
        if (!opened) console.warn("[iGM CraftCeon Launcher] 未能打开外部链接：", message.url);
      })();
      break;
    case "download:start":
      void (async () => {
        // 用户在一卡式弹窗中选定的存放路径：与当前根目录不同则先切换根目录，
        // 随后按该路径生成标准 iGML_Matrix 目录结构；切换失败直接提示并放弃本次下载
        const root = (message.rootPath ?? "").trim();
        if (root && root !== iGM_LauncherV2_UserRootPath()) {
          try {
            await iGM_LauncherV2_SetUserRoot(root);
            // 清掉 gameRoot 覆盖，否则 GameRootPath 会忽略新根目录
            await iGM_LauncherV2_SettingsSave({ gameRoot: "" });
            iGM_LauncherV2_PushPaths(push);
          } catch (error) {
            push({
              type: "download:notice",
              message: `切换存放路径失败：${error instanceof Error ? error.message : "未知错误"}`,
            });
            return;
          }
        }

        // 开工前按登录态校准并发上限：游客下调，正式账号恢复默认
        iGM_LauncherV2_SyncDownloadLimit();
        const result = await iGM_LauncherV2_Download_Start(
          {
            versionId: message.versionId,
            loaderLabel: message.loaderLabel,
            horizonName: message.horizonName,
          },
          push,
        );
        if (!result.ok) push({ type: "download:notice", message: result.message });
      })();
      break;
    case "server:list":
      void (async () => {
        const result = await iGM_LauncherV2_Servers_List();
        push({
          type: "server:list",
          items: result.items,
          source: result.source,
          message: result.message,
        });
      })();
      break;
    case "server:add":
      void (async () => {
        const result = await iGM_LauncherV2_Servers_Add({
          name: message.name,
          ip: message.ip,
          port: message.port,
          site: message.site,
          manifest: message.manifest,
        });
        push({ type: "server:result", ok: result.ok, message: result.message });
        // 写入后立即回推最新列表，界面无需额外再请求一次
        if (result.ok) {
          const list = await iGM_LauncherV2_Servers_List();
          push({
            type: "server:list",
            items: list.items,
            source: list.source,
            message: list.message,
          });
        }
      })();
      break;
    case "server:remove":
      void (async () => {
        const result = iGM_LauncherV2_Servers_Remove(message.id);
        push({ type: "server:result", ok: result.ok, message: result.message });
        if (result.ok) {
          const list = await iGM_LauncherV2_Servers_List();
          push({
            type: "server:list",
            items: list.items,
            source: list.source,
            message: list.message,
          });
        }
      })();
      break;
    case "server:status":
      void (async () => {
        // 状态查询一律由本地进程直达 mcsrvstat.us（携带 UA），先按 id 反查连接目标
        const target = await iGM_LauncherV2_Servers_Target(message.id);
        if (!target) {
          push({ type: "server:status", id: message.id, status: null, message: "未找到该服务器" });
          return;
        }
        const result = await iGM_LauncherV2_Servers_Status(target.ip, target.port);
        push({
          type: "server:status",
          id: message.id,
          status: result.status,
          message: result.message,
        });
      })();
      break;
    case "server:join":
      void (async () => {
        // 一键进服：在当前视界启动游戏，并追加直连参数（--server / --port）
        const target = await iGM_LauncherV2_Servers_Target(message.id);
        if (!target) {
          push({ type: "server:result", ok: false, message: "未找到该服务器，无法进入" });
          return;
        }
        const horizonId = iGM_LauncherV2_SettingsGet().horizonId;
        if (!horizonId) {
          push({ type: "server:result", ok: false, message: "请先创建并选择视界，再进入服务器" });
          return;
        }

        iGM_LauncherV2_SetLaunchLogNotify((entry) => push({ type: "launch:log", entry }));
        iGM_LauncherV2_SetLaunchProgressNotify((progress) =>
          push({ type: "launch:progress", progress }),
        );
        const state = await iGM_LauncherV2_LaunchStart(horizonId, {
          server: target.ip,
          port: target.port,
        });
        iGM_LauncherV2_PushGameState(push, state);
        push({
          type: "server:result",
          ok: state.running,
          message: state.running
            ? `正在进入 ${target.name}（${target.ip}:${target.port}）`
            : state.message,
        });
        if (state.running) {
          iGM_LauncherV2_Download_RateLimitSet(IGM_LAUNCHERV2_GAME_RATE_LIMIT_BPS);
          iGM_LauncherV2_PushThrottle(push);
          iGM_LauncherV2_PollLaunchState(push);
        }
      })();
      break;
    case "server:statuses":
      void (async () => {
        // 批量状态：一次拉取全部条目在线人数，供界面从高到低排序
        const list = await iGM_LauncherV2_Servers_List();
        const result = await iGM_LauncherV2_Servers_StatusAll(list.items.map((item) => item.id));
        push({ type: "server:statuses", items: result.items, message: result.message });
      })();
      break;
    case "server:sync":
      void (async () => {
        // 启动并同步：由本地引擎直连外部清单补齐 mods/config，完成后复用启动函数一键进服；
        // 引擎自回推 server:sync 进度，启动阶段复用游戏启动日志与进度回推
        iGM_LauncherV2_SetLaunchLogNotify((entry) => push({ type: "launch:log", entry }));
        iGM_LauncherV2_SetLaunchProgressNotify((progress) =>
          push({ type: "launch:progress", progress }),
        );
        const state = await iGM_LauncherV2_ServerSync_Start(message.id, message.horizonId, push);
        if (!state) return;
        iGM_LauncherV2_PushGameState(push, state);
        if (state.running) {
          // Java 进程已拉起：置全局限速并轮询状态，进程退出后解除
          iGM_LauncherV2_Download_RateLimitSet(IGM_LAUNCHERV2_GAME_RATE_LIMIT_BPS);
          iGM_LauncherV2_PushThrottle(push);
          iGM_LauncherV2_PollLaunchState(push);
        }
      })();
      break;
    case "server:manifest":
      void (async () => {
        // 客户端清单工作室：按勾选路径收集文件，写出 manifest.json 与客户端 ZIP 包，
        // 结果由模块自身回推（server:manifest）
        await iGM_LauncherV2_ServerManifest_Generate(
          message.serverId,
          message.name,
          message.paths,
          push,
        );
      })();
      break;
    case "server:scan-tree":
      void (async () => {
        // 客户端清单工作室：递归扫描该本地服务器的 mods / config，结果由模块回推 server:tree
        await iGM_LauncherV2_ServerScanTree(message.serverId, push);
      })();
      break;
    case "server:local-list":
      void (async () => {
        iGM_LauncherV2_PushLocalServers(push, await iGM_LauncherV2_LocalServers_List());
      })();
      break;
    case "server:core-create":
      void (async () => {
        // 本地开服：创建目录、下载核心并安装，进度由模块回推 server:core；完成后刷新列表
        await iGM_LauncherV2_LocalServers_Create(
          message.name,
          message.core,
          message.gameVersion,
          message.loaderVersion,
          push,
        );
        iGM_LauncherV2_PushLocalServers(push, await iGM_LauncherV2_LocalServers_List());
      })();
      break;
    case "server:local-remove":
      void (async () => {
        try {
          await iGM_LauncherV2_LocalServers_Remove(message.id);
        } catch (error) {
          console.warn("[iGM CraftCeon Launcher] 删除本地服务器失败：", error);
        }
        iGM_LauncherV2_PushLocalServers(push, await iGM_LauncherV2_LocalServers_List());
      })();
      break;
    case "core:versions":
      void (async () => {
        // 全量版本目录：按核心从上游动态拉取（外壳不做硬编码版本表），结果经 core:versions 回推
        const result = await iGM_LauncherV2_VersionCatalog_List(message.core);
        push({
          type: "core:versions",
          core: message.core,
          versions: result.versions,
          message: result.message,
        });
      })();
      break;
    case "server:start":
      void (async () => {
        // 本地开服运行：拉起服务端进程，就绪后由运行层经 server:runtime 回推状态；随后刷新一次快照
        await iGM_LauncherV2_ServerRuntime_Start(message.id, push);
        push({ type: "server:runtimes", items: iGM_LauncherV2_ServerRuntime_List() });
      })();
      break;
    case "server:stop":
      void (async () => {
        // 停止本地服务端进程（先优雅停机，超时强杀），随后刷新一次快照
        await iGM_LauncherV2_ServerRuntime_Stop(message.id, push);
        push({ type: "server:runtimes", items: iGM_LauncherV2_ServerRuntime_List() });
      })();
      break;
    case "server:runtime-list":
      push({ type: "server:runtimes", items: iGM_LauncherV2_ServerRuntime_List() });
      break;
    case "server:logs":
      // 打开控制台时拉取一次日志缓冲全量
      push({
        type: "server:logs",
        id: message.id,
        entries: iGM_LauncherV2_ServerRuntime_Logs(message.id),
      });
      break;
    case "server:publish":
      void (async () => {
        // 把服务器目录内已生成的 manifest.json 与客户端 ZIP 发布为局域网直链，
        // 并回填到方块广场「客户端同步大厅」记录；成功后重推列表刷新大厅
        const result = await iGM_LauncherV2_ServerRuntime_Publish(message.id);
        push({
          type: "server:publish",
          ok: result.ok,
          id: message.id,
          url: result.url,
          message: result.message,
        });
        if (result.ok) {
          const list = await iGM_LauncherV2_Servers_List();
          push({
            type: "server:list",
            items: list.items,
            source: list.source,
            message: list.message,
          });
        }
      })();
      break;
    case "news:list":
      void (async () => {
        // 首页新闻流：读取本地 news.json，缺失或损坏时回退内置默认内容
        const result = await iGM_LauncherV2_News_Load();
        push({
          type: "news:list",
          items: result.items,
          source: result.source,
          message: result.message,
        });
      })();
      break;
    case "peer:status":
      push(iGM_LauncherV2_PeerSnapshotMessage());
      break;
    case "peer:connect":
      void iGM_LauncherV2_Peer_Connect(push);
      break;
    case "peer:create":
      void iGM_LauncherV2_Peer_Create(message.horizonId, push);
      break;
    case "peer:bind-port":
      iGM_LauncherV2_Peer_BindPort(message.port, push);
      break;
    case "peer:join":
      void iGM_LauncherV2_Peer_Join(message.code, push);
      break;
    case "peer:leave":
      iGM_LauncherV2_Peer_Leave(push);
      break;
    case "market:search":
      void (async () => {
        const result = await iGM_LauncherV2_Market_Search({
          source: message.source,
          category: message.category,
          loader: message.loader,
          query: message.query,
          offset: message.offset,
        });
        push({
          type: "market:result",
          source: message.source,
          category: message.category,
          loader: message.loader,
          query: message.query,
          offset: message.offset,
          items: result.items,
          total: result.total,
          message: result.message,
        });
      })();
      break;
    case "market:detail":
      void (async () => {
        const result = await iGM_LauncherV2_Market_Detail(
          message.source,
          message.id,
          message.category,
        );
        push({ type: "market:detail", detail: result.detail, message: result.message });
      })();
      break;
    case "market:download":
      void (async () => {
        // 通道由界面选定：A 走后端代理，B 直连；
        // 落盘模式由界面的安装确认对话框决定：安装到视界 / 仅下载文件到自选目录
        // 游客限制：未登录社区账号时只允许直连通道，SDK 通道由界面隐藏，此处再兜底一次
        const guest = !iGM_LauncherV2_Auth_CurrentUser();
        const channel = guest ? "direct" : message.channel;
        iGM_LauncherV2_SyncDownloadLimit();
        const result = iGM_LauncherV2_Market_Download(
          {
            name: message.name,
            category: message.category,
            url: message.url,
            fileName: message.fileName,
            size: message.size,
            channel,
            mode: message.mode,
            horizonId: message.horizonId,
            folderPath: message.folderPath,
          },
          push,
        );
        if (!result.ok) push({ type: "download:notice", message: result.message });
      })();
      break;
    case "download:list":
      push({ type: "download:list", tasks: iGM_LauncherV2_Download_Snapshot() });
      break;
    case "download:cancel":
      push({ type: "download:list", tasks: iGM_LauncherV2_Download_Cancel(message.id) });
      break;
    case "download:pause":
      push({ type: "download:list", tasks: iGM_LauncherV2_Download_Pause(message.id) });
      break;
    case "download:resume":
      push({ type: "download:list", tasks: iGM_LauncherV2_Download_Resume(message.id) });
      break;
    case "download:clear":
      push({ type: "download:list", tasks: iGM_LauncherV2_Download_Clear(message.id) });
      break;
    case "download:throttle":
      iGM_LauncherV2_PushThrottle(push);
      break;
    case "appearance:get":
      void (async () => {
        push({ type: "appearance:state", appearance: await iGM_LauncherV2_Appearance_Load() });
      })();
      break;
    case "appearance:set":
      void (async () => {
        push({ type: "appearance:state", appearance: await iGM_LauncherV2_Appearance_Set(message.patch) });
      })();
      break;
    case "update:check":
      void iGM_LauncherV2_Update_Check(push, false);
      break;
    case "update:download":
      void iGM_LauncherV2_Update_Download(push);
      break;
    case "update:install":
      void iGM_LauncherV2_Update_Install(push);
      break;
    case "installer:browse":
      void (async () => {
        try {
          const picked = await Utils.openFileDialog({
            startingFolder: message.current || "~/",
            allowedFileTypes: "*",
            canChooseFiles: false,
            canChooseDirectory: true,
            allowsMultipleSelection: false,
          });
          const path = picked[0];
          if (path) push({ type: "installer:path", path });
        } catch (error) {
          console.warn("[iGM CraftCeon Launcher] 打开目录选择器失败：", error);
        }
      })();
      break;
    case "dialog:pick-folder":
      void (async () => {
        // 通用目录选择器：只回推结果，不改动任何设置，供安装弹窗的「浏览文件夹」使用
        try {
          const picked = await Utils.openFileDialog({
            startingFolder: message.current || "~/",
            allowedFileTypes: "*",
            canChooseFiles: false,
            canChooseDirectory: true,
            allowsMultipleSelection: false,
          });
          const path = picked[0];
          if (path) push({ type: "dialog:picked", path });
        } catch (error) {
          console.warn("[iGM CraftCeon Launcher] 打开目录选择器失败：", error);
        }
      })();
      break;
    case "installer:complete":
      void (async () => {
        // 标记完成后再进入主界面；标记写入失败也照常进入，避免卡在向导
        await iGM_LauncherV2_InstallFlagWrite().catch((error) =>
          console.warn("[iGM CraftCeon Launcher] 写入安装标记失败：", error),
        );
        window.webview?.loadURL(iGM_LauncherV2_ResolveStartUrl(iGM_LauncherV2_ActiveMode, true));
      })();
      break;
  }
}

async function iGM_LauncherV2_Bootstrap(): Promise<void> {
  // 最先安装兜底，保证后续任何初始化异常都不会静默终止进程
  iGM_LauncherV2_InstallCrashGuards();
  const mode = iGM_LauncherV2_ResolveRunMode();
  iGM_LauncherV2_ActiveMode = mode;

  console.log(`[iGM CraftCeon Launcher] 版本 26.5.7；启动模式：${mode}`);

  // 初始化路径与设置（读取根目录指针、生成 iGML_Matrix 结构、载入 settings.json）
  const paths = await iGM_LauncherV2_PathsInit().catch((error) => {
    console.warn("[iGM CraftCeon Launcher] 路径初始化失败，改用默认结构：", error);
    return iGM_LauncherV2_PathsSnapshot();
  });
  console.log(`[iGM CraftCeon Launcher] 总目录：${paths.matrixRoot}`);
  console.log(`[iGM CraftCeon Launcher] 游戏根目录：${paths.gameRoot}`);

  const corePath = iGM_LauncherV2_CoreResolvePath();
  console.log(
    `[iGM CraftCeon Launcher] Rust 核心：${corePath ?? "未找到可执行文件（界面将提示不可用，可先执行 bun run core:build）"}`,
  );

  // 打包模式首次运行时先展示安装向导；开发模式跳过，交由 dev server 提供页面
  const installed =
    mode === "dev" ? true : await iGM_LauncherV2_InstallFlagExists().catch(() => false);
  const startUrl = iGM_LauncherV2_ResolveStartUrl(mode, installed);

  // 静默恢复本地会话：不阻塞窗口创建，界面查询登录态时会等待本次恢复
  iGM_LauncherV2_RestoreTask = iGM_LauncherV2_Auth_Restore()
    .then((user) => {
      console.log(
        `[iGM CraftCeon Launcher] 会话恢复：${user ? `已登录 ${user.nickname}（${user.uid}）` : "未登录"}`,
      );
    })
    .catch((error) => {
      console.warn("[iGM CraftCeon Launcher] 会话恢复失败：", error);
    });

  // 静默恢复已绑定的微软正版账号（仅读取本地公开视图）
  void iGM_LauncherV2_MsaRestore()
    .then((account) => {
      if (account) {
        console.log(`[iGM CraftCeon Launcher] 正版账号恢复：${account.name}（${account.uuid}）`);
      }
    })
    .catch((error) => {
      console.warn("[iGM CraftCeon Launcher] 正版账号恢复失败：", error);
    });

  // 不传 frame.x / frame.y，构造函数据此判定窗口居中；
  // 无边框窗口用 titleBarStyle: "hidden"，标题栏与窗口按钮交给界面自绘
  const mainWindow = new BrowserWindow({
    title: IGM_LAUNCHERV2_APP_TITLE,
    url: startUrl,
    titleBarStyle: "hidden",
    frame: {
      width: IGM_LAUNCHERV2_WINDOW_SIZE.width,
      height: IGM_LAUNCHERV2_WINDOW_SIZE.height,
    },
  });

  // devkit 的 BrowserView.on 事件名联合类型未收录 "host-message"，
  // 但运行时经 eventBridge 正常派发（native.ts 映射为 hostMessage），故显式断言事件名类型。
  mainWindow.webview?.on(
    "host-message" as unknown as Parameters<
      NonNullable<BrowserWindow["webview"]>["on"]
    >[0],
    (event: unknown) => {
      const message = iGM_LauncherV2_ParseHostMessage(event);
      if (!message) return;
      iGM_LauncherV2_HandleHostMessage(mainWindow, message);
    },
  );

  // 启动即自动扫描常见 .minecraft 目录，并把路径快照与扫描结果推给界面
  void (async () => {
    try {
      const push = iGM_LauncherV2_Pusher(mainWindow);
      iGM_LauncherV2_PushPaths(push);
      iGM_LauncherV2_PushGameScan(push, await iGM_LauncherV2_GameScan());
    } catch (error) {
      console.warn("[iGM CraftCeon Launcher] 启动扫描失败：", error);
    }
  })();

  // 静默检查启动器更新：失败（离线 / 清单缺失）不打扰用户，仅在发现新版本时回推提示
  void iGM_LauncherV2_Update_Check(iGM_LauncherV2_Pusher(mainWindow), true).catch((error) => {
    console.warn("[iGM CraftCeon Launcher] 启动更新检查失败：", error);
  });

  // 退出前回收 Rust 核心进程，避免残留孤儿进程
  process.on("exit", () => iGM_LauncherV2_Core_Dispose());

  console.log(`[iGM CraftCeon Launcher] 主窗口已创建，加载：${startUrl}`);
}

// 导出 //
void iGM_LauncherV2_Bootstrap();
