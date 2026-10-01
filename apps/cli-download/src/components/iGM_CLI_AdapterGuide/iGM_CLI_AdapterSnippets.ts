/**
 * 文件路径：apps/cli-download/src/components/iGM_CLI_AdapterGuide/iGM_CLI_AdapterSnippets.ts
 * 所属层：前端 / 组件层
 * 路由：/docs/adapter、/docs/adapter/sdk、/docs/adapter/protocol、/docs/adapter/progress
 * 模块：iGM_CLI_Downloader
 * 作用：适配器文档的语言无关常量——C ABI 代码片段、协议示例报文、接口路径、事件名
 * 内容：代码标识符（函数名、结构体、路径、事件类型、动态库文件名）不随语言变化，
 *       统一在此维护；说明性文案全部位于 next-intl 语言包 docs.adapter.*
 */

// 导入依赖 //
// （本文件仅包含常量与类型，无运行时依赖）

// 类型定义 //
/** 协议接口条目（方法与路径语言无关，标题/说明取自语言包） */
export interface iGM_CLI_AdapterEndpoint {
  /** 章节锚点 id（二级目录与正文锚点共用） */
  id: string;
  /** HTTP 方法或 WS 标识 */
  method: "POST" | "GET" | "WS";
  /** 接口路径（含示例参数） */
  path: string;
  /** 语言包字段名（docs.adapter.protocol.*） */
  messageKey: "create" | "query" | "ws" | "cancel";
}

/** 进度事件类型条目（事件名语言无关，说明取自语言包 docs.adapter.events.types.*） */
export interface iGM_CLI_AdapterEventType {
  /** 事件名，同时作为目录/锚点后缀 */
  name: "start" | "progress" | "pause" | "resume" | "retry" | "complete" | "error";
}

/** SDK 动态库平台产物（平台名为专有名词，五种语言保持原文） */
export interface iGM_CLI_AdapterLib {
  /** 章节锚点 id 后缀 */
  id: string;
  /** 平台名 */
  platform: string;
  /** 动态库文件名 */
  file: string;
}

// 核心逻辑 //
/** 适配器协议统一接口前缀 */
export const iGM_CLI_AdapterApiPrefix = "/api/igm-cli";

/** C ABI 核心导出函数 */
export const iGM_CLI_AdapterExportsC = `igm_task_t* igm_task_create(
    const char* resource_id,
    const char* version,
    const char* loader,
    const char* target_dir
);

void igm_task_set_progress_cb(
    igm_task_t* task,
    void (*cb)(const igm_progress_t*, void*),
    void* user_data
);

int igm_task_start(igm_task_t* task);
void igm_task_cancel(igm_task_t* task);
void igm_task_free(igm_task_t* task);`;

/** C ABI 进度回调结构 */
export const iGM_CLI_AdapterStructC = `typedef struct {
    const char* task_id;
    int         status;      // 0=等待 1=下载中 2=完成 3=失败
    long long   downloaded;
    long long   total;
    double      percent;
    double      speed;
    long long   eta_seconds;
    const char* error;
} igm_progress_t;`;

/** C++ 调用示例 */
export const iGM_CLI_AdapterCppExample = `#include "igm_downloader.h"

void on_progress(const igm_progress_t* p, void* user) {
    // 更新启动器 UI 进度条
}

igm_task_t* task = igm_task_create("sodium", "1.20.1", "fabric", "./mods");
igm_task_set_progress_cb(task, on_progress, nullptr);
igm_task_start(task);`;

/** Zig 调用示例 */
export const iGM_CLI_AdapterZigExample = `const igm = @cImport({
    @cInclude("igm_downloader.h");
});

fn onProgress(p: [*c]const igm.igm_progress_t, user: ?*anyopaque) callconv(.C) void {
    // 更新启动器 UI
}

var task = igm.igm_task_create("sodium", "1.20.1", "fabric", "./mods");
igm.igm_task_set_progress_cb(task, onProgress, null);
_ = igm.igm_task_start(task);`;

/** 创建下载任务——请求体示例 */
export const iGM_CLI_AdapterCreateReqJson = `{
  "resourceId": "sodium",
  "version": "1.20.1",
  "loader": "fabric",
  "targetDir": "./mods"
}`;

/** 创建下载任务——响应示例 */
export const iGM_CLI_AdapterCreateRespJson = `{
  "success": true,
  "code": "OK",
  "message": "task created",
  "data": { "taskId": "abc123" }
}`;

/** 查询任务进度——响应示例 */
export const iGM_CLI_AdapterProgressRespJson = `{
  "success": true,
  "code": "OK",
  "message": "ok",
  "data": {
    "taskId": "abc123",
    "status": "downloading",
    "downloaded": 1048576,
    "total": 4194304,
    "percent": 25.0,
    "speed": 524288,
    "eta": 6
  }
}`;

/** WebSocket 进度事件——统一事件结构示例 */
export const iGM_CLI_AdapterEventJson = `{
  "type": "progress",
  "taskId": "abc123",
  "payload": {
    "status": "downloading",
    "downloaded": 1048576,
    "total": 4194304,
    "percent": 25.0,
    "speed": 524288,
    "eta": 6,
    "error": null
  },
  "timestamp": 1730000000
}`;

/** SDK 平台动态库产物 */
export const iGM_CLI_AdapterLibs: iGM_CLI_AdapterLib[] = [
  { id: "lib-windows", platform: "Windows", file: "igm_downloader.dll" },
  { id: "lib-linux", platform: "Linux", file: "libigm_downloader.so" },
  { id: "lib-macos", platform: "macOS", file: "libigm_downloader.dylib" },
];

/** 适配器协议接口列表（顺序即文档与目录顺序） */
export const iGM_CLI_AdapterEndpoints: iGM_CLI_AdapterEndpoint[] = [
  {
    id: "ep-create",
    method: "POST",
    path: `${iGM_CLI_AdapterApiPrefix}/task`,
    messageKey: "create",
  },
  {
    id: "ep-query",
    method: "GET",
    path: `${iGM_CLI_AdapterApiPrefix}/task/{taskId}`,
    messageKey: "query",
  },
  {
    id: "ep-ws",
    method: "WS",
    path: `${iGM_CLI_AdapterApiPrefix}/ws?taskId=abc123`,
    messageKey: "ws",
  },
  {
    id: "ep-cancel",
    method: "POST",
    path: `${iGM_CLI_AdapterApiPrefix}/task/{taskId}/cancel`,
    messageKey: "cancel",
  },
];

/** 进度事件类型（顺序即事件生命周期） */
export const iGM_CLI_AdapterEventTypes: iGM_CLI_AdapterEventType[] = [
  { name: "start" },
  { name: "progress" },
  { name: "pause" },
  { name: "resume" },
  { name: "retry" },
  { name: "complete" },
  { name: "error" },
];

// 导出 //
export default iGM_CLI_AdapterEndpoints;
