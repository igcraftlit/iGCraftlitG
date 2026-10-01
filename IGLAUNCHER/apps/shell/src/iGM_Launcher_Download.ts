/**
 * 文件路径：apps/shell/src/iGM_Launcher_Download.ts
 * 所属层：桌面外壳 / 下载引擎层
 * 路由：全局（不对外暴露 URL，仅被 iGM_Launcher_Bridge 调用）
 * 模块：iGM_Launcher_Download
 * 作用：按官方目录规则把 Minecraft 游戏本体真实下载到共享根目录（.minecraft 根）
 * 内容：官方版本清单与版本 json 解析、客户端 jar、依赖库（含 natives 分类器）、
 *       资源索引与资源对象、Fabric 加载器 profile 与其依赖库；
 *       分阶段并发下载并实时维护进度快照，支持取消与失败重试
 *
 * 说明：目录规则与模块六一致——versions / libraries / assets 为全部实例共享、只存一份；
 *       同版本不同加载器在 versions 下按 <version> 与 <version>-<loader> 区分，
 *       但共用同一份 libraries 与 assets。
 *       本模块只负责下载与落盘，natives 解压、游戏启动与参数拼装留待后续模块；
 *       下载进度只在主进程内存中维护，不做任何伪造（失败即如实标记 failed）。
 *       Rust 侧对应契约：iGM_Launcher_ListLoaderVersions / iGM_Launcher_StartDownload /
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
} from "@igm-launcher/shared";

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
}

// 核心逻辑 //

/** 任务表与最近一次任务编号（界面不带 taskId 时取最近一次） */
const iGM_Launcher_DownloadTasks = new Map<string, iGM_Launcher_DownloadTask>();
let iGM_Launcher_DownloadLastTaskId: string | null = null;

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
 * 下载主流程：
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
}

// 导出 //
export default iGM_Launcher_Download_Start;