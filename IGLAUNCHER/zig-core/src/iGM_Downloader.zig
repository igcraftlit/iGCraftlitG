//! 文件路径：zig-core/src/iGM_Downloader.zig
//! 所属层：Zig 原生核心 / 下载引擎
//! 路由：全局（内部模块 + C ABI）
//! 模块：iGM_Downloader
//! 作用：把「资源 id + 版本 + 加载器 + 目标目录」解析并下载为本地文件，支持流式进度、
//!       暂停/恢复/取消/重试、断点续传、429/503 指数退避、SHA1 流式校验、按哈希去重缓存
//! 内容：进度结构体与回调类型、任务句柄与生命周期 C ABI、Modrinth 解析、HTTPS 流式下载、
//!       进度节拍与速度平滑、原子改名、缓存命中复制

// 导入依赖 //
const std = @import("std");
const iGM_FileManager = @import("iGM_FileManager.zig");
const iGM_Hasher = @import("iGM_Hasher.zig");

// 类型定义 //

/// 任务状态：等待
pub const iGM_Launcher_Status_Idle: c_int = 0;
/// 任务状态：下载中
pub const iGM_Launcher_Status_Downloading: c_int = 1;
/// 任务状态：完成
pub const iGM_Launcher_Status_Done: c_int = 2;
/// 任务状态：失败
pub const iGM_Launcher_Status_Failed: c_int = 3;
/// 任务状态：已暂停
pub const iGM_Launcher_Status_Paused: c_int = 4;
/// 任务状态：已取消
pub const iGM_Launcher_Status_Canceled: c_int = 5;

/// 调用成功
pub const iGM_Launcher_Ok: c_int = 0;
/// 参数为空指针
pub const iGM_Launcher_Err_Null: c_int = -1;
/// 任务状态不允许该操作
pub const iGM_Launcher_Err_State: c_int = -2;

/// 进度节拍（毫秒）
pub const IGM_LAUNCHER_PROGRESS_TICK_MS: u64 = 120;
/// 读写缓冲（字节）
pub const IGM_LAUNCHER_CHUNK_BYTES: usize = 64 * 1024;
/// 暂停轮询间隔（毫秒）
pub const IGM_LAUNCHER_PAUSE_POLL_MS: u64 = 100;
/// 请求间隔随机抖动下界（毫秒）
pub const IGM_LAUNCHER_REQUEST_JITTER_MIN_MS: u64 = 100;
/// 请求间隔随机抖动上界（毫秒）
pub const IGM_LAUNCHER_REQUEST_JITTER_MAX_MS: u64 = 300;
/// 默认并发度
pub const IGM_LAUNCHER_DEFAULT_CONCURRENCY: u8 = 1;
/// 最大并发度
pub const IGM_LAUNCHER_MAX_CONCURRENCY: u8 = 3;
/// 429 / 503 最多重试次数
pub const IGM_LAUNCHER_RETRY_MAX: u32 = 5;
/// Modrinth API 基址
pub const IGM_LAUNCHER_MODRINTH_API: []const u8 = "https://api.modrinth.com/v2";
/// 请求 User-Agent（Modrinth 要求可联系的 UA）
pub const IGM_LAUNCHER_USER_AGENT: []const u8 = "iGM-CraftCeon/1.0 (contact: igcraftlit@outlook.com)";

/// 当前并发度（当前实现为单任务，常量保留以便后续扩展）
pub var iGM_Launcher_Download_Concurrency: u8 = IGM_LAUNCHER_DEFAULT_CONCURRENCY;

/// 进度结构体：64 字节（64 位平台），字段顺序与偏移不可变
pub const iGM_Launcher_Progress = extern struct {
    /// 任务编号（C 字符串，仅回调期间有效）
    task_id: ?[*:0]const u8,
    /// 状态，取值见状态常量
    status: c_int,
    /// 已下载字节
    downloaded: i64,
    /// 总字节，未知为 0
    total: i64,
    /// 百分比 0-100
    percent: f64,
    /// 速度（字节/秒）
    speed: f64,
    /// 预计剩余秒数，未知为 -1
    eta: i64,
    /// 错误信息（C 字符串，仅回调期间有效），无错误为空串
    /// 说明：ABI 字段名为 error，此处因 error 是 Zig 关键字改用 error_text，偏移不变
    error_text: ?[*:0]const u8,
};

/// 进度回调类型
pub const iGM_Launcher_ProgressCallback = ?*const fn (
    ?*const iGM_Launcher_Progress,
    ?*anyopaque,
) callconv(.c) void;

comptime {
    // 结构体大小与各字段偏移必须严格一致，否则 TS 侧解析会错位
    std.debug.assert(@sizeOf(iGM_Launcher_Progress) == 64);
    std.debug.assert(@offsetOf(iGM_Launcher_Progress, "task_id") == 0);
    std.debug.assert(@offsetOf(iGM_Launcher_Progress, "status") == 8);
    std.debug.assert(@offsetOf(iGM_Launcher_Progress, "downloaded") == 16);
    std.debug.assert(@offsetOf(iGM_Launcher_Progress, "total") == 24);
    std.debug.assert(@offsetOf(iGM_Launcher_Progress, "percent") == 32);
    std.debug.assert(@offsetOf(iGM_Launcher_Progress, "speed") == 40);
    std.debug.assert(@offsetOf(iGM_Launcher_Progress, "eta") == 48);
    std.debug.assert(@offsetOf(iGM_Launcher_Progress, "error_text") == 56);
}

/// 解析后的待下载文件描述
const iGM_Downloader_Resolved = struct {
    url: []const u8,
    filename: []const u8,
    size: i64,
    sha1: []const u8,
};

/// 下载结果
const iGM_Downloader_Outcome = union(enum) {
    completed: i64,
    canceled,
};

/// Modrinth 文件哈希集合
const iGM_Downloader_ModrinthHashes = struct {
    sha1: []const u8 = "",
};

/// Modrinth 文件条目
const iGM_Downloader_ModrinthFile = struct {
    url: []const u8 = "",
    filename: []const u8 = "",
    size: i64 = 0,
    primary: bool = false,
    hashes: iGM_Downloader_ModrinthHashes = .{},
};

/// Modrinth 版本记录（只声明关心的字段）
const iGM_Downloader_ModrinthVersion = struct {
    files: []const iGM_Downloader_ModrinthFile = &.{},
};

/// 下载任务句柄（不透明）
pub const iGM_Launcher_Download_Task = struct {
    task_id: [:0]u8,
    resource_id: []u8,
    version: []u8,
    loader: []u8,
    target_dir: []u8,
    /// 直链模式：非空时跳过 Modrinth 解析，直接下载该 URL（游戏本体清单 / 第三方直链共用）
    direct_url: []u8 = &.{},
    /// 直链模式的目标文件绝对路径（由调用方拼好，Zig 侧仅做下载与校验）
    direct_dest: []u8 = &.{},
    /// 直链模式的期望 SHA1（空串表示跳过校验）
    direct_sha1: []u8 = &.{},
    /// 直链模式的期望大小（0 表示未知）
    direct_size: i64 = 0,
    cb: iGM_Launcher_ProgressCallback = null,
    user_data: ?*anyopaque = null,
    cancel: std.atomic.Value(bool) = .init(false),
    pause: std.atomic.Value(bool) = .init(false),
    running: std.atomic.Value(bool) = .init(false),
    thread: ?std.Thread = null,
    /// 最近一次 HTTP 状态码：用于把失败原因整理为可读文案（如「Modrinth 返回状态码 403」）
    last_status: std.atomic.Value(u32) = .init(0),
    /// 进度快照：常驻任务内，保证回调期间地址有效
    /// 说明：bun:ffi 的 threadsafe JSCallback 会把回调排队到 JS 主线程后再执行，
    ///       若沿用「栈上构造」，消费端读到的将是已失效的栈内存，故改为任务常驻
    progress_slot: iGM_Launcher_Progress = .{
        .task_id = null,
        .status = iGM_Launcher_Status_Idle,
        .downloaded = 0,
        .total = 0,
        .percent = 0.0,
        .speed = 0.0,
        .eta = -1,
        .error_text = "",
    },
    /// 错误信息缓冲：常驻任务内，随进度快照一并暴露
    error_slot: [256:0]u8 = .{0} ** 256,
};

/// 任务编号自增序列
var iGM_Launcher_Task_Sequence: std.atomic.Value(u64) = .init(0);

// 核心逻辑 //

/// 关键节点日志：统一 `[SDK]` 前缀，输出到标准错误流。
/// 仅打印文本，不创建任何窗口 / 控制台，符合「无终端弹窗」约束。
fn iGM_Downloader_Log(comptime fmt: []const u8, args: anytype) void {
    std.debug.print("[SDK] " ++ fmt ++ "\n", args);
}

/// 触发一次进度回调。
/// 进度快照与错误缓冲常驻任务句柄内（progress_slot / error_slot）：
/// bun:ffi 的 threadsafe JSCallback 会把回调排队到 JS 主线程后再执行，
/// 若在栈上构造，回调真正读取时栈帧已失效，消费端会读到垃圾指针。
fn iGM_Downloader_Emit(
    task: *iGM_Launcher_Download_Task,
    status: c_int,
    downloaded: i64,
    total: i64,
    speed: f64,
    eta: i64,
    err: ?[]const u8,
) void {
    const callback = task.cb orelse return;

    if (err) |message| {
        const length = @min(message.len, task.error_slot.len - 1);
        @memcpy(task.error_slot[0..length], message[0..length]);
        task.error_slot[length] = 0;
    } else {
        task.error_slot[0] = 0;
    }

    const percent: f64 = if (total > 0)
        (@as(f64, @floatFromInt(downloaded)) / @as(f64, @floatFromInt(total))) * 100.0
    else
        0.0;

    task.progress_slot = .{
        .task_id = task.task_id.ptr,
        .status = status,
        .downloaded = downloaded,
        .total = total,
        .percent = percent,
        .speed = speed,
        .eta = eta,
        .error_text = @ptrCast(&task.error_slot),
    };
    callback(&task.progress_slot, task.user_data);
}

/// 从 `?*anyopaque` 还原任务指针
fn iGM_Launcher_Download_TaskCast(pointer: ?*anyopaque) ?*iGM_Launcher_Download_Task {
    const raw = pointer orelse return null;
    return @ptrCast(@alignCast(raw));
}

/// 校验文件名，拒绝空串、路径分隔符与上跳片段
fn iGM_Downloader_SafeFileName(filename: []const u8) bool {
    if (filename.len == 0) return false;
    if (std.mem.indexOfScalar(u8, filename, '/') != null) return false;
    if (std.mem.indexOfScalar(u8, filename, '\\') != null) return false;
    if (std.mem.eql(u8, filename, ".")) return false;
    if (std.mem.eql(u8, filename, "..")) return false;
    return true;
}

/// 从版本记录中挑选主文件并组装描述
fn iGM_Downloader_PickFile(
    allocator: std.mem.Allocator,
    version: iGM_Downloader_ModrinthVersion,
) !iGM_Downloader_Resolved {
    var chosen: ?iGM_Downloader_ModrinthFile = null;
    for (version.files) |file| {
        if (file.primary) {
            chosen = file;
            break;
        }
    }
    if (chosen == null and version.files.len > 0) chosen = version.files[0];
    const file = chosen orelse return error.NoDownloadableFile;

    if (std.mem.trim(u8, file.url, " \t").len == 0) return error.FileMissingUrl;
    if (!iGM_Downloader_SafeFileName(file.filename)) return error.InvalidFileName;

    const raw_sha1 = file.hashes.sha1;
    const sha1 = try allocator.alloc(u8, raw_sha1.len);
    _ = std.ascii.lowerString(sha1, raw_sha1);

    return .{
        .url = try allocator.dupe(u8, file.url),
        .filename = try allocator.dupe(u8, file.filename),
        .size = file.size,
        .sha1 = sha1,
    };
}

/// 发起一次 GET 并把响应体读入内存。
/// 记录请求直链与第三方返回状态码（关键节点日志），
/// 非 2xx / 3xx 时把状态码写入任务并返回 ModrinthStatusFailed，
/// 避免把错误页当作正常 JSON 继续解析而给出难以定位的报错。
fn iGM_Downloader_HttpGet(
    rt: *iGM_FileManager.iGM_FileManager_Runtime,
    client: *std.http.Client,
    task: ?*iGM_Launcher_Download_Task,
    url: []const u8,
) ![]u8 {
    var body: std.Io.Writer.Allocating = .init(rt.allocator);
    defer body.deinit();

    iGM_Downloader_Log("正在请求 Modrinth 直链: {s}", .{url});
    const result = try client.fetch(.{
        .location = .{ .url = url },
        .response_writer = &body.writer,
        .extra_headers = &.{
            .{ .name = "User-Agent", .value = IGM_LAUNCHER_USER_AGENT },
        },
        .keep_alive = false,
    });
    const status = @intFromEnum(result.status);
    iGM_Downloader_Log("第三方返回状态码: {d}", .{status});
    if (task) |handle| handle.last_status.store(status, .release);
    if (status < 200 or status >= 400) return error.ModrinthStatusFailed;
    return body.toOwnedSlice();
}

/// 解析资源：
/// 1) 先把 version 当作 Modrinth 版本 id，调用单版本接口；
/// 2) 未命中时再把它当作游戏版本号，按加载器与游戏版本筛选版本列表取首个。
fn iGM_Downloader_Resolve(
    rt: *iGM_FileManager.iGM_FileManager_Runtime,
    client: *std.http.Client,
    task: ?*iGM_Launcher_Download_Task,
    allocator: std.mem.Allocator,
    resource_id: []const u8,
    version: []const u8,
    loader: []const u8,
) !iGM_Downloader_Resolved {
    if (std.mem.trim(u8, resource_id, " \t").len == 0) return error.ResourceIdEmpty;

    const parse_options: std.json.ParseOptions = .{ .ignore_unknown_fields = true };

    // 路径一：按版本 id 精确解析
    if (std.mem.trim(u8, version, " \t").len > 0) {
        const by_id = try std.fmt.allocPrint(
            allocator,
            "{s}/project/{s}/version/{s}",
            .{ IGM_LAUNCHER_MODRINTH_API, resource_id, version },
        );
        if (iGM_Downloader_HttpGet(rt, client, task, by_id)) |body| {
            if (std.json.parseFromSlice(iGM_Downloader_ModrinthVersion, allocator, body, parse_options)) |parsed| {
                if (iGM_Downloader_PickFile(allocator, parsed.value)) |resolved| {
                    return resolved;
                } else |_| {}
            } else |_| {}
        } else |_| {}
    }

    // 路径二：按游戏版本 + 加载器筛选
    const by_query = try std.fmt.allocPrint(
        allocator,
        "{s}/project/{s}/version?loaders=%5B%22{s}%22%5D&game_versions=%5B%22{s}%22%5D",
        .{ IGM_LAUNCHER_MODRINTH_API, resource_id, loader, version },
    );
    const body = try iGM_Downloader_HttpGet(rt, client, task, by_query);
    const parsed = try std.json.parseFromSlice([]iGM_Downloader_ModrinthVersion, allocator, body, parse_options);
    if (parsed.value.len == 0) return error.NoMatchingResource;
    return iGM_Downloader_PickFile(allocator, parsed.value[0]);
}

/// 暂停等待：暂停期间按固定间隔轮询；取消时返回 true
fn iGM_Downloader_WaitWhilePaused(
    rt: *iGM_FileManager.iGM_FileManager_Runtime,
    task: *iGM_Launcher_Download_Task,
) bool {
    while (task.pause.load(.acquire)) {
        if (task.cancel.load(.acquire)) return true;
        std.Io.sleep(
            rt.io,
            std.Io.Duration.fromMilliseconds(@intCast(IGM_LAUNCHER_PAUSE_POLL_MS)),
            .awake,
        ) catch {};
    }
    return task.cancel.load(.acquire);
}

/// 请求前的随机抖动（100-300ms），降低瞬时并发压力
fn iGM_Downloader_ApplyJitter(rt: *iGM_FileManager.iGM_FileManager_Runtime) void {
    const now = std.Io.Timestamp.now(rt.io, .awake);
    const base: u64 = @truncate(@as(u96, @bitCast(now.nanoseconds)));
    const seed = base ^ (iGM_Launcher_Task_Sequence.load(.monotonic) *% 0x9E3779B97F4A7C15);
    var prng = std.Random.DefaultPrng.init(seed);
    const span = IGM_LAUNCHER_REQUEST_JITTER_MAX_MS - IGM_LAUNCHER_REQUEST_JITTER_MIN_MS;
    const delay = IGM_LAUNCHER_REQUEST_JITTER_MIN_MS + prng.random().uintLessThan(u64, span + 1);
    std.Io.sleep(rt.io, std.Io.Duration.fromMilliseconds(@intCast(delay)), .awake) catch {};
}

/// 429 / 503 的指数退避
fn iGM_Downloader_Backoff(
    rt: *iGM_FileManager.iGM_FileManager_Runtime,
    attempt: u32,
) void {
    const shift: u6 = @intCast(@min(attempt, 4));
    const delay = @min(@as(u64, 500) << shift, 8000);
    std.Io.sleep(rt.io, std.Io.Duration.fromMilliseconds(@intCast(delay)), .awake) catch {};
}

/// 流式下载单个文件：
/// 1) 写入 `<dest>.part`，边写边算 SHA1；
/// 2) 按 120ms 节拍回调进度（downloaded / total / speed / eta）；
/// 3) 结束时（清单提供时）流式校验 SHA1，通过后原子改名到最终路径；
/// 4) `<dest>.part` 已存在时以 Range 续传，服务器不支持则从头覆盖重下。
fn iGM_Downloader_DownloadFile(
    rt: *iGM_FileManager.iGM_FileManager_Runtime,
    client: *std.http.Client,
    task: *iGM_Launcher_Download_Task,
    url: []const u8,
    dest_path: []const u8,
    part_path: []const u8,
    expected_sha1: []const u8,
    expected_size: i64,
) !iGM_Downloader_Outcome {
    const io = rt.io;
    const dir = std.Io.Dir.cwd();

    try iGM_FileManager.iGM_FileManager_EnsureParentDir(rt, dest_path);

    // 已存在的 .part 大小即续传起点
    var resume_offset: u64 = 0;
    if (iGM_FileManager.iGM_FileManager_ExistsSize(rt, part_path)) |size| {
        resume_offset = size;
    }

    // 直链模式（游戏本体清单走官方 CDN，按清单逐文件下载）不做随机抖动，
    // 否则数千个资源对象会被 100-300ms 的间隔拖到不可用；第三方资源仍保留抖动限速。
    if (task.direct_url.len == 0) iGM_Downloader_ApplyJitter(rt);

    const uri = try std.Uri.parse(url);
    const tick_nanoseconds: i96 = @as(i96, IGM_LAUNCHER_PROGRESS_TICK_MS) * std.time.ns_per_ms;

    var attempt: u32 = 0;
    while (true) {
        var range_buffer: [64]u8 = undefined;
        var headers_buffer: [2]std.http.Header = undefined;
        var header_count: usize = 0;
        headers_buffer[header_count] = .{ .name = "User-Agent", .value = IGM_LAUNCHER_USER_AGENT };
        header_count += 1;
        if (resume_offset > 0) {
            const range_value = std.fmt.bufPrint(&range_buffer, "bytes={d}-", .{resume_offset}) catch "bytes=0-";
            headers_buffer[header_count] = .{ .name = "Range", .value = range_value };
            header_count += 1;
        }

        var request = try client.request(.GET, uri, .{
            .extra_headers = headers_buffer[0..header_count],
            .keep_alive = false,
        });
        defer request.deinit();
        try request.sendBodiless();

        var redirect_buffer: [4096]u8 = undefined;
        var response = try request.receiveHead(&redirect_buffer);
        const status = @intFromEnum(response.head.status);
        iGM_Downloader_Log("正在请求下载直链: {s}", .{url});
        iGM_Downloader_Log("下载源返回状态码: {d}", .{status});
        task.last_status.store(status, .release);

        // 429 / 503 指数退避
        if ((status == 429 or status == 503) and attempt < IGM_LAUNCHER_RETRY_MAX) {
            attempt += 1;
            iGM_Downloader_Backoff(rt, attempt);
            continue;
        }
        if (status != 200 and status != 206) return error.HttpStatusFailed;

        // 服务器忽略 Range（返回 200）时从头写入
        const effective_offset: u64 = if (status == 206) resume_offset else 0;
        const content_length = response.head.content_length;
        var total: i64 = if (content_length) |value| @intCast(value) else expected_size;
        if (status == 206) {
            if (content_length) |value| {
                total = @as(i64, @intCast(effective_offset)) + @as(i64, @intCast(value));
            }
        }

        var part_file = if (effective_offset > 0)
            try dir.createFile(io, part_path, .{ .truncate = false })
        else
            try dir.createFile(io, part_path, .{ .truncate = true });
        defer part_file.close(io);

        var write_buffer: [IGM_LAUNCHER_CHUNK_BYTES]u8 = undefined;
        var file_writer = part_file.writer(io, &write_buffer);
        file_writer.pos = effective_offset;

        var transfer_buffer: [8192]u8 = undefined;
        const body = response.reader(&transfer_buffer);

        var downloaded: i64 = @intCast(effective_offset);
        var last_bytes: i64 = downloaded;
        var last_speed: f64 = 0.0;
        var last_tick = std.Io.Timestamp.now(io, .awake);
        var read_buffer: [IGM_LAUNCHER_CHUNK_BYTES]u8 = undefined;

        while (true) {
            if (iGM_Downloader_WaitWhilePaused(rt, task)) {
                iGM_FileManager.iGM_FileManager_Remove(rt, part_path);
                return .canceled;
            }
            const read = body.readSliceShort(&read_buffer) catch return error.HttpBodyReadFailed;
            if (read == 0) break;

            file_writer.interface.writeAll(read_buffer[0..read]) catch return error.FileWriteFailed;
            downloaded += @intCast(read);

            const now = std.Io.Timestamp.now(io, .awake);
            const elapsed = now.nanoseconds - last_tick.nanoseconds;
            if (elapsed >= tick_nanoseconds) {
                const seconds = @max(@as(f64, @floatFromInt(elapsed)) / 1_000_000_000.0, 0.001);
                const current_speed = @as(f64, @floatFromInt(downloaded - last_bytes)) / seconds;
                last_speed = if (last_speed <= 0.0) current_speed else last_speed * 0.7 + current_speed * 0.3;
                last_bytes = downloaded;
                last_tick = now;
                const eta: i64 = if (total > 0 and last_speed > 0.0)
                    @intFromFloat(@round(@as(f64, @floatFromInt(@max(total - downloaded, 0))) / last_speed))
                else
                    -1;
                iGM_Downloader_Emit(
                    task,
                    if (task.pause.load(.acquire)) iGM_Launcher_Status_Paused else iGM_Launcher_Status_Downloading,
                    downloaded,
                    total,
                    last_speed,
                    eta,
                    null,
                );
            }
        }

        file_writer.interface.flush() catch return error.FileWriteFailed;

        if (task.cancel.load(.acquire)) {
            iGM_FileManager.iGM_FileManager_Remove(rt, part_path);
            return .canceled;
        }

        // 校验 SHA1（清单未提供时跳过）
        if (expected_sha1.len > 0) {
            const actual = iGM_Hasher.iGM_Hasher_Sha1File(rt, part_path) catch return error.HashFailed;
            if (!std.ascii.eqlIgnoreCase(actual[0..], expected_sha1)) {
                iGM_FileManager.iGM_FileManager_Remove(rt, part_path);
                return error.Sha1Mismatch;
            }
        }

        try iGM_FileManager.iGM_FileManager_RenameReplace(rt, part_path, dest_path);
        return .{ .completed = downloaded };
    }
}

/// 缓存命中则直接复制，返回是否命中
fn iGM_Downloader_TryCache(
    rt: *iGM_FileManager.iGM_FileManager_Runtime,
    allocator: std.mem.Allocator,
    resolved: iGM_Downloader_Resolved,
    dest_path: []const u8,
) ?i64 {
    if (resolved.sha1.len == 0) return null;
    const cache_dir = iGM_FileManager.iGM_FileManager_CacheDir(allocator) catch return null;
    const cache_file = iGM_FileManager.iGM_FileManager_JoinPath(allocator, &.{ cache_dir, resolved.sha1 }) catch return null;
    const size = iGM_FileManager.iGM_FileManager_ExistsSize(rt, cache_file) orelse return null;
    iGM_FileManager.iGM_FileManager_EnsureParentDir(rt, dest_path) catch return null;
    iGM_FileManager.iGM_FileManager_Copy(rt, cache_file, dest_path) catch return null;
    return @intCast(size);
}

/// 下载成功后将成品写入缓存（按 sha1 去重）
fn iGM_Downloader_StoreCache(
    rt: *iGM_FileManager.iGM_FileManager_Runtime,
    allocator: std.mem.Allocator,
    resolved: iGM_Downloader_Resolved,
    dest_path: []const u8,
) void {
    if (resolved.sha1.len == 0) return;
    const cache_dir = iGM_FileManager.iGM_FileManager_CacheDir(allocator) catch return;
    const cache_file = iGM_FileManager.iGM_FileManager_JoinPath(allocator, &.{ cache_dir, resolved.sha1 }) catch return;
    iGM_FileManager.iGM_FileManager_Copy(rt, dest_path, cache_file) catch {};
}

/// 把 Zig 错误整理为界面可读的中文文案（含第三方状态码），未知错误回退为错误名。
/// 调用方提供栈上缓冲；文案会被 iGM_Downloader_Emit 立即复制进任务常驻缓冲，随后栈失效无影响。
fn iGM_Downloader_ErrorText(
    task: *iGM_Launcher_Download_Task,
    err: anyerror,
    buffer: []u8,
) []const u8 {
    const status = task.last_status.load(.acquire);
    // 版本已被作者删除 / 直链失效：给出可操作提示，而不是笼统的「无法连接」
    if (status == 404) return "该版本已失效，请选择其他版本";
    return switch (err) {
        error.ModrinthStatusFailed => std.fmt.bufPrint(
            buffer,
            "无法连接 Modrinth（状态码 {d}）",
            .{status},
        ) catch "无法连接 Modrinth",
        error.NoMatchingResource => "未找到匹配该游戏版本与加载器的资源",
        error.NoDownloadableFile, error.FileMissingUrl => "该版本没有可直接下载的文件",
        error.InvalidFileName => "资源文件名非法，已拒绝下载",
        error.Sha1Mismatch => "文件校验失败（SHA1 不匹配）",
        error.HttpStatusFailed => std.fmt.bufPrint(
            buffer,
            "下载直链返回状态码 {d}",
            .{status},
        ) catch "下载直链返回异常状态码",
        error.HttpBodyReadFailed => "读取下载数据失败，请检查网络",
        error.FileWriteFailed => "写入目标文件失败，请检查磁盘权限与剩余空间",
        error.HashFailed => "计算文件校验值失败",
        error.ResourceIdEmpty => "缺少资源 id",
        else => @errorName(err),
    };
}

/// 下载线程主流程：解析 → 命中缓存或下载 → 校验 → 回报终态
fn iGM_Downloader_Run(task: *iGM_Launcher_Download_Task) void {
    const allocator = iGM_FileManager.iGM_FileManager_Allocator;

    iGM_Downloader_Emit(
        task,
        iGM_Launcher_Status_Downloading,
        0,
        0,
        0.0,
        -1,
        null,
    );

    var rt: iGM_FileManager.iGM_FileManager_Runtime = undefined;
    rt.iGM_FileManager_Runtime_Init(allocator);
    defer rt.iGM_FileManager_Runtime_Deinit();

    var client: std.http.Client = .{ .allocator = allocator, .io = rt.io };
    defer client.deinit();

    var arena_state = std.heap.ArenaAllocator.init(allocator);
    defer arena_state.deinit();
    const arena = arena_state.allocator();

    // 直链模式：调用方已给出完整 URL 与目标文件绝对路径，跳过 Modrinth 解析
    const is_direct = task.direct_url.len > 0;
    const resolved = if (is_direct) blk: {
        if (task.direct_dest.len == 0) {
            iGM_Downloader_Emit(task, iGM_Launcher_Status_Failed, 0, 0, 0.0, -1, "缺少目标文件路径");
            return;
        }
        break :blk iGM_Downloader_Resolved{
            .url = arena.dupe(u8, task.direct_url) catch {
                iGM_Downloader_Emit(task, iGM_Launcher_Status_Failed, 0, 0, 0.0, -1, "分配下载地址失败");
                return;
            },
            .filename = "",
            .size = task.direct_size,
            .sha1 = arena.dupe(u8, task.direct_sha1) catch {
                iGM_Downloader_Emit(task, iGM_Launcher_Status_Failed, 0, 0, 0.0, -1, "分配校验值失败");
                return;
            },
        };
    } else iGM_Downloader_Resolve(
        &rt,
        &client,
        task,
        arena,
        task.resource_id,
        task.version,
        task.loader,
    ) catch |err| {
        var error_buffer: [256]u8 = undefined;
        const message = iGM_Downloader_ErrorText(task, err, &error_buffer);
        iGM_Downloader_Log("解析资源失败: {s}", .{message});
        iGM_Downloader_Emit(
            task,
            iGM_Launcher_Status_Failed,
            0,
            0,
            0.0,
            -1,
            message,
        );
        return;
    };

    const dest_path = if (is_direct)
        arena.dupe(u8, task.direct_dest) catch {
            iGM_Downloader_Emit(task, iGM_Launcher_Status_Failed, 0, 0, 0.0, -1, "分配目标路径失败");
            return;
        }
    else
        iGM_FileManager.iGM_FileManager_JoinPath(
            arena,
            &.{ task.target_dir, resolved.filename },
        ) catch {
            iGM_Downloader_Emit(task, iGM_Launcher_Status_Failed, 0, 0, 0.0, -1, "分配目标路径失败");
            return;
        };
    const part_path = std.fmt.allocPrint(arena, "{s}.part", .{dest_path}) catch {
        iGM_Downloader_Emit(task, iGM_Launcher_Status_Failed, 0, 0, 0.0, -1, "分配临时路径失败");
        return;
    };

    // 缓存命中：直接复制到目标目录，不重复下载
    if (iGM_Downloader_TryCache(&rt, arena, resolved, dest_path)) |size| {
        iGM_Downloader_Emit(
            task,
            iGM_Launcher_Status_Done,
            size,
            size,
            0.0,
            0,
            null,
        );
        return;
    }

    // SHA1 校验失败重试一次
    var sha_retry: bool = false;
    while (true) {
        const outcome = iGM_Downloader_DownloadFile(
            &rt,
            &client,
            task,
            resolved.url,
            dest_path,
            part_path,
            resolved.sha1,
            resolved.size,
        ) catch |err| {
            if (err == error.Sha1Mismatch and !sha_retry) {
                sha_retry = true;
                continue;
            }
            var error_buffer: [256]u8 = undefined;
            const message = iGM_Downloader_ErrorText(task, err, &error_buffer);
            iGM_Downloader_Log("下载失败: {s}", .{message});
            iGM_Downloader_Emit(
                task,
                iGM_Launcher_Status_Failed,
                0,
                0,
                0.0,
                -1,
                message,
            );
            return;
        };

        switch (outcome) {
            .canceled => {
                iGM_Downloader_Emit(
                    task,
                    iGM_Launcher_Status_Canceled,
                    0,
                    0,
                    0.0,
                    -1,
                    null,
                );
                return;
            },
            .completed => |downloaded| {
                iGM_Downloader_StoreCache(&rt, arena, resolved, dest_path);
                iGM_Downloader_Emit(
                    task,
                    iGM_Launcher_Status_Done,
                    downloaded,
                    downloaded,
                    0.0,
                    0,
                    null,
                );
                return;
            },
        }
    }
}

/// 线程入口：执行完成后清空运行标记
fn iGM_Downloader_RunEntry(task: *iGM_Launcher_Download_Task) void {
    iGM_Downloader_Run(task);
    task.running.store(false, .release);
}

/// 启动下载线程（重置取消 / 暂停标志）
fn iGM_Launcher_Download_TaskSpawn(task: *iGM_Launcher_Download_Task) !void {
    if (task.thread) |previous| {
        previous.join();
        task.thread = null;
    }
    task.cancel.store(false, .release);
    task.pause.store(false, .release);
    task.running.store(true, .release);
    task.thread = std.Thread.spawn(.{}, iGM_Downloader_RunEntry, .{task}) catch |err| {
        task.running.store(false, .release);
        return err;
    };
}

/// 取消并等待线程结束
fn iGM_Launcher_Download_TaskStopAndJoin(task: *iGM_Launcher_Download_Task) void {
    task.cancel.store(true, .release);
    task.pause.store(false, .release);
    if (task.thread) |thread| {
        thread.join();
        task.thread = null;
    }
}

// 导出 //

/// 创建下载任务；参数非法时返回 null
export fn iGM_Launcher_Download_CreateTask(
    resource_id: ?[*:0]const u8,
    version: ?[*:0]const u8,
    loader: ?[*:0]const u8,
    target_dir: ?[*:0]const u8,
) ?*anyopaque {
    const allocator = iGM_FileManager.iGM_FileManager_Allocator;
    const resource_id_value = std.mem.span(resource_id orelse return null);
    const version_value = std.mem.span(version orelse return null);
    const loader_value = std.mem.span(loader orelse return null);
    const target_dir_value = std.mem.span(target_dir orelse return null);
    if (std.mem.trim(u8, resource_id_value, " \t").len == 0) return null;
    if (std.mem.trim(u8, target_dir_value, " \t").len == 0) return null;

    const task = allocator.create(iGM_Launcher_Download_Task) catch return null;
    errdefer allocator.destroy(task);

    const sequence = iGM_Launcher_Task_Sequence.fetchAdd(1, .monotonic) + 1;
    const task_id = std.fmt.allocPrintSentinel(allocator, "igm-sdk-{d}", .{sequence}, 0) catch return null;
    errdefer allocator.free(task_id);

    const resource_owned = allocator.dupe(u8, resource_id_value) catch return null;
    errdefer allocator.free(resource_owned);
    const version_owned = allocator.dupe(u8, version_value) catch return null;
    errdefer allocator.free(version_owned);
    const loader_owned = allocator.dupe(u8, loader_value) catch return null;
    errdefer allocator.free(loader_owned);
    const target_owned = allocator.dupe(u8, target_dir_value) catch return null;
    errdefer allocator.free(target_owned);

    task.* = .{
        .task_id = task_id,
        .resource_id = resource_owned,
        .version = version_owned,
        .loader = loader_owned,
        .target_dir = target_owned,
    };
    iGM_Downloader_Log(
        "创建下载任务 {s}: resource={s} version={s} loader={s} target={s}",
        .{ task_id, resource_owned, version_owned, loader_owned, target_owned },
    );
    return @ptrCast(task);
}

/// 创建「直链文件」下载任务：把 url 直接下载到 dest_path，用 sha1 校验（可空串跳过）。
/// 用于游戏本体文件清单与第三方直链，跳过 Modrinth 解析与随机抖动限速。参数非法返回 null。
export fn iGM_Launcher_Download_CreateFileTask(
    url: ?[*:0]const u8,
    dest_path: ?[*:0]const u8,
    sha1: ?[*:0]const u8,
    expected_size: i64,
) ?*anyopaque {
    const allocator = iGM_FileManager.iGM_FileManager_Allocator;
    const url_value = std.mem.span(url orelse return null);
    const dest_value = std.mem.span(dest_path orelse return null);
    const sha1_value = std.mem.span(sha1 orelse "");
    if (std.mem.trim(u8, url_value, " \t").len == 0) return null;
    if (std.mem.trim(u8, dest_value, " \t").len == 0) return null;

    const task = allocator.create(iGM_Launcher_Download_Task) catch return null;
    errdefer allocator.destroy(task);

    const sequence = iGM_Launcher_Task_Sequence.fetchAdd(1, .monotonic) + 1;
    const task_id = std.fmt.allocPrintSentinel(allocator, "igm-sdk-{d}", .{sequence}, 0) catch return null;
    errdefer allocator.free(task_id);

    const resource_owned = allocator.dupe(u8, "") catch return null;
    errdefer allocator.free(resource_owned);
    const version_owned = allocator.dupe(u8, "") catch return null;
    errdefer allocator.free(version_owned);
    const loader_owned = allocator.dupe(u8, "") catch return null;
    errdefer allocator.free(loader_owned);
    const target_owned = allocator.dupe(u8, "") catch return null;
    errdefer allocator.free(target_owned);
    const url_owned = allocator.dupe(u8, url_value) catch return null;
    errdefer allocator.free(url_owned);
    const dest_owned = allocator.dupe(u8, dest_value) catch return null;
    errdefer allocator.free(dest_owned);
    const sha1_owned = allocator.alloc(u8, sha1_value.len) catch return null;
    errdefer allocator.free(sha1_owned);
    _ = std.ascii.lowerString(sha1_owned, sha1_value);

    task.* = .{
        .task_id = task_id,
        .resource_id = resource_owned,
        .version = version_owned,
        .loader = loader_owned,
        .target_dir = target_owned,
        .direct_url = url_owned,
        .direct_dest = dest_owned,
        .direct_sha1 = sha1_owned,
        .direct_size = expected_size,
    };
    iGM_Downloader_Log("创建直链下载任务 {s}: dest={s}", .{ task_id, dest_owned });
    return @ptrCast(task);
}

/// 注册进度回调与用户数据（须在 StartTask 之前调用）
export fn iGM_Launcher_Download_SetProgressCallback(
    task: ?*anyopaque,
    cb: iGM_Launcher_ProgressCallback,
    user_data: ?*anyopaque,
) void {
    const handle = iGM_Launcher_Download_TaskCast(task) orelse return;
    handle.cb = cb;
    handle.user_data = user_data;
}

/// 启动任务：立即返回，下载在独立线程执行
export fn iGM_Launcher_Download_StartTask(task: ?*anyopaque) c_int {
    const handle = iGM_Launcher_Download_TaskCast(task) orelse return iGM_Launcher_Err_Null;
    if (handle.running.load(.acquire)) return iGM_Launcher_Err_State;
    iGM_Launcher_Download_TaskSpawn(handle) catch return iGM_Launcher_Err_State;
    return iGM_Launcher_Ok;
}

/// 暂停任务：立即回调一次 PAUSED，下载线程在下一个检查点挂起
export fn iGM_Launcher_Download_PauseTask(task: ?*anyopaque) c_int {
    const handle = iGM_Launcher_Download_TaskCast(task) orelse return iGM_Launcher_Err_Null;
    if (!handle.running.load(.acquire)) return iGM_Launcher_Err_State;
    handle.pause.store(true, .release);
    iGM_Downloader_Emit(
        handle,
        iGM_Launcher_Status_Paused,
        0,
        0,
        0.0,
        -1,
        null,
    );
    return iGM_Launcher_Ok;
}

/// 恢复任务
export fn iGM_Launcher_Download_ResumeTask(task: ?*anyopaque) c_int {
    const handle = iGM_Launcher_Download_TaskCast(task) orelse return iGM_Launcher_Err_Null;
    handle.pause.store(false, .release);
    iGM_Downloader_Emit(
        handle,
        iGM_Launcher_Status_Downloading,
        0,
        0,
        0.0,
        -1,
        null,
    );
    return iGM_Launcher_Ok;
}

/// 重试任务：先取消并等待当前线程结束，再从设计目标重新开始
export fn iGM_Launcher_Download_RetryTask(task: ?*anyopaque) c_int {
    const handle = iGM_Launcher_Download_TaskCast(task) orelse return iGM_Launcher_Err_Null;
    iGM_Launcher_Download_TaskStopAndJoin(handle);
    iGM_Launcher_Download_TaskSpawn(handle) catch return iGM_Launcher_Err_State;
    return iGM_Launcher_Ok;
}

/// 取消任务
export fn iGM_Launcher_Download_CancelTask(task: ?*anyopaque) c_int {
    const handle = iGM_Launcher_Download_TaskCast(task) orelse return iGM_Launcher_Err_Null;
    handle.cancel.store(true, .release);
    handle.pause.store(false, .release);
    return iGM_Launcher_Ok;
}

/// 释放任务：先取消并等待线程结束，再回收句柄
export fn iGM_Launcher_Download_FreeTask(task: ?*anyopaque) void {
    const handle = iGM_Launcher_Download_TaskCast(task) orelse return;
    iGM_Launcher_Download_TaskStopAndJoin(handle);
    const allocator = iGM_FileManager.iGM_FileManager_Allocator;
    allocator.free(handle.task_id);
    allocator.free(handle.resource_id);
    allocator.free(handle.version);
    allocator.free(handle.loader);
    allocator.free(handle.target_dir);
    allocator.free(handle.direct_url);
    allocator.free(handle.direct_dest);
    allocator.free(handle.direct_sha1);
    allocator.destroy(handle);
}
