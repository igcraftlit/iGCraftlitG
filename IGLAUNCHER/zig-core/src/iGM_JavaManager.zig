//! 文件路径：zig-core/src/iGM_JavaManager.zig
//! 所属层：Zig 原生核心 / 基础层
//! 路由：全局（内部模块 + C ABI）
//! 模块：iGM_JavaManager
//! 作用：检测本机 Java 运行时（版本 / 路径 / 架构），导出 `iGM_Launcher_Java_Detect`
//! 内容：无终端窗口的进程捕获（CREATE_NO_WINDOW）、属性解析、where 定位 java 可执行文件、
//!       JSON 组装与转义、线程局部静态返回缓冲

// 导入依赖 //
const std = @import("std");
const iGM_FileManager = @import("iGM_FileManager.zig");

// 类型定义 //

/// 进程捕获结果（stdout / stderr 均由调用方释放）
const iGM_JavaManager_Capture = struct {
    stdout: []u8,
    stderr: []u8,
};

/// 线程局部静态返回缓冲（JSON 文本 + NUL）
threadlocal var iGM_JavaManager_Json_Buffer: [1024:0]u8 = .{0} ** 1024;

// 核心逻辑 //

/// 启动进程并捕获输出；create_no_window 保证 Windows 下无终端弹窗
fn iGM_JavaManager_Run(
    rt: *iGM_FileManager.iGM_FileManager_Runtime,
    argv: []const []const u8,
) !iGM_JavaManager_Capture {
    const result = try std.process.run(rt.allocator, rt.io, .{
        .argv = argv,
        .create_no_window = true,
    });
    return .{ .stdout = result.stdout, .stderr = result.stderr };
}

/// 在文本中查找 "key = value" / "key: value" 形式的取值
fn iGM_JavaManager_FindValue(haystack: []const u8, key: []const u8) ?[]const u8 {
    var index: usize = 0;
    while (std.mem.indexOfPos(u8, haystack, index, key)) |pos| {
        var cursor = pos + key.len;
        while (cursor < haystack.len and
            (haystack[cursor] == ' ' or haystack[cursor] == ':' or haystack[cursor] == '='))
        {
            cursor += 1;
        }
        const start = cursor;
        while (cursor < haystack.len and haystack[cursor] != '\r' and haystack[cursor] != '\n') {
            cursor += 1;
        }
        const value = std.mem.trim(u8, haystack[start..cursor], " \t");
        if (value.len > 0) return value;
        index = cursor;
    }
    return null;
}

/// 从 `java -version` 输出中提取 `version "x.y.z"` 形式的版本号
fn iGM_JavaManager_FindQuotedVersion(text: []const u8) ?[]const u8 {
    const marker = "version \"";
    const pos = std.mem.indexOf(u8, text, marker) orelse return null;
    const start = pos + marker.len;
    const end = std.mem.indexOfScalarPos(u8, text, start, '"') orelse return null;
    if (end <= start) return null;
    return text[start..end];
}

/// 取文本第一行（去除首尾空白）
fn iGM_JavaManager_FirstLine(text: []const u8) ?[]const u8 {
    var end: usize = 0;
    while (end < text.len and text[end] != '\r' and text[end] != '\n') end += 1;
    const line = std.mem.trim(u8, text[0..end], " \t");
    if (line.len == 0) return null;
    return line;
}

/// 向 JSON 写入字符串（转义反斜杠与双引号）
fn iGM_JavaManager_WriteJsonString(writer: *std.Io.Writer, value: []const u8) !void {
    for (value) |char| {
        switch (char) {
            '\\' => try writer.writeAll("\\\\"),
            '"' => try writer.writeAll("\\\""),
            '\r', '\n', '\t' => try writer.writeAll(" "),
            else => try writer.writeAll(&.{char}),
        }
    }
}

/// 组装 JSON 到线程局部缓冲并返回指针
fn iGM_JavaManager_FormatJson(
    found: bool,
    path: []const u8,
    version: []const u8,
    arch: []const u8,
) [*:0]const u8 {
    var buffer: std.Io.Writer.Allocating = .init(iGM_FileManager.iGM_FileManager_Allocator);
    defer buffer.deinit();
    const writer = &buffer.writer;

    writer.writeAll("{\"found\":") catch return &iGM_JavaManager_Json_Buffer;
    writer.writeAll(if (found) "true" else "false") catch return &iGM_JavaManager_Json_Buffer;
    writer.writeAll(",\"path\":\"") catch return &iGM_JavaManager_Json_Buffer;
    iGM_JavaManager_WriteJsonString(writer, path) catch return &iGM_JavaManager_Json_Buffer;
    writer.writeAll("\",\"version\":\"") catch return &iGM_JavaManager_Json_Buffer;
    iGM_JavaManager_WriteJsonString(writer, version) catch return &iGM_JavaManager_Json_Buffer;
    writer.writeAll("\",\"arch\":\"") catch return &iGM_JavaManager_Json_Buffer;
    iGM_JavaManager_WriteJsonString(writer, arch) catch return &iGM_JavaManager_Json_Buffer;
    writer.writeAll("\"}") catch return &iGM_JavaManager_Json_Buffer;

    const text = buffer.written();
    const length = @min(text.len, iGM_JavaManager_Json_Buffer.len - 1);
    @memcpy(iGM_JavaManager_Json_Buffer[0..length], text[0..length]);
    iGM_JavaManager_Json_Buffer[length] = 0;
    return &iGM_JavaManager_Json_Buffer;
}

// 导出 //

/// 检测 Java：返回静态 JSON `{"found":bool,"path":"...","version":"...","arch":"..."}`
export fn iGM_Launcher_Java_Detect() [*:0]const u8 {
    var rt: iGM_FileManager.iGM_FileManager_Runtime = undefined;
    rt.iGM_FileManager_Runtime_Init(iGM_FileManager.iGM_FileManager_Allocator);
    defer rt.iGM_FileManager_Runtime_Deinit();

    // 优先用 -XshowSettings:properties 一次拿到 java.version 与 os.arch
    var version: []const u8 = "";
    var arch: []const u8 = "";
    var version_owned: ?[]u8 = null;
    var arch_owned: ?[]u8 = null;
    defer if (version_owned) |value| rt.allocator.free(value);
    defer if (arch_owned) |value| rt.allocator.free(value);

    var found = false;
    if (iGM_JavaManager_Run(&rt, &.{ "java", "-XshowSettings:properties", "-version" })) |capture| {
        defer rt.allocator.free(capture.stdout);
        defer rt.allocator.free(capture.stderr);
        if (iGM_JavaManager_FindValue(capture.stderr, "java.version") orelse
            iGM_JavaManager_FindValue(capture.stdout, "java.version")) |value|
        {
            version_owned = rt.allocator.dupe(u8, value) catch null;
            version = version_owned orelse "";
        }
        if (iGM_JavaManager_FindValue(capture.stderr, "os.arch") orelse
            iGM_JavaManager_FindValue(capture.stdout, "os.arch")) |value|
        {
            arch_owned = rt.allocator.dupe(u8, value) catch null;
            arch = arch_owned orelse "";
        }
        found = version.len > 0;
    } else |_| {}

    // 回退：java -version（仅为取版本号）
    if (!found) {
        if (iGM_JavaManager_Run(&rt, &.{ "java", "-version" })) |capture| {
            defer rt.allocator.free(capture.stdout);
            defer rt.allocator.free(capture.stderr);
            const value = iGM_JavaManager_FindQuotedVersion(capture.stderr) orelse
                iGM_JavaManager_FindQuotedVersion(capture.stdout);
            if (value) |text| {
                version_owned = rt.allocator.dupe(u8, text) catch null;
                version = version_owned orelse "";
                found = version.len > 0;
            }
        } else |_| {}
    }

    // 用 where 定位可执行文件全路径
    var path: []const u8 = "";
    var path_owned: ?[]u8 = null;
    defer if (path_owned) |value| rt.allocator.free(value);
    if (found) {
        if (iGM_JavaManager_Run(&rt, &.{ "where", "java" })) |capture| {
            defer rt.allocator.free(capture.stdout);
            defer rt.allocator.free(capture.stderr);
            if (iGM_JavaManager_FirstLine(capture.stdout)) |line| {
                path_owned = rt.allocator.dupe(u8, line) catch null;
                path = path_owned orelse "";
            }
        } else |_| {}
        if (path.len == 0 and arch.len == 0) arch = "";
    }

    return iGM_JavaManager_FormatJson(found, path, version, arch);
}
