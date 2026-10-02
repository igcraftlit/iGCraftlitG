//! 文件路径：zig-core/src/iGM_FileManager.zig
//! 所属层：Zig 原生核心 / 基础层
//! 路由：全局（内部模块）
//! 模块：iGM_FileManager
//! 作用：提供进程级分配器与 Io 运行时，封装路径拼接、缓存目录、目录创建与文件增删改查
//! 内容：iGM_FileManager_Runtime（std.Io.Threaded + Io）、缓存目录解析、父目录创建、
//!       文件存在性与大小、文件删除、原子改名（覆盖）、文件复制（含建父目录）

// 导入依赖 //
const std = @import("std");
const Io = std.Io;

// 类型定义 //

/// 进程级线程安全分配器（smp_allocator 可在任意线程使用）
pub const iGM_FileManager_Allocator: std.mem.Allocator = std.heap.smp_allocator;

/// Io 运行时：持有 Threaded 实例与其 Io 接口
/// 注意：Threaded 实例的地址必须稳定，故只允许就地初始化，禁止按值返回
pub const iGM_FileManager_Runtime = struct {
    allocator: std.mem.Allocator = iGM_FileManager_Allocator,
    threaded: std.Io.Threaded = undefined,
    io: Io = undefined,

    /// 就地初始化运行时（创建 Threaded 并取得 Io）
    pub fn iGM_FileManager_Runtime_Init(self: *iGM_FileManager_Runtime, allocator: std.mem.Allocator) void {
        self.allocator = allocator;
        self.threaded = std.Io.Threaded.init(allocator, .{});
        self.io = self.threaded.io();
    }

    /// 释放运行时（等待内部工作线程结束）
    pub fn iGM_FileManager_Runtime_Deinit(self: *iGM_FileManager_Runtime) void {
        self.threaded.deinit();
    }
};

// 核心逻辑 //

/// 拼接路径片段；由调用方负责释放
pub fn iGM_FileManager_JoinPath(
    allocator: std.mem.Allocator,
    parts: []const []const u8,
) ![]u8 {
    return std.Io.Dir.path.join(allocator, parts);
}

/// 解析缓存目录 `%USERPROFILE%\.igm\cache`；由调用方负责释放
pub fn iGM_FileManager_CacheDir(allocator: std.mem.Allocator) ![]u8 {
    const environ: std.process.Environ = .{ .block = .{ .use_global = true } };
    const home = std.process.Environ.getAlloc(environ, allocator, "USERPROFILE") catch {
        return error.EnvironmentVariableMissing;
    };
    defer allocator.free(home);
    if (home.len == 0) return error.EnvironmentVariableMissing;
    return std.Io.Dir.path.join(allocator, &.{ home, ".igm", "cache" });
}

/// 创建目标文件的父目录（已存在视为成功）
pub fn iGM_FileManager_EnsureParentDir(
    rt: *iGM_FileManager_Runtime,
    file_path: []const u8,
) !void {
    const parent = std.Io.Dir.path.dirname(file_path) orelse return;
    if (parent.len == 0) return;
    std.Io.Dir.cwd().createDirPath(rt.io, parent) catch |err| switch (err) {
        error.PathAlreadyExists => {},
        else => return err,
    };
}

/// 查询文件大小；不存在或不是普通文件时返回 null
pub fn iGM_FileManager_ExistsSize(
    rt: *iGM_FileManager_Runtime,
    path: []const u8,
) ?u64 {
    const st = std.Io.Dir.cwd().statFile(rt.io, path, .{}) catch return null;
    if (st.kind != .file) return null;
    return st.size;
}

/// 删除文件；不存在或删除失败均静默忽略
pub fn iGM_FileManager_Remove(
    rt: *iGM_FileManager_Runtime,
    path: []const u8,
) void {
    std.Io.Dir.deleteFileAbsolute(rt.io, path) catch {};
}

/// 原子改名：目标已存在时先删除再改名，避免半成品被读到
pub fn iGM_FileManager_RenameReplace(
    rt: *iGM_FileManager_Runtime,
    from: []const u8,
    to: []const u8,
) !void {
    iGM_FileManager_Remove(rt, to);
    try std.Io.Dir.renameAbsolute(from, to, rt.io);
}

/// 复制文件（自动创建父目录、覆盖已存在目标）
pub fn iGM_FileManager_Copy(
    rt: *iGM_FileManager_Runtime,
    from: []const u8,
    to: []const u8,
) !void {
    try std.Io.Dir.copyFileAbsolute(from, to, rt.io, .{
        .make_path = true,
        .replace = true,
    });
}

// 导出 //
