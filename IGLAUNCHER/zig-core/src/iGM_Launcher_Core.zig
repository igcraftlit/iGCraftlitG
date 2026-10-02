//! 文件路径：zig-core/src/iGM_Launcher_Core.zig
//! 所属层：Zig 原生核心 / C ABI 入口
//! 路由：全局
//! 模块：iGM_Launcher_Core
//! 作用：Zig 原生核心入口，聚合各子模块并导出 C ABI，供启动器经 bun:ffi 加载
//! 内容：初始化与版本号导出、子模块引用（确保各模块导出符号进入动态库）

// 导入依赖 //
const std = @import("std");

pub const iGM_FileManager = @import("iGM_FileManager.zig");
pub const iGM_Hasher = @import("iGM_Hasher.zig");
pub const iGM_JavaManager = @import("iGM_JavaManager.zig");
pub const iGM_Downloader = @import("iGM_Downloader.zig");

// 类型定义 //

/// 核心版本号
const iGM_Launcher_Core_Version_Text: [:0]const u8 = "26.2.5";

// 核心逻辑 //

// 引用各子模块，确保其 export 函数被纳入编译并导出到动态库
comptime {
    _ = iGM_FileManager;
    _ = iGM_Hasher;
    _ = iGM_JavaManager;
    _ = iGM_Downloader;
}

// 导出 //

/// 初始化原生核心：0 表示成功
export fn iGM_Launcher_Core_Init() c_int {
    return 0;
}

/// 读取原生核心版本号（静态字符串）
export fn iGM_Launcher_Core_Version() [*:0]const u8 {
    return iGM_Launcher_Core_Version_Text.ptr;
}
