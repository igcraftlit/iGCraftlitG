/**
 * 文件路径：apps/shell/src/iGM_Launcher_SDK.ts
 * 所属层：桌面外壳 / 原生 SDK 接入层
 * 路由：全局（不对外暴露 URL，仅被 iGM_Launcher_Bridge 调用）
 * 模块：iGM_Launcher_SDK
 * 作用：以性能最优方式接入下载器 SDK——用 bun:ffi 的 dlopen 直接加载 igm_downloader 动态库，
 *       下载任务在 SDK 内部线程执行，进度经 threadSafe JSCallback 直接回调到主进程，
 *       无额外进程、无 HTTP/WebSocket 网络层、内存占用最小，适合长时间运行的启动器
 * 内容：按平台解析动态库文件名与候选路径、dlopen 符号规格、进度结构体解析、
 *       任务登记表与 create / set_progress_cb / start / pause / resume / retry / cancel / free 封装；
 *       动态库缺失时静默降级（IsAvailable 返回 false），由调用方回退到后端 API 下载
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
  JSCallback,
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
  iGM_Launcher_Download_SetProgressCallback: {
    args: [FFIType.ptr, FFIType.function, FFIType.ptr],
    returns: FFIType.void,
  },
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
  /** 进度回调（须保持引用，避免被 GC 回收导致回调失效） */
  callback: JSCallback;
  /** 最新快照 */
  snapshot: iGM_Launcher_SDK_TaskSnapshot;
}

/** 任务登记表：键为启动器侧自增序号（同时作为回调 user_data 传给 SDK） */
const iGM_Launcher_SDK_Tasks = new Map<string, iGM_Launcher_SDK_TaskRecord>();

/** 任务序号自增器 */
let iGM_Launcher_SDK_TaskSeq = 0;

/** 最近一次创建的任务编号（供不带 taskId 的查询使用） */
let iGM_Launcher_SDK_LastTaskId: string | null = null;

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
  if (!libraryPath) return false;

  try {
    iGM_Launcher_SDK_Handle = dlopen(libraryPath, iGM_Launcher_SDK_FfiSpec);
    return true;
  } catch (error) {
    console.warn("[iGM_Launcher_SDK] 动态库加载失败，回退后端 API 下载：", error);
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

/**
 * 创建并启动下载任务。
 * 通过 user_data 传入启动器侧任务序号，回调据此定位登记项（SDK 只透传该指针，不解引用）。
 */
export function iGM_Launcher_SDK_Start(
  request: iGM_Launcher_SDK_DownloadRequest,
): iGM_Launcher_SDK_TaskSnapshot {
  if (!iGM_Launcher_SDK_IsAvailable() || !iGM_Launcher_SDK_Handle) {
    throw new Error("SDK 动态库未加载");
  }
  const symbols = iGM_Launcher_SDK_Handle.symbols;

  const resourceId = request.resourceId.trim();
  const version = request.version.trim();
  const loader = request.loader.trim();
  const targetDir = request.targetDir.trim();
  if (!resourceId) throw new Error("缺少资源 id");
  if (!targetDir) throw new Error("缺少下载目标目录");

  const handle = symbols.iGM_Launcher_Download_CreateTask(
    Buffer.from(`${resourceId}\0`, "utf8"),
    Buffer.from(`${version}\0`, "utf8"),
    Buffer.from(`${loader}\0`, "utf8"),
    Buffer.from(`${targetDir}\0`, "utf8"),
  ) as Pointer | null;
  if (!handle) throw new Error("SDK 创建任务失败");

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
    resourceId,
    version,
    loader,
    targetDir,
    createdAt: new Date().toISOString(),
  };

  // 进度回调：threadSafe 允许 SDK 内部线程直接回调；首个事件即带回 SDK 任务编号
  const callback = new JSCallback(
    (progressPointer: unknown, userPointer: unknown) => {
      const key = String(Number(userPointer));
      const record = iGM_Launcher_SDK_Tasks.get(key);
      if (!record) return;
      const parsed = iGM_Launcher_SDK_ParseProgress(progressPointer);
      record.snapshot = {
        ...record.snapshot,
        sdkTaskId: parsed.sdkTaskId || record.snapshot.sdkTaskId,
        status: parsed.status,
        downloaded: parsed.downloaded,
        total: parsed.total,
        percent: parsed.percent,
        speed: parsed.speed,
        eta: parsed.eta < 0 ? 0 : parsed.eta,
        error: parsed.error,
      };
    },
    { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.void, threadsafe: true },
  );

  iGM_Launcher_SDK_Tasks.set(taskId, { handle, callback, snapshot });
  iGM_Launcher_SDK_LastTaskId = taskId;

  // 注册回调：threadsafe 回调须传 JSCallback 本体（Bun 需据此建立线程安全引用），
  // user_data 传启动器侧任务序号（小整数），回调据此定位登记项
  symbols.iGM_Launcher_Download_SetProgressCallback(handle, callback, BigInt(iGM_Launcher_SDK_TaskSeq));
  const started = symbols.iGM_Launcher_Download_StartTask(handle);
  if (started !== 0) {
    iGM_Launcher_SDK_Release(taskId);
    throw new Error(`SDK 启动任务失败（错误码 ${started}）`);
  }

  return { ...snapshot };
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
  if (iGM_Launcher_SDK_Handle) {
    iGM_Launcher_SDK_Handle.symbols.iGM_Launcher_Download_CancelTask(record.handle);
    iGM_Launcher_SDK_Handle.symbols.iGM_Launcher_Download_FreeTask(record.handle);
  }
  record.callback.close();
  iGM_Launcher_SDK_Tasks.delete(taskId);
  if (iGM_Launcher_SDK_LastTaskId === taskId) iGM_Launcher_SDK_LastTaskId = null;
}

// 导出 //
export default iGM_Launcher_SDK_IsAvailable;
