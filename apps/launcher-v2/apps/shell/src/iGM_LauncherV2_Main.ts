/**
 * 文件路径：apps/shell/src/iGM_LauncherV2_Main.ts
 * 所属层：桌面外壳 / 主进程
 * 路由：全局
 * 模块：iGM_LauncherV2_Main
 * 作用：iGM CraftCeon Launcher 26.4.0 主进程入口（Electrobun + Bun）
 * 内容：创建无边框主窗口（界面自绘标题栏与窗口控制按钮）；
 *       开发模式加载 3211 端口 dev server，打包模式加载 views://launcher/index.html；
 *       经 host-message 承接界面指令：窗口控制、社区登录状态查询 / 发起授权 / 退出登录、
 *       Rust 核心连通性探测；启动时静默恢复本地会话；进程级异常兜底写入崩溃日志
 * 说明：主进程不持有任何界面渲染逻辑，也不向界面下发令牌，只下发登录状态与账号公开信息
 */

// 导入依赖 //
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { BrowserWindow } from "electrobun/main";
import {
  IGM_LAUNCHERV2_APP_TITLE,
  IGM_LAUNCHERV2_DEV_URL,
  IGM_LAUNCHERV2_PACKAGED_ENTRY,
  IGM_LAUNCHERV2_WINDOW_SIZE,
} from "./iGM_LauncherV2_Constants";
import {
  iGM_LauncherV2_ParseHostMessage,
  iGM_LauncherV2_Pusher,
  type iGM_LauncherV2_OutboundMessage,
} from "./iGM_LauncherV2_Ipc";
import {
  iGM_LauncherV2_Auth_Login,
  iGM_LauncherV2_Auth_Logout,
  iGM_LauncherV2_Auth_Restore,
  iGM_LauncherV2_Auth_Snapshot,
} from "./iGM_LauncherV2_CommunityAuth";
import {
  iGM_LauncherV2_Core_Ping,
  iGM_LauncherV2_Core_ToMessage,
  iGM_LauncherV2_Core_Dispose,
  iGM_LauncherV2_CoreResolvePath,
} from "./iGM_LauncherV2_Core";
import { IGM_LAUNCHERV2_DATA_ROOT } from "./iGM_LauncherV2_Store";

// 类型定义 //
/** 主进程启动模式 */
type iGM_LauncherV2_RunMode = "dev" | "packaged";

// 核心逻辑 //

/** 开发模式开关：默认按打包产物加载 */
function iGM_LauncherV2_ResolveRunMode(): iGM_LauncherV2_RunMode {
  return process.env.IGM_LAUNCHER_V2_DEV === "1" ? "dev" : "packaged";
}

/** 解析窗口起始地址 */
function iGM_LauncherV2_ResolveStartUrl(mode: iGM_LauncherV2_RunMode): string {
  return mode === "dev" ? `${IGM_LAUNCHERV2_DEV_URL}/` : IGM_LAUNCHERV2_PACKAGED_ENTRY;
}

/**
 * 进程级异常兜底。
 * 打包版主进程 stdout 不被采集，未捕获异常只会让进程静默退出（界面表现为闪退），
 * 故注册 uncaughtException / unhandledRejection：错误追加写入数据目录下的崩溃日志。
 */
function iGM_LauncherV2_InstallCrashGuards(): void {
  const logPath = join(IGM_LAUNCHERV2_DATA_ROOT, "iGM_LauncherV2_Crash.log");
  const record = (kind: string, error: unknown): void => {
    const detail =
      error instanceof Error
        ? `${error.message}\n${error.stack ?? ""}`
        : typeof error === "string"
          ? error
          : JSON.stringify(error);
    try {
      mkdirSync(IGM_LAUNCHERV2_DATA_ROOT, { recursive: true });
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
    case "core:ping":
      void (async () => {
        push(iGM_LauncherV2_Core_ToMessage(await iGM_LauncherV2_Core_Ping()));
      })();
      break;
  }
}

function iGM_LauncherV2_Bootstrap(): void {
  // 最先安装兜底，保证后续任何初始化异常都不会静默终止进程
  iGM_LauncherV2_InstallCrashGuards();
  const mode = iGM_LauncherV2_ResolveRunMode();

  console.log(`[iGM CraftCeon Launcher] 版本 26.4.0；启动模式：${mode}`);
  console.log(`[iGM CraftCeon Launcher] 本地数据目录：${IGM_LAUNCHERV2_DATA_ROOT}`);

  const corePath = iGM_LauncherV2_CoreResolvePath();
  console.log(
    `[iGM CraftCeon Launcher] Rust 核心：${corePath ?? "未找到可执行文件（界面将提示不可用，可先执行 bun run core:build）"}`,
  );

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

  // 不传 frame.x / frame.y，构造函数据此判定窗口居中；
  // 无边框窗口用 titleBarStyle: "hidden"，标题栏与窗口按钮交给界面自绘
  const mainWindow = new BrowserWindow({
    title: IGM_LAUNCHERV2_APP_TITLE,
    url: iGM_LauncherV2_ResolveStartUrl(mode),
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

  // 退出前回收 Rust 核心进程，避免残留孤儿进程
  process.on("exit", () => iGM_LauncherV2_Core_Dispose());

  console.log(`[iGM CraftCeon Launcher] 主窗口已创建，加载：${iGM_LauncherV2_ResolveStartUrl(mode)}`);
}

// 导出 //
iGM_LauncherV2_Bootstrap();
