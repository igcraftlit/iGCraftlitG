/**
 * 文件路径：apps/shell/src/iGM_Launcher_Download.ts
 * 所属层：桌面外壳 / 下载引擎层
 * 路由：全局（不对外暴露 URL，仅被 iGM_Launcher_Bridge 调用）
 * 模块：iGM_Launcher_Download
 * 作用：按官方目录规则把 Minecraft 游戏本体真实下载到共享根目录（.minecraft 根）
 * 内容：清单驱动主流程——主站下发版本文件清单，文本文件原样写盘、二进制文件逐文件
 *       经 Zig 引擎（bun:ffi）直链下载并实时叠加进度；
 *       旧 Mojang 直连流程作为兜底保留：官方版本清单与版本 json 解析、客户端 jar、
 *       依赖库（含 natives 分类器）、资源索引与资源对象、Fabric 加载器 profile 与其依赖库；
 *       分阶段下载并实时维护进度快照，支持取消与失败重试；
 *       通过 iGM_Launcher_Download_Subscribe 向独立进度窗口广播进度
 *
 * 说明：目录规则与模块六一致——versions / libraries / assets 为全部实例共享、只存一份；
 *       同版本不同加载器在 versions 下按 <version> 与 <version>-<loader> 区分，
 *       但共用同一份 libraries 与 assets。
 *       本模块只负责下载与落盘，natives 解压、游戏启动与参数拼装留待后续模块；
 *       下载进度只在主进程内存中维护，不做任何伪造（失败即如实标记 failed）。
 *       Zig 侧对应契约：iGM_Launcher_ListLoaderVersions / iGM_Launcher_StartDownload /
 *       iGM_Launcher_DownloadStatus / iGM_Launcher_CancelDownload。
 */

// 导入依赖 //
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import {
  IGM_LAUNCHER_ASSET_BASE_URL,
  IGM_LAUNCHER_DOWNLOAD_CONCURRENCY,
  IGM_LAUNCHER_DOWNLOAD_RETRY,
  IGM_LAUNCHER_DOWNLOAD_TIMEOUT_MS,
  IGM_LAUNCHER_FABRIC_META_URL,
  IGM_LAUNCHER_MOJANG_MANIFEST_URL,
  iGM_Launcher_NewId,
  iGM_Launcher_VersionDirName,
  type iGM_Launcher_DownloadProgress,
  type iGM_Launcher_DownloadStage,
  type iGM_Launcher_LoaderType,
  type iGM_Launcher_VersionFilesManifest,
} from "@igm-launcher/shared";
import {
  iGM_Launcher_SDK_Await,
  iGM_Launcher_SDK_IsAvailable,
  iGM_Launcher_SDK_Release,
  iGM_Launcher_SDK_StartUrl,
  iGM_Launcher_SDK_Subscribe,
} from "./iGM_Launcher_SDK";

// 类型定义 //

/** 需要下载的单个文件 */
interface iGM_Launcher_DownloadItem {
  /** 下载地址 */
  url: string;
  /** 相对共享根目录的落盘路径 */
  path: string;
  /** 期望大小（字节），未知为 0 */
  size: number;
  /** 期望 sha1，未知为空字符串 */
  sha1: string;
}

/** 官方版本清单单条记录 */
interface iGM_Launcher_ManifestVersion {
  id: string;
  url: string;
  type?: string;
  releaseTime?: string;
}

/** 官方版本清单 */
interface iGM_Launcher_Manifest {
  versions: iGM_Launcher_ManifestVersion[];
}

/** 依赖库规则 */
interface iGM_Launcher_LibraryRule {
  action: string;
  os?: { name?: string };
}

/** 依赖库下载项 */
interface iGM_Launcher_LibraryDownload {
  path?: string;
  url?: string;
  sha1?: string;
  size?: number;
}

/** 依赖库条目（官方版本 json 与 Fabric profile 共用形状） */
interface iGM_Launcher_Library {
  name: string;
  url?: string;
  rules?: iGM_Launcher_LibraryRule[];
  natives?: Record<string, string>;
  downloads?: {
    artifact?: iGM_Launcher_LibraryDownload;
    classifiers?: Record<string, iGM_Launcher_LibraryDownload>;
  };
}

/** 官方版本 json 中本模块关心的字段 */
interface iGM_Launcher_VersionJson {
  id: string;
  assets?: string;
  assetIndex?: { id?: string; url?: string; sha1?: string; size?: number };
  downloads?: { client?: iGM_Launcher_LibraryDownload };
  libraries?: iGM_Launcher_Library[];
  logging?: { client?: { file?: { id?: string; url?: string; sha1?: string; size?: number } } };
}

/** 资源索引中的单个对象 */
interface iGM_Launcher_AssetObject {
  hash: string;
  size?: number;
}

/** 资源索引 */
interface iGM_Launcher_AssetIndex {
  objects?: Record<string, iGM_Launcher_AssetObject>;
}

/** Fabric 加载器列表单条记录 */
interface iGM_Launcher_FabricLoaderItem {
  loader?: { version?: string; stable?: boolean };
}

/** Fabric 加载器 profile */
interface iGM_Launcher_FabricProfile {
  id?: string;
  inheritsFrom?: string;
  libraries?: iGM_Launcher_Library[];
  [key: string]: unknown;
}

/** 下载任务：进度快照 + 取消标记 */
interface iGM_Launcher_DownloadTask {
  progress: iGM_Launcher_DownloadProgress;
  cancelled: boolean;
}

/** 下载目标 */
export interface iGM_Launcher_DownloadTarget {
  version: string;
  loader: iGM_Launcher_LoaderType;
  loaderVersion?: string;
  rootDir: string;
  /**
   * 主站下发的版本文件清单。
   * 提供时走「清单驱动」流程（文本写盘 + 二进制逐文件走 Zig 引擎直连下载）；
   * 缺省时回退为启动器自解析 Mojang 清单的兜底流程。
   */
  manifest?: iGM_Launcher_VersionFilesManifest;
}

/** 下载进度订阅回调（独立进度窗口据此实时刷新） */
export type iGM_Launcher_DownloadListener = (progress: iGM_Launcher_DownloadProgress) => void;

// 核心逻辑 //

/** 任务表与最近一次任务编号（界面不带 taskId 时取最近一次） */
const iGM_Launcher_DownloadTasks = new Map<string, iGM_Launcher_DownloadTask>();
let iGM_Launcher_DownloadLastTaskId: string | null = null;

/** 下载进度订阅者集合（同一时刻通常只有下载进度窗口） */
const iGM_Launcher_DownloadListeners = new Set<iGM_Launcher_DownloadListener>();

/**
 * 订阅下载进度：返回取消订阅函数。
 * 每次阶段变化、文件完成与 SDK 子进度更新都会经 iGM_Launcher_Download_Notify 广播。
 */
export function iGM_Launcher_Download_Subscribe(
  listener: iGM_Launcher_DownloadListener,
): () => void {
  iGM_Launcher_DownloadListeners.add(listener);
  return () => {
    iGM_Launcher_DownloadListeners.delete(listener);
  };
}

/** 广播一次进度快照；单个订阅者抛错不影响其余订阅者 */
function iGM_Launcher_Download_Notify(progress: iGM_Launcher_DownloadProgress): void {
  for (const listener of [...iGM_Launcher_DownloadListeners]) {
    try {
      listener({ ...progress });
    } catch (error) {
      console.warn("[iGM_Launcher_Download] 进度订阅回调异常：", error);
    }
  }
}

/* ---- 通用工具 ---- */

/** 休眠指定毫秒 */
function iGM_Launcher_Download_Sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 当前平台对应的官方 os 名（用于依赖库 rules 判定） */
function iGM_Launcher_Download_OsName(): string {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "osx";
  return "linux";
}

/**
 * 依赖库 rules 判定：无 rules 视为允许；
 * 逐条匹配当前平台，最后一条命中规则决定允许与否（与官方启动器一致）。
 */
function iGM_Launcher_Download_AllowRules(rules?: iGM_Launcher_LibraryRule[]): boolean {
  if (!rules || rules.length === 0) return true;
  const osName = iGM_Launcher_Download_OsName();
  let allowed = false;
  for (const rule of rules) {
    const matched = !rule.os?.name || rule.os.name === osName;
    if (matched) allowed = rule.action === "allow";
  }
  return allowed;
}

/** 由 maven 坐标推导仓库相对路径：group:artifact:version[:classifier] */
function iGM_Launcher_Download_MavenPath(name: string): string {
  const [group, artifact, version, classifier] = name.split(":");
  const groupPath = (group ?? "").replace(/\./g, "/");
  const suffix = classifier ? `-${classifier}` : "";
  return `${groupPath}/${artifact}/${version}/${artifact}-${version}${suffix}.jar`;
}

/** 校验落盘路径合法（禁止越出共享根目录） */
function iGM_Launcher_Download_AbsPath(rootDir: string, relativePath: string): string {
  const abs = normalize(join(rootDir, relativePath));
  if (!abs.startsWith(normalize(rootDir))) {
    throw new Error(`非法下载路径：${relativePath}`);
  }
  return abs;
}

/**
 * 按文件相对路径推断下载阶段：
 * versions 下按是否为目标加载器版本目录区分「客户端」与「加载器」；
 * libraries / assets 各归对应阶段；其余沿用上一阶段。
 */
function iGM_Launcher_Download_StageOfPath(
  path: string,
  loader: iGM_Launcher_LoaderType,
  versionId: string,
  previous: iGM_Launcher_DownloadStage,
): iGM_Launcher_DownloadStage {
  const posix = path.replace(/\\/g, "/");
  if (posix.startsWith("versions/")) {
    const inLoaderDir = loader !== "vanilla" && posix.startsWith(`versions/${versionId}/`);
    return inLoaderDir ? "loader" : "client";
  }
  if (posix.startsWith("libraries/")) return "libraries";
  if (posix.startsWith("assets/")) return "assets";
  return previous;
}

/** 校验 sha1（未提供期望值时跳过） */
function iGM_Launcher_Download_Sha1(data: Uint8Array): string {
  return createHash("sha1").update(data).digest("hex");
}

/** 带超时与重试的 JSON 请求 */
async function iGM_Launcher_Download_FetchJson<T>(url: string): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= IGM_LAUNCHER_DOWNLOAD_RETRY; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(IGM_LAUNCHER_DOWNLOAD_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (attempt < IGM_LAUNCHER_DOWNLOAD_RETRY) {
        await iGM_Launcher_Download_Sleep(400 * attempt);
      }
    }
  }
  throw new Error(
    `请求失败：${url}（${lastError instanceof Error ? lastError.message : "未知错误"}）`,
  );
}

/**
 * 下载单个文件到共享根目录。
 * 已存在且大小一致时直接跳过；下载写入 .part 临时文件后再改名，避免半成品被误用。
 */
async function iGM_Launcher_Download_File(
  rootDir: string,
  item: iGM_Launcher_DownloadItem,
): Promise<number> {
  const absPath = iGM_Launcher_Download_AbsPath(rootDir, item.path);

  if (existsSync(absPath)) {
    const info = await stat(absPath);
    if (info.size > 0 && (item.size === 0 || info.size === item.size)) {
      return info.size;
    }
  }

  await mkdir(dirname(absPath), { recursive: true });
  const tempPath = `${absPath}.part`;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= IGM_LAUNCHER_DOWNLOAD_RETRY; attempt += 1) {
    try {
      const response = await fetch(item.url, {
        signal: AbortSignal.timeout(IGM_LAUNCHER_DOWNLOAD_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = new Uint8Array(await response.arrayBuffer());
      if (item.sha1 && iGM_Launcher_Download_Sha1(buffer) !== item.sha1.toLowerCase()) {
        throw new Error("sha1 校验失败");
      }
      await writeFile(tempPath, buffer);
      await rename(tempPath, absPath);
      return buffer.byteLength;
    } catch (error) {
      lastError = error;
      if (attempt < IGM_LAUNCHER_DOWNLOAD_RETRY) {
        await iGM_Launcher_Download_Sleep(500 * attempt);
      }
    }
  }

  throw new Error(
    `下载失败：${item.path}（${lastError instanceof Error ? lastError.message : "未知错误"}）`,
  );
}

/**
 * 阶段执行：登记计划总量后按并发窗口逐个下载，实时累计进度。
 * 取消时立即停止后续文件，返回 false 表示本轮被取消。
 */
async function iGM_Launcher_Download_RunPhase(
  task: iGM_Launcher_DownloadTask,
  stage: iGM_Launcher_DownloadStage,
  items: iGM_Launcher_DownloadItem[],
  concurrency: number,
): Promise<boolean> {
  const { progress } = task;
  progress.stage = stage;
  if (items.length === 0) return true;

  progress.filesTotal += items.length;
  progress.bytesTotal += items.reduce((sum, item) => sum + (item.size || 0), 0);

  let cursor = 0;
  let cancelled = false;

  const worker = async (): Promise<void> => {
    while (!task.cancelled && !cancelled) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      const item = items[index];
      progress.currentFile = item.path;
      try {
        const written = await iGM_Launcher_Download_File(progress.rootDir, item);
        progress.bytesDone += written;
      } catch (error) {
        // 单个文件失败即终止整个任务，如实报错，不跳过、不伪造成功
        progress.error = error instanceof Error ? error.message : "下载失败";
        cancelled = true;
        return;
      }
      progress.filesDone += 1;
    }
  };

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker);
  await Promise.all(workers);
  return !cancelled && !task.cancelled;
}

/* ---- 计划构建 ---- */

/** 依赖库下载项转计划条目 */
function iGM_Launcher_Download_LibraryItems(
  libraries: iGM_Launcher_Library[] | undefined,
  osName: string,
): iGM_Launcher_DownloadItem[] {
  const items: iGM_Launcher_DownloadItem[] = [];
  for (const library of libraries ?? []) {
    if (!iGM_Launcher_Download_AllowRules(library.rules)) continue;

    const artifact = library.downloads?.artifact;
    if (artifact?.url) {
      items.push({
        url: artifact.url,
        path: `libraries/${artifact.path ?? iGM_Launcher_Download_MavenPath(library.name)}`,
        size: artifact.size ?? 0,
        sha1: artifact.sha1 ?? "",
      });
    } else if (library.url && library.name) {
      // 早期版本的依赖库只有 maven 仓库基址，按坐标拼路径
      const relativePath = iGM_Launcher_Download_MavenPath(library.name);
      items.push({
        url: `${library.url.replace(/\/+$/, "")}/${relativePath}`,
        path: `libraries/${relativePath}`,
        size: 0,
        sha1: "",
      });
    }

    // natives 分类器：按当前平台取对应 classifier
    const classifierKey = library.natives?.[osName];
    const classifier = classifierKey
      ? library.downloads?.classifiers?.[classifierKey]
      : undefined;
    if (classifier?.url) {
      items.push({
        url: classifier.url,
        path: `libraries/${classifier.path ?? iGM_Launcher_Download_MavenPath(library.name)}`,
        size: classifier.size ?? 0,
        sha1: classifier.sha1 ?? "",
      });
    }
  }
  return items;
}

/** 资源对象计划条目：官方 CDN <前缀>/<sha1 前两位>/<sha1> */
function iGM_Launcher_Download_AssetItems(index: iGM_Launcher_AssetIndex): iGM_Launcher_DownloadItem[] {
  const items: iGM_Launcher_DownloadItem[] = [];
  for (const object of Object.values(index.objects ?? {})) {
    const hash = object.hash;
    if (!hash) continue;
    const prefix = hash.slice(0, 2);
    items.push({
      url: `${IGM_LAUNCHER_ASSET_BASE_URL}/${prefix}/${hash}`,
      path: `assets/objects/${prefix}/${hash}`,
      size: object.size ?? 0,
      sha1: hash,
    });
  }
  return items;
}

/* ---- 加载器元数据 ---- */

/**
 * 查询加载器的可选版本列表（Fabric 官方元数据，新版本在前）。
 * 原版没有加载器版本，返回空数组。
 */
export async function iGM_Launcher_Download_LoaderVersions(
  version: string,
  loader: iGM_Launcher_LoaderType,
): Promise<string[]> {
  if (loader !== "fabric") return [];
  const url = `${IGM_LAUNCHER_FABRIC_META_URL}/versions/loader/${encodeURIComponent(version)}`;
  const list = await iGM_Launcher_Download_FetchJson<iGM_Launcher_FabricLoaderItem[]>(url);
  return list
    .map((item) => item.loader?.version ?? "")
    .filter((value) => value.length > 0);
}

/* ---- 任务入口 ---- */

/** 查询任务进度：不带 taskId 时取最近一次任务 */
export function iGM_Launcher_Download_Status(taskId?: string): iGM_Launcher_DownloadProgress | null {
  const id = taskId ?? iGM_Launcher_DownloadLastTaskId ?? "";
  const task = iGM_Launcher_DownloadTasks.get(id);
  return task ? { ...task.progress } : null;
}

/** 取消任务：不带 taskId 时取最近一次任务 */
export function iGM_Launcher_Download_Cancel(taskId?: string): iGM_Launcher_DownloadProgress | null {
  const id = taskId ?? iGM_Launcher_DownloadLastTaskId ?? "";
  const task = iGM_Launcher_DownloadTasks.get(id);
  if (!task) return null;
  if (task.progress.stage !== "done" && task.progress.stage !== "failed") {
    task.cancelled = true;
  }
  return { ...task.progress };
}

/**
 * 启动下载任务：立即返回初始进度快照，真实下载在后台继续。
 * 界面按返回的 taskId 轮询 minecraft:download-status。
 */
export function iGM_Launcher_Download_Start(
  target: iGM_Launcher_DownloadTarget,
): iGM_Launcher_DownloadProgress {
  const version = target.version?.trim() ?? "";
  const rootDir = target.rootDir?.trim() ? normalize(target.rootDir.trim()) : "";
  if (!version) throw new Error("缺少目标版本号");
  if (!rootDir) throw new Error("缺少下载目录（共享根目录）");

  const progress: iGM_Launcher_DownloadProgress = {
    taskId: iGM_Launcher_NewId("dl"),
    version,
    loader: target.loader,
    loaderVersion: target.loaderVersion ?? "",
    versionId: iGM_Launcher_VersionDirName(version, target.loader),
    rootDir,
    stage: "resolving",
    filesTotal: 0,
    filesDone: 0,
    bytesTotal: 0,
    bytesDone: 0,
    currentFile: "",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: "",
  };

  const task: iGM_Launcher_DownloadTask = { progress, cancelled: false };
  iGM_Launcher_DownloadTasks.set(progress.taskId, task);
  iGM_Launcher_DownloadLastTaskId = progress.taskId;

  void iGM_Launcher_Download_Execute(task, target);
  return { ...progress };
}

/* ---- 下载主流程 ---- */

/**
 * 清单驱动下载主流程（清单由自己网站下发）：
 * 1) 建根目录，把 manifest.texts 逐个原样写盘（每写一个计一个文件）；
 * 2) 按清单顺序逐文件下载：本地已存在且大小一致则跳过，否则优先走 Zig 引擎直链下载
 *    （SDK 不可用时回退旧的 HTTP 直连），逐文件等待终态并累加进度；
 * 3) 收尾校验目标版本 json 真实存在。
 * 全程经 iGM_Launcher_Download_Notify 广播进度，任一文件失败即如实标记 failed。
 */
async function iGM_Launcher_Download_ExecuteFromManifest(
  task: iGM_Launcher_DownloadTask,
  manifest: iGM_Launcher_VersionFilesManifest,
): Promise<void> {
  const { progress } = task;

  // 回填清单解析结果，保证进度快照与真实安装目标一致
  if (manifest.versionId) progress.versionId = manifest.versionId;
  if (manifest.loaderVersion) progress.loaderVersion = manifest.loaderVersion;

  // 当前活动 SDK 任务编号：订阅据此只叠加当前文件的实时字节
  let activeTaskId = "";
  let sdkFileBase = progress.bytesDone;

  /*
   * 逐文件下载期间把 SDK 快照的 downloaded 叠加到已完成基数上，
   * 使进度条在单个大文件下载过程中也能平滑推进（而不是只在文件之间跳）。
   */
  const unsubscribe = iGM_Launcher_SDK_Subscribe((snapshot) => {
    if (!activeTaskId || snapshot.taskId !== activeTaskId) return;
    progress.bytesDone = sdkFileBase + snapshot.downloaded;
    iGM_Launcher_Download_Notify(progress);
  });

  try {
    await mkdir(progress.rootDir, { recursive: true });

    // 1) 文本文件原样写盘（版本 json / Fabric profile / 资源索引）
    progress.stage = "version-json";
    iGM_Launcher_Download_Notify(progress);
    for (const text of manifest.texts ?? []) {
      if (task.cancelled) return iGM_Launcher_Download_Finish(task, "cancelled");
      const absPath = iGM_Launcher_Download_AbsPath(progress.rootDir, text.path);
      await mkdir(dirname(absPath), { recursive: true });
      await writeFile(absPath, text.content, "utf8");
      progress.currentFile = text.path;
      progress.filesTotal += 1;
      progress.filesDone += 1;
      iGM_Launcher_Download_Notify(progress);
    }

    // 2) 二进制文件逐文件下载
    const files = manifest.files ?? [];
    progress.filesTotal += files.length;
    progress.bytesTotal += files.reduce((sum, file) => sum + (file.size || 0), 0);
    iGM_Launcher_Download_Notify(progress);

    for (const file of files) {
      if (task.cancelled) return iGM_Launcher_Download_Finish(task, "cancelled");

      // 本文件的已完成基数：SDK 实时叠加与最终累加都以此为准，避免重复计数
      const fileBase = progress.bytesDone;
      progress.currentFile = file.path;
      progress.stage = iGM_Launcher_Download_StageOfPath(
        file.path,
        progress.loader,
        progress.versionId,
        progress.stage,
      );
      iGM_Launcher_Download_Notify(progress);

      const absPath = iGM_Launcher_Download_AbsPath(progress.rootDir, file.path);

      // 本地已存在且大小一致则跳过，避免重复下载
      if (existsSync(absPath)) {
        const info = await stat(absPath);
        if (info.size > 0 && (file.size === 0 || info.size === file.size)) {
          progress.bytesDone = fileBase + info.size;
          progress.filesDone += 1;
          iGM_Launcher_Download_Notify(progress);
          continue;
        }
      }

      let written = 0;
      let sdkTaskId = "";
      if (iGM_Launcher_SDK_IsAvailable()) {
        try {
          const snapshot = iGM_Launcher_SDK_StartUrl({
            url: file.url,
            destPath: absPath,
            sha1: file.sha1,
            size: file.size,
            version: progress.version,
            loader: manifest.loader,
            targetDir: progress.rootDir,
          });
          sdkTaskId = snapshot.taskId;
          activeTaskId = sdkTaskId;
          sdkFileBase = fileBase;
          const final = await iGM_Launcher_SDK_Await(sdkTaskId);
          if (final.status !== "completed") {
            throw new Error(final.error || `文件下载未完成：${file.path}`);
          }
          written = final.downloaded > 0 ? final.downloaded : file.size;
        } catch (error) {
          /*
           * SDK 创建阶段失败（符号缺失 / 参数非法等）不阻断整体安装，
           * 回退到旧的 HTTP 直连下载，保证仍能完成安装；
           * 已创建任务后的失败（含校验失败 / 404）则如实抛出，不掩盖真实原因。
           */
          if (sdkTaskId) throw error;
          console.warn(
            `[iGM_Launcher_Download] SDK 直链下载创建失败，回退 HTTP：${file.path}`,
            error,
          );
        } finally {
          activeTaskId = "";
          if (sdkTaskId) iGM_Launcher_SDK_Release(sdkTaskId);
        }
      }

      // SDK 不可用或创建失败时，回退旧的 HTTP 逐文件下载
      if (!sdkTaskId) {
        written = await iGM_Launcher_Download_File(progress.rootDir, {
          url: file.url,
          path: file.path,
          size: file.size,
          sha1: file.sha1,
        });
      }

      if (task.cancelled) return iGM_Launcher_Download_Finish(task, "cancelled");
      progress.bytesDone = fileBase + written;
      progress.filesDone += 1;
      iGM_Launcher_Download_Notify(progress);
    }

    // 3) 收尾校验：目标版本 json 必须真实存在，否则视为安装未完成
    progress.stage = "finalizing";
    iGM_Launcher_Download_Notify(progress);
    const finalJsonPath = iGM_Launcher_Download_AbsPath(
      progress.rootDir,
      `versions/${progress.versionId}/${progress.versionId}.json`,
    );
    if (!existsSync(finalJsonPath)) {
      throw new Error("版本 json 未落盘，安装未完成");
    }
    iGM_Launcher_Download_Finish(task, "done");
  } catch (error) {
    progress.error = error instanceof Error ? error.message : "下载过程发生未知错误";
    iGM_Launcher_Download_Finish(task, "failed");
  } finally {
    unsubscribe();
  }
}

/**
 * 下载主流程：
 * 提供 manifest 时走清单驱动流程（见 iGM_Launcher_Download_ExecuteFromManifest）；
 * 否则回退旧的 Mojang 直连兜底流程：
 * 1) 拉取官方版本清单定位目标版本，取得版本 json；
 * 2) 写入 versions/<version>/<version>.json（原版清单，加载器 profile 依赖它）；
 * 3) 下载客户端 jar、依赖库（含 natives）、资源索引与资源对象；
 * 4) 加载器为 Fabric 时，写入 <version>-<loader> 的 profile json 并补齐其依赖库；
 * 5) 收尾校验版本 json 是否落盘。
 * 任一环节失败即标记 failed 并记录原因，绝不伪造成功。
 */
async function iGM_Launcher_Download_Execute(
  task: iGM_Launcher_DownloadTask,
  target: iGM_Launcher_DownloadTarget,
): Promise<void> {
  // 优先走主站清单驱动流程；清单缺省时才回退旧的 Mojang 直连兜底流程
  if (target.manifest) {
    return iGM_Launcher_Download_ExecuteFromManifest(task, target.manifest);
  }

  const { progress } = task;
  const osName = iGM_Launcher_Download_OsName();
  try {
    await mkdir(progress.rootDir, { recursive: true });

    // 1) 官方版本清单 → 目标版本 json
    const manifest = await iGM_Launcher_Download_FetchJson<iGM_Launcher_Manifest>(
      IGM_LAUNCHER_MOJANG_MANIFEST_URL,
    );
    const manifestEntry = (manifest.versions ?? []).find((item) => item.id === progress.version);
    if (!manifestEntry?.url) throw new Error(`官方版本清单中未找到版本 ${progress.version}`);
    if (task.cancelled) return iGM_Launcher_Download_Finish(task, "cancelled");
    const versionJson = await iGM_Launcher_Download_FetchJson<iGM_Launcher_VersionJson>(
      manifestEntry.url,
    );
    if (task.cancelled) return iGM_Launcher_Download_Finish(task, "cancelled");

    // 2) 原版版本 json 落盘（versions/<version>/<version>.json）
    progress.stage = "version-json";
    progress.filesTotal += 1;
    const vanillaJsonPath = iGM_Launcher_Download_AbsPath(
      progress.rootDir,
      `versions/${progress.version}/${progress.version}.json`,
    );
    await mkdir(dirname(vanillaJsonPath), { recursive: true });
    await writeFile(vanillaJsonPath, `${JSON.stringify(versionJson, null, 2)}\n`, "utf8");
    progress.filesDone += 1;

    // 3) 客户端 jar
    const client = versionJson.downloads?.client;
    if (client?.url) {
      const ok = await iGM_Launcher_Download_RunPhase(
        task,
        "client",
        [
          {
            url: client.url,
            path: `versions/${progress.version}/${progress.version}.jar`,
            size: client.size ?? 0,
            sha1: client.sha1 ?? "",
          },
        ],
        1,
      );
      if (!ok) return iGM_Launcher_Download_Finish(task, "cancelled");
    }

    // 4) 依赖库（含 natives 分类器）
    const libraryItems = iGM_Launcher_Download_LibraryItems(versionJson.libraries, osName);
    if (
      !(await iGM_Launcher_Download_RunPhase(
        task,
        "libraries",
        libraryItems,
        IGM_LAUNCHER_DOWNLOAD_CONCURRENCY,
      ))
    ) {
      return iGM_Launcher_Download_Finish(task, "cancelled");
    }

    // 5) 资源索引与资源对象（早期版本索引无 objects，仅有 map_to_resources，跳过对象下载）
    const assetIndexRef = versionJson.assetIndex;
    if (assetIndexRef?.url && assetIndexRef.id) {
      const assetIndex = await iGM_Launcher_Download_FetchJson<iGM_Launcher_AssetIndex>(
        assetIndexRef.url,
      );
      if (task.cancelled) return iGM_Launcher_Download_Finish(task, "cancelled");

      progress.stage = "assets";
      progress.filesTotal += 1;
      const indexPath = iGM_Launcher_Download_AbsPath(
        progress.rootDir,
        `assets/indexes/${assetIndexRef.id}.json`,
      );
      await mkdir(dirname(indexPath), { recursive: true });
      await writeFile(indexPath, `${JSON.stringify(assetIndex, null, 2)}\n`, "utf8");
      progress.filesDone += 1;

      const assetItems = iGM_Launcher_Download_AssetItems(assetIndex);
      if (
        !(await iGM_Launcher_Download_RunPhase(
          task,
          "assets",
          assetItems,
          IGM_LAUNCHER_DOWNLOAD_CONCURRENCY,
        ))
      ) {
        return iGM_Launcher_Download_Finish(task, "cancelled");
      }
    }

    // 6) 加载器 profile（当前仅支持 Fabric，其他加载器在界面侧置灰）
    if (progress.loader === "fabric") {
      progress.stage = "loader";
      const loaderVersions = await iGM_Launcher_Download_LoaderVersions(
        progress.version,
        "fabric",
      );
      const loaderVersion = progress.loaderVersion || loaderVersions[0] || "";
      if (!loaderVersion) throw new Error(`未找到 ${progress.version} 可用的 Fabric 加载器版本`);
      progress.loaderVersion = loaderVersion;

      const profile = await iGM_Launcher_Download_FetchJson<iGM_Launcher_FabricProfile>(
        `${IGM_LAUNCHER_FABRIC_META_URL}/versions/loader/${encodeURIComponent(
          progress.version,
        )}/${encodeURIComponent(loaderVersion)}/profile/json`,
      );
      if (task.cancelled) return iGM_Launcher_Download_Finish(task, "cancelled");

      // 版本目录名统一为 <version>-<loader>，json 内回填 id 与 inheritsFrom 便于扫描识别
      const profileJson: iGM_Launcher_FabricProfile = {
        ...profile,
        id: progress.versionId,
        inheritsFrom: progress.version,
      };
      progress.filesTotal += 1;
      const profilePath = iGM_Launcher_Download_AbsPath(
        progress.rootDir,
        `versions/${progress.versionId}/${progress.versionId}.json`,
      );
      await mkdir(dirname(profilePath), { recursive: true });
      await writeFile(profilePath, `${JSON.stringify(profileJson, null, 2)}\n`, "utf8");
      progress.filesDone += 1;

      const loaderItems = iGM_Launcher_Download_LibraryItems(profile.libraries, osName);
      if (
        !(await iGM_Launcher_Download_RunPhase(
          task,
          "loader",
          loaderItems,
          IGM_LAUNCHER_DOWNLOAD_CONCURRENCY,
        ))
      ) {
        return iGM_Launcher_Download_Finish(task, "cancelled");
      }
    }

    // 7) 收尾校验
    progress.stage = "finalizing";
    const finalJsonPath = iGM_Launcher_Download_AbsPath(
      progress.rootDir,
      `versions/${progress.versionId}/${progress.versionId}.json`,
    );
    if (!existsSync(finalJsonPath)) {
      throw new Error("版本 json 未落盘，安装未完成");
    }
    iGM_Launcher_Download_Finish(task, "done");
  } catch (error) {
    progress.error = error instanceof Error ? error.message : "下载过程发生未知错误";
    iGM_Launcher_Download_Finish(task, "failed");
  }
}

/** 结束任务：写入结束时间与终态 */
function iGM_Launcher_Download_Finish(
  task: iGM_Launcher_DownloadTask,
  stage: "done" | "failed" | "cancelled",
): void {
  task.progress.stage = stage;
  task.progress.currentFile = "";
  task.progress.finishedAt = new Date().toISOString();
  // 终态也广播一次，保证独立进度窗口即时收敛（旧兜底流程同样受益）
  iGM_Launcher_Download_Notify(task.progress);
}

// 导出 //
export default iGM_Launcher_Download_Start;