/**
 * 文件路径：apps/shell/src/iGM_Launcher_SDK.ts
 * 所属层：桌面外壳 / 原生 SDK 接入层
 * 路由：全局（不对外暴露 URL，仅被 iGM_Launcher_Bridge 调用）
 * 模块：iGM_Launcher_SDK
 * 作用：以性能最优方式接入下载器 SDK——用 bun:ffi 的 dlopen 直接加载 igm_downloader 动态库，
 *       下载任务在 SDK 内部线程执行，进度由 JS 侧按 200ms 节拍轮询任务内常驻快照获取，
 *       无额外进程、无 HTTP/WebSocket 网络层、内存占用最小，适合长时间运行的启动器
 * 内容：按平台解析动态库文件名与候选路径、dlopen 符号规格、进度结构体解析、
 *       任务登记表与 create / start / pause / resume / retry / cancel / free 封装、
 *       进度轮询定时器（有任务时启动，任务清空后停止）；
 *       动态库缺失时静默降级（IsAvailable 返回 false），由调用方回退到后端 API 下载
 *
 * 进度获取（关键设计）：
 *   不注册原生进度回调。原生下载线程经 bun:ffi 的 threadsafe JSCallback 跨线程回调 JS
 *   会触发 Windows 上的偶发进程级崩溃（0xC0000409 fastfail，整进程静默消失，
 *   表现为「点击下载后启动器所有窗口与任务栏图标一起消失」），且崩溃无任何日志。
 *   改为调用 iGM_Launcher_Download_GetProgress 轮询任务内常驻的 64 字节快照：
 *   进度、终态、等待者唤醒均由轮询驱动，行为与回调路径完全一致，但不再有跨线程 JS 入口。
 *
 * 架构分层（模块二十三）：
 *   后端 API（HTTP/WebSocket）——服务网页端、第三方工具，并作为 SDK 不可用时的兜底；
 *   SDK（本文件）——直连第三方下载源（Modrinth），不经过后端服务器；
 *   旧的第三方下载代理路径——保留为兜底，已标记 @deprecated，待 SDK 稳定后删除。
 */

// 导入依赖 //
import {
  CString,
  dlopen,
  FFIType,
  toArrayBuffer,
  type FFIFunction,
  type Library,
  type Pointer,
} from "bun:ffi";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

// 类型定义 //

/** 创建下载任务的入参 */
export interface iGM_Launcher_SDK_DownloadRequest {
  /** Modrinth 项目 id 或 slug */
  resourceId: string;
  /** 目标游戏版本，如 1.20.1 */
  version: string;
  /** 加载器标识，如 fabric */
  loader: string;
  /** 目标目录（绝对路径） */
  targetDir: string;
}

/**
 * 直链下载入参：直接给出完整 URL 与目标文件绝对路径，跳过 Modrinth 解析。
 * 游戏本体文件清单（走官方 CDN）与第三方直链下载共用此入参；
 * URL 必须是完整地址（含协议与主机），引擎不再拼接任何 base url。
 */
export interface iGM_Launcher_SDK_UrlDownloadRequest {
  /** 完整下载地址 */
  url: string;
  /** 目标文件绝对路径（已含文件名，父目录不存在时引擎会自动创建） */
  destPath: string;
  /** 期望 sha1，空串表示跳过校验 */
  sha1?: string;
  /** 期望大小（字节），0 表示未知 */
  size?: number;
  /** 回显字段：资源 id（第三方资源用，游戏本体可留空） */
  resourceId?: string;
  /** 回显字段：版本 id / 版本号 */
  version?: string;
  /** 回显字段：加载器标识 */
  loader?: string;
  /** 回显字段：目标目录（缺省取 destPath 所在目录） */
  targetDir?: string;
}

/** SDK 任务状态（与 iGM_Launcher_ThirdPartyTaskStatus 对齐） */
export type iGM_Launcher_SDK_TaskStatus =
  | "pending"
  | "downloading"
  | "completed"
  | "paused"
  | "failed"
  | "canceled";

/** SDK 任务快照，供桥接层映射为界面使用的任务结构 */
export interface iGM_Launcher_SDK_TaskSnapshot {
  /** 启动器侧任务编号（形如 sdk-1） */
  taskId: string;
  /** SDK 内部任务编号（回调上报，首个事件后才可得） */
  sdkTaskId: string;
  /** 状态 */
  status: iGM_Launcher_SDK_TaskStatus;
  /** 已下载字节 */
  downloaded: number;
  /** 总字节，未知为 0 */
  total: number;
  /** 进度百分比 0-100 */
  percent: number;
  /** 速度（字节/秒） */
  speed: number;
  /** 预计剩余秒数，未知为 0 */
  eta: number;
  /** 失败原因，未失败为空字符串 */
  error: string;
  /** 入参回显 */
  resourceId: string;
  version: string;
  loader: string;
  targetDir: string;
  /** 创建时间（ISO 字符串） */
  createdAt: string;
}

// 核心逻辑 //

/** dlopen 符号规格：与 zig-core 导出的 C ABI 一一对应（zig-core/src/iGM_Launcher_Core.zig） */
const iGM_Launcher_SDK_FfiSpec = {
  iGM_Launcher_Core_Version: { args: [], returns: FFIType.ptr },
  iGM_Launcher_Core_Init: { args: [], returns: FFIType.i32 },
  iGM_Launcher_Download_CreateTask: {
    args: [FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr],
    returns: FFIType.ptr,
  },
  iGM_Launcher_Download_CreateFileTask: {
    args: [FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.i64],
    returns: FFIType.ptr,
  },
  /*
   * 进度读取：SDK 侧不再注册跨线程进度回调（见文件头「进度获取」说明），
   * 改为按固定节拍调用本函数读取任务内常驻的进度快照，返回 64 字节结构体指针。
   */
  iGM_Launcher_Download_GetProgress: { args: [FFIType.ptr], returns: FFIType.ptr },
  iGM_Launcher_Download_StartTask: { args: [FFIType.ptr], returns: FFIType.i32 },
  iGM_Launcher_Download_PauseTask: { args: [FFIType.ptr], returns: FFIType.i32 },
  iGM_Launcher_Download_ResumeTask: { args: [FFIType.ptr], returns: FFIType.i32 },
  iGM_Launcher_Download_RetryTask: { args: [FFIType.ptr], returns: FFIType.i32 },
  iGM_Launcher_Download_CancelTask: { args: [FFIType.ptr], returns: FFIType.i32 },
  iGM_Launcher_Download_FreeTask: { args: [FFIType.ptr], returns: FFIType.void },
} satisfies Record<string, FFIFunction>;

/** 进度结构体的字节布局（64 位平台）：8+4(+4 对齐)+8+8+8+8+8+8 = 64
 *  与 zig-core/src/iGM_Downloader.zig 的 extern struct 字段顺序严格一致 */
const IGM_LAUNCHER_SDK_PROGRESS_BYTES = 64;

/** 单个任务的内部登记项 */
interface iGM_Launcher_SDK_TaskRecord {
  /** SDK 任务句柄（指针） */
  handle: Pointer;
  /** 最新快照 */
  snapshot: iGM_Launcher_SDK_TaskSnapshot;
  /** 终态等待者：任务进入完成 / 失败 / 取消时统一唤醒（供逐文件顺序编排使用） */
  waiters: Array<(snapshot: iGM_Launcher_SDK_TaskSnapshot) => void>;
}

/** 任务登记表：键为启动器侧任务编号（sdk-<序号>，序号同时作为回调 user_data 传给 SDK） */
const iGM_Launcher_SDK_Tasks = new Map<string, iGM_Launcher_SDK_TaskRecord>();

/** 任务序号自增器 */
let iGM_Launcher_SDK_TaskSeq = 0;

/** 最近一次创建的任务编号（供不带 taskId 的查询使用） */
let iGM_Launcher_SDK_LastTaskId: string | null = null;

/** 进度订阅回调：主进程据此把进度实时推送给独立下载进度窗口 */
export type iGM_Launcher_SDK_ProgressListener = (
  snapshot: iGM_Launcher_SDK_TaskSnapshot,
) => void;

/** 进度订阅者集合（同一时刻通常只有下载进度窗口） */
const iGM_Launcher_SDK_Listeners = new Set<iGM_Launcher_SDK_ProgressListener>();

/**
 * 订阅任务进度：返回取消订阅函数。
 * 广播由 JS 主线程的进度轮询定时器驱动，因此订阅回调内可直接向 webview 推送消息。
 */
export function iGM_Launcher_SDK_Subscribe(
  listener: iGM_Launcher_SDK_ProgressListener,
): () => void {
  iGM_Launcher_SDK_Listeners.add(listener);
  return () => {
    iGM_Launcher_SDK_Listeners.delete(listener);
  };
}

/** 广播一次任务快照；单个订阅者抛错不影响其余订阅者 */
function iGM_Launcher_SDK_Notify(snapshot: iGM_Launcher_SDK_TaskSnapshot): void {
  for (const listener of [...iGM_Launcher_SDK_Listeners]) {
    try {
      listener({ ...snapshot });
    } catch (error) {
      console.warn("[iGM_Launcher_SDK] 进度订阅回调异常：", error);
    }
  }
}

/** 按平台给出动态库文件名 */
function iGM_Launcher_SDK_LibraryFileName(): string {
  if (process.platform === "win32") return "igm_downloader.dll";
  if (process.platform === "darwin") return "libigm_downloader.dylib";
  return "libigm_downloader.so";
}

/** 动态库候选路径：环境变量覆盖 → 开发态 zig 产物 → 打包态随包分发目录 */
function iGM_Launcher_SDK_LibraryCandidates(): string[] {
  const fileName = iGM_Launcher_SDK_LibraryFileName();
  const candidates: string[] = [];

  const override = process.env.IGM_SDK_LIB_PATH?.trim();
  if (override) candidates.push(override);

  // 开发态：zig build 产物（zig-core/zig-out/bin）
  candidates.push(
    join(import.meta.dir, "..", "..", "..", "zig-core", "zig-out", "bin", fileName),
  );

  // 打包态：Electrobun 把 build.copy 的 "sdk" 放到包内 Resources/app/sdk
  // （与 views/launcher 同级，可由便携版 Resources/app/views/launcher 的实际布局确认），
  // 主进程可执行文件位于 bin/ 下；此处覆盖 Resources/app/sdk 及若干兼容位置。
  try {
    const execDir = dirname(process.execPath);
    candidates.push(
      join(execDir, "..", "Resources", "app", "sdk", fileName),
      join(execDir, "..", "Resources", "sdk", fileName),
      join(execDir, "resources", "sdk", fileName),
      join(execDir, "sdk", fileName),
    );
  } catch {
    // 某些运行环境不支持 process.execPath，忽略即可
  }

  // 打包态兜底：Electrobun 把包内资源根目录设为模块目录（Resources），直接在其下探测
  try {
    candidates.push(
      join(import.meta.dir, "app", "sdk", fileName),
      join(import.meta.dir, "sdk", fileName),
      join(import.meta.dir, "..", "sdk", fileName),
    );
  } catch {
    // import.meta.dir 不可用时忽略
  }

  return candidates;
}

/** 在候选路径中查找已编译的动态库 */
function iGM_Launcher_SDK_FindLibraryPath(): string | null {
  for (const candidate of iGM_Launcher_SDK_LibraryCandidates()) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

let iGM_Launcher_SDK_Handle: Library<typeof iGM_Launcher_SDK_FfiSpec> | null = null;
let iGM_Launcher_SDK_Loaded = false;

/**
 * 尝试加载动态库（仅执行一次）。
 * 动态库缺失或加载失败时静默降级，IsAvailable 返回 false，调用方回退后端 API。
 */
export function iGM_Launcher_SDK_EnsureLoaded(): boolean {
  if (iGM_Launcher_SDK_Loaded) return iGM_Launcher_SDK_Handle !== null;

  iGM_Launcher_SDK_Loaded = true;
  const libraryPath = iGM_Launcher_SDK_FindLibraryPath();
  if (!libraryPath) {
    console.warn(
      "[SDK] 未找到 Zig 动态库，回退 HTTP 下载。候选路径：",
      iGM_Launcher_SDK_LibraryCandidates(),
    );
    return false;
  }

  try {
    iGM_Launcher_SDK_Handle = dlopen(libraryPath, iGM_Launcher_SDK_FfiSpec);
    console.log(`[SDK] Zig 动态库已加载：${libraryPath}`);
    return true;
  } catch (error) {
    console.error("[SDK] Zig 动态库加载失败，回退 HTTP 下载：", error);
    iGM_Launcher_SDK_Handle = null;
    return false;
  }
}

/** SDK 是否可用（动态库已成功加载） */
export function iGM_Launcher_SDK_IsAvailable(): boolean {
  return iGM_Launcher_SDK_EnsureLoaded() && iGM_Launcher_SDK_Handle !== null;
}

/** 读取核心版本号；不可用时返回空字符串 */
export function iGM_Launcher_SDK_Version(): string {
  if (!iGM_Launcher_SDK_IsAvailable() || !iGM_Launcher_SDK_Handle) return "";
  const symbols = iGM_Launcher_SDK_Handle.symbols;
  const pointer = symbols.iGM_Launcher_Core_Version();
  if (!pointer) return "";
  return new CString(pointer).toString();
}

/** 初始化原生核心：0 表示成功；动态库不可用时返回 0（不阻断外壳启动） */
export function iGM_Launcher_SDK_CoreInit(): number {
  if (!iGM_Launcher_SDK_IsAvailable() || !iGM_Launcher_SDK_Handle) return 0;
  return iGM_Launcher_SDK_Handle.symbols.iGM_Launcher_Core_Init();
}

/** SDK 状态码（0=等待 1=下载中 2=完成 3=失败 4=已暂停 5=已取消）→ 启动器状态字符串 */
function iGM_Launcher_SDK_MapStatus(status: number): iGM_Launcher_SDK_TaskStatus {
  switch (status) {
    case 2:
      return "completed";
    case 3:
      return "failed";
    case 4:
      return "paused";
    case 5:
      return "canceled";
    case 1:
      return "downloading";
    default:
      return "pending";
  }
}

/** 读取 C 字符串指针（空指针返回空字符串） */
function iGM_Launcher_SDK_ReadCString(pointer: unknown): string {
  const address = Number(pointer);
  if (!address) return "";
  try {
    return new CString(address).toString();
  } catch {
    return "";
  }
}

/** 解析 SDK 回调传入的进度结构体 */
function iGM_Launcher_SDK_ParseProgress(pointer: unknown): {
  sdkTaskId: string;
  status: iGM_Launcher_SDK_TaskStatus;
  downloaded: number;
  total: number;
  percent: number;
  speed: number;
  eta: number;
  error: string;
} {
  const view = new DataView(toArrayBuffer(Number(pointer), 0, IGM_LAUNCHER_SDK_PROGRESS_BYTES));
  const sdkTaskId = iGM_Launcher_SDK_ReadCString(view.getBigUint64(0, true));
  const status = iGM_Launcher_SDK_MapStatus(view.getInt32(8, true));
  const downloaded = Number(view.getBigInt64(16, true));
  const total = Number(view.getBigInt64(24, true));
  const percent = view.getFloat64(32, true);
  const speed = view.getFloat64(40, true);
  const eta = Number(view.getBigInt64(48, true));
  const error = iGM_Launcher_SDK_ReadCString(view.getBigUint64(56, true));
  return { sdkTaskId, status, downloaded, total, percent, speed, eta, error };
}

/** 任务是否已进入终态（完成 / 失败 / 取消） */
function iGM_Launcher_SDK_IsTerminal(status: iGM_Launcher_SDK_TaskStatus): boolean {
  return status === "completed" || status === "failed" || status === "canceled";
}

/** 唤醒并清空某个任务的终态等待者 */
function iGM_Launcher_SDK_FlushWaiters(record: iGM_Launcher_SDK_TaskRecord): void {
  if (!iGM_Launcher_SDK_IsTerminal(record.snapshot.status) || record.waiters.length === 0) return;
  const waiters = record.waiters.splice(0, record.waiters.length);
  for (const resolve of waiters) resolve({ ...record.snapshot });
}

/**
 * 进度轮询节拍（毫秒）。
 *
 * 为什么不注册原生进度回调：原生下载线程通过 bun:ffi 的 threadsafe JSCallback
 * 跨线程回调 JS 时，在 Windows 上会出现偶发的进程级崩溃（0xC0000409 fastfail），
 * 表现为「点击下载后启动器所有窗口连同任务栏图标一起消失」，且崩溃静默无日志。
 * 改为 JS 侧按节拍读取任务内常驻的进度快照，彻底移除这条跨线程 JS 入口。
 */
const IGM_LAUNCHER_SDK_POLL_MS = 200;

/** 进度轮询定时器（有任务时启动，任务清空后自动停止） */
let iGM_Launcher_SDK_PollTimer: ReturnType<typeof setInterval> | null = null;

/** 按需启动进度轮询 */
function iGM_Launcher_SDK_EnsurePolling(): void {
  if (iGM_Launcher_SDK_PollTimer) return;
  iGM_Launcher_SDK_PollTimer = setInterval(
    iGM_Launcher_SDK_PollTick,
    IGM_LAUNCHER_SDK_POLL_MS,
  );
}

/** 停止进度轮询（无任务时） */
function iGM_Launcher_SDK_StopPolling(): void {
  if (!iGM_Launcher_SDK_PollTimer) return;
  clearInterval(iGM_Launcher_SDK_PollTimer);
  iGM_Launcher_SDK_PollTimer = null;
}

/**
 * 刷新单个任务快照：从 native 侧读取最新进度并写入登记项。
 * 返回是否发生变化（无变化时不广播，避免无意义的消息推送）。
 */
function iGM_Launcher_SDK_Refresh(record: iGM_Launcher_SDK_TaskRecord): boolean {
  const symbols = iGM_Launcher_SDK_Handle?.symbols;
  if (!symbols) return false;
  let pointer: unknown;
  try {
    pointer = symbols.iGM_Launcher_Download_GetProgress(record.handle);
  } catch (error) {
    console.warn("[iGM_Launcher_SDK] 读取任务进度异常：", error);
    return false;
  }
  if (!pointer || Number(pointer) === 0) return false;
  const parsed = iGM_Launcher_SDK_ParseProgress(pointer);
  const previous = record.snapshot;
  const changed =
    parsed.status !== previous.status ||
    parsed.downloaded !== previous.downloaded ||
    parsed.total !== previous.total ||
    parsed.error !== previous.error;
  if (!changed) return false;
  record.snapshot = {
    ...previous,
    sdkTaskId: parsed.sdkTaskId || previous.sdkTaskId,
    status: parsed.status,
    downloaded: parsed.downloaded,
    total: parsed.total,
    percent: parsed.percent,
    speed: parsed.speed,
    eta: parsed.eta < 0 ? 0 : parsed.eta,
    error: parsed.error,
  };
  return true;
}

/** 轮询一次：把每个任务的最新快照同步到登记项，变化时广播并唤醒终态等待者 */
function iGM_Launcher_SDK_PollTick(): void {
  if (iGM_Launcher_SDK_Tasks.size === 0) {
    iGM_Launcher_SDK_StopPolling();
    return;
  }
  for (const record of iGM_Launcher_SDK_Tasks.values()) {
    if (!iGM_Launcher_SDK_Refresh(record)) continue;
    // 实时广播：独立下载进度窗口据此刷新，而不是只靠任务列表轮询
    iGM_Launcher_SDK_Notify(record.snapshot);
    // 终态唤醒：逐文件编排在等待单个文件完成时依赖此回调
    iGM_Launcher_SDK_FlushWaiters(record);
  }
}

/**
 * 内部：登记任务、启动线程、开启进度轮询并广播初始快照。
 * createHandle 由调用方提供（Modrinth 解析模式用 CreateTask，直链模式用 CreateFileTask），
 * 其余流程完全一致，避免两条路径出现行为分叉。
 */
function iGM_Launcher_SDK_Launch(
  echo: { resourceId: string; version: string; loader: string; targetDir: string },
  createHandle: () => Pointer | null,
): iGM_Launcher_SDK_TaskSnapshot {
  if (!iGM_Launcher_SDK_IsAvailable() || !iGM_Launcher_SDK_Handle) {
    throw new Error("SDK 动态库未加载");
  }
  const symbols = iGM_Launcher_SDK_Handle.symbols;
  const targetDir = echo.targetDir.trim();
  if (!targetDir) throw new Error("缺少下载目标目录");

  console.log(`[SDK] 准备创建任务，目标路径: ${targetDir}`);

  let handle: Pointer | null = null;
  try {
    handle = createHandle();
  } catch (error) {
    // bun:ffi 调用本身抛错（符号缺失 / 参数非法）也统一收敛为可读错误
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[SDK] 调用创建任务异常：${detail}`);
    throw new Error(`调用创建任务异常：${detail}`);
  }
  console.log(`[SDK] 调用创建任务返回: ${handle ? "0 (成功)" : "null (失败)"}`);
  if (!handle) throw new Error("创建任务返回空任务句柄");

  iGM_Launcher_SDK_TaskSeq += 1;
  const taskId = `sdk-${iGM_Launcher_SDK_TaskSeq}`;
  const snapshot: iGM_Launcher_SDK_TaskSnapshot = {
    taskId,
    sdkTaskId: "",
    status: "pending",
    downloaded: 0,
    total: 0,
    percent: 0,
    speed: 0,
    eta: 0,
    error: "",
    resourceId: echo.resourceId,
    version: echo.version,
    loader: echo.loader,
    targetDir,
    createdAt: new Date().toISOString(),
  };

  iGM_Launcher_SDK_Tasks.set(taskId, { handle, snapshot, waiters: [] });
  iGM_Launcher_SDK_LastTaskId = taskId;

  let started = 0;
  try {
    started = symbols.iGM_Launcher_Download_StartTask(handle);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[SDK] 调用 StartTask 异常：${detail}`);
    iGM_Launcher_SDK_Release(taskId);
    throw new Error(`调用 StartTask 异常：${detail}`);
  }
  console.log(`[SDK] 调用 StartTask 返回: ${started} ${started === 0 ? "(成功)" : "(错误码)"}`);
  if (started !== 0) {
    iGM_Launcher_SDK_Release(taskId);
    throw new Error(`调用 StartTask 返回错误码 ${started}`);
  }

  // 启动进度轮询（有任务时才运行，任务清空后自动停止）
  iGM_Launcher_SDK_EnsurePolling();

  // 通知订阅者任务已创建，便于进度窗口立即拿到初始快照
  iGM_Launcher_SDK_Notify(snapshot);
  return { ...snapshot };
}

/**
 * 创建并启动「Modrinth 解析」下载任务（资源 id + 版本 + 加载器）。
 * 进度由 JS 侧轮询 iGM_Launcher_Download_GetProgress 获取，native 侧不再回调 JS。
 */
export function iGM_Launcher_SDK_Start(
  request: iGM_Launcher_SDK_DownloadRequest,
): iGM_Launcher_SDK_TaskSnapshot {
  const resourceId = request.resourceId.trim();
  const version = request.version.trim();
  const loader = request.loader.trim();
  const targetDir = request.targetDir.trim();
  if (!resourceId) throw new Error("缺少资源 id");
  if (!targetDir) throw new Error("缺少下载目标目录");

  return iGM_Launcher_SDK_Launch({ resourceId, version, loader, targetDir }, () => {
    const symbols = iGM_Launcher_SDK_Handle!.symbols;
    return symbols.iGM_Launcher_Download_CreateTask(
      Buffer.from(`${resourceId}\0`, "utf8"),
      Buffer.from(`${version}\0`, "utf8"),
      Buffer.from(`${loader}\0`, "utf8"),
      Buffer.from(`${targetDir}\0`, "utf8"),
    ) as Pointer | null;
  });
}

/**
 * 创建并启动「直链文件」下载任务：引擎直接使用完整 URL，不再拼接任何 base url，
 * 因此不会因把本地 id 当作 Modrinth 版本 id 而产生 404。
 * 目标文件绝对路径由调用方拼好，引擎负责建父目录、断点续传、SHA1 校验与原子改名。
 */
export function iGM_Launcher_SDK_StartUrl(
  request: iGM_Launcher_SDK_UrlDownloadRequest,
): iGM_Launcher_SDK_TaskSnapshot {
  const url = request.url.trim();
  const destPath = request.destPath.trim();
  const sha1 = (request.sha1 ?? "").trim();
  const size = Number.isFinite(request.size)
    ? Math.max(0, Math.trunc(request.size ?? 0))
    : 0;
  if (!url) throw new Error("缺少下载直链");
  if (!destPath) throw new Error("缺少目标文件路径");

  const resourceId = (request.resourceId ?? "").trim();
  const version = (request.version ?? "").trim();
  const loader = (request.loader ?? "").trim();
  const fallbackDir = destPath.slice(
    0,
    Math.max(destPath.lastIndexOf("\\"), destPath.lastIndexOf("/")),
  );
  const targetDir = (request.targetDir ?? fallbackDir).trim();

  return iGM_Launcher_SDK_Launch({ resourceId, version, loader, targetDir }, () => {
    const symbols = iGM_Launcher_SDK_Handle!.symbols;
    return symbols.iGM_Launcher_Download_CreateFileTask(
      Buffer.from(`${url}\0`, "utf8"),
      Buffer.from(`${destPath}\0`, "utf8"),
      Buffer.from(`${sha1}\0`, "utf8"),
      BigInt(size),
    ) as Pointer | null;
  });
}

/**
 * 等待任务进入终态并返回最终快照。
 * 逐文件顺序编排（游戏本体清单）据此在单个文件下载完成后再推进下一个，
 * 避免一次性把成千上万个文件同时压给引擎。
 */
export function iGM_Launcher_SDK_Await(taskId: string): Promise<iGM_Launcher_SDK_TaskSnapshot> {
  const record = iGM_Launcher_SDK_Tasks.get(taskId);
  if (!record) return Promise.reject(new Error("下载任务不存在"));
  if (iGM_Launcher_SDK_IsTerminal(record.snapshot.status)) {
    return Promise.resolve({ ...record.snapshot });
  }
  return new Promise((resolve) => {
    record.waiters.push(resolve);
  });
}

/** 查询任务快照：不带 taskId 时取最近一次任务 */
export function iGM_Launcher_SDK_Status(taskId?: string): iGM_Launcher_SDK_TaskSnapshot | null {
  const id = taskId ?? iGM_Launcher_SDK_LastTaskId ?? "";
  const record = iGM_Launcher_SDK_Tasks.get(id);
  return record ? { ...record.snapshot } : null;
}

/** 列出全部任务快照 */
export function iGM_Launcher_SDK_List(): iGM_Launcher_SDK_TaskSnapshot[] {
  return [...iGM_Launcher_SDK_Tasks.values()].map((record) => ({ ...record.snapshot }));
}

/** 任务操作公共实现 */
function iGM_Launcher_SDK_Control(
  taskId: string | undefined,
  action: "pause" | "resume" | "retry" | "cancel",
): iGM_Launcher_SDK_TaskSnapshot | null {
  const id = taskId ?? iGM_Launcher_SDK_LastTaskId ?? "";
  const record = iGM_Launcher_SDK_Tasks.get(id);
  if (!record || !iGM_Launcher_SDK_Handle) return null;
  const symbols = iGM_Launcher_SDK_Handle.symbols;
  switch (action) {
    case "pause":
      symbols.iGM_Launcher_Download_PauseTask(record.handle);
      break;
    case "resume":
      symbols.iGM_Launcher_Download_ResumeTask(record.handle);
      break;
    case "retry":
      symbols.iGM_Launcher_Download_RetryTask(record.handle);
      break;
    case "cancel":
      symbols.iGM_Launcher_Download_CancelTask(record.handle);
      break;
  }
  // 控制动作（暂停 / 恢复 / 重试 / 取消）会在 native 侧同步写入快照，
  // 这里立即拉取一次并广播，保证进度窗口状态即时同步（无需等下一个轮询节拍）
  iGM_Launcher_SDK_Refresh(record);
  iGM_Launcher_SDK_Notify(record.snapshot);
  return { ...record.snapshot };
}

/** 暂停任务 */
export function iGM_Launcher_SDK_Pause(taskId?: string): iGM_Launcher_SDK_TaskSnapshot | null {
  return iGM_Launcher_SDK_Control(taskId, "pause");
}

/** 恢复任务 */
export function iGM_Launcher_SDK_Resume(taskId?: string): iGM_Launcher_SDK_TaskSnapshot | null {
  return iGM_Launcher_SDK_Control(taskId, "resume");
}

/** 重试任务 */
export function iGM_Launcher_SDK_Retry(taskId?: string): iGM_Launcher_SDK_TaskSnapshot | null {
  return iGM_Launcher_SDK_Control(taskId, "retry");
}

/** 取消任务 */
export function iGM_Launcher_SDK_Cancel(taskId?: string): iGM_Launcher_SDK_TaskSnapshot | null {
  return iGM_Launcher_SDK_Control(taskId, "cancel");
}

/** 释放任务：取消并释放句柄与回调，避免内存与回调泄漏 */
export function iGM_Launcher_SDK_Release(taskId: string): void {
  const record = iGM_Launcher_SDK_Tasks.get(taskId);
  if (!record) return;
  // 释放前把等待者唤醒并置为已取消，避免逐文件编排永久挂起
  record.snapshot = { ...record.snapshot, status: "canceled" };
  iGM_Launcher_SDK_FlushWaiters(record);
  if (iGM_Launcher_SDK_Handle) {
    iGM_Launcher_SDK_Handle.symbols.iGM_Launcher_Download_CancelTask(record.handle);
    iGM_Launcher_SDK_Handle.symbols.iGM_Launcher_Download_FreeTask(record.handle);
  }
  iGM_Launcher_SDK_Tasks.delete(taskId);
  if (iGM_Launcher_SDK_LastTaskId === taskId) iGM_Launcher_SDK_LastTaskId = null;
}

// 导出 //
export default iGM_Launcher_SDK_IsAvailable;
