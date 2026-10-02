/**
 * 文件路径：apps/cli-download/src/i18n/iGM_CLI_SdkDocContent.ts
 * 所属层：前端 / 国际化内容层
 * 路由：/{locale}/sdk
 * 模块：iGM_CLI_Downloader
 * 作用：SDK 文档长文正文的唯一事实来源——仅提供简体中文与英文两套内容
 * 内容：SDK 概述、下载、bun:ffi 集成、核心函数、进度回调与事件、
 *       错误处理、完整示例项目，以及面向零基础开发者的七章手把手教程；
 *       代码常量复用 iGM_CLI_AdapterSnippets，繁体中文 / 日文 / 俄文回退英文
 */

// 导入依赖 //
import type { iGM_CLI_DocLocale } from "./iGM_CLI_DocLocale";

// 类型定义 //
/** 核心函数条目 */
export interface iGM_CLI_SdkFunctionItem {
  name: string;
  desc: string;
}

/** 进度字段条目 */
export interface iGM_CLI_SdkProgressField {
  name: string;
  desc: string;
}

/** 错误条目 */
export interface iGM_CLI_SdkErrorItem {
  name: string;
  desc: string;
}

/** 教程章节条目（第七章以 FAQ 列表呈现） */
export interface iGM_CLI_SdkTutorialStep {
  /** 锚点 id */
  id: string;
  title: string;
  intro: string;
  bullets: string[];
  /** 常见问题章节的问答列表（仅第七章使用） */
  faq?: { q: string; a: string }[];
}

/** SDK 文档单语言正文结构 */
export interface iGM_CLI_SdkDocEntry {
  /** 页面标题 */
  title: string;
  /** 页头导言 */
  lead: string;
  /** 章节一：概述与支持平台 */
  overview: {
    title: string;
    lead: string;
    platformsTitle: string;
    platforms: { name: string; desc: string }[];
  };
  /** 章节二：下载 SDK */
  download: {
    title: string;
    lead: string;
    fileLabel: string;
    hint: string;
  };
  /** 章节三：集成方式（bun:ffi） */
  integrate: {
    title: string;
    lead: string;
    prosTitle: string;
    pros: string[];
  };
  /** 章节四：核心函数 */
  functions: {
    title: string;
    lead: string;
    columns: { name: string; desc: string };
    items: iGM_CLI_SdkFunctionItem[];
  };
  /** 章节五：进度回调与事件结构 */
  progress: {
    title: string;
    lead: string;
    fieldsTitle: string;
    fields: iGM_CLI_SdkProgressField[];
    eventTitle: string;
  };
  /** 章节六：错误处理 */
  errors: {
    title: string;
    lead: string;
    items: iGM_CLI_SdkErrorItem[];
  };
  /** 章节七：完整示例项目 */
  sample: {
    title: string;
    lead: string;
    runLabel: string;
    outputTitle: string;
  };
  /** 章节八：手把手新手教程 */
  tutorial: {
    title: string;
    lead: string;
    steps: iGM_CLI_SdkTutorialStep[];
  };
}

// 核心逻辑 //
/** 简体中文正文 */
const iGM_CLI_SdkDocZhCN: iGM_CLI_SdkDocEntry = {
  title: "SDK 文档",
  lead: "iGM 下载 SDK 以 C ABI 动态库形式随平台分发，可被任何支持 C ABI 的语言直接链接。对 Bun 启动器而言，推荐使用 bun:ffi 加载：无额外进程、无网络层，进度回调直达 UI。",
  overview: {
    title: "SDK 概述与支持平台",
    lead: "SDK 把 iGM 下载引擎嵌入你的进程内，调用链路最短、内存占用最小，天然不会弹出终端窗口。头文件为 igm_downloader.h，随平台提供对应的动态库产物。",
    platformsTitle: "支持平台与产物",
    platforms: [
      { name: "Windows", desc: "igm_downloader.dll（x64 / arm64）" },
      { name: "macOS", desc: "libigm_downloader.dylib（arm64 / x64）" },
      { name: "Linux", desc: "libigm_downloader.so（x64 / arm64）" },
    ],
  },
  download: {
    title: "下载 SDK",
    lead: "从开发者平台或发行页下载对应平台的动态库，放入你的项目目录（示例统一放在 ./lib）。",
    fileLabel: "平台产物",
    hint: "动态库需与目标架构一致；Windows 需保证同目录存在运行时依赖的 C 运行库。",
  },
  integrate: {
    title: "集成方式：bun:ffi 加载 C ABI",
    lead: "Bun 内置 bun:ffi，可直接加载动态库并声明导出符号，无需编译绑定层。这是启动器采用的最优方式：",
    prosTitle: "为什么选 bun:ffi",
    pros: [
      "无额外进程：库在启动器进程内运行，天然无终端弹窗。",
      "无网络层：不经过本地 HTTP 服务，省去端口与连接管理。",
      "JSCallback 进度回调直达 UI：回调在进程内触发，可实时刷新进度条。",
      "内存占用最小：与启动器共享进程，无跨进程拷贝。",
    ],
  },
  functions: {
    title: "核心函数说明",
    lead: "SDK 导出以下 C ABI 函数；签名以 igm_downloader.h 为准。",
    columns: { name: "函数", desc: "说明" },
    items: [
      { name: "iGM_Launcher_Download_CreateTask", desc: "创建下载任务，传入资源 ID、版本、加载器与目标目录，返回任务句柄。" },
      { name: "iGM_Launcher_Download_SetProgressCallback", desc: "注册进度回调与用户数据指针，回调在进度变化时触发。" },
      { name: "iGM_Launcher_Download_StartTask", desc: "启动任务，返回 0 表示成功。" },
      { name: "iGM_Launcher_Download_PauseTask", desc: "暂停任务，保留已下载分片。" },
      { name: "iGM_Launcher_Download_ResumeTask", desc: "恢复已暂停的任务。" },
      { name: "iGM_Launcher_Download_RetryTask", desc: "重试失败的任务。" },
      { name: "iGM_Launcher_Download_CancelTask", desc: "取消任务并清理临时分片。" },
      { name: "iGM_Launcher_Download_FreeTask", desc: "释放任务句柄，须在任务结束后调用以避免内存泄漏。" },
    ],
  },
  progress: {
    title: "进度回调与事件结构",
    lead: "进度回调接收 iGM_Launcher_Progress 结构指针；WebSocket 事件使用与之同构的 payload。",
    fieldsTitle: "进度字段含义",
    fields: [
      { name: "status", desc: "任务状态：0 等待、1 下载中、2 完成、3 失败。" },
      { name: "downloaded", desc: "已下载字节数。" },
      { name: "total", desc: "文件总字节数。" },
      { name: "percent", desc: "完成百分比（0-100）。" },
      { name: "speed", desc: "当前速度（字节 / 秒）。" },
      { name: "eta", desc: "预计剩余秒数。" },
      { name: "error", desc: "失败时的错误描述，成功时为 null。" },
    ],
    eventTitle: "WebSocket 事件结构",
  },
  errors: {
    title: "错误处理",
    lead: "创建与启动函数通过返回空指针或非零值报告错误，运行期错误经进度回调的 status 与 error 字段返回。",
    items: [
      { name: "加载失败", desc: "dlopen 抛出异常：检查动态库文件名、架构与依赖是否匹配当前平台。" },
      { name: "创建失败", desc: "iGM_Launcher_Download_CreateTask 返回空指针：检查资源 ID、版本与加载器组合是否存在。" },
      { name: "启动失败", desc: "iGM_Launcher_Download_StartTask 返回非零：检查目标目录是否可写、磁盘空间是否充足。" },
      { name: "运行期失败", desc: "回调 status=3 且 error 非空：读取 error 字段并按其类型处理网络或校验问题。" },
    ],
  },
  sample: {
    title: "完整示例项目",
    lead: "以下为可直接运行的最小项目：加载 SDK、创建任务、订阅进度并打印日志。",
    runLabel: "运行命令",
    outputTitle: "预期输出",
  },
  tutorial: {
    title: "手把手新手教程",
    lead: "面向零基础开发者，从注册账号到跑通第一个下载任务，逐步操作。",
    steps: [
      {
        id: "tutor-1",
        title: "章节一 准备工作",
        intro: "在写代码之前，先准备好账号、密钥与动态库。",
        bullets: [
          "注册 iGCraftLit 账号，并完成邮箱验证。",
          "在开发者平台申请成为开发者，获取 64 位开发者密钥。",
          "在账户设置中复制开发者密钥，妥善保存（仅服务端或本地环境变量持有）。",
          "下载对应平台的动态库（igm_downloader.dll / libigm_downloader.so / libigm_downloader.dylib）。",
        ],
      },
      {
        id: "tutor-2",
        title: "章节二 集成到项目",
        intro: "创建一个最小项目目录，并把动态库放进去。",
        bullets: [
          "新建项目目录，例如 my-igm-app，并在其中建立 lib 子目录。",
          "把对应平台的动态库放入 lib 目录。",
          "安装 Bun（bun --version 能输出版本号即成功）。",
          "新建 iGM_SDK.ts，用 bun:ffi 的 dlopen 加载动态库并声明导出符号。",
          "运行 bun iGM_SDK.ts，看到「iGM 下载引擎加载成功」即表示加载成功。",
        ],
      },
      {
        id: "tutor-3",
        title: "章节三 第一个下载任务",
        intro: "加载成功后，创建并启动你的第一个下载任务。",
        bullets: [
          "初始化 SDK：按平台选择动态库并 dlopen。",
          "创建任务：调用 iGM_Launcher_Download_CreateTask，传入资源 ID、版本、加载器与目标目录。",
          "注册进度回调：调用 iGM_Launcher_Download_SetProgressCallback 绑定回调和用户数据。",
          "启动任务：调用 iGM_Launcher_Download_StartTask，返回 0 表示成功。",
          "观察输出：回调持续打印百分比、速度与剩余时间。",
          "完成后校验：确认目标目录出现文件，并按响应中的校验信息核对完整性。",
        ],
      },
      {
        id: "tutor-4",
        title: "章节四 进度回调详解",
        intro: "把回调字段映射到界面，并掌握任务控制。",
        bullets: [
          "字段含义：status 状态、downloaded/total 字节数、percent 百分比、speed 速度、eta 剩余秒数。",
          "映射进度条：直接用 percent 作为进度条宽度（0-100）。",
          "暂停 / 恢复：调用 iGM_Launcher_Download_PauseTask / iGM_Launcher_Download_ResumeTask 控制任务。",
          "重试：任务失败后调用 iGM_Launcher_Download_RetryTask 重新开始，已校验分片会被跳过。",
          "取消：调用 iGM_Launcher_Download_CancelTask 中止任务，结束后记得 iGM_Launcher_Download_FreeTask。",
        ],
      },
      {
        id: "tutor-5",
        title: "章节五 错误处理",
        intro: "认识常见错误并在代码中分类处理。",
        bullets: [
          "常见错误码：加载失败、创建失败、启动失败、运行期失败各自对应不同返回。",
          "网络重试：运行期网络错误可调用 iGM_Launcher_Download_RetryTask 重试，建议配合指数退避。",
          "令牌过期 / 密钥失效：密钥与 iGMUid 绑定，失效后在开发者平台重置并更新环境变量。",
          "文件校验失败：回调 error 提示校验失败时，删除目标文件后重新创建任务。",
        ],
      },
      {
        id: "tutor-6",
        title: "章节六 完整示例",
        intro: "把前面的步骤串成一个可直接运行的最小项目。",
        bullets: [
          "创建 iGM_SDK.ts，按示例代码加载 SDK、创建任务、订阅进度并打印日志。",
          "运行 bun iGM_SDK.ts 启动下载。",
          "观察控制台输出的进度行与最终完成日志。",
          "按 Ctrl+C 可随时取消任务，示例已注册 SIGINT 处理。",
        ],
      },
      {
        id: "tutor-7",
        title: "章节七 常见问题",
        intro: "新手最常遇到的几个问题与排查方向。",
        bullets: [],
        faq: [
          {
            q: "动态库加载失败怎么办？",
            a: "核对文件名拼写与架构（x64 / arm64）是否与运行环境一致；Windows 还需确认 C 运行库等依赖是否就绪。",
          },
          {
            q: "进度回调不触发怎么办？",
            a: "确认已在 iGM_Launcher_Download_StartTask 之前调用 iGM_Launcher_Download_SetProgressCallback，且传入的回调指针有效、未被提前回收。",
          },
          {
            q: "下载很慢怎么办？",
            a: "优先检查本地网络与目标镜像状态；服务端会自动选择可用镜像，必要时切换镜像源后重试。",
          },
          {
            q: "如何切换下载源？",
            a: "通过 SDK / API 的镜像源配置切换，或在创建任务前选择就近镜像；切换后已下载分片仍可复用。",
          },
          {
            q: "如何获取开发者密钥？",
            a: "在开发者平台申请成为开发者后，于账户设置中生成并复制 64 位开发者密钥，密钥与你的 iGMUid 绑定。",
          },
        ],
      },
    ],
  },
};

/** 英文正文 */
const iGM_CLI_SdkDocEn: iGM_CLI_SdkDocEntry = {
  title: "SDK Documentation",
  lead: "The iGM Download SDK ships as a C ABI dynamic library per platform and can be linked from any language that supports the C ABI. For Bun launchers we recommend loading it with bun:ffi: no extra process, no network layer, and progress callbacks straight to your UI.",
  overview: {
    title: "SDK Overview and Supported Platforms",
    lead: "The SDK embeds the iGM download engine in your process for the shortest call path and the smallest memory footprint, with no terminal window ever popping up. The header is igm_downloader.h and each platform ships its own library artifact.",
    platformsTitle: "Supported Platforms and Artifacts",
    platforms: [
      { name: "Windows", desc: "igm_downloader.dll (x64 / arm64)" },
      { name: "macOS", desc: "libigm_downloader.dylib (arm64 / x64)" },
      { name: "Linux", desc: "libigm_downloader.so (x64 / arm64)" },
    ],
  },
  download: {
    title: "Download the SDK",
    lead: "Download the library for your platform from the developer portal or release page and place it in your project (the samples use ./lib).",
    fileLabel: "Platform artifact",
    hint: "The library must match the target architecture; on Windows make sure the required C runtime is present alongside it.",
  },
  integrate: {
    title: "Integration: Loading the C ABI with bun:ffi",
    lead: "Bun ships bun:ffi, so you can load the library and declare exported symbols with no binding layer to compile. This is the recommended approach for launchers:",
    prosTitle: "Why bun:ffi",
    pros: [
      "No extra process: the library runs in the launcher process, so no terminal window appears.",
      "No network layer: no local HTTP service, no port or connection management.",
      "JSCallback progress straight to the UI: callbacks fire in-process for live progress bars.",
      "Smallest memory footprint: shared process, no cross-process copies.",
    ],
  },
  functions: {
    title: "Core Functions",
    lead: "The SDK exports the following C ABI functions; igm_downloader.h is the source of truth for signatures.",
    columns: { name: "Function", desc: "Description" },
    items: [
      { name: "iGM_Launcher_Download_CreateTask", desc: "Create a download task from resource ID, version, loader and target dir; returns a task handle." },
      { name: "iGM_Launcher_Download_SetProgressCallback", desc: "Register a progress callback and a user-data pointer; the callback fires on progress changes." },
      { name: "iGM_Launcher_Download_StartTask", desc: "Start the task; returns 0 on success." },
      { name: "iGM_Launcher_Download_PauseTask", desc: "Pause the task and keep downloaded chunks." },
      { name: "iGM_Launcher_Download_ResumeTask", desc: "Resume a paused task." },
      { name: "iGM_Launcher_Download_RetryTask", desc: "Retry a failed task." },
      { name: "iGM_Launcher_Download_CancelTask", desc: "Cancel the task and clean up temporary chunks." },
      { name: "iGM_Launcher_Download_FreeTask", desc: "Free the task handle; call after the task ends to avoid leaks." },
    ],
  },
  progress: {
    title: "Progress Callback and Event Structure",
    lead: "The progress callback receives a pointer to iGM_Launcher_Progress; WebSocket events use a payload with the same shape.",
    fieldsTitle: "Progress Field Meanings",
    fields: [
      { name: "status", desc: "Task status: 0 pending, 1 downloading, 2 done, 3 failed." },
      { name: "downloaded", desc: "Bytes downloaded so far." },
      { name: "total", desc: "Total bytes of the file." },
      { name: "percent", desc: "Completion percentage (0-100)." },
      { name: "speed", desc: "Current speed in bytes/second." },
      { name: "eta", desc: "Estimated seconds remaining." },
      { name: "error", desc: "Error description on failure; null on success." },
    ],
    eventTitle: "WebSocket Event Structure",
  },
  errors: {
    title: "Error Handling",
    lead: "Create and start report errors via a null pointer or non-zero return, while runtime errors surface through the status and error fields of the progress callback.",
    items: [
      { name: "Load failure", desc: "dlopen throws: check the library file name, architecture and dependencies for the current platform." },
      { name: "Create failure", desc: "iGM_Launcher_Download_CreateTask returns null: check that the resource ID, version and loader combination exists." },
      { name: "Start failure", desc: "iGM_Launcher_Download_StartTask returns non-zero: check that the target dir is writable and disk space is sufficient." },
      { name: "Runtime failure", desc: "Callback status=3 with non-null error: read the error field and handle network or checksum issues accordingly." },
    ],
  },
  sample: {
    title: "Complete Sample Project",
    lead: "The following minimal project runs as-is: it loads the SDK, creates a task, subscribes to progress and prints logs.",
    runLabel: "Run command",
    outputTitle: "Expected output",
  },
  tutorial: {
    title: "Hands-on Beginner Tutorial",
    lead: "A step-by-step walkthrough for developers with no prior experience, from signing up to running your first download task.",
    steps: [
      {
        id: "tutor-1",
        title: "Chapter 1 — Preparation",
        intro: "Before writing code, get the account, key and library ready.",
        bullets: [
          "Register an iGCraftLit account and verify your email.",
          "Apply to become a developer in the developer portal to obtain a 64-character developer key.",
          "Copy the developer key from account settings and store it safely (server-side or in local env vars only).",
          "Download the library for your platform (igm_downloader.dll / libigm_downloader.so / libigm_downloader.dylib).",
        ],
      },
      {
        id: "tutor-2",
        title: "Chapter 2 — Integrate into a Project",
        intro: "Create a minimal project directory and drop the library in.",
        bullets: [
          "Create a project folder such as my-igm-app and add a lib subfolder.",
          "Put the platform library into the lib folder.",
          "Install Bun (success means bun --version prints a version).",
          "Create iGM_SDK.ts, load the library with bun:ffi's dlopen and declare the exported symbols.",
          "Run bun iGM_SDK.ts; seeing \"iGM download engine loaded\" means loading succeeded.",
        ],
      },
      {
        id: "tutor-3",
        title: "Chapter 3 — Your First Download Task",
        intro: "Once loading works, create and start your first download task.",
        bullets: [
          "Initialize the SDK: pick the library by platform and dlopen it.",
          "Create a task: call iGM_Launcher_Download_CreateTask with resource ID, version, loader and target dir.",
          "Register the progress callback: call iGM_Launcher_Download_SetProgressCallback with the callback and user data.",
          "Start the task: call iGM_Launcher_Download_StartTask; a 0 return means success.",
          "Watch the output: the callback prints percent, speed and remaining time.",
          "Verify on completion: confirm the file exists in the target dir and check integrity with the checksum info.",
        ],
      },
      {
        id: "tutor-4",
        title: "Chapter 4 — Progress Callback in Depth",
        intro: "Map callback fields to your UI and master task control.",
        bullets: [
          "Field meanings: status, downloaded/total bytes, percent, speed and eta.",
          "Map a progress bar: use percent directly as the bar width (0-100).",
          "Pause / resume: call iGM_Launcher_Download_PauseTask / iGM_Launcher_Download_ResumeTask.",
          "Retry: after a failure call iGM_Launcher_Download_RetryTask; verified chunks are skipped.",
          "Cancel: call iGM_Launcher_Download_CancelTask, then iGM_Launcher_Download_FreeTask once the task has ended.",
        ],
      },
      {
        id: "tutor-5",
        title: "Chapter 5 — Error Handling",
        intro: "Recognize common errors and handle them by category in code.",
        bullets: [
          "Common errors: load, create, start and runtime failures each have distinct returns.",
          "Network retry: on a runtime network error, call iGM_Launcher_Download_RetryTask with exponential backoff.",
          "Token expired / invalid key: the key is bound to your iGMUid; reset it in the portal and update env vars.",
          "Checksum failure: when the callback reports a checksum failure, delete the file and re-create the task.",
        ],
      },
      {
        id: "tutor-6",
        title: "Chapter 6 — Complete Example",
        intro: "Wire the previous steps into one runnable minimal project.",
        bullets: [
          "Create iGM_SDK.ts using the sample code to load the SDK, create a task, subscribe to progress and print logs.",
          "Run bun iGM_SDK.ts to start the download.",
          "Watch the progress lines and the final completion log.",
          "Press Ctrl+C to cancel at any time; the sample registers a SIGINT handler.",
        ],
      },
      {
        id: "tutor-7",
        title: "Chapter 7 — FAQ",
        intro: "The problems beginners hit most often and how to troubleshoot them.",
        bullets: [],
        faq: [
          {
            q: "The library fails to load — what now?",
            a: "Check the file name spelling and architecture (x64 / arm64) against your runtime; on Windows also confirm the C runtime and other dependencies are present.",
          },
          {
            q: "The progress callback never fires — why?",
            a: "Make sure iGM_Launcher_Download_SetProgressCallback is called before iGM_Launcher_Download_StartTask, and that the callback pointer is valid and not garbage-collected early.",
          },
          {
            q: "Downloads are slow — what can I do?",
            a: "Check your network and the target mirror first; the server picks an available mirror automatically, and you can switch mirrors and retry.",
          },
          {
            q: "How do I switch the download source?",
            a: "Configure the mirror via the SDK / API settings or pick a nearby mirror before creating a task; downloaded chunks remain reusable.",
          },
          {
            q: "How do I get a developer key?",
            a: "After applying to become a developer, generate and copy the 64-character key in account settings; it is bound to your iGMUid.",
          },
        ],
      },
    ],
  },
};

/** 两种文档语言对应的正文映射 */
export const iGM_CLI_SdkDocContent: Record<iGM_CLI_DocLocale, iGM_CLI_SdkDocEntry> = {
  "zh-CN": iGM_CLI_SdkDocZhCN,
  en: iGM_CLI_SdkDocEn,
};

// 导出 //
export default iGM_CLI_SdkDocContent;
