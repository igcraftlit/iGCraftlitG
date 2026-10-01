/**
 * 文件路径：apps/shell/src/iGM_Launcher_CoreBindings.ts
 * 所属层：桌面外壳 / 原生核心桥接层
 * 路由：全局
 * 模块：iGM_Launcher_CoreBindings
 * 作用：通过 bun:ffi 预留加载 Rust 核心动态库（iGM_Launcher_Core）的接口
 * 内容：按平台解析动态库文件名、尝试 dlopen、导出占位函数；
 *       动态库尚未编译时全部返回占位值，不抛出异常、不影响外壳启动
 */

// 导入依赖 //
import {
  CString,
  dlopen,
  FFIType,
  type FFIFunction,
  type Library,
} from "bun:ffi";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  IGM_LAUNCHER_CORE_PLACEHOLDER_TASK_ID,
  IGM_LAUNCHER_CORE_PLACEHOLDER_VERSION,
  type iGM_Launcher_CoreLibrary,
} from "@igm-launcher/shared";

// 类型定义 //
interface iGM_Launcher_CoreSymbols {
  /** 初始化核心，返回 0 表示成功 */
  iGM_Launcher_Core_Init: () => number;
  /** 读取核心版本号（C 字符串指针） */
  iGM_Launcher_Core_GetVersion: () => number;
  /** 创建下载任务（占位），返回任务编号或负值 */
  iGM_Launcher_Core_DownloadTask: (url: NodeJS.TypedArray) => number;
}

/**
 * bun:ffi 符号描述：与 iGM_Launcher_CoreSymbols 一一对应，
 * 供 dlopen 推断真实类型，并作为 Library 泛型参数来源。
 *
 * 模块二说明：Rust 侧已声明 Instance / Java / Account 三组函数签名，
 * 但真实落盘、检测与鉴权逻辑尚未实现，故此处不绑定这些符号，
 * 模块二由 iGM_Launcher_Bridge.ts 在 Bun 侧完成占位实现。
 */
const iGM_Launcher_Core_FfiSpec = {
  iGM_Launcher_Core_Init: { args: [], returns: FFIType.i32 },
  iGM_Launcher_Core_GetVersion: { args: [], returns: FFIType.ptr },
  // URL 以字节缓冲（UTF-8、零结尾）经指针传入，故此处声明为 ptr
  iGM_Launcher_Core_DownloadTask: { args: [FFIType.ptr], returns: FFIType.i32 },
} satisfies Record<string, FFIFunction>;

/**
 * 模块三 / 模块四：Minecraft 正版认证链的原生符号规格。
 * Rust 侧仅登记签名与数据结构（当前一律返回未实现），
 * 真实 https 调用由 iGM_Launcher_MsaAuth.ts 在 Bun 侧承载；
 * 因此这里单独声明一份规格用于“可用性探测”，不并入主规格，
 * 避免动态库版本落后时令整个核心加载失败。
 *
 * 模块四变更：认证链前三步迁出到 Rust 子模块 iGM_Launcher_MSAuth，
 * 并改用「返回结构体指针」的契约（失败返回空指针），故此处同步更新参数与返回值；
 * 释放函数命名为 iGM_Launcher_MSAuth_Free*，调用方读取完毕需显式释放。
 */
const iGM_Launcher_Core_McFfiSpec = {
  iGM_Launcher_MSA_RequestDeviceCode: {
    args: [FFIType.ptr, FFIType.ptr],
    returns: FFIType.ptr,
  },
  iGM_Launcher_MSA_PollToken: {
    args: [FFIType.ptr, FFIType.ptr],
    returns: FFIType.ptr,
  },
  iGM_Launcher_MSA_RefreshToken: {
    args: [FFIType.ptr, FFIType.ptr, FFIType.ptr],
    returns: FFIType.i32,
  },
  iGM_Launcher_Xbox_Authenticate: {
    args: [FFIType.ptr],
    returns: FFIType.ptr,
  },
  iGM_Launcher_XSTS_Authorize: {
    args: [FFIType.ptr],
    returns: FFIType.ptr,
  },
  iGM_Launcher_MSAuth_FreeDeviceCode: {
    args: [FFIType.ptr],
    returns: FFIType.void,
  },
  iGM_Launcher_MSAuth_FreeMSAToken: {
    args: [FFIType.ptr],
    returns: FFIType.void,
  },
  iGM_Launcher_MSAuth_FreeXboxToken: {
    args: [FFIType.ptr],
    returns: FFIType.void,
  },
  iGM_Launcher_MSAuth_FreeXSTSToken: {
    args: [FFIType.ptr],
    returns: FFIType.void,
  },
  iGM_Launcher_Minecraft_Authenticate: {
    args: [FFIType.ptr, FFIType.ptr, FFIType.ptr],
    returns: FFIType.i32,
  },
  iGM_Launcher_Minecraft_GetProfile: {
    args: [FFIType.ptr, FFIType.ptr],
    returns: FFIType.i32,
  },
  iGM_Launcher_Minecraft_CheckEntitlements: {
    args: [FFIType.ptr, FFIType.ptr],
    returns: FFIType.i32,
  },
} satisfies Record<string, FFIFunction>;

// 核心逻辑 //

/** Rust cdylib 产物所在目录（cargo build 后生成于 crates 下的 target/debug 或 target/release） */
const iGM_Launcher_CoreArtifactDirs: readonly string[] = [
  join(import.meta.dir, "..", "..", "..", "crates", "iGM_Launcher_Core", "target", "debug"),
  join(import.meta.dir, "..", "..", "..", "crates", "iGM_Launcher_Core", "target", "release"),
];

/** 按平台给出动态库文件名 */
function iGM_Launcher_CoreLibraryFileName(): string {
  if (process.platform === "win32") return "igm_launcher_core.dll";
  if (process.platform === "darwin") return "libigm_launcher_core.dylib";
  return "libigm_launcher_core.so";
}

/** 在候选目录中查找已编译的动态库 */
function iGM_Launcher_FindCoreLibraryPath(): string | null {
  const fileName = iGM_Launcher_CoreLibraryFileName();
  for (const dir of iGM_Launcher_CoreArtifactDirs) {
    const candidate = join(dir, fileName);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

let iGM_Launcher_CoreHandle: Library<typeof iGM_Launcher_Core_FfiSpec> | null = null;
let iGM_Launcher_CoreLoaded = false;

/**
 * 尝试加载动态库。
 * 模块一不要求 Rust 产物存在，加载失败即静默降级为占位实现。
 */
export function iGM_Launcher_Core_EnsureLoaded(): boolean {
  if (iGM_Launcher_CoreLoaded) return iGM_Launcher_CoreHandle !== null;

  iGM_Launcher_CoreLoaded = true;
  const libraryPath = iGM_Launcher_FindCoreLibraryPath();
  if (!libraryPath) return false;

  try {
    iGM_Launcher_CoreHandle = dlopen(libraryPath, iGM_Launcher_Core_FfiSpec);
    return true;
  } catch (error) {
    console.warn("[iGM_Launcher_CoreBindings] 动态库加载失败，使用占位实现：", error);
    iGM_Launcher_CoreHandle = null;
    return false;
  }
}

/** 初始化核心：未加载动态库时返回成功占位 */
function iGM_Launcher_Core_Init(): number {
  if (!iGM_Launcher_Core_EnsureLoaded() || !iGM_Launcher_CoreHandle) return 0;
  const symbols = iGM_Launcher_CoreHandle.symbols as unknown as iGM_Launcher_CoreSymbols;
  return symbols.iGM_Launcher_Core_Init();
}

/** 读取核心版本：未加载动态库时返回占位版本号 */
function iGM_Launcher_Core_GetVersion(): string {
  if (!iGM_Launcher_Core_EnsureLoaded() || !iGM_Launcher_CoreHandle) {
    return IGM_LAUNCHER_CORE_PLACEHOLDER_VERSION;
  }
  const symbols = iGM_Launcher_CoreHandle.symbols as unknown as iGM_Launcher_CoreSymbols;
  const pointer = symbols.iGM_Launcher_Core_GetVersion();
  if (!pointer) return IGM_LAUNCHER_CORE_PLACEHOLDER_VERSION;
  return new CString(pointer).toString();
}

/** 创建下载任务：模块一恒为占位值 */
function iGM_Launcher_Core_DownloadTask(url: string): number {
  if (!iGM_Launcher_Core_EnsureLoaded() || !iGM_Launcher_CoreHandle) {
    return IGM_LAUNCHER_CORE_PLACEHOLDER_TASK_ID;
  }
  const symbols = iGM_Launcher_CoreHandle.symbols as unknown as iGM_Launcher_CoreSymbols;
  // 按字节缓冲传递：UTF-8 编码并补零结尾，经指针交给原生侧
  return symbols.iGM_Launcher_Core_DownloadTask(Buffer.from(`${url}\0`, "utf8"));
}

/** 汇总原生核心状态，供主进程日志与状态栏后续模块使用 */
export function iGM_Launcher_Core_Status(): iGM_Launcher_CoreLibrary {
  const loaded = iGM_Launcher_Core_EnsureLoaded();
  return {
    loaded,
    version: iGM_Launcher_Core_GetVersion(),
    initResult: iGM_Launcher_Core_Init(),
  };
}

let iGM_Launcher_CoreMcHandle: Library<typeof iGM_Launcher_Core_McFfiSpec> | null = null;
let iGM_Launcher_CoreMcChecked = false;

/**
 * 探测原生侧是否已登记模块三的认证链符号。
 * 仅作可用性上报（主进程启动日志）：即使原生符号齐备，认证链仍由 Bun 侧执行，
 * 因为 Rust 侧实现统一返回 NOT_IMPLEMENTED。
 */
export function iGM_Launcher_Core_HasMcSymbols(): boolean {
  if (iGM_Launcher_CoreMcChecked) return iGM_Launcher_CoreMcHandle !== null;
  iGM_Launcher_CoreMcChecked = true;

  const libraryPath = iGM_Launcher_FindCoreLibraryPath();
  if (!libraryPath) return false;
  try {
    iGM_Launcher_CoreMcHandle = dlopen(libraryPath, iGM_Launcher_Core_McFfiSpec);
    return true;
  } catch (error) {
    console.warn("[iGM_Launcher_CoreBindings] 认证链原生符号未登记：", error);
    iGM_Launcher_CoreMcHandle = null;
    return false;
  }
}

// 导出 //
export {
  iGM_Launcher_Core_DownloadTask,
  iGM_Launcher_Core_GetVersion,
  iGM_Launcher_Core_Init,
};
export default iGM_Launcher_Core_Status;