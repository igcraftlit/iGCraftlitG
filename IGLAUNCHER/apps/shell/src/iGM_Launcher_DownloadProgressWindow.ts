/**
 * 文件路径：apps/shell/src/iGM_Launcher_DownloadProgressWindow.ts
 * 所属层：桌面外壳 / 窗口管理层
 * 路由：全局（不对外暴露 URL，仅被 iGM_Launcher_Main 调用）
 * 模块：iGM_Launcher_DownloadProgressWindow
 * 作用：把资源下载独立为窄进度窗口——下载中心点「开始下载」后由主进程创建，
 *       加载 G_DownloadProgress 界面，并把 SDK 进度实时推送给该窗口
 * 内容：窗口创建 / 复用与关闭、宿主消息处理（窗口控制 + downloadProgress:init +
 *       bridge:call）、引擎信息回填、SDK 进度订阅与 IPC 推送
 *
 * 说明：进度窗口是独立渲染进程，无法访问主窗口内存，故：
 *       1) 创建时把任务与引擎信息暂存在主进程，窗口就绪后经 init 事件回填；
 *       2) 订阅 iGM_Launcher_SDK 的进度广播，把快照映射为任务结构后
 *          经 queueHostMessageToWebview 推给该窗口（不依赖任务列表轮询）；
 *       3) 该窗口自行经 bridge:call 调用 thirdParty:download-status / download-cancel，
 *          与主窗口共用同一套桥接层。
 */

// 导入依赖 //
import { BrowserWindow } from "electrobun/main";
import {
  IGM_LAUNCHER_DOWNLOAD_PROGRESS_CHANNEL,
  IGM_LAUNCHER_PROGRESS_DEV_URL,
  IGM_LAUNCHER_PROGRESS_PACKAGED_ENTRY,
  IGM_LAUNCHER_PROGRESS_WINDOW_SIZE,
  type iGM_Launcher_DownloadProgressEvent,
  type iGM_Launcher_HostMessage,
  type iGM_Launcher_ThirdPartyEngine,
} from "@igm-launcher/shared";
import { iGM_Launcher_SDK_ToThirdPartyTask } from "./iGM_Launcher_Bridge";
import { iGM_Launcher_Ipc_HandleMessage, iGM_Launcher_Ipc_ParseHostMessage } from "./iGM_Launcher_Ipc";
import {
  iGM_Launcher_SDK_Status,
  iGM_Launcher_SDK_Subscribe,
  type iGM_Launcher_SDK_TaskSnapshot,
} from "./iGM_Launcher_SDK";

// 类型定义 //
/** 打开进度窗口所需的全部信息（与 window:open-download-progress 宿主消息一致） */
export interface iGM_Launcher_ProgressWindowParams {
  taskId: string;
  resourceName: string;
  version: string;
  targetDir: string;
  engine: iGM_Launcher_ThirdPartyEngine;
  engineError: string;
}

// 核心逻辑 //
/** 当前进度窗口（同一时刻只保留一个） */
let iGM_Launcher_ProgressWindowRef: BrowserWindow | null = null;

/** 当前进度窗口对应的任务与引擎信息 */
let iGM_Launcher_ProgressWindowParams: iGM_Launcher_ProgressWindowParams | null = null;

/** 当前 SDK 进度订阅的取消函数 */
let iGM_Launcher_ProgressWindowUnsubscribe: (() => void) | null = null;

/** 解析窗口起始 URL（开发模式走 dev server，否则走打包静态产物） */
function iGM_Launcher_ProgressWindowUrl(): string {
  return process.env.IGM_LAUNCHER_DEV === "1"
    ? IGM_LAUNCHER_PROGRESS_DEV_URL
    : IGM_LAUNCHER_PROGRESS_PACKAGED_ENTRY;
}

/** 向进度窗口推送一条宿主事件；窗口已销毁时静默忽略 */
function iGM_Launcher_ProgressWindowPush(event: iGM_Launcher_DownloadProgressEvent): void {
  try {
    iGM_Launcher_ProgressWindowRef?.webview?.queueHostMessageToWebview(event);
  } catch (error) {
    console.warn("[SDK] 推送下载进度失败（窗口可能已关闭）：", error);
  }
}

/** 回填任务与引擎信息（窗口就绪时调用） */
function iGM_Launcher_ProgressWindowPushInit(): void {
  const params = iGM_Launcher_ProgressWindowParams;
  if (!params) return;
  iGM_Launcher_ProgressWindowPush({
    channel: IGM_LAUNCHER_DOWNLOAD_PROGRESS_CHANNEL,
    type: "init",
    taskId: params.taskId,
    resourceName: params.resourceName,
    version: params.version,
    targetDir: params.targetDir,
    engine: params.engine,
    engineError: params.engineError,
  });

  // init 后立即补一次已有快照，避免窗口首帧空白（任务尚在解析清单时 total 为 0）
  const snapshot = params.taskId ? iGM_Launcher_SDK_Status(params.taskId) : null;
  if (snapshot) iGM_Launcher_ProgressWindowPushSnapshot(snapshot);
}

/** 把 SDK 快照推送给进度窗口（仅推送当前窗口对应的任务） */
function iGM_Launcher_ProgressWindowPushSnapshot(snapshot: iGM_Launcher_SDK_TaskSnapshot): void {
  const params = iGM_Launcher_ProgressWindowParams;
  if (!params || !params.taskId || snapshot.taskId !== params.taskId) return;
  iGM_Launcher_ProgressWindowPush({
    channel: IGM_LAUNCHER_DOWNLOAD_PROGRESS_CHANNEL,
    type: "progress",
    taskId: snapshot.taskId,
    task: iGM_Launcher_SDK_ToThirdPartyTask(snapshot),
    engineError: "",
  });
}

/** 处理进度窗口的宿主消息：窗口控制 + 就绪回填 + 桥接调用 */
function iGM_Launcher_ProgressWindowHandleMessage(
  window: BrowserWindow,
  message: iGM_Launcher_HostMessage,
): void {
  // 桥接调用（查询状态 / 取消 / 打开目录）与主窗口共用同一实现
  if (iGM_Launcher_Ipc_HandleMessage(window, message)) return;

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
    case "downloadProgress:init":
      iGM_Launcher_ProgressWindowPushInit();
      break;
    default:
      break;
  }
}

/**
 * 打开独立下载进度窗口。
 * 若已存在进度窗口，先关闭旧窗口并解除订阅，再创建新窗口（同一时刻只需一个）。
 */
export function iGM_Launcher_ProgressWindow_Open(params: iGM_Launcher_ProgressWindowParams): void {
  iGM_Launcher_ProgressWindow_Dispose();

  iGM_Launcher_ProgressWindowParams = params;

  const url = iGM_Launcher_ProgressWindowUrl();
  const window = new BrowserWindow({
    title: `${params.resourceName} · 下载`,
    url,
    // 无原生标题栏：窗口内自绘拖动区与关闭按钮，保持极简边框
    titleBarStyle: "hidden",
    // 不传 x / y，构造函数据此判定窗口居中
    frame: {
      width: IGM_LAUNCHER_PROGRESS_WINDOW_SIZE.width,
      height: IGM_LAUNCHER_PROGRESS_WINDOW_SIZE.height,
    },
  });
  iGM_Launcher_ProgressWindowRef = window;

  // devkit 的 BrowserView.on 事件名联合类型未收录 "host-message"，运行时正常派发，故显式断言
  window.webview?.on(
    "host-message" as unknown as Parameters<
      NonNullable<BrowserWindow["webview"]>["on"]
    >[0],
    (event: unknown) => {
      const message = iGM_Launcher_Ipc_ParseHostMessage(event);
      if (!message) return;
      iGM_Launcher_ProgressWindowHandleMessage(window, message);
    },
  );

  // 订阅 SDK 进度广播：下载线程每次回调都会经此实时推送给进度窗口
  iGM_Launcher_ProgressWindowUnsubscribe = iGM_Launcher_SDK_Subscribe((snapshot) => {
    iGM_Launcher_ProgressWindowPushSnapshot(snapshot);
  });

  console.log(
    `[SDK] 已打开独立下载进度窗口：taskId=${params.taskId || "(空)"} engine=${params.engine} 加载=${url}`,
  );
}

/** 关闭并释放当前进度窗口（含解除 SDK 订阅），无窗口时为空操作 */
export function iGM_Launcher_ProgressWindow_Dispose(): void {
  if (iGM_Launcher_ProgressWindowUnsubscribe) {
    iGM_Launcher_ProgressWindowUnsubscribe();
    iGM_Launcher_ProgressWindowUnsubscribe = null;
  }
  if (iGM_Launcher_ProgressWindowRef) {
    try {
      iGM_Launcher_ProgressWindowRef.close();
    } catch (error) {
      console.warn("[SDK] 关闭下载进度窗口失败：", error);
    }
    iGM_Launcher_ProgressWindowRef = null;
  }
  iGM_Launcher_ProgressWindowParams = null;
}

// 导出 //
export default iGM_Launcher_ProgressWindow_Open;