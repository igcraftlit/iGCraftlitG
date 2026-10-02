/**
 * 文件路径：apps/shell/src/iGM_Launcher_Main.ts
 * 所属层：桌面外壳 / 主进程
 * 路由：全局
 * 模块：iGM_Launcher_Main
 * 作用：Electrobun 主进程入口：创建主窗口、加载静态界面、处理窗口控制消息并预留原生核心
 * 内容：窗口默认 1280x800 居中；开发模式加载 dev server，生产模式加载
 *       views://launcher/index.html；经 host-message 处理最小化 / 最大化切换 / 关闭
 *
 * 说明：Electrobun 2.0.1 的 BrowserWindowOptions 没有 minWidth/minHeight 字段，
 *       窗口最小可用尺寸（1024x640）由界面层 CSS 兜底，详见 AppShell 样式与验收报告。
 *       开发模式需显式设置环境变量 IGM_LAUNCHER_DEV=1。
 */

// 导入依赖 //
import { BrowserWindow } from "electrobun/main";
import {
  IGM_LAUNCHER_APP_TITLE,
  IGM_LAUNCHER_DEFAULT_SIZE,
  IGM_LAUNCHER_DEV_URL,
  type iGM_Launcher_HostMessage,
} from "@igm-launcher/shared";
import { iGM_Launcher_Core_Status } from "./iGM_Launcher_CoreBindings";
import { IGM_LAUNCHER_BRIDGE_DATA_ROOT } from "./iGM_Launcher_Bridge";
import { iGM_Launcher_Msa_IsConfigured } from "./iGM_Launcher_MsaAuth";
import { iGM_Launcher_Ipc_HandleMessage } from "./iGM_Launcher_Ipc";

// 类型定义 //
/** 主进程启动模式 */
type iGM_Launcher_RunMode = "dev" | "packaged";

// 核心逻辑 //

/** 静态界面在打包产物中的入口（build.copy 将 iGM_Launcher_Assets/launcher 映射为 views://launcher） */
const IGM_LAUNCHER_PACKAGED_ENTRY = "views://launcher/index.html";

/** 开发模式开关：默认按打包产物加载 */
function iGM_Launcher_ResolveRunMode(): iGM_Launcher_RunMode {
  return process.env.IGM_LAUNCHER_DEV === "1" ? "dev" : "packaged";
}

/** 解析窗口起始 URL */
function iGM_Launcher_ResolveStartUrl(mode: iGM_Launcher_RunMode): string {
  return mode === "dev" ? `${IGM_LAUNCHER_DEV_URL}/` : IGM_LAUNCHER_PACKAGED_ENTRY;
}

/**
 * 解析 webview 上报的宿主消息。
 * Electrobun 的 webview 事件把消息体放在事件对象的 data.detail 上
 * （事件构造为 new ElectrobunEvent("host-message", { detail })），
 * 因此优先读取 data.detail，并兼容仅暴露 detail 的旧形态与已解析对象，
 * 解析失败一律返回 null 并由调用方忽略。
 */
function iGM_Launcher_ParseHostMessage(payload: unknown): iGM_Launcher_HostMessage | null {
  const normalize = (value: unknown): iGM_Launcher_HostMessage | null => {
    if (typeof value === "string") {
      try {
        return normalize(JSON.parse(value));
      } catch {
        return null;
      }
    }
    if (value && typeof value === "object") {
      const candidate = value as { type?: unknown };
      if (typeof candidate.type === "string") {
        return value as iGM_Launcher_HostMessage;
      }
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

/** 窗口控制：由界面 TopBar 的按钮经 host-message 触发 */
function iGM_Launcher_HandleHostMessage(
  window: BrowserWindow,
  message: iGM_Launcher_HostMessage,
): void {
  // 桥接层调用（bridge:call）由 IPC 层接管，其余仍为窗口控制
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
  }
}

function iGM_Launcher_Bootstrap(): void {
  const mode = iGM_Launcher_ResolveRunMode();

  // 原生核心状态：Zig 动态库未加载时返回占位状态，不影响外壳启动
  const coreState = iGM_Launcher_Core_Status();
  console.log(
    `[iGM Launcher] 启动模式：${mode}；原生核心：${
      coreState.loaded ? "已加载" : "占位未加载"
    }（v${coreState.version}）`,
  );
  console.log(`[iGM Launcher] 本地数据目录：${IGM_LAUNCHER_BRIDGE_DATA_ROOT}`);
  // 模块三：正版认证可用性（Client ID 内置，安装版无需环境变量即可用）
  console.log(
    `[iGM Launcher] Minecraft 正版认证：${
      iGM_Launcher_Msa_IsConfigured()
        ? "微软链路可用（内置公开 Client ID，可用 IGM_MSA_CLIENT_ID 覆盖）"
        : "未解析到 Client ID，正版绑定不可用"
    }；原生认证链：由 Bun 侧承载（iGM_Launcher_MsaAuth）`,
  );

  // 不传 frame.x / frame.y，构造函数据此判定窗口居中
  const mainWindow = new BrowserWindow({
    title: IGM_LAUNCHER_APP_TITLE,
    url: iGM_Launcher_ResolveStartUrl(mode),
    /*
     * 无边框窗口（模块九）：Electrobun 的 WindowOptionsType 没有 frame: false /
     * backgroundColor 字段，frame 是尺寸对象；去系统白色边框的正确方式是
     * titleBarStyle: "hidden"，其内部把 styleMask 设为 Titled:false +
     * FullSizeContentView:true，窗口仅保留可调整尺寸的边框，标题栏与原生按钮
     * 全部交给界面自绘的 TopBar（拖动区 + 最小化/最大化/关闭，见
     * apps/launcher-ui/components/iGM_Launcher_TopBar 与 iGM_Launcher_WindowControls）。
     * 窗口底色由界面层 html/body 的 var(--igm-bg) 兜底，避免首帧白闪。
     */
    titleBarStyle: "hidden",
    frame: {
      width: IGM_LAUNCHER_DEFAULT_SIZE.width,
      height: IGM_LAUNCHER_DEFAULT_SIZE.height,
    },
  });

  // devkit 的 BrowserView.on 事件名联合类型未收录 "host-message"，
  // 但运行时经 eventBridge 正常派发（native.ts 映射为 hostMessage），故此处显式断言事件名类型。
  mainWindow.webview?.on(
    "host-message" as unknown as Parameters<
      NonNullable<BrowserWindow["webview"]>["on"]
    >[0],
    (event: unknown) => {
      const message = iGM_Launcher_ParseHostMessage(event);
      if (!message) return;
      iGM_Launcher_HandleHostMessage(mainWindow, message);
    },
  );

  console.log(`[iGM Launcher] 主窗口已创建，加载：${iGM_Launcher_ResolveStartUrl(mode)}`);
}

// 导出 //
iGM_Launcher_Bootstrap();