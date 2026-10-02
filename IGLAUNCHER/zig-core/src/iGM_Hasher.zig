//! 文件路径：zig-core/src/iGM_Hasher.zig
//! 所属层：Zig 原生核心 / 基础层
//! 路由：全局（内部模块 + C ABI）
//! 模块：iGM_Hasher
//! 作用：流式计算文件 SHA1 / SHA256，导出 `iGM_Launcher_Hash_Compute`
//! 内容：流式哈希核心（64 KiB 缓冲，不整文件载入内存）、小写十六进制输出、
//!       线程局部返回缓冲、"sha1"|"sha256" 算法分派

// 导入依赖 //
const std = @import("std");
const iGM_FileManager = @import("iGM_FileManager.zig");

// 类型定义 //

/// 读取缓冲大小（字节）
const iGM_Hasher_Chunk_Bytes: usize = 64 * 1024;

/// 十六进制字符表
const iGM_Hasher_Hex_Chars = "0123456789abcdef";

/// 线程局部返回缓冲：最长 64 字符 + NUL
threadlocal var iGM_Hasher_Hex_Buffer: [65:0]u8 = .{0} ** 65;

// 核心逻辑 //

/// 把摘要字节写成小写十六进制
fn iGM_Hasher_EncodeHex(digest: []const u8, out: []u8) void {
    for (digest, 0..) |byte, index| {
        out[index * 2] = iGM_Hasher_Hex_Chars[byte >> 4];
        out[index * 2 + 1] = iGM_Hasher_Hex_Chars[byte & 0x0f];
    }
}

/// 流式计算文件摘要并写入 out（out.len 必须等于 digest_length * 2）
fn iGM_Hasher_FileDigest(
    comptime Hasher: type,
    rt: *iGM_FileManager.iGM_FileManager_Runtime,
    path: []const u8,
    out: []u8,
) !void {
    var file = try std.Io.Dir.cwd().openFile(rt.io, path, .{});
    defer file.close(rt.io);

    var hasher = Hasher.init(.{});
    var buffer: [iGM_Hasher_Chunk_Bytes]u8 = undefined;
    while (true) {
        // 说明：Zig 0.16 的 File.readStreaming 以 error.EndOfStream 表示流末尾（非返回 0）
        const read = file.readStreaming(rt.io, &.{buffer[0..]}) catch |err| switch (err) {
            error.EndOfStream => break,
            else => return err,
        };
        if (read == 0) break;
        hasher.update(buffer[0..read]);
    }
    var digest: [Hasher.digest_length]u8 = undefined;
    hasher.final(&digest);
    iGM_Hasher_EncodeHex(digest[0..], out);
}

/// 计算文件 SHA1 小写十六进制（40 字符）
pub fn iGM_Hasher_Sha1File(
    rt: *iGM_FileManager.iGM_FileManager_Runtime,
    path: []const u8,
) ![40]u8 {
    var out: [40]u8 = undefined;
    try iGM_Hasher_FileDigest(std.crypto.hash.Sha1, rt, path, out[0..]);
    return out;
}

/// 计算文件 SHA256 小写十六进制（64 字符）
pub fn iGM_Hasher_Sha256File(
    rt: *iGM_FileManager.iGM_FileManager_Runtime,
    path: []const u8,
) ![64]u8 {
    var out: [64]u8 = undefined;
    try iGM_Hasher_FileDigest(std.crypto.hash.sha2.Sha256, rt, path, out[0..]);
    return out;
}

// 导出 //

/// 计算文件哈希：algorithm 取 "sha1" | "sha256"，返回小写十六进制
/// 返回线程局部静态缓冲指针（最长 64 字符 + NUL），失败返回空串
export fn iGM_Launcher_Hash_Compute(
    file_path: ?[*:0]const u8,
    algorithm: ?[*:0]const u8,
) [*:0]const u8 {
    iGM_Hasher_Hex_Buffer[0] = 0;
    const path_ptr = file_path orelse return &iGM_Hasher_Hex_Buffer;
    const algo_ptr = algorithm orelse return &iGM_Hasher_Hex_Buffer;
    const path = std.mem.span(path_ptr);
    const algo = std.mem.span(algo_ptr);
    if (path.len == 0) return &iGM_Hasher_Hex_Buffer;

    var rt: iGM_FileManager.iGM_FileManager_Runtime = undefined;
    rt.iGM_FileManager_Runtime_Init(iGM_FileManager.iGM_FileManager_Allocator);
    defer rt.iGM_FileManager_Runtime_Deinit();

    var length: usize = 0;
    if (std.ascii.eqlIgnoreCase(algo, "sha1")) {
        const hex = iGM_Hasher_Sha1File(&rt, path) catch return &iGM_Hasher_Hex_Buffer;
        @memcpy(iGM_Hasher_Hex_Buffer[0..hex.len], hex[0..]);
        length = hex.len;
    } else if (std.ascii.eqlIgnoreCase(algo, "sha256")) {
        const hex = iGM_Hasher_Sha256File(&rt, path) catch return &iGM_Hasher_Hex_Buffer;
        @memcpy(iGM_Hasher_Hex_Buffer[0..hex.len], hex[0..]);
        length = hex.len;
    } else {
        return &iGM_Hasher_Hex_Buffer;
    }
    iGM_Hasher_Hex_Buffer[length] = 0;
    return &iGM_Hasher_Hex_Buffer;
}
