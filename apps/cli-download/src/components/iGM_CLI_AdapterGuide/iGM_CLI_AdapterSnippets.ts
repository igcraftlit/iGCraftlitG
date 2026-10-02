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
export const iGM_CLI_AdapterExportsC = `void* iGM_Launcher_Download_CreateTask(
    const char* resource_id,
    const char* version,
    const char* loader,
    const char* target_dir
);

void iGM_Launcher_Download_SetProgressCallback(
    void* task,
    void (*cb)(const iGM_Launcher_Progress*, void*),
    void* user_data
);

int  iGM_Launcher_Download_StartTask(void* task);
int  iGM_Launcher_Download_PauseTask(void* task);
int  iGM_Launcher_Download_ResumeTask(void* task);
int  iGM_Launcher_Download_RetryTask(void* task);
int  iGM_Launcher_Download_CancelTask(void* task);
void iGM_Launcher_Download_FreeTask(void* task);`;

/** C ABI 进度回调结构（64 位平台下 64 字节，字段顺序不可调整） */
export const iGM_CLI_AdapterStructC = `typedef struct {
    const char* task_id;
    int         status;      // 0=等待 1=下载中 2=完成 3=失败 4=已暂停 5=已取消
    long long   downloaded;
    long long   total;
    double      percent;
    double      speed;
    long long   eta;
    const char* error;
} iGM_Launcher_Progress;`;

/** C++ 调用示例 */
export const iGM_CLI_AdapterCppExample = `#include "igm_downloader.h"

void on_progress(const iGM_Launcher_Progress* p, void* user) {
    // 更新启动器 UI 进度条
}

void* task = iGM_Launcher_Download_CreateTask("sodium", "1.20.1", "fabric", "./mods");
iGM_Launcher_Download_SetProgressCallback(task, on_progress, nullptr);
iGM_Launcher_Download_StartTask(task);`;

/** Zig 调用示例 */
export const iGM_CLI_AdapterZigExample = `const igm = @cImport({
    @cInclude("igm_downloader.h");
});

fn onProgress(p: [*c]const igm.iGM_Launcher_Progress, user: ?*anyopaque) callconv(.c) void {
    // 更新启动器 UI
}

var task = igm.iGM_Launcher_Download_CreateTask("sodium", "1.20.1", "fabric", "./mods");
igm.iGM_Launcher_Download_SetProgressCallback(task, onProgress, null);
_ = igm.iGM_Launcher_Download_StartTask(task);`;

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

/** API 服务基础地址（语言无关常量） */
export const iGM_CLI_ApiBaseUrl = "https://api.igcraftlit.com";

/** API 文档完整端点路径集合（语言无关；用途说明位于 iGM_CLI_ApiDocContent） */
export const iGM_CLI_ApiEndpointPaths = {
  search: `${iGM_CLI_AdapterApiPrefix}/resource/search`,
  resource: `${iGM_CLI_AdapterApiPrefix}/resource/{resourceId}`,
  create: `${iGM_CLI_AdapterApiPrefix}/task`,
  query: `${iGM_CLI_AdapterApiPrefix}/task/{taskId}`,
  pause: `${iGM_CLI_AdapterApiPrefix}/task/{taskId}/pause`,
  resume: `${iGM_CLI_AdapterApiPrefix}/task/{taskId}/resume`,
  cancel: `${iGM_CLI_AdapterApiPrefix}/task/{taskId}/cancel`,
  retry: `${iGM_CLI_AdapterApiPrefix}/task/{taskId}/retry`,
} as const;

/** 统一响应信封示例 */
export const iGM_CLI_ApiEnvelopeJson = `{
  "success": true,
  "code": "OK",
  "message": "ok",
  "data": {}
}`;

/** 鉴权请求头示例（开发者密钥与用户 Token 二选一或并用） */
export const iGM_CLI_ApiAuthHeader = `X-IGM-Uid: 1000123456
X-IGM-Developer-Key: <64 位开发者密钥>
Authorization: Bearer <access_token>`;

/** 示例请求：curl */
export const iGM_CLI_ApiCurlExample = `curl -X POST https://api.igcraftlit.com/api/igm-cli/task \\
  -H "Content-Type: application/json" \\
  -H "X-IGM-Uid: 1000123456" \\
  -H "X-IGM-Developer-Key: $IGM_DEV_KEY" \\
  -d '{
    "resourceId": "sodium",
    "version": "1.20.1",
    "loader": "fabric",
    "targetDir": "./mods"
  }'`;

/** 示例请求：浏览器 / Node 的 fetch */
export const iGM_CLI_ApiFetchExample = `const res = await fetch("https://api.igcraftlit.com/api/igm-cli/task", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-IGM-Uid": "1000123456",
    "X-IGM-Developer-Key": process.env.IGM_DEV_KEY,
  },
  body: JSON.stringify({
    resourceId: "sodium",
    version: "1.20.1",
    loader: "fabric",
    targetDir: "./mods",
  }),
});

const json = await res.json();
if (!json.success) throw new Error(\`\${json.code}: \${json.message}\`);
console.log("taskId", json.data.taskId);`;

/** 示例请求：Bun */
export const iGM_CLI_ApiBunExample = `const res = await fetch("https://api.igcraftlit.com/api/igm-cli/task", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-igm-uid": Bun.env.IGM_UID!,
    "x-igm-developer-key": Bun.env.IGM_DEV_KEY!,
  },
  body: JSON.stringify({
    resourceId: "sodium",
    version: "1.20.1",
    loader: "fabric",
    targetDir: "./mods",
  }),
});

const { success, code, message, data } = await res.json();
if (!success) throw new Error(\`\${code}: \${message}\`);
console.log("taskId", data.taskId);`;

/** 示例请求：Python（requests） */
export const iGM_CLI_ApiPythonExample = `import os, requests

res = requests.post(
    "https://api.igcraftlit.com/api/igm-cli/task",
    headers={
        "X-IGM-Uid": os.environ["IGM_UID"],
        "X-IGM-Developer-Key": os.environ["IGM_DEV_KEY"],
    },
    json={
        "resourceId": "sodium",
        "version": "1.20.1",
        "loader": "fabric",
        "targetDir": "./mods",
    },
    timeout=30,
)

body = res.json()
if not body["success"]:
    raise RuntimeError(f'{body["code"]}: {body["message"]}')
print(body["data"]["taskId"])`;

/** SDK 集成：bun:ffi 加载 C ABI 动态库（符号声明） */
export const iGM_CLI_SdkBunFfiExample = `// iGM_SDK.ts —— 用 bun:ffi 加载 iGM 下载引擎动态库
import { dlopen, FFIType } from "bun:ffi";

const LIB =
  process.platform === "win32"
    ? "igm_downloader.dll"
    : process.platform === "darwin"
      ? "libigm_downloader.dylib"
      : "libigm_downloader.so";

const { symbols: igm } = dlopen(\`./lib/\${LIB}\`, {
  iGM_Launcher_Download_CreateTask: {
    args: [FFIType.cstring, FFIType.cstring, FFIType.cstring, FFIType.cstring],
    returns: FFIType.ptr,
  },
  iGM_Launcher_Download_SetProgressCallback: {
    args: [FFIType.ptr, FFIType.function, FFIType.ptr],
    returns: FFIType.void,
  },
  iGM_Launcher_Download_StartTask: { args: [FFIType.ptr], returns: FFIType.int },
  iGM_Launcher_Download_CancelTask: { args: [FFIType.ptr], returns: FFIType.int },
  iGM_Launcher_Download_FreeTask: { args: [FFIType.ptr], returns: FFIType.void },
});

console.log("iGM 下载引擎加载成功");`;

/** SDK 最小可运行项目（加载 + 创建任务 + 订阅进度 + 打印日志） */
export const iGM_CLI_SdkMinimalProject = `// iGM_SDK.ts —— 最小可运行的 iGM 下载示例
import { dlopen, FFIType, CString, JSCallback, ptr, toArrayBuffer } from "bun:ffi";
import { join } from "node:path";

// 1. 按平台选择动态库文件名
const LIB =
  process.platform === "win32"
    ? "igm_downloader.dll"
    : process.platform === "darwin"
      ? "libigm_downloader.dylib"
      : "libigm_downloader.so";

// 2. 加载动态库并声明用到的导出符号
const { symbols: igm } = dlopen(join(import.meta.dir, "lib", LIB), {
  iGM_Launcher_Download_CreateTask: {
    args: [FFIType.cstring, FFIType.cstring, FFIType.cstring, FFIType.cstring],
    returns: FFIType.ptr,
  },
  iGM_Launcher_Download_SetProgressCallback: {
    args: [FFIType.ptr, FFIType.function, FFIType.ptr],
    returns: FFIType.void,
  },
  iGM_Launcher_Download_StartTask: { args: [FFIType.ptr], returns: FFIType.int },
  iGM_Launcher_Download_CancelTask: { args: [FFIType.ptr], returns: FFIType.int },
  iGM_Launcher_Download_FreeTask: { args: [FFIType.ptr], returns: FFIType.void },
});

// 3. 读取 iGM_Launcher_Progress 结构（64 位字节布局，小端序）
function readProgress(p: number) {
  const view = new DataView(toArrayBuffer(p, 0, 64));
  return {
    taskId: new CString(Number(view.getBigUint64(0, true))).toString(),
    status: view.getInt32(8, true),
    downloaded: Number(view.getBigInt64(16, true)),
    total: Number(view.getBigInt64(24, true)),
    percent: view.getFloat64(32, true),
    speed: view.getFloat64(40, true),
    eta: Number(view.getBigInt64(48, true)),
  };
}

// 4. 注册进度回调：C ABI 回调直达进程内 UI，无需额外进程与网络往返
const onProgress = new JSCallback(
  (progressPtr: number) => {
    const p = readProgress(progressPtr);
    console.log(
      \`[\${p.percent.toFixed(1)}%] \${p.downloaded}/\${p.total} 字节\` +
        \` 速度 \${(p.speed / 1024).toFixed(0)} KB/s 剩余 \${p.eta}s\`,
    );
  },
  { args: [FFIType.ptr, FFIType.ptr], returns: FFIType.void },
);

// 5. 创建任务（资源 ID、版本、加载器、目标目录）
const c = (value: string) => ptr(Buffer.from(\`\${value}\\0\`, "utf8"));
const task = igm.iGM_Launcher_Download_CreateTask(
  c("sodium"),
  c("1.20.1"),
  c("fabric"),
  c("./mods"),
);
if (!task) throw new Error("iGM_Launcher_Download_CreateTask 返回空指针");

// 6. 绑定回调并启动
igm.iGM_Launcher_Download_SetProgressCallback(task, onProgress.ptr, null);
const started = igm.iGM_Launcher_Download_StartTask(task);
if (started !== 0) throw new Error(\`iGM_Launcher_Download_StartTask 失败：\${started}\`);

console.log("下载已启动，按 Ctrl+C 取消");
process.on("SIGINT", () => {
  igm.iGM_Launcher_Download_CancelTask(task);
  igm.iGM_Launcher_Download_FreeTask(task);
  process.exit(0);
});`;

// 导出 //
export default iGM_CLI_AdapterEndpoints;
