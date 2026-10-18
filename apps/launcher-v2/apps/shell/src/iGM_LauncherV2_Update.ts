/**
 * 文件路径：apps/shell/src/iGM_LauncherV2_Update.ts
 * 所属层：桌面外壳 / 自动更新层
 * 路由：全局
 * 模块：iGM_LauncherV2_Update
 * 作用：启动器自动更新：静默版本检查、后台下载更新包与重启安装
 * 内容：启动时静默请求更新清单（IGM_LAUNCHERV2_UPDATE_MANIFEST_URL）取得最新版本号、
 *       更新包直链与更新说明；按版本号逐段数值比较，仅当远端更高时判定为「有新版本」；
 *       用户确认后在后台把更新包下载到 launcher_data/update/，全程回推进度；
 *       下载完成后可「立即重启并更新」：可执行安装包直接拉起并退出启动器，
 *       压缩包则交由系统解压程序打开，由用户完成安装；
 *       「设置 → 关于」提供手动「检查更新」入口，复用同一套流程
 * 说明：全部网络与落盘动作都在主进程执行，界面只投递指令并展示回推状态；
 *       清单缺失、网络异常均只回推可读文案，不抛出、不阻塞启动
 */

// 导入依赖 //
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { Utils } from "electrobun/main";
import {
  IGM_LAUNCHERV2_UPDATE_DIR_NAME,
  IGM_LAUNCHERV2_UPDATE_MANIFEST_URL,
  IGM_LAUNCHERV2_UPDATE_TIMEOUT_MS,
  IGM_LAUNCHERV2_VERSION,
} from "./iGM_LauncherV2_Constants";
import type { iGM_LauncherV2_InboundMessage } from "./iGM_LauncherV2_Ipc";
import { iGM_LauncherV2_LauncherDataPath } from "./iGM_LauncherV2_Paths";

// 类型定义 //

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
  /** 当前本地版本 */
  currentVersion: string;
  /** 远端最新版本；未取到时为空串 */
  latestVersion: string;
  /** 更新说明（清单 notes / changelog，缺失时回退版本标签） */
  notes: string;
  /** 更新包文件名 */
  fileName: string;
  /** 更新包已落盘的绝对路径；未下载时为空串 */
  filePath: string;
  /** 下载进度（0-100） */
  progress: number;
  /** 可读状态文案 */
  message: string;
}

/** 更新清单字段（仅取本模块需要的部分） */
interface iGM_LauncherV2_UpdateManifest {
  version?: unknown;
  versionLabel?: unknown;
  fileName?: unknown;
  downloadUrl?: unknown;
  releasePageUrl?: unknown;
  notes?: unknown;
  changelog?: unknown;
}

// 核心逻辑 //

/** 更新包落盘目录 */
function iGM_UpdateDirPath(): string {
  return join(iGM_LauncherV2_LauncherDataPath(), IGM_LAUNCHERV2_UPDATE_DIR_NAME);
}

/** 更新状态缓存（进程内单例） */
let iGM_UpdateState: iGM_LauncherV2_UpdateState = {
  status: "idle",
  currentVersion: IGM_LAUNCHERV2_VERSION,
  latestVersion: "",
  notes: "",
  fileName: "",
  filePath: "",
  progress: 0,
  message: "",
};

/** 清单中解析出的更新包直链（下载阶段复用，不重复请求清单） */
let iGM_UpdateDownloadUrl = "";

/** 更新状态快照 */
export function iGM_LauncherV2_Update_Snapshot(): iGM_LauncherV2_UpdateState {
  return { ...iGM_UpdateState };
}

/** 回推更新状态 */
function iGM_UpdateEmit(push: (message: iGM_LauncherV2_InboundMessage) => void): void {
  push({ type: "update:state", state: iGM_LauncherV2_Update_Snapshot() });
}

/**
 * 版本号比较。
 * 逐段按数值比较（忽略前导 v 与非数字后缀），远端更高返回 1，相同返回 0，更低返回 -1。
 */
function iGM_UpdateCompare(a: string, b: string): number {
  const parts = (value: string): number[] =>
    value
      .trim()
      .replace(/^v/i, "")
      .split(".")
      .map((item) => {
        const matched = /^\d+/.exec(item.trim());
        return matched ? Number(matched[0]) : 0;
      });

  const left = parts(a);
  const right = parts(b);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const l = left[index] ?? 0;
    const r = right[index] ?? 0;
    if (l > r) return 1;
    if (l < r) return -1;
  }
  return 0;
}

/** 取清单中的可读文本字段 */
function iGM_UpdateText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** 检查更新：静默请求清单并比较版本号，结果经回推下发 */
export async function iGM_LauncherV2_Update_Check(
  push: (message: iGM_LauncherV2_InboundMessage) => void,
  silent = false,
): Promise<void> {
  if (iGM_UpdateState.status === "downloading") return;

  iGM_UpdateState = {
    ...iGM_UpdateState,
    status: "checking",
    message: "正在检查更新…",
  };
  if (!silent) iGM_UpdateEmit(push);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IGM_LAUNCHERV2_UPDATE_TIMEOUT_MS);
  try {
    const response = await fetch(IGM_LAUNCHERV2_UPDATE_MANIFEST_URL, {
      signal: controller.signal,
      headers: { "user-agent": `iGMLLauncher/${IGM_LAUNCHERV2_VERSION} (contact: igcraftlit@outlook.com)` },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const manifest = (await response.json()) as iGM_LauncherV2_UpdateManifest;
    const latest = iGM_UpdateText(manifest.version);
    if (!latest) throw new Error("清单缺少 version 字段");

    const notes =
      iGM_UpdateText(manifest.notes) ||
      iGM_UpdateText(manifest.changelog) ||
      iGM_UpdateText(manifest.versionLabel);
    const fileName = iGM_UpdateText(manifest.fileName);
    const downloadUrl = iGM_UpdateText(manifest.downloadUrl);
    iGM_UpdateDownloadUrl = downloadUrl;

    // 仅当远端版本严格高于本地时才提示更新；其余一律视为已是最新
    if (iGM_UpdateCompare(latest, IGM_LAUNCHERV2_VERSION) <= 0) {
      iGM_UpdateState = {
        ...iGM_UpdateState,
        status: "latest",
        latestVersion: latest,
        notes: "",
        fileName: "",
        filePath: "",
        progress: 0,
        message: `当前已是最新版本（${IGM_LAUNCHERV2_VERSION}）`,
      };
      iGM_UpdateEmit(push);
      return;
    }

    iGM_UpdateState = {
      ...iGM_UpdateState,
      status: "available",
      latestVersion: latest,
      notes,
      fileName,
      filePath: "",
      progress: 0,
      message: downloadUrl
        ? `发现新版本 ${latest}`
        : `发现新版本 ${latest}，但清单未提供更新包地址`,
    };
    iGM_UpdateEmit(push);
  } catch (error) {
    // 静默检查失败不打扰用户（启动阶段常见于离线）；手动检查则明确提示
    const reason = error instanceof Error ? error.message : "未知错误";
    iGM_UpdateState = {
      ...iGM_UpdateState,
      status: silent ? "idle" : "error",
      message: silent ? "" : `检查更新失败：${reason}`,
    };
    if (!silent) iGM_UpdateEmit(push);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 后台静默下载更新包。
 * 内容：流式接收并写入 launcher_data/update/<fileName>，按已接收字节回推进度；
 *       完成后状态切换为 downloaded，等待用户选择「立即重启并更新」。
 */
export async function iGM_LauncherV2_Update_Download(
  push: (message: iGM_LauncherV2_InboundMessage) => void,
): Promise<void> {
  if (iGM_UpdateState.status === "downloading") return;

  const url = iGM_UpdateDownloadUrl;
  if (!url) {
    iGM_UpdateState = {
      ...iGM_UpdateState,
      status: "error",
      message: "更新清单未提供更新包地址，请前往下载站手动下载",
    };
    iGM_UpdateEmit(push);
    return;
  }

  // 文件名优先取清单字段，缺失时从直链末段推导；再缺失则退化为固定名
  const rawName = iGM_UpdateState.fileName || url.split(/[?#]/)[0].split("/").pop() || "";
  const fileName = rawName.replace(/[<>:"|?*\u0000-\u001f\\/]/g, "").trim() || `iGM-CraftCeon-Launcher-${iGM_UpdateState.latestVersion}.zip`;
  const targetPath = join(iGM_UpdateDirPath(), fileName);

  iGM_UpdateState = {
    ...iGM_UpdateState,
    status: "downloading",
    fileName,
    progress: 0,
    message: "正在后台下载更新包…",
  };
  iGM_UpdateEmit(push);

  try {
    const response = await fetch(url, {
      headers: { "user-agent": `iGMLLauncher/${IGM_LAUNCHERV2_VERSION} (contact: igcraftlit@outlook.com)` },
    });
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

    const total = Number(response.headers.get("content-length") ?? 0) || 0;
    const chunks: Uint8Array[] = [];
    let received = 0;
    let lastEmit = 0;

    const reader = response.body.getReader();
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      chunks.push(chunk.value);
      received += chunk.value.length;
      const now = Date.now();
      if (now - lastEmit >= 300) {
        lastEmit = now;
        iGM_UpdateState = {
          ...iGM_UpdateState,
          progress: total > 0 ? Math.min(99, Math.round((received / total) * 100)) : 0,
          message: total > 0
            ? `正在后台下载更新包… ${Math.round((received / total) * 100)}%`
            : `正在后台下载更新包… 已接收 ${Math.round(received / 1024 / 1024)} MB`,
        };
        iGM_UpdateEmit(push);
      }
    }

    await mkdir(iGM_UpdateDirPath(), { recursive: true });
    const merged = new Uint8Array(received);
    let offset = 0;
    for (const item of chunks) {
      merged.set(item, offset);
      offset += item.length;
    }
    await writeFile(targetPath, merged);

    iGM_UpdateState = {
      ...iGM_UpdateState,
      status: "downloaded",
      filePath: targetPath,
      progress: 100,
      message: "更新包已下载完成，可立即重启并更新",
    };
    iGM_UpdateEmit(push);
  } catch (error) {
    iGM_UpdateState = {
      ...iGM_UpdateState,
      status: "error",
      progress: 0,
      message: `更新包下载失败：${error instanceof Error ? error.message : "未知错误"}`,
    };
    iGM_UpdateEmit(push);
  }
}

/**
 * 立即重启并更新。
 * 内容：可执行安装包（.exe）直接以分离进程拉起安装程序，随后退出启动器，
 *       由安装程序覆盖安装并重新启动；非可执行包（压缩包等）交由系统默认程序打开，
 *       并提示用户在安装完成后手动重启启动器。
 * 说明：安装程序与启动器同属本机，退出前不再做任何清理，避免影响安装进程读取资源
 */
export async function iGM_LauncherV2_Update_Install(
  push: (message: iGM_LauncherV2_InboundMessage) => void,
): Promise<void> {
  const path = iGM_UpdateState.filePath;
  if (!path) {
    iGM_UpdateState = { ...iGM_UpdateState, status: "error", message: "尚未下载更新包" };
    iGM_UpdateEmit(push);
    return;
  }

  if (extname(path).toLowerCase() === ".exe") {
    try {
      Bun.spawn([path], {
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
      });
      iGM_UpdateState = {
        ...iGM_UpdateState,
        status: "downloaded",
        message: "正在启动安装程序，启动器即将退出…",
      };
      iGM_UpdateEmit(push);
      // 留出回推时间后退出，避免界面看不到提示
      setTimeout(() => Utils.quit(), 600);
      return;
    } catch (error) {
      iGM_UpdateState = {
        ...iGM_UpdateState,
        status: "error",
        message: `无法启动安装程序：${error instanceof Error ? error.message : "未知错误"}`,
      };
      iGM_UpdateEmit(push);
      return;
    }
  }

  // 非可执行包：打开所在目录并给出明确指引，避免用户以为更新已自动完成
  const opened = Utils.openPath(path);
  iGM_UpdateState = {
    ...iGM_UpdateState,
    status: "downloaded",
    message: opened
      ? "已打开更新包，请完成安装后手动重启启动器"
      : `已下载到 ${path}，请手动运行安装程序后重启启动器`,
  };
  iGM_UpdateEmit(push);
}

// 导出 //
export default iGM_LauncherV2_Update_Check;
