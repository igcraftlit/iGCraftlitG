/**
 * 文件路径：apps/cli-download/src/i18n/iGM_CLI_ApiDocContent.ts
 * 所属层：前端 / 国际化内容层
 * 路由：/{locale}/api
 * 模块：iGM_CLI_Downloader
 * 作用：API 参考长文正文的唯一事实来源——仅提供简体中文与英文两套内容
 * 内容：概述与接入流程、端点列表、请求参数与响应格式、错误码表、
 *       鉴权方式、限流与配额、示例请求、常见问题；
 *       接口路径等语言无关常量复用 iGM_CLI_AdapterSnippets，
 *       繁体中文 / 日文 / 俄文由 iGM_CLI_ResolveDocLocale 回退英文
 */

// 导入依赖 //
import type { iGM_CLI_DocLocale } from "./iGM_CLI_DocLocale";
import {
  iGM_CLI_ApiEndpointPaths,
} from "../components/iGM_CLI_AdapterGuide/iGM_CLI_AdapterSnippets";

// 类型定义 //
/** 端点列表条目 */
export interface iGM_CLI_ApiEndpointItem {
  /** 锚点 id */
  id: string;
  /** HTTP 方法 */
  method: string;
  /** 接口路径 */
  path: string;
  /** 用途简述 */
  purpose: string;
}

/** API 参考单语言正文结构 */
export interface iGM_CLI_ApiDocEntry {
  /** 页面标题 */
  title: string;
  /** 页头导言 */
  lead: string;
  /** 章节一：概述与接入流程 */
  overview: {
    title: string;
    body: string;
    baseUrlLabel: string;
    flowTitle: string;
    flow: string[];
    modelTitle: string;
    models: { name: string; desc: string }[];
  };
  /** 章节二：端点列表 */
  endpoints: {
    title: string;
    lead: string;
    columns: { method: string; path: string; purpose: string };
    items: iGM_CLI_ApiEndpointItem[];
  };
  /** 章节三：请求参数与响应格式 */
  format: {
    title: string;
    lead: string;
    envelopeTitle: string;
    envelopeNote: string;
    columns: { field: string; desc: string };
    fields: { name: string; desc: string }[];
    createReqTitle: string;
    createRespTitle: string;
    progressTitle: string;
    eventTitle: string;
  };
  /** 章节四：错误码表 */
  errors: {
    title: string;
    lead: string;
    columns: { code: string; http: string; meaning: string };
    items: { code: string; http: string; meaning: string }[];
  };
  /** 章节五：鉴权方式 */
  auth: {
    title: string;
    lead: string;
    items: { name: string; desc: string }[];
    headerTitle: string;
  };
  /** 章节六：限流规则与配额 */
  rateLimit: {
    title: string;
    lead: string;
    columns: { name: string; value: string; desc: string };
    items: { name: string; value: string; desc: string }[];
  };
  /** 章节七：示例请求 */
  examples: {
    title: string;
    lead: string;
    labels: { curl: string; fetch: string; bun: string; python: string };
  };
  /** 章节八：常见问题 */
  faq: {
    title: string;
    items: { q: string; a: string }[];
  };
}

// 核心逻辑 //
/** 简体中文正文 */
const iGM_CLI_ApiDocZhCN: iGM_CLI_ApiDocEntry = {
  title: "API 参考",
  lead: "iGM Download API 以 REST 形式提供资源检索与下载任务调度能力。所有接口统一挂载在 /api/igm-cli 前缀下，请求与响应均为 JSON，响应遵循统一信封结构。",
  overview: {
    title: "API 概述与接入流程",
    body: "客户端通过资源接口获取可下载资源，再通过任务接口创建并管理下载任务。资源是静态描述，任务是一次下载动作的运行实例，两者以 resourceId 与 taskId 建立关联。",
    baseUrlLabel: "基础地址",
    flowTitle: "一次请求的完整流程",
    flow: [
      "携带开发者密钥或用户 Token，调用资源搜索 / 资源详情接口，拿到 resourceId。",
      "调用创建下载任务接口，提交 resourceId、版本、加载器与目标目录，服务端返回 taskId。",
      "通过查询任务进度接口轮询，或建立 WebSocket 订阅，实时获取下载进度。",
      "按需调用暂停 / 恢复 / 重试 / 取消接口控制任务生命周期。",
      "任务完成后按响应中的校验信息核对文件完整性。",
    ],
    modelTitle: "资源模型与任务模型",
    models: [
      {
        name: "资源（Resource）",
        desc: "iGCraftLit Community 上的可下载内容，如模组、整合包、材质包、地图等，以 resourceId 唯一标识，配合 version 与 loader 定位具体文件。",
      },
      {
        name: "任务（Task）",
        desc: "一次下载动作的运行实例。创建后由服务端调度，以 taskId 唯一标识，可查询、暂停、恢复、重试与取消。",
      },
    ],
  },
  endpoints: {
    title: "端点列表",
    lead: "所有端点均由「基础地址 + 接口前缀」拼接而成，路径中的 {resourceId}、{taskId} 为路径参数。",
    columns: { method: "方法", path: "路径", purpose: "用途" },
    items: [
      {
        id: "ep-search",
        method: "GET",
        path: iGM_CLI_ApiEndpointPaths.search,
        purpose: "按关键词、类型、版本与加载器搜索资源。",
      },
      {
        id: "ep-resource",
        method: "GET",
        path: iGM_CLI_ApiEndpointPaths.resource,
        purpose: "根据 resourceId 获取资源详情与可下载文件列表。",
      },
      {
        id: "ep-create",
        method: "POST",
        path: iGM_CLI_ApiEndpointPaths.create,
        purpose: "创建下载任务，返回 taskId。",
      },
      {
        id: "ep-query",
        method: "GET",
        path: iGM_CLI_ApiEndpointPaths.query,
        purpose: "查询任务的下载状态、字节数、百分比、速度与剩余时间。",
      },
      {
        id: "ep-pause",
        method: "POST",
        path: iGM_CLI_ApiEndpointPaths.pause,
        purpose: "暂停任务，保留已下载分片。",
      },
      {
        id: "ep-resume",
        method: "POST",
        path: iGM_CLI_ApiEndpointPaths.resume,
        purpose: "恢复已暂停的任务，从断点继续。",
      },
      {
        id: "ep-cancel",
        method: "POST",
        path: iGM_CLI_ApiEndpointPaths.cancel,
        purpose: "取消任务并清理临时分片。",
      },
      {
        id: "ep-retry",
        method: "POST",
        path: iGM_CLI_ApiEndpointPaths.retry,
        purpose: "重试失败的任务，跳过已通过校验的分片。",
      },
    ],
  },
  format: {
    title: "请求参数与响应格式",
    lead: "所有接口的请求体与响应体均为 application/json，响应统一使用下述信封结构。",
    envelopeTitle: "统一响应信封",
    envelopeNote: "success 表示业务是否成功；code 为机器可读状态码；message 为人类可读简述；data 承载实际数据，失败时为 null。",
    columns: { field: "字段", desc: "说明" },
    fields: [
      { name: "success", desc: "布尔值，业务是否成功。" },
      { name: "code", desc: "字符串状态码，如 OK、INVALID_PARAM。" },
      { name: "message", desc: "人类可读的结果简述。" },
      { name: "data", desc: "实际数据对象或数组，失败时为 null。" },
    ],
    createReqTitle: "创建任务——请求体",
    createRespTitle: "创建任务——响应",
    progressTitle: "查询进度——响应",
    eventTitle: "WebSocket 事件——结构",
  },
  errors: {
    title: "错误码表",
    lead: "HTTP 状态码表示协议层结果，code 表示业务层结果。客户端应优先依据 success 与 code 判断处理逻辑。",
    columns: { code: "code", http: "HTTP", meaning: "含义" },
    items: [
      { code: "OK", http: "200", meaning: "请求成功。" },
      { code: "INVALID_PARAM", http: "400", meaning: "参数缺失或格式错误。" },
      { code: "UNAUTHORIZED", http: "401", meaning: "缺少或无效的开发者密钥 / Token。" },
      { code: "FORBIDDEN", http: "403", meaning: "密钥与 iGMUid 不匹配，或无权限访问该资源。" },
      { code: "NOT_FOUND", http: "404", meaning: "资源或任务不存在。" },
      { code: "RESOURCE_LOCKED", http: "409", meaning: "任务当前状态不允许该操作（如对已完成任务暂停）。" },
      { code: "RATE_LIMITED", http: "429", meaning: "超过限流阈值，请稍后重试。" },
      { code: "UPSTREAM_ERROR", http: "502", meaning: "上游存储或镜像暂时不可用。" },
      { code: "INTERNAL_ERROR", http: "500", meaning: "服务端内部错误，请附带 requestId 反馈。" },
    ],
  },
  auth: {
    title: "鉴权方式",
    lead: "公开资源的搜索与详情接口无需鉴权；创建与管理下载任务需要开发者身份。",
    items: [
      {
        name: "开发者密钥（Developer Key）",
        desc: "64 位字符串，与你的 iGMUid 绑定，在开发者平台申请生成，可随时重置。适合服务端集成与任务调度。",
      },
      {
        name: "Token（访问令牌）",
        desc: "通过 OAuth 授权或 igm login 获取的访问令牌，代表具体用户身份，适合需要同步下载记录的客户端场景。",
      },
    ],
    headerTitle: "请求头示例",
  },
  rateLimit: {
    title: "限流规则与配额说明",
    lead: "为保障服务稳定，接口按账号与 IP 双重维度限流，超出后返回 RATE_LIMITED。",
    columns: { name: "项目", value: "额度", desc: "说明" },
    items: [
      { name: "搜索与详情", value: "60 次 / 分钟", desc: "按 IP 统计，未登录也可调用。" },
      { name: "任务创建", value: "20 次 / 分钟", desc: "按开发者密钥或账号统计。" },
      { name: "任务查询", value: "120 次 / 分钟", desc: "建议改用 WebSocket 订阅以降低轮询。" },
      { name: "并发任务", value: "最多 5 个", desc: "同一密钥同时运行的任务上限。" },
      { name: "单任务重试", value: "最多 5 次", desc: "自动重试耗尽后需手动重试。" },
    ],
  },
  examples: {
    title: "示例请求",
    lead: "以下示例创建同一个下载任务，可按语言栈取用；请将占位符替换为你的真实密钥。",
    labels: { curl: "curl", fetch: "fetch", bun: "Bun", python: "Python" },
  },
  faq: {
    title: "常见问题",
    items: [
      {
        q: "需要登录才能调用 API 吗？",
        a: "搜索与详情接口无需登录；创建与管理下载任务需要开发者密钥或用户 Token。",
      },
      {
        q: "开发者密钥与 Token 该用哪个？",
        a: "服务端集成请使用开发者密钥；代表用户身份的客户端请使用 OAuth 获取的 Token。",
      },
      {
        q: "如何获取 resourceId？",
        a: "调用资源搜索接口并带上关键词、类型、版本与加载器筛选，从返回结果的 id 字段获取。",
      },
      {
        q: "任务支持断点续传吗？",
        a: "支持。任务状态由服务端持久化，网络中断后可凭 taskId 查询并恢复，已通过哈希校验的分片会被跳过。",
      },
      {
        q: "WebSocket 与轮询如何选择？",
        a: "需要实时进度条时使用 WebSocket；仅需最终结果时低频轮询查询接口即可。",
      },
      {
        q: "超过限流怎么办？",
        a: "收到 RATE_LIMITED 时请遵循指数退避重试，或降低查询频率、改用 WebSocket 订阅。",
      },
    ],
  },
};

/** 英文正文 */
const iGM_CLI_ApiDocEn: iGM_CLI_ApiDocEntry = {
  title: "API Reference",
  lead: "The iGM Download API exposes resource lookup and download-task scheduling over REST. Every endpoint lives under the /api/igm-cli prefix, requests and responses are JSON, and responses follow a unified envelope.",
  overview: {
    title: "Overview and Integration Flow",
    body: "Clients fetch downloadable resources through the resource endpoints, then create and manage download tasks through the task endpoints. A resource is a static description; a task is one running download instance. They are linked by resourceId and taskId.",
    baseUrlLabel: "Base URL",
    flowTitle: "How a Request Flows",
    flow: [
      "Call the resource search / detail endpoints with your developer key or user token to obtain a resourceId.",
      "Call the create-task endpoint with resourceId, version, loader and targetDir; the server returns a taskId.",
      "Poll the task progress endpoint or open a WebSocket subscription to receive download progress in real time.",
      "Call pause / resume / retry / cancel as needed to control the task lifecycle.",
      "After completion, verify file integrity using the checksum info in the response.",
    ],
    modelTitle: "Resource Model and Task Model",
    models: [
      {
        name: "Resource",
        desc: "A downloadable item on iGCraftLit Community such as a mod, modpack, resource pack or map, uniquely identified by resourceId and located by version and loader.",
      },
      {
        name: "Task",
        desc: "A running instance of one download. Scheduled by the server after creation, uniquely identified by taskId, and supports query, pause, resume, retry and cancel.",
      },
    ],
  },
  endpoints: {
    title: "Endpoint List",
    lead: "Every endpoint is the base URL plus the API prefix; {resourceId} and {taskId} are path parameters.",
    columns: { method: "Method", path: "Path", purpose: "Purpose" },
    items: [
      {
        id: "ep-search",
        method: "GET",
        path: iGM_CLI_ApiEndpointPaths.search,
        purpose: "Search resources by keyword, type, version and loader.",
      },
      {
        id: "ep-resource",
        method: "GET",
        path: iGM_CLI_ApiEndpointPaths.resource,
        purpose: "Get resource details and the downloadable file list by resourceId.",
      },
      {
        id: "ep-create",
        method: "POST",
        path: iGM_CLI_ApiEndpointPaths.create,
        purpose: "Create a download task and return its taskId.",
      },
      {
        id: "ep-query",
        method: "GET",
        path: iGM_CLI_ApiEndpointPaths.query,
        purpose: "Query task status, bytes, percent, speed and remaining time.",
      },
      {
        id: "ep-pause",
        method: "POST",
        path: iGM_CLI_ApiEndpointPaths.pause,
        purpose: "Pause the task and keep downloaded chunks.",
      },
      {
        id: "ep-resume",
        method: "POST",
        path: iGM_CLI_ApiEndpointPaths.resume,
        purpose: "Resume a paused task from where it stopped.",
      },
      {
        id: "ep-cancel",
        method: "POST",
        path: iGM_CLI_ApiEndpointPaths.cancel,
        purpose: "Cancel the task and clean up temporary chunks.",
      },
      {
        id: "ep-retry",
        method: "POST",
        path: iGM_CLI_ApiEndpointPaths.retry,
        purpose: "Retry a failed task, skipping chunks that already passed checksum.",
      },
    ],
  },
  format: {
    title: "Request Parameters and Response Format",
    lead: "Every request and response body is application/json, and responses follow the envelope below.",
    envelopeTitle: "Unified Response Envelope",
    envelopeNote: "success tells whether the operation succeeded; code is a machine-readable status; message is a human-readable summary; data carries the payload (null on failure).",
    columns: { field: "Field", desc: "Description" },
    fields: [
      { name: "success", desc: "Boolean, whether the operation succeeded." },
      { name: "code", desc: "String status code such as OK or INVALID_PARAM." },
      { name: "message", desc: "Human-readable summary." },
      { name: "data", desc: "The payload object or array; null on failure." },
    ],
    createReqTitle: "Create Task — Request Body",
    createRespTitle: "Create Task — Response",
    progressTitle: "Query Progress — Response",
    eventTitle: "WebSocket Event — Structure",
  },
  errors: {
    title: "Error Codes",
    lead: "The HTTP status describes the protocol result while code describes the business result. Decide your handling logic from success and code first.",
    columns: { code: "code", http: "HTTP", meaning: "Meaning" },
    items: [
      { code: "OK", http: "200", meaning: "Request succeeded." },
      { code: "INVALID_PARAM", http: "400", meaning: "Missing or malformed parameter." },
      { code: "UNAUTHORIZED", http: "401", meaning: "Missing or invalid developer key / token." },
      { code: "FORBIDDEN", http: "403", meaning: "Key does not match the iGMUid, or no access to the resource." },
      { code: "NOT_FOUND", http: "404", meaning: "Resource or task not found." },
      { code: "RESOURCE_LOCKED", http: "409", meaning: "Current task state does not allow this action (e.g. pausing a finished task)." },
      { code: "RATE_LIMITED", http: "429", meaning: "Rate limit exceeded; retry later." },
      { code: "UPSTREAM_ERROR", http: "502", meaning: "Upstream storage or mirror is temporarily unavailable." },
      { code: "INTERNAL_ERROR", http: "500", meaning: "Server internal error; report it with the requestId." },
    ],
  },
  auth: {
    title: "Authentication",
    lead: "Search and detail endpoints for public resources need no authentication; creating and managing download tasks requires a developer identity.",
    items: [
      {
        name: "Developer Key",
        desc: "A 64-character string bound to your iGMUid, generated in the developer portal and resettable at any time. Best for server-side integration and task scheduling.",
      },
      {
        name: "Token",
        desc: "An access token obtained via OAuth or igm login, representing a specific user. Best for clients that must sync download history.",
      },
    ],
    headerTitle: "Request Header Example",
  },
  rateLimit: {
    title: "Rate Limits and Quotas",
    lead: "To keep the service stable, endpoints are rate limited by both account and IP; exceeding a limit returns RATE_LIMITED.",
    columns: { name: "Item", value: "Quota", desc: "Description" },
    items: [
      { name: "Search and detail", value: "60 / minute", desc: "Counted per IP; anonymous use is allowed." },
      { name: "Task creation", value: "20 / minute", desc: "Counted per developer key or account." },
      { name: "Task query", value: "120 / minute", desc: "Prefer a WebSocket subscription to reduce polling." },
      { name: "Concurrent tasks", value: "Up to 5", desc: "Maximum tasks running under one key." },
      { name: "Retries per task", value: "Up to 5", desc: "Manual retry is required after automatic retries are exhausted." },
    ],
  },
  examples: {
    title: "Sample Requests",
    lead: "The samples below create the same download task; pick your language. Replace the placeholders with your real key.",
    labels: { curl: "curl", fetch: "fetch", bun: "Bun", python: "Python" },
  },
  faq: {
    title: "FAQ",
    items: [
      {
        q: "Do I need to sign in to call the API?",
        a: "Search and detail endpoints need no sign-in; creating and managing tasks requires a developer key or user token.",
      },
      {
        q: "Developer key or token — which one?",
        a: "Use the developer key for server-side integration; use an OAuth token for clients acting on behalf of a user.",
      },
      {
        q: "How do I get a resourceId?",
        a: "Call the resource search endpoint with keyword, type, version and loader filters, then read the id field of a result.",
      },
      {
        q: "Do tasks support resume?",
        a: "Yes. Task state is persisted server-side; after a network drop, query and resume by taskId and chunks that already passed the checksum are skipped.",
      },
      {
        q: "WebSocket or polling?",
        a: "Use WebSocket when you need a live progress bar; poll the query endpoint at a low rate when you only need the final result.",
      },
      {
        q: "What if I hit the rate limit?",
        a: "On RATE_LIMITED, retry with exponential backoff, lower your query rate, or switch to a WebSocket subscription.",
      },
    ],
  },
};

/** 两种文档语言对应的正文映射 */
export const iGM_CLI_ApiDocContent: Record<iGM_CLI_DocLocale, iGM_CLI_ApiDocEntry> = {
  "zh-CN": iGM_CLI_ApiDocZhCN,
  en: iGM_CLI_ApiDocEn,
};

// 导出 //
export default iGM_CLI_ApiDocContent;
