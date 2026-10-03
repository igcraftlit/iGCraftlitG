//! 文件路径：zig-core/build.zig
//! 所属层：Zig 原生核心 / 构建脚本
//! 路由：全局（构建期）
//! 模块：iGM_Launcher_Core
//! 作用：把 Zig 原生核心编译为 C ABI 动态库，供启动器经 bun:ffi 加载
//! 内容：目标平台与优化模式选项、动态库目标声明、安装规则、C 头文件 igm_downloader.h 生成与安装

// 导入依赖 //
const std = @import("std");

// 核心逻辑 //

/// 与导出符号完全一致的 C 头文件内容
/// 说明：Zig 0.16 的 -femit-h（lib.getEmittedH）已被上游标记为 broken
/// （https://github.com/ziglang/zig/issues/9698），故改为由构建脚本直接写出
/// ABI 完全一致的头文件，产物路径仍为 zig-out/bin/igm_downloader.h。
const iGM_Launcher_Header_Text =
    \\/*
    \\ * 文件路径：zig-core/zig-out/bin/igm_downloader.h
    \\ * 所属层：Zig 原生核心 / C ABI 头文件
    \\ * 模块：iGM_Launcher_Core
    \\ * 作用：声明原生核心对外暴露的 C ABI 结构与函数，供 C / C++ / Zig / bun:ffi 调用
    \\ * 内容：初始化与版本函数、进度结构 iGM_Launcher_Progress、进度回调类型、
    \\ *       下载任务生命周期函数（create / set_progress_callback / get_progress / start /
    \\ *       pause / resume / retry / cancel / free）、哈希与 Java 检测函数；
    \\ *       字符串均为 C 字符串指针，生命周期由 SDK 内部保证，仅在回调调用期间有效。
    \\ */
    \\
    \\#ifndef IGM_DOWNLOADER_H
    \\#define IGM_DOWNLOADER_H
    \\
    \\#ifdef __cplusplus
    \\extern "C" {
    \\#endif
    \\
    \\/* 任务状态取值：0=等待 1=下载中 2=完成 3=失败 4=已暂停 5=已取消 */
    \\#define IGM_STATUS_IDLE 0
    \\#define IGM_STATUS_DOWNLOADING 1
    \\#define IGM_STATUS_DONE 2
    \\#define IGM_STATUS_FAILED 3
    \\#define IGM_STATUS_PAUSED 4
    \\#define IGM_STATUS_CANCELED 5
    \\
    \\/* 调用返回码：0=成功 -1=空指针 -2=状态不允许 */
    \\#define IGM_LAUNCHER_OK 0
    \\#define IGM_LAUNCHER_ERR_NULL -1
    \\#define IGM_LAUNCHER_ERR_STATE -2
    \\
    \\/* 进度结构：64 字节（64 位平台），字段顺序与偏移不可变；指针仅在回调期间有效 */
    \\typedef struct {
    \\    const char* task_id;      /* 任务编号 */
    \\    int         status;       /* 取值见 IGM_STATUS_* */
    \\    long long   downloaded;   /* 已下载字节 */
    \\    long long   total;        /* 总字节，未知为 0 */
    \\    double      percent;      /* 百分比 0-100 */
    \\    double      speed;        /* 速度（字节/秒） */
    \\    long long   eta;          /* 预计剩余秒数，未知为 -1 */
    \\    const char* error;        /* 错误信息，无错误为空字符串 */
    \\} iGM_Launcher_Progress;
    \\
    \\/* 进度回调：p 与 p 内字符串仅在本次调用期间有效；user_data 原样回传 */
    \\typedef void (*iGM_Launcher_ProgressCallback)(const iGM_Launcher_Progress* p, void* user_data);
    \\
    \\/* 不透明任务句柄 */
    \\typedef void* iGM_Launcher_Download_Task;
    \\
    \\/* 初始化原生核心：0 = 成功 */
    \\int iGM_Launcher_Core_Init(void);
    \\
    \\/* 读取原生核心版本号（静态字符串，无需释放） */
    \\const char* iGM_Launcher_Core_Version(void);
    \\
    \\/* 创建下载任务；参数非法时返回 NULL。resourceId 为 Modrinth 项目 id 或 slug */
    \\iGM_Launcher_Download_Task iGM_Launcher_Download_CreateTask(
    \\    const char* resourceId,
    \\    const char* version,
    \\    const char* loader,
    \\    const char* targetDir
    \\);
    \\
    \\/* 注册进度回调与用户数据；须在 iGM_Launcher_Download_StartTask 之前调用 */
    \\void iGM_Launcher_Download_SetProgressCallback(
    \\    iGM_Launcher_Download_Task task,
    \\    iGM_Launcher_ProgressCallback cb,
    \\    void* user_data
    \\);
    \\
    \\/* 读取任务最新进度快照：返回任务内常驻结构体指针，任务释放前始终有效；参数非法返回 NULL */
    \\const iGM_Launcher_Progress* iGM_Launcher_Download_GetProgress(iGM_Launcher_Download_Task task);
    \\
    \\/* 启动任务：在独立线程执行，立即返回；0 成功，负值为错误码 */
    \\int iGM_Launcher_Download_StartTask(iGM_Launcher_Download_Task task);
    \\
    \\/* 暂停任务：0 成功，负值为错误码 */
    \\int iGM_Launcher_Download_PauseTask(iGM_Launcher_Download_Task task);
    \\
    \\/* 恢复任务：0 成功，负值为错误码 */
    \\int iGM_Launcher_Download_ResumeTask(iGM_Launcher_Download_Task task);
    \\
    \\/* 重试任务：从头重新开始，0 成功，负值为错误码 */
    \\int iGM_Launcher_Download_RetryTask(iGM_Launcher_Download_Task task);
    \\
    \\/* 取消任务：0 成功，负值为错误码 */
    \\int iGM_Launcher_Download_CancelTask(iGM_Launcher_Download_Task task);
    \\
    \\/* 释放任务：会先取消并等待线程结束，之后不可再使用该句柄 */
    \\void iGM_Launcher_Download_FreeTask(iGM_Launcher_Download_Task task);
    \\
    \\/* 计算文件哈希：algorithm 取 "sha1" | "sha256"，返回小写 hex（线程局部静态缓冲，失败返回空串） */
    \\const char* iGM_Launcher_Hash_Compute(const char* file_path, const char* algorithm);
    \\
    \\/* 检测 Java：返回静态 JSON 字符串 {"found":bool,"path":"...","version":"...","arch":"..."} */
    \\const char* iGM_Launcher_Java_Detect(void);
    \\
    \\#ifdef __cplusplus
    \\}
    \\#endif
    \\
    \\#endif /* IGM_DOWNLOADER_H */
    \\
;

pub fn build(b: *std.Build) void {
    // 发布产物必须在任意 x86_64 机器上可运行：不带 -Dtarget 时 Zig 默认按「构建机」
    // 自身 CPU 特性编译（GitHub 运行器带 AVX-512），产物落到仅支持 AVX-2 的机器上
    // 会以 Illegal instruction 直接终止宿主进程（表现为启动器点下载即整体闪退）。
    // 故把默认 CPU 固定为 baseline，保证 CI 与本机产出一致且可移植。
    const target = b.standardTargetOptions(.{
        .default_target = .{ .cpu_model = .baseline },
    });
    // Zig 0.16 已移除内置 -Doptimize，此处自行登记同名选项以保持脚本命令稳定，
    // 缺省即为 ReleaseFast（发布产物使用），可用 -Doptimize=Debug 等覆盖。
    const optimize = b.option(
        std.builtin.OptimizeMode,
        "optimize",
        "优化模式（缺省 ReleaseFast）",
    ) orelse .ReleaseFast;

    const lib = b.addLibrary(.{
        .name = "igm_downloader",
        .linkage = .dynamic,
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/iGM_Launcher_Core.zig"),
            .target = target,
            .optimize = optimize,
        }),
    });

    b.installArtifact(lib);

    // 把与 C ABI 完全一致的 igm_downloader.h 输出到 zig-out/bin/
    const header_files = b.addWriteFiles();
    const header = header_files.add("igm_downloader.h", iGM_Launcher_Header_Text);
    const install_header = b.addInstallFile(header, "bin/igm_downloader.h");
    b.getInstallStep().dependOn(&install_header.step);
}
