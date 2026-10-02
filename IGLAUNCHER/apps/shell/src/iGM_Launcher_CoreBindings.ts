/**
 * 文件路径：apps/shell/src/iGM_Launcher_CoreBindings.ts
 * 所属层：桌面外壳 / 原生核心桥接层
 * 路由：全局
 * 模块：iGM_Launcher_CoreBindings
 * 作用：把 Zig 原生核心（zig-core 编译出的 igm_downloader 动态库）的初始化与版本能力
 *       汇总为外壳启动状态，供主进程日志与状态栏使用
 * 内容：复用 iGM_Launcher_SDK 已加载的动态库句柄，导出 Init / GetVersion / Status；
 *       动态库缺失时返回共享包中的占位版本号，不抛出异常、不影响外壳启动
 */

// 导入依赖 //
import {
  IGM_LAUNCHER_CORE_PLACEHOLDER_VERSION,
  type iGM_Launcher_CoreLibrary,
} from "@igm-launcher/shared";
import {
  iGM_Launcher_SDK_CoreInit,
  iGM_Launcher_SDK_IsAvailable,
  iGM_Launcher_SDK_Version,
} from "./iGM_Launcher_SDK";

// 类型定义 //
/* 复用共享包中的 iGM_Launcher_CoreLibrary，不额外定义 */

// 核心逻辑 //

/** 初始化原生核心：动态库不可用时返回成功占位（0） */
function iGM_Launcher_Core_Init(): number {
  return iGM_Launcher_SDK_CoreInit();
}

/** 读取核心版本：动态库不可用时返回占位版本号 */
function iGM_Launcher_Core_GetVersion(): string {
  if (!iGM_Launcher_SDK_IsAvailable()) return IGM_LAUNCHER_CORE_PLACEHOLDER_VERSION;
  return iGM_Launcher_SDK_Version() || IGM_LAUNCHER_CORE_PLACEHOLDER_VERSION;
}

/** 汇总原生核心状态，供主进程日志与状态栏后续模块使用 */
export function iGM_Launcher_Core_Status(): iGM_Launcher_CoreLibrary {
  const loaded = iGM_Launcher_SDK_IsAvailable();
  return {
    loaded,
    version: iGM_Launcher_Core_GetVersion(),
    initResult: iGM_Launcher_Core_Init(),
  };
}

// 导出 //
export { iGM_Launcher_Core_GetVersion, iGM_Launcher_Core_Init };
export default iGM_Launcher_Core_Status;
