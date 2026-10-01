/**
 * 文件路径：apps/installer/src/iGM_Installer_Main.ts
 * 所属层：安装程序 / 主进程
 * 路由：全局
 * 模块：iGM_Installer_Main
 * 作用：安装程序主进程入口：创建向导窗口、加载静态界面、承接向导指令并回推进度
 * 内容：窗口 900x660、无原生标题栏（界面自带拖动区与窗口控制按钮）；
 *       开发模式加载 3210 端口的 /G_Installer，打包模式加载
 *       views://installer/G_Installer.html；
 *       处理 window:* 窗口控制、installer:* 安装指令与 bridge:call（仅 app:locale）
 *
 * 说明：安装向导界面与启动器界面同属 apps/launcher-ui 的一次静态导出，
 *       因此界面侧共用 iGM_Launcher_Providers；向导向主进程回推一律经
 *       webview.executeJavascript 调用页面注册的 window.__igmInstallerHost，
 *       与 Electrobun 预加载脚本的消息通道互不干扰。
 *       开发模式需显式设置环境变量 IGM_INSTALLER_DEV=1。
 */

// 导入依赖 //
import { BrowserWindow, Utils } from "electrobun/main";
import {
  IGM_INSTALLER_APP_TITLE,
  IGM_INSTALLER_DEV_URL,
  IGM_INSTALLER_PACKAGED_ENTRY,
  IGM_INSTALLER_WINDOW_SIZE,
  IGM_LAUNCHER_BRIDGE_FAILED,
  IGM_LAUNCHER_BRIDGE_OK,
  type iGM_Installer_HostEvent,
  type iGM_Installer_HostMessage,
  type iGM_Launcher_Locale,
} from "@igm-launcher/shared";
import {
  iGM_Installer_DefaultDir,
  iGM_Installer_OpenLauncher,
  iGM_Installer_ReadConfig,
  iGM_Installer_Run,
} from "./iGM_Installer_Install";

// 类型定义 //
/** 主进程启动模式 */
type iGM_Installer_RunMode = "dev" | "packaged";

/** 界面发来的桥接调用消息（安装程序只实现 app:locale） */
interface iGM_Installer_BridgeCallMessage {
  type: "bridge:call";
  id: string;
  method: string;
}

// 核心逻辑 //

/** 回退语言：与启动器默认语言一致 */
const IGM_INSTALLER_FALLBACK_LOCALE: iGM_Launcher_Locale = "zh-CN";

/** 桥接回包通道标识（与 iGM_Launcher_BridgeClient 保持一致） */
const IGM_INSTALLER_BRIDGE_CHANNEL = "iGM_Launcher_Bridge";

/** 最近一次成功安装目录，用于「打开启动器」兜底 */
let iGM_Installer_LastDir: string | null = null;

/** 开发模式开关：默认按打包产物加载 */
function iGM_Installer_ResolveRunMode(): iGM_Installer_RunMode {
  return process.env.IGM_INSTALLER_DEV === "1" ? "dev" : "packaged";
}

/**
 * 解析 webview 上报的宿主消息。
 * Electrobun 的 webview 事件把消息体放在事件对象的 data.detail 上，
 * 因此优先读取 data.detail，并兼容仅暴露 detail 的旧形态与已解析对象。
 */
function iGM_Installer_ParseHostMessage(payload: unknown): unknown {
  const normalize = (value: unknown): unknown => {
    if (typeof value === "string") {
      try {
        return normalize(JSON.parse(value));
      } catch {
        return null;
      }
    }
    if (value && typeof value === "object") {
      const candidate = value as { type?: unknown };
      if (typeof candidate.type === "string") return value;
    }
    return null;
  };

  if (!payload || typeof payload !== "object") return null;

  const data = (payload as { data?: unknown }).data;
  if (data && typeof data === "object" && "detail" in data) {
    const fromData = normalize((data as { detail: unknown }).detail);
    if (fromData) return fromData;
  }

  if ("detail" in payload) {
    const fromDetail = normalize((payload as { detail: unknown }).detail);
    if (fromDetail) return fromDetail;
  }

  return normalize(payload);
}

/** 把事件回推给向导界面 */
function iGM_Installer_Push(window: BrowserWindow, event: iGM_Installer_HostEvent): void {
  const payload = JSON.stringify(event);
  window.webview?.executeJavascript(
    `window.__igmInstallerHost && window.__igmInstallerHost(${payload});`,
  );
}

/** 回填桥接调用响应（安装程序只服务 app:locale，其余一律拒绝） */
function iGM_Installer_ReplyBridge(
  window: BrowserWindow,
  id: string,
  response: Record<string, unknown>,
): void {
  window.webview?.queueHostMessageToWebview({
    channel: IGM_INSTALLER_BRIDGE_CHANNEL,
    id,
    response,
  });
}

/** 处理 bridge:call；返回 true 表示已接管 */
function iGM_Installer_HandleBridgeCall(window: BrowserWindow, message: unknown): boolean {
  if (!message || typeof message !== "object") return false;
  const call = message as Partial<iGM_Installer_BridgeCallMessage>;
  if (call.type !== "bridge:call" || typeof call.id !== "string") return false;

  void (async () => {
    if (call.method === "app:locale") {
      const config = await iGM_Installer_ReadConfig();
      iGM_Installer_ReplyBridge(window, call.id as string, {
        success: true,
        code: IGM_LAUNCHER_BRIDGE_OK,
        message: "ok",
        data: { locale: config?.locale ?? null },
      });
      return;
    }
    iGM_Installer_ReplyBridge(window, call.id as string, {
      success: false,
      code: IGM_LAUNCHER_BRIDGE_FAILED,
      message: "安装程序不提供该桥接方法",
      data: null,
    });
  })();

  return true;
}

/** 向导就绪：回推默认安装目录与上次选择的语言 */
async function iGM_Installer_HandleInit(window: BrowserWindow): Promise<void> {
  const config = await iGM_Installer_ReadConfig();
  iGM_Installer_Push(window, {
    type: "installer:ready",
    defaultDir: iGM_Installer_DefaultDir(),
    locale: config?.locale ?? IGM_INSTALLER_FALLBACK_LOCALE,
  });
}

/** 打开系统目录选择器，取消选择时回推 null */
async function iGM_Installer_HandlePickDir(
  window: BrowserWindow,
  current: string | undefined,
): Promise<void> {
  try {
    /*
     * Electrobun 的 openFileDialog 用对象展开合并默认值，显式传入 undefined 会把
     * 默认起始目录覆盖成 undefined 并在 FFI 转 C 字符串时抛错，
     * 因此起始目录一律给成确定字符串。默认值是安装目录的父级，便于用户改盘符。
     */
    const startingFolder = current?.trim() || iGM_Installer_DefaultDir();
    const picked = await Utils.openFileDialog({
      startingFolder,
      canChooseFiles: false,
      canChooseDirectory: true,
      allowsMultipleSelection: false,
    });
    iGM_Installer_Push(window, { type: "installer:dir-picked", dir: picked[0] ?? null });
  } catch (error) {
    console.warn("[iGM Installer] 打开目录选择器失败", error);
    iGM_Installer_Push(window, { type: "installer:dir-picked", dir: null });
  }
}

/** 开始安装：驱动安装引擎并把每个阶段回推给界面 */
async function iGM_Installer_HandleBegin(
  window: BrowserWindow,
  locale: iGM_Launcher_Locale,
  dir: string,
): Promise<void> {
  await iGM_Installer_Run({
    locale,
    dir,
    onProgress: (progress) => {
      if (progress.phase === "done") iGM_Installer_LastDir = dir;
      iGM_Installer_Push(window, { type: "installer:progress", progress });
    },
  });
}

/** 处理一条宿主消息 */
function iGM_Installer_HandleHostMessage(window: BrowserWindow, raw: unknown): void {
  if (iGM_Installer_HandleBridgeCall(window, raw)) return;

  const message = raw as iGM_Installer_HostMessage;
  switch (message.type) {
    case "window:minimize":
      window.minimize();
      break;
    case "window:toggle-maximize":
      if (window.isMaximized()) {
        window.unmaximize();
      } else {
        window.maximize();
      }
      break;
    case "window:close":
      window.close();
      break;
    case "installer:init":
      void iGM_Installer_HandleInit(window);
      break;
    case "installer:pick-dir":
      void iGM_Installer_HandlePickDir(window, message.current);
      break;
    case "installer:begin":
      void iGM_Installer_HandleBegin(window, message.locale, message.dir);
      break;
    case "installer:open-launcher":
      if (!iGM_Installer_OpenLauncher(message.dir.trim() || iGM_Installer_LastDir || "")) {
        console.warn("[iGM Installer] 未找到已安装的启动器可执行文件");
      }
      break;
    case "installer:finish":
      window.close();
      break;
    default:
      break;
  }
}

function iGM_Installer_Bootstrap(): void {
  const mode = iGM_Installer_ResolveRunMode();
  const url = mode === "dev" ? IGM_INSTALLER_DEV_URL : IGM_INSTALLER_PACKAGED_ENTRY;

  const installerWindow = new BrowserWindow({
    title: IGM_INSTALLER_APP_TITLE,
    url,
    // 无原生标题栏：向导界面自带拖动区与最小化 / 关闭按钮
    titleBarStyle: "hidden",
    frame: {
      width: IGM_INSTALLER_WINDOW_SIZE.width,
      height: IGM_INSTALLER_WINDOW_SIZE.height,
    },
  });

  // devkit 的 BrowserView.on 事件名联合类型未收录 "host-message"，
  // 但运行时经 eventBridge 正常派发，故此处显式断言事件名类型。
  installerWindow.webview?.on(
    "host-message" as unknown as Parameters<
      NonNullable<BrowserWindow["webview"]>["on"]
    >[0],
    (event: unknown) => {
      const parsed = iGM_Installer_ParseHostMessage(event);
      if (!parsed) return;
      iGM_Installer_HandleHostMessage(installerWindow, parsed);
    },
  );

  console.log(`[iGM Installer] 启动模式：${mode}；加载：${url}`);
  console.log(`[iGM Installer] 默认安装目录：${iGM_Installer_DefaultDir()}`);
}

// 导出 //
iGM_Installer_Bootstrap();