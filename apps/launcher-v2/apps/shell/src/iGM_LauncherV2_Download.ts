/**
 * 文件路径：apps/shell/src/iGM_LauncherV2_Download.ts
 * 所属层：桌面外壳 / 下载调度层
 * 路由：全局
 * 模块：iGM_LauncherV2_Download
 * 作用：游戏资源下载的任务编排、并发执行与进度回推
 * 内容：解析版本详情 JSON（客户端 JAR、依赖库与原生库、资源索引与全部资源对象），
 *       生成待下载文件清单（含大小与 SHA-1 校验值），地址一律保存官方原始地址；
 *       下载前由引擎后台自动测速选源（iGM_LauncherV2_SourceOrder），按延迟升序生成候选地址，
 *       逐源自动容灾：任一源超时、过慢或不支持 Range 时自动切换下一源，全程无用户交互、无弹窗；
 *       跨源断点续传：分片模式下 .part 与已完成分片跨源保留，换源只重下未完成分片；
 *       单流失败同样自动换源，仅在全部候选源都失败后任务才标记失败；
 *       SHA-1 全量校验、已存在且大小一致的文件直接跳过、
 *       并发策略：全局在途连接默认 25（各源一视同仁，不做任何降级），
 *       游客模式下由主进程下调至较低上限（见 SetConcurrencyLimit），抑制游客滥用带宽；
 *       大文件按 25 分片并行下载并以全局闸门约束在途连接数，滑动窗口保证带宽跑满；
 *       下载完成后据 horizonName 自动创建视界；实时统计已完成字节、瞬时速度（MB/s）与剩余文件数；
 *       支持任务级暂停 / 继续 / 取消（暂停期间保持连接并持续续期空闲计时，避免误判超时；
 *       取消由流程自身清理 .part 缓存）；
 *       支持全局下载限速（iGM_DownloadThrottle）：游戏运行期间由主进程置限速，
 *       全部在途分片与单流共用同一令牌窗口，从而压住整体带宽而不停任务；
 *       另提供资源市场单文件下载（iGM_LauncherV2_Market_Download）：
 *       通道 A 经 iGCraftLit SDK 后端代理，通道 B 直连目标地址，二者共用同一任务注册表与进度回推；
 *       落盘位置支持「安装到视界」（按视界 id 定位 horizons/<id>）与「仅下载文件」（用户自选目录）
 * 说明：进度以固定节流频率回推，避免高频 IPC 造成界面卡顿；各分片进度合并为单一总进度
 */

// 导入依赖 //
import { createReadStream } from "node:fs";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  iGM_LauncherV2_Horizon_Create,
  iGM_LauncherV2_Horizon_CurrentPath,
  iGM_LauncherV2_Horizon_PathById,
} from "./iGM_LauncherV2_Horizon";
import type { iGM_LauncherV2_InboundMessage } from "./iGM_LauncherV2_Ipc";
import type { iGM_LauncherV2_MarketCategory } from "./iGM_LauncherV2_Market";
import {
  iGM_LauncherV2_GameRootPath,
  type iGM_LauncherV2_DownloadChannel,
} from "./iGM_LauncherV2_Paths";
import {
  iGM_LauncherV2_MirrorUrls,
  iGM_LauncherV2_SdkProxyUrl,
  iGM_LauncherV2_SourceOrder,
  iGM_LauncherV2_SourceUrl,
  iGM_LauncherV2_VersionDetailUrl,
  iGM_LauncherV2_Versions_List,
} from "./iGM_LauncherV2_Versions";

// 类型定义 //

/** 单个待下载文件 */
interface iGM_LauncherV2_DownloadJob {
  /** 官方原始地址 */
  url: string;
  /** 实际候选地址（按顺序尝试） */
  urls: string[];
  /** 落盘绝对路径 */
  path: string;
  /** 期望 SHA-1（小写十六进制）；为空表示不做校验 */
  sha1: string;
  /** 期望大小（字节）；未知为 0 */
  size: number;
}

/** 下载任务状态 */
export type iGM_LauncherV2_DownloadState = "running" | "paused" | "done" | "failed" | "canceled";

/** 下载任务的界面视图 */
export interface iGM_LauncherV2_DownloadTask {
  id: string;
  /** 展示名称，如「1.20.1 · Fabric 0.15.11」 */
  name: string;
  versionId: string;
  /** 视界标识（若有） */
  horizonId: string;
  /** 用户填写的视界名称；下载成功后据此创建视界 */
  horizonName: string;
  /** 加载器展示名（用于任务命名） */
  loaderLabel: string;
  state: iGM_LauncherV2_DownloadState;
  /** 文件总数 / 已完成数 */
  totalFiles: number;
  doneFiles: number;
  /** 总字节 / 已完成字节 */
  totalBytes: number;
  doneBytes: number;
  /** 瞬时速度（字节/秒） */
  speed: number;
  /** 结果或失败提示 */
  message: string;
  /** 色系编号（0-359），供界面给每个任务分配不同色系圆点 */
  hue: number;
  startedAt: number;
  finishedAt: number;
}

/** 开始下载的入参 */
export interface iGM_LauncherV2_DownloadStartInput {
  versionId: string;
  /** 加载器展示名，仅用于任务命名 */
  loaderLabel?: string;
  /** 用户填写的视界名称；下载成功后据此创建视界 */
  horizonName: string;
}

/** 开始下载的返回 */
export interface iGM_LauncherV2_DownloadStartResult {
  ok: boolean;
  message: string;
  task?: iGM_LauncherV2_DownloadTask;
}

/** 资源市场单文件下载入参 */
export interface iGM_LauncherV2_MarketDownloadInput {
  /** 资源展示名称（用于任务命名与文件名兜底） */
  name: string;
  /** 资源分类，决定落盘子目录 */
  category: iGM_LauncherV2_MarketCategory;
  /** 目标文件直连地址 */
  url: string;
  /** 目标文件名（含扩展名） */
  fileName: string;
  /** 目标文件字节数；未知为 0 */
  size: number;
  /** 下载通道：sdk 经 iGCraftLit SDK 后端代理，direct 直连目标地址 */
  channel: iGM_LauncherV2_DownloadChannel;
  /** 落盘模式：horizon 安装到视界，folder 仅下载文件到自选目录 */
  mode: "horizon" | "folder";
  /** 安装目标视界标识（mode 为 horizon 时生效；为空表示使用当前视界） */
  horizonId: string;
  /** 仅下载模式下的自选保存目录（mode 为 folder 时生效） */
  folderPath: string;
}

/** 资源市场单文件下载返回 */
export interface iGM_LauncherV2_MarketDownloadResult {
  ok: boolean;
  message: string;
}

// 核心逻辑 //

/**
 * 全局最大并发连接数：固定 25，官方源与镜像源一视同仁，不做任何降级或限流。
 * 该值同时用作「在途 HTTP 连接」上限（见 iGM_DownloadGate）：分片与单流共用同一配额，
 * 因此无论同时下载的是一个大文件（25 分片）还是数百个小文件，在途连接恒不超过 25。
 */
const IGM_DOWNLOAD_CONCURRENCY = 25;

/** 游客模式下的并发上限：远低于正式账号，用于抑制游客滥用带宽与连接数 */
export const IGM_DOWNLOAD_GUEST_CONCURRENCY = 4;

/**
 * 当前生效的并发上限。
 * 默认即正式上限；游客模式由主进程在登录态变化时下调（见 SetConcurrencyLimit）。
 */
let iGM_DownloadConcurrency = IGM_DOWNLOAD_CONCURRENCY;

/**
 * 设置并发上限。
 * limit 小于等于 0 时恢复默认上限；其余取值会被夹在 [1, IGM_DOWNLOAD_CONCURRENCY] 内。
 * 调低后已在途的连接不会被强制中断，随其自然结束后新连接按新上限放行。
 */
export function iGM_LauncherV2_Download_SetConcurrencyLimit(limit: number): void {
  iGM_DownloadConcurrency =
    limit > 0
      ? Math.max(1, Math.min(IGM_DOWNLOAD_CONCURRENCY, Math.floor(limit)))
      : IGM_DOWNLOAD_CONCURRENCY;
}

/** 当前生效的单文件分片并发数：不超过全局并发上限 */
function iGM_DownloadChunkLimit(): number {
  return Math.min(IGM_DOWNLOAD_CHUNKS, iGM_DownloadConcurrency);
}

/** 单文件最大分片并发数：正式上限 25，游客模式随全局上限一并下调 */
const IGM_DOWNLOAD_CHUNKS = 25;

/** 单片最小字节数：低于该值则减少片数，避免生成过多小分片 */
const IGM_DOWNLOAD_CHUNK_MIN = 128 * 1024;

/** 分片阈值：文件小于该值不分片，直接走单流下载（避免为小文件额外开销） */
const IGM_DOWNLOAD_CHUNK_THRESHOLD = 2 * 1024 * 1024;

/** 进度回推节流（毫秒） */
const IGM_DOWNLOAD_PROGRESS_THROTTLE_MS = 500;

/** 单文件空闲超时（毫秒）：连续无响应即视为所选源超时 */
const IGM_DOWNLOAD_FILE_TIMEOUT_MS = 15000;

/** 请求统一使用的 UA 标识 */
const IGM_DOWNLOAD_USER_AGENT = "iGMLLauncher/26.5.7";

/** 速度下限（字节/秒）：判定时长内低于此值即视为源过慢 */
const IGM_DOWNLOAD_MIN_SPEED = 1024;

/** 任务注册表（内存态；下载任务不跨进程持久化） */
const iGM_DownloadTasks = new Map<string, iGM_LauncherV2_DownloadTask>();

/** 任务取消标记 */
const iGM_DownloadCancels = new Map<string, boolean>();

/** 任务色系：依次分配，避免相邻任务同色 */
let iGM_DownloadHueCursor = 205;

/** 运行平台名（用于依赖库规则判定） */
function iGM_DownloadPlatformName(): string {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "osx";
  return "linux";
}

/**
 * 全局连接信号量：限制同时在途的 HTTP 连接数为当前并发上限（默认 25，游客模式下调低）。
 * 分片与单流共用同一配额——一个大文件的多个分片会临时占满配额，
 * 其余 worker 在配额释放后立刻补位，既保证带宽跑满，又避免连接数失控。
 * 上限由回调实时读取，因此运行中调整上限无需重建信号量。
 */
function iGM_DownloadSemaphore(limitOf: () => number) {
  let active = 0;
  const waiters: (() => void)[] = [];
  return {
    /** 申请一个连接配额（无空闲则排队等待） */
    acquire(): Promise<void> {
      if (active < limitOf()) {
        active += 1;
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        waiters.push(() => {
          active += 1;
          resolve();
        });
      });
    },
    /** 释放一个连接配额，并在仍有空位时唤醒等待者 */
    release(): void {
      active -= 1;
      while (waiters.length > 0 && active < limitOf()) {
        const next = waiters.shift();
        if (next) next();
      }
    },
  };
}

/** 全局连接闸门：所有下载请求（分片与单流）都必须先取得配额 */
const iGM_DownloadGate = iGM_DownloadSemaphore(() => iGM_DownloadConcurrency);

/** 速度下限判定：下载超过 10 秒后，平均速度仍低于下限则视为所选源过慢（单流与分片共用） */
function iGM_DownloadTooSlow(startedAt: number, received: number): boolean {
  const elapsedSec = (Date.now() - startedAt) / 1000;
  return elapsedSec > 10 && received / elapsedSec < IGM_DOWNLOAD_MIN_SPEED;
}

/* ---- 任务暂停 / 继续 ---- */

/** 任务暂停标记（true 表示已暂停） */
const iGM_DownloadPauses = new Map<string, boolean>();

/** 暂停轮询间隔（毫秒）：等待期间以此频率续期空闲计时并检查取消标记 */
const IGM_DOWNLOAD_PAUSE_POLL_MS = 200;

/**
 * 任务暂停等待：任务处于暂停态时循环等待，直到用户点击继续或取消。
 * 返回本次暂停的毫秒数（未暂停返回 0），调用方据此回补超时 / 速度判定基准，
 * 避免暂停被误判为「源过慢」；keepAlive 在等待期间持续调用，用于续期空闲超时。
 */
async function iGM_DownloadWaitResume(taskId: string, keepAlive: () => void): Promise<number> {
  if (!iGM_DownloadPauses.get(taskId)) return 0;
  const pausedAt = Date.now();
  while (iGM_DownloadPauses.get(taskId)) {
    // 暂停期间允许取消：立即抛出，由下载流程统一清理 .part 缓存
    if (iGM_DownloadCancels.get(taskId)) throw new Error("canceled");
    keepAlive();
    await new Promise<void>((resolve) => setTimeout(resolve, IGM_DOWNLOAD_PAUSE_POLL_MS));
  }
  return Date.now() - pausedAt;
}

/* ---- 全局下载限速（游戏运行限速联动） ---- */

/**
 * 全局限速上限（字节/秒）；0 表示不限速。
 * 游戏运行期间由主进程置为固定上限，Java 进程退出后清零恢复全速。
 * 全部在途分片与单流共用同一令牌窗口，因此限制的是整体带宽而非单个连接。
 */
let iGM_DownloadRateLimitBps = 0;

/** 限速滑动窗口长度（毫秒） */
const IGM_DOWNLOAD_RATE_WINDOW_MS = 1000;

/** 当前限速窗口的起始时刻与窗口内已放行字节 */
let iGM_DownloadRateWindowAt = Date.now();
let iGM_DownloadRateWindowBytes = 0;

/** 设置全局限速（字节/秒；非正数表示解除限速） */
export function iGM_LauncherV2_Download_RateLimitSet(bps: number): void {
  const next = Number.isFinite(bps) && bps > 0 ? Math.floor(bps) : 0;
  if (next === iGM_DownloadRateLimitBps) return;
  iGM_DownloadRateLimitBps = next;
  iGM_DownloadRateWindowAt = Date.now();
  iGM_DownloadRateWindowBytes = 0;
}

/** 读取当前全局限速（字节/秒；0 表示不限速） */
export function iGM_LauncherV2_Download_RateLimitGet(): number {
  return iGM_DownloadRateLimitBps;
}

/**
 * 全局限速节流：按 1 秒滑动窗口累计已接收字节，超出上限时按差值等待。
 * 说明：调用方须在等待结束后自行续期空闲超时，否则限速可能被误判为源超时。
 */
async function iGM_DownloadThrottle(bytes: number): Promise<void> {
  const limit = iGM_DownloadRateLimitBps;
  if (limit <= 0 || bytes <= 0) return;

  const now = Date.now();
  if (now - iGM_DownloadRateWindowAt >= IGM_DOWNLOAD_RATE_WINDOW_MS) {
    iGM_DownloadRateWindowAt = now;
    iGM_DownloadRateWindowBytes = 0;
  }
  iGM_DownloadRateWindowBytes += bytes;

  const expectedMs = (iGM_DownloadRateWindowBytes / limit) * IGM_DOWNLOAD_RATE_WINDOW_MS;
  const delay = expectedMs - (Date.now() - iGM_DownloadRateWindowAt);
  if (delay > 1) await new Promise<void>((resolve) => setTimeout(resolve, delay));
}

/** 带超时地取 JSON */
async function iGM_DownloadFetchJson(url: string, timeoutMs: number): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { "user-agent": IGM_DOWNLOAD_USER_AGENT } });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 按官方地址 + BMCLAPI 镜像备选顺序取 JSON（任一成功即返回，均失败返回 null） */
async function iGM_DownloadFetchJsonAny(
  url: string,
  timeoutMs: number,
): Promise<unknown | null> {
  for (const candidate of iGM_LauncherV2_MirrorUrls(url)) {
    const json = await iGM_DownloadFetchJson(candidate, timeoutMs);
    if (json) return json;
  }
  return null;
}

/** 依赖库规则判定：仅处理无规则与 os.name / os.arch 两类常见规则 */
function iGM_DownloadRulesAllow(rules: unknown): boolean {
  if (!Array.isArray(rules) || rules.length === 0) return true;
  const platform = iGM_DownloadPlatformName();
  let allow = false;
  for (const item of rules) {
    const rule = item as {
      action?: unknown;
      os?: { name?: unknown; arch?: unknown };
      features?: unknown;
    };
    if (rule.features) continue; // 未支持的特性条件一律视为不匹配
    let match = true;
    if (typeof rule.os?.name === "string" && rule.os.name !== platform) match = false;
    if (typeof rule.os?.arch === "string" && rule.os.arch !== "x86_64") match = false;
    if (match) allow = rule.action === "allow";
  }
  return allow;
}

/** 版本详情 JSON 中的 downloads 描述 */
interface iGM_DownloadArtifact {
  url?: unknown;
  sha1?: unknown;
  size?: unknown;
}

/** 追加一条待下载任务（跳过地址缺失者） */
function iGM_DownloadPushJob(
  jobs: iGM_LauncherV2_DownloadJob[],
  artifact: iGM_DownloadArtifact | undefined,
  path: string,
): void {
  if (!artifact || typeof artifact.url !== "string") return;
  jobs.push({
    url: artifact.url,
    urls: [],
    path,
    sha1: typeof artifact.sha1 === "string" ? artifact.sha1.toLowerCase() : "",
    size: typeof artifact.size === "number" ? artifact.size : 0,
  });
}

/**
 * 解析版本详情，生成完整待下载清单。
 * 内容：客户端 JAR、依赖库（含 win32 原生库）、资源索引与全部资源对象、日志配置。
 * 说明：job 的 url 一律保存官方原始地址，候选地址 urls 留空，由 Start 阶段按测速顺序填充。
 */
async function iGM_DownloadPlan(versionId: string): Promise<{
  jobs: iGM_LauncherV2_DownloadJob[];
  versionJson: unknown;
} | null> {
  let detailUrl = iGM_LauncherV2_VersionDetailUrl(versionId);
  if (!detailUrl) {
    // 缓存缺失（未先取过列表）时，先拉一次全量列表以填充地址缓存
    await iGM_LauncherV2_Versions_List();
    detailUrl = iGM_LauncherV2_VersionDetailUrl(versionId);
  }
  if (!detailUrl) return null;

  const detail = await iGM_DownloadFetchJsonAny(detailUrl, 15000);
  if (!detail) return null;

  const gameRoot = iGM_LauncherV2_GameRootPath();
  const jobs: iGM_LauncherV2_DownloadJob[] = [];
  const record = detail as {
    downloads?: { client?: iGM_DownloadArtifact };
    libraries?: unknown;
    assetIndex?: iGM_DownloadArtifact & { id?: unknown };
    logging?: { client?: { file?: iGM_DownloadArtifact & { id?: unknown } } };
  };

  // 客户端 JAR
  iGM_DownloadPushJob(
    jobs,
    record.downloads?.client,
    join(gameRoot, "versions", versionId, `${versionId}.jar`),
  );

  // 依赖库与原生库
  const libraries = Array.isArray(record.libraries) ? record.libraries : [];
  const platform = iGM_DownloadPlatformName();
  for (const item of libraries) {
    const lib = item as {
      downloads?: {
        artifact?: iGM_DownloadArtifact & { path?: unknown };
        classifiers?: Record<string, iGM_DownloadArtifact & { path?: unknown }>;
      };
      natives?: Record<string, unknown>;
      rules?: unknown;
    };
    if (!iGM_DownloadRulesAllow(lib.rules)) continue;

    const artifact = lib.downloads?.artifact;
    if (artifact && typeof artifact.path === "string") {
      iGM_DownloadPushJob(jobs, artifact, join(gameRoot, "libraries", artifact.path));
    }

    const nativeKey = lib.natives?.[platform];
    if (typeof nativeKey === "string") {
      const classifier = lib.downloads?.classifiers?.[nativeKey];
      if (classifier && typeof classifier.path === "string") {
        iGM_DownloadPushJob(jobs, classifier, join(gameRoot, "libraries", classifier.path));
      }
    }
  }

  // 资源索引本身
  const assetIndex = record.assetIndex;
  if (assetIndex && typeof assetIndex.url === "string" && typeof assetIndex.id === "string") {
    iGM_DownloadPushJob(
      jobs,
      assetIndex,
      join(gameRoot, "assets", "indexes", `${assetIndex.id}.json`),
    );

    // 资源索引内的全部对象（url 保存官方原始地址，候选地址由 Start 阶段换算）
    const index = await iGM_DownloadFetchJsonAny(assetIndex.url, 20000);
    const objects = (index as { objects?: Record<string, { hash?: unknown; size?: unknown }> })
      ?.objects;
    if (objects) {
      for (const value of Object.values(objects)) {
        if (typeof value.hash !== "string" || value.hash.length < 4) continue;
        const prefix = value.hash.slice(0, 2);
        jobs.push({
          url: `https://resources.download.minecraft.net/${prefix}/${value.hash}`,
          urls: [],
          path: join(gameRoot, "assets", "objects", prefix, value.hash),
          sha1: value.hash.toLowerCase(),
          size: typeof value.size === "number" ? value.size : 0,
        });
      }
    }
  }

  // 日志配置（可选）
  const logFile = record.logging?.client?.file;
  if (logFile && typeof logFile.id === "string") {
    iGM_DownloadPushJob(jobs, logFile, join(gameRoot, "assets", "log_configs", logFile.id));
  }

  return { jobs, versionJson: detail };
}

/** 确保 .part 存在且大小为目标值：已存在且大小一致时保留（跨源续传复用其已写数据），否则重建 */
async function iGM_DownloadEnsurePart(partPath: string, total: number): Promise<void> {
  try {
    const info = await stat(partPath);
    if (info.size === total) return;
  } catch {
    // 文件不存在：走下方重建流程
  }
  const allocation = await open(partPath, "w");
  await allocation.truncate(total);
  await allocation.close();
}

/**
 * 单文件下载：多源自动容灾 + 跨源断点续传。
 * 成功返回已写入字节数；全部候选源均失败时返回 null。
 * 外层按 job.urls（已按延迟升序）逐源尝试：分片模式下 .part 与已完成分片索引跨源保留，
 * 换源只重下未完成分片；当前源返回非 206（不支持 Range）则清理 .part 整体回退单流；
 * 单流失败 / 超时 / 过慢同样自动换下一源。每换一次源，已写入字节与已完成分片均不回退，
 * 全程不中断任务、不报错、无弹窗，仅在全部候选源都失败后才返回 null。
 */
async function iGM_DownloadOneFile(
  job: iGM_LauncherV2_DownloadJob,
  taskId: string,
  onBytes: (delta: number) => void,
): Promise<number | null> {
  await mkdir(dirname(job.path), { recursive: true });

  // 断点复用：目标文件已存在且大小一致时直接跳过，不重复下载
  if (job.size > 0) {
    try {
      const info = await stat(job.path);
      if (info.size === job.size) return 0;
    } catch {
      // 文件不存在，继续下载
    }
  }

  const partPath = `${job.path}.part`;

  // 文件总大小：清单已给定时直接采用，缺失时对候选源依次做一次 HEAD 试探
  let total = job.size;
  if (total <= 0) {
    for (const candidate of job.urls) {
      try {
        const head = await fetch(candidate, {
          method: "HEAD",
          headers: { "user-agent": IGM_DOWNLOAD_USER_AGENT },
        });
        const length = Number(head.headers.get("content-length") ?? 0) || 0;
        if (length > 0) {
          total = length;
          break;
        }
      } catch {
        // 试探失败：继续尝试下一个候选源
      }
    }
  }

  // 只要文件够大就优先尝试分片，不再依赖 accept-ranges 响应头：
  // 该头在部分镜像上缺失或不可靠，若据此放弃分片会导致大文件退化为单流（下载极慢）。
  // 服务器是否真正支持 Range 由每个分片的 206 响应实证判定，不支持则整体回退单流。
  const chunked = total >= IGM_DOWNLOAD_CHUNK_THRESHOLD;
  const chunkCount = chunked
    ? Math.max(1, Math.min(iGM_DownloadChunkLimit(), Math.floor(total / IGM_DOWNLOAD_CHUNK_MIN)))
    : 0;
  const perSize = chunked ? Math.floor(total / chunkCount) : 0;

  /**
   * 本进程内已成功完成的分片索引，跨源保留复用。
   * 分片级没有独立哈希，故只信任本进程内写满的分片；集合外的分片一律重下。
   */
  const doneChunks = new Set<number>();

  for (const url of job.urls) {
    if (iGM_DownloadCancels.get(taskId)) return null;

    // ---------- 分片模式：多源续传 ----------
    if (chunked) {
      try {
        // 确保 .part 就位（保留跨源进度；校验失败清理后亦在此重建）
        await iGM_DownloadEnsurePart(partPath, total);

        /** Range 不受支持标记：服务器忽略 Range 返回 200 整文件时置位，用于回退单流 */
        let rangeUnsupported = false;
        let chunkFailed = false;
        const chunkControllers: AbortController[] = [];

        /**
         * 下载单个分片：先占用一个全局连接配额（避免连接数失控），
         * 再按 Range 请求并边收边写盘到指定偏移。
         */
        const runChunk = async (index: number): Promise<void> => {
          const start = index * perSize;
          const end = index === chunkCount - 1 ? total - 1 : start + perSize - 1;
          const controller = new AbortController();
          chunkControllers.push(controller);
          // 先排队取得连接配额，空闲超时从真正发起请求后才开始计时（排队耗时不计入）
          await iGM_DownloadGate.acquire();
          let timer = setTimeout(() => controller.abort(), IGM_DOWNLOAD_FILE_TIMEOUT_MS);
          const touch = () => {
            clearTimeout(timer);
            timer = setTimeout(() => controller.abort(), IGM_DOWNLOAD_FILE_TIMEOUT_MS);
          };
          // 速度判定基准：暂停期间不计入耗时，恢复后把基准前移，避免暂停被误判为源过慢
          let elapsedBase = Date.now();
          let received = 0;
          try {
            const handle = await open(partPath, "r+");
            try {
              const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                  "user-agent": IGM_DOWNLOAD_USER_AGENT,
                  Range: `bytes=${start}-${end}`,
                },
              });
              // 必须收到 206 部分内容才可按偏移写入；服务器忽略 Range 而返回 200 整文件时
              // 置回退标记，避免整文件被写进单个分片区间造成数据错位损坏
              if (response.status !== 206 || !response.body) {
                if (response.status === 200) rangeUnsupported = true;
                throw new Error(`HTTP ${response.status}`);
              }
              const reader = response.body.getReader();
              let offset = start;
              for (;;) {
                const chunk = await reader.read();
                if (chunk.done) break;
                if (iGM_DownloadCancels.get(taskId)) throw new Error("canceled");
                touch();
                // 第四参为文件内定位偏移；第二参是缓冲内偏移，须显式传 0
                await handle.write(chunk.value, 0, chunk.value.length, offset);
                offset += chunk.value.length;
                received += chunk.value.length;
                onBytes(chunk.value.length);
                if (iGM_DownloadTooSlow(elapsedBase, received)) {
                  throw new Error("下载源速度过低");
                }
                // 全局限速：等待期间不计入耗时，结束后续期空闲计时
                if (iGM_DownloadRateLimitBps > 0) {
                  const limitedAt = Date.now();
                  await iGM_DownloadThrottle(chunk.value.length);
                  elapsedBase += Date.now() - limitedAt;
                  touch();
                }
                // 暂停：等待期间持续续期空闲计时，恢复后把速度判定基准前移
                const pausedMs = await iGM_DownloadWaitResume(taskId, touch);
                if (pausedMs > 0) elapsedBase += pausedMs;
              }
            } finally {
              await handle.close();
            }
          } catch (error) {
            // 任一失败：置失败标记并中止其余分片，避免悬挂请求
            chunkFailed = true;
            for (const item of chunkControllers) item.abort();
            throw error;
          } finally {
            clearTimeout(timer);
            // 无论成功失败都归还连接配额，让等待中的 worker / 分片立刻补位
            iGM_DownloadGate.release();
          }
        };

        // 只重下未完成的分片（换源时已在 doneChunks 内的分片直接复用其已写数据）
        const pending: number[] = [];
        for (let index = 0; index < chunkCount; index += 1) {
          if (!doneChunks.has(index)) pending.push(index);
        }
        const settled = await Promise.allSettled(pending.map((index) => runChunk(index)));
        settled.forEach((item, position) => {
          if (item.status === "fulfilled") doneChunks.add(pending[position]);
        });

        if (rangeUnsupported) {
          // 服务器声称支持 Range 却返回整文件：清理 .part（含错位数据）后回退单流下载
          await rm(partPath, { force: true }).catch(() => undefined);
          doneChunks.clear();
        } else if (chunkFailed) {
          // 当前源超时 / 过慢 / 取消：保留 .part 与已完成分片，换下一个源继续
          if (iGM_DownloadCancels.get(taskId)) return null;
          continue;
        } else {
          // 全部分片就位：流式读取 .part 重算整文件 SHA-1
          if (job.sha1) {
            const hasher = new Bun.CryptoHasher("sha1");
            const stream = createReadStream(partPath);
            for await (const chunk of stream) hasher.update(chunk as Uint8Array);
            if (hasher.digest("hex").toLowerCase() !== job.sha1) {
              // 校验不一致：丢弃残留数据，换下一个源重下
              await rm(partPath, { force: true }).catch(() => undefined);
              doneChunks.clear();
              continue;
            }
          }

          await rm(job.path, { force: true });
          await rename(partPath, job.path);
          return (await stat(job.path)).size;
        }
      } catch {
        // 分片阶段的意外错误：保留 .part 与已完成分片，换下一个源继续
        if (iGM_DownloadCancels.get(taskId)) return null;
        continue;
      }
    }

    // ---------- 单流模式：文件过小，或当前源不支持 Range ----------
    const controller = new AbortController();
    // 先排队取得连接配额，空闲超时从真正发起请求后才开始计时（排队耗时不计入）
    await iGM_DownloadGate.acquire();
    let timer = setTimeout(() => controller.abort(), IGM_DOWNLOAD_FILE_TIMEOUT_MS);
    const resetIdle = () => {
      clearTimeout(timer);
      timer = setTimeout(() => controller.abort(), IGM_DOWNLOAD_FILE_TIMEOUT_MS);
    };
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { "user-agent": IGM_DOWNLOAD_USER_AGENT },
      });
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

      const hasher = new Bun.CryptoHasher("sha1");
      const sink = await open(partPath, "w");
      const reader = response.body.getReader();
      // 速度判定基准：暂停与限速等待期间不计入耗时，避免被误判为源过慢
      let elapsedBase = Date.now();
      let received = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          if (iGM_DownloadCancels.get(taskId)) throw new Error("canceled");
          resetIdle();
          hasher.update(chunk.value);
          await sink.write(chunk.value);
          received += chunk.value.length;
          onBytes(chunk.value.length);
          // 速度下限：下载超过 10 秒后平均速度仍低于下限，判定当前源过慢
          if (iGM_DownloadTooSlow(elapsedBase, received)) {
            throw new Error("下载源速度过低");
          }
          // 全局限速：等待期间不计入耗时，结束后续期空闲计时
          if (iGM_DownloadRateLimitBps > 0) {
            const limitedAt = Date.now();
            await iGM_DownloadThrottle(chunk.value.length);
            elapsedBase += Date.now() - limitedAt;
            resetIdle();
          }
          // 暂停：等待期间持续续期空闲计时，恢复后把速度判定基准前移
          const pausedMs = await iGM_DownloadWaitResume(taskId, resetIdle);
          if (pausedMs > 0) elapsedBase += pausedMs;
        }
      } finally {
        await sink.close();
      }

      if (job.sha1 && hasher.digest("hex").toLowerCase() !== job.sha1) {
        await rm(partPath, { force: true });
        throw new Error("SHA-1 校验不一致");
      }
      await rm(job.path, { force: true });
      await rename(partPath, job.path);
      return (await stat(job.path)).size;
    } catch {
      // 单流失败：清理残片并换下一个候选源（不中断任务、不报错、无弹窗）
      await rm(partPath, { force: true }).catch(() => undefined);
      doneChunks.clear();
      if (iGM_DownloadCancels.get(taskId)) return null;
    } finally {
      clearTimeout(timer);
      // 无论成功失败都归还连接配额
      iGM_DownloadGate.release();
    }
  }
  return null;
}

/** 执行任务：并发下载全部文件并回推进度 */
async function iGM_DownloadRun(
  task: iGM_LauncherV2_DownloadTask,
  jobs: iGM_LauncherV2_DownloadJob[],
  push: (message: iGM_LauncherV2_InboundMessage) => void,
): Promise<void> {
  const started = Date.now();
  let speedBaseBytes = 0;
  let speedBaseTime = started;

  task.totalFiles = jobs.length;
  task.totalBytes = jobs.reduce((sum, job) => sum + job.size, 0);

  /** 回推进度（节流由计时器统一负责，此处仅组装消息） */
  const emit = () => {
    push({ type: "download:progress", task: { ...task } });
  };

  const ticker = setInterval(() => {
    const now = Date.now();
    const elapsed = now - speedBaseTime;
    if (elapsed >= 500) {
      task.speed = Math.round(((task.doneBytes - speedBaseBytes) * 1000) / elapsed);
      speedBaseBytes = task.doneBytes;
      speedBaseTime = now;
    }
    emit();
  }, IGM_DOWNLOAD_PROGRESS_THROTTLE_MS);

  const queue = [...jobs];
  const workers: Promise<void>[] = [];

  // 全局并发取当前生效上限：正式上限 25，游客模式下调低；
  // worker 数与连接配额一致，worker 完成一个立刻取下一个（滑动窗口），
  // 真正的在途连接数由 iGM_DownloadGate 统一约束，官方源与镜像源不做任何降级
  const globalLimit = iGM_DownloadConcurrency;

  const worker = async (): Promise<void> => {
    for (;;) {
      if (iGM_DownloadCancels.get(task.id)) return;
      // 暂停期间不领取新文件：worker 就地等待，继续或取消都能立即生效
      while (iGM_DownloadPauses.get(task.id)) {
        if (iGM_DownloadCancels.get(task.id)) return;
        await new Promise<void>((resolve) => setTimeout(resolve, IGM_DOWNLOAD_PAUSE_POLL_MS));
      }
      const job = queue.shift();
      if (!job) return;
      const written = await iGM_DownloadOneFile(job, task.id, (delta) => {
        task.doneBytes += delta;
      });
      if (written === null) {
        if (iGM_DownloadCancels.get(task.id)) return;
        // 全部候选源均已自动尝试并失败：直接标记任务失败，不暂停、不弹窗
        task.state = "failed";
        task.message = `全部下载源均不可用，已重试 ${job.urls.length} 个源`;
        push({ type: "download:notice", message: task.message });
        return;
      }
      task.doneFiles += 1;
    }
  };

  for (let index = 0; index < globalLimit; index += 1) workers.push(worker());
  await Promise.all(workers);

  clearInterval(ticker);
  task.finishedAt = Date.now();
  task.speed = 0;

  if (iGM_DownloadCancels.get(task.id)) {
    task.state = "canceled";
    task.message = "下载已取消";
  } else if (task.state === "running" || task.state === "paused") {
    task.state = "done";
    task.message = `已完成，共 ${task.doneFiles} 个文件`;
  }

  // 收尾清理：删除全部临时分片文件（含取消 / 失败 / 暂停后放弃的任务），不留 .part 残留
  await Promise.all(
    jobs.map((job) => rm(`${job.path}.part`, { force: true }).catch(() => undefined)),
  );

  // 下载完成后按用户填写的视界名称创建视界（含 mods/resourcepacks/shaderpacks/saves/config
  // 子目录并设为当前视界），前端「视界列表」据此自动刷新；
  // 仅成功完成时创建，取消 / 失败均不创建，且失败不影响任务状态
  if (task.state === "done") {
    try {
      const result = await iGM_LauncherV2_Horizon_Create(
        task.horizonName || `${task.versionId}-Vanilla`,
        { versionId: task.versionId, loaderLabel: task.loaderLabel },
      );
      push({ type: "horizon:list", ...result });
    } catch (error) {
      push({ type: "download:notice", message: `视界创建失败：${(error as Error).message}` });
    }
  }

  iGM_DownloadCancels.delete(task.id);
  iGM_DownloadPauses.delete(task.id);
  emit();
  push({ type: "download:list", tasks: iGM_LauncherV2_Download_Snapshot() });
}

/** 任务快照（倒序，最近开始的在前） */
export function iGM_LauncherV2_Download_Snapshot(): iGM_LauncherV2_DownloadTask[] {
  return [...iGM_DownloadTasks.values()].sort((a, b) => b.startedAt - a.startedAt);
}

/**
 * 开始一次下载。
 * 后台自动测速选源：先生成候选地址顺序（按延迟升序），再为每份文件填充候选地址列表；
 * 下载阶段逐源自动容灾与断点续传，全程无用户交互。下载完成后按 horizonName 创建视界。
 */
export async function iGM_LauncherV2_Download_Start(
  input: iGM_LauncherV2_DownloadStartInput,
  push: (message: iGM_LauncherV2_InboundMessage) => void,
): Promise<iGM_LauncherV2_DownloadStartResult> {
  const versionId = input.versionId.trim();
  if (!versionId) return { ok: false, message: "未选择游戏版本" };

  const plan = await iGM_DownloadPlan(versionId);
  if (!plan) {
    return { ok: false, message: "无法获取该版本的依赖清单，请检查网络后重试" };
  }
  if (plan.jobs.length === 0) {
    return { ok: false, message: "该版本未解析出可下载文件，请更换版本重试" };
  }

  // 后台自动测速选源：按延迟升序生成候选源顺序，再据此为每份文件填充候选地址列表。
  // 换算后与原地址相同者也一并保留（mojang 源即官方原始地址），便于按序逐一尝试。
  const order = await iGM_LauncherV2_SourceOrder();
  for (const job of plan.jobs) {
    job.urls = order.map((source) => iGM_LauncherV2_SourceUrl(job.url, source));
  }

  const hue = iGM_DownloadHueCursor;
  iGM_DownloadHueCursor = (iGM_DownloadHueCursor + 67) % 360;

  const task: iGM_LauncherV2_DownloadTask = {
    id: `dl-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`,
    name: `${versionId}${input.loaderLabel ? ` · ${input.loaderLabel}` : " · 原版"}`,
    versionId,
    horizonId: "",
    horizonName: input.horizonName,
    loaderLabel: input.loaderLabel ?? "",
    state: "running",
    totalFiles: plan.jobs.length,
    doneFiles: 0,
    totalBytes: 0,
    doneBytes: 0,
    speed: 0,
    message: "正在准备下载…",
    hue,
    startedAt: Date.now(),
    finishedAt: 0,
  };

  iGM_DownloadTasks.set(task.id, task);
  iGM_DownloadCancels.set(task.id, false);
  iGM_DownloadPauses.set(task.id, false);
  push({ type: "download:list", tasks: iGM_LauncherV2_Download_Snapshot() });

  // 记录版本详情 JSON，便于后续启动时直接读取
  void (async () => {
    const { writeFile } = await import("node:fs/promises");
    const target = join(iGM_LauncherV2_GameRootPath(), "versions", versionId, `${versionId}.json`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify(plan.versionJson, null, 2), "utf8");
  })().catch(() => undefined);

  void iGM_DownloadRun(task, plan.jobs, push);
  return { ok: true, message: "已开始下载", task };
}

/** 资源分类 → 落盘子目录（相对当前视界或游戏根目录） */
const IGM_MARKET_SUBDIRS: Record<iGM_LauncherV2_MarketCategory, string> = {
  mods: "mods",
  shaders: "shaderpacks",
  resourcepacks: "resourcepacks",
  modpacks: "modpacks",
  worlds: "saves",
};

/** 清洗文件名：剔除以 / 与 \\ 分隔的目录片段，避免越界写入 */
function iGM_MarketSafeFileName(fileName: string, fallback: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[<>:"|?*\u0000-\u001f]/g, "").trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

/**
 * 市场单文件下载的候选地址调度（自动源调度）。
 * 内容：按用户所选通道确定首选地址，并把另一条通道作为自动回退候选：
 *       通道 A（sdk）首选后端代理地址，代理不可用时自动回退直连；
 *       通道 B（direct）首选直连地址，直连不可用时自动回退后端代理；
 *       另并入 iGM_LauncherV2_MirrorUrls 生成的镜像备选，交由下载引擎按次序自动容灾。
 * 说明：用户所选通道始终排在首位，仅在首选不可用时才切换，避免影响用户显式选择。
 */
function iGM_MarketCandidateUrls(
  origin: string,
  preferred: string,
  channel: iGM_LauncherV2_DownloadChannel,
): string[] {
  const proxy = iGM_LauncherV2_SdkProxyUrl(origin);
  const primary = channel === "sdk" ? preferred : origin;
  const backup = channel === "sdk" ? origin : proxy;
  const candidates: string[] = [];
  for (const item of [primary, ...iGM_LauncherV2_MirrorUrls(origin), backup]) {
    if (item && !candidates.includes(item)) candidates.push(item);
  }
  return candidates;
}

/** 以 HEAD 试探目标地址的文件大小；失败返回 0（不影响下载，仅影响进度基数） */
async function iGM_MarketProbeSize(url: string): Promise<number> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IGM_DOWNLOAD_FILE_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      headers: { "user-agent": IGM_DOWNLOAD_USER_AGENT },
    });
    return Number(response.headers.get("content-length") ?? 0) || 0;
  } catch {
    return 0;
  } finally {
    clearTimeout(timer);
  }
}

/** 资源市场单文件下载的执行体：单文件进度回推，不创建视界 */
async function iGM_MarketDownloadRun(
  task: iGM_LauncherV2_DownloadTask,
  job: iGM_LauncherV2_DownloadJob,
  push: (message: iGM_LauncherV2_InboundMessage) => void,
): Promise<void> {
  let speedBaseBytes = 0;
  let speedBaseTime = Date.now();
  task.totalFiles = 1;
  task.totalBytes = job.size;

  const emit = () => push({ type: "download:progress", task: { ...task } });
  const ticker = setInterval(() => {
    const now = Date.now();
    const elapsed = now - speedBaseTime;
    if (elapsed >= 500) {
      task.speed = Math.round(((task.doneBytes - speedBaseBytes) * 1000) / elapsed);
      speedBaseBytes = task.doneBytes;
      speedBaseTime = now;
    }
    emit();
  }, IGM_DOWNLOAD_PROGRESS_THROTTLE_MS);

  const written = await iGM_DownloadOneFile(job, task.id, (delta) => {
    task.doneBytes += delta;
    // 大小未知时以已下载字节作为进度基数，保证进度条单调推进至 100%
    if (task.totalBytes < task.doneBytes) task.totalBytes = task.doneBytes;
  });

  clearInterval(ticker);
  task.finishedAt = Date.now();
  task.speed = 0;

  if (iGM_DownloadCancels.get(task.id)) {
    task.state = "canceled";
    task.message = "下载已取消";
  } else if (written === null) {
    task.state = "failed";
    task.message = "下载失败：目标地址不可达或校验未通过";
  } else {
    task.state = "done";
    task.doneFiles = 1;
    task.totalBytes = Math.max(task.totalBytes, written);
    task.doneBytes = Math.max(task.doneBytes, written);
    task.message = `已保存到 ${job.path}`;
  }

  await rm(`${job.path}.part`, { force: true }).catch(() => undefined);
  iGM_DownloadCancels.delete(task.id);
  iGM_DownloadPauses.delete(task.id);
  emit();
  push({ type: "download:list", tasks: iGM_LauncherV2_Download_Snapshot() });
}

/**
 * 资源市场单文件下载。
 * 内容：按用户所选通道拼装实际请求地址（通道 A 走 SDK 代理，通道 B 直连），
 *       并按落盘模式定位目录——mode 为 horizon 时装入目标视界（horizonId 为空则用当前视界）
 *       对应分类子目录；mode 为 folder 时仅下载文件到用户自选目录。
 */
export function iGM_LauncherV2_Market_Download(
  input: iGM_LauncherV2_MarketDownloadInput,
  push: (message: iGM_LauncherV2_InboundMessage) => void,
): iGM_LauncherV2_MarketDownloadResult {
  const targetUrl = (input.url ?? "").trim();
  if (!targetUrl) return { ok: false, message: "缺少下载地址" };

  const finalUrl =
    input.channel === "sdk" ? iGM_LauncherV2_SdkProxyUrl(targetUrl) : targetUrl;
  const fileName = iGM_MarketSafeFileName(input.fileName, `${input.name || "resource"}.jar`);

  // 落盘目录：仅下载模式用用户自选目录；安装到视界模式按视界 id 定位，
  // 指定视界不存在时回退当前视界，再回退游戏根目录，保证任何情况下都能落盘
  const folderMode = input.mode === "folder";
  const folderPath = (input.folderPath ?? "").trim();
  if (folderMode && !folderPath) {
    return { ok: false, message: "请先选择保存目录" };
  }

  const baseDir = folderMode
    ? folderPath
    : iGM_LauncherV2_Horizon_PathById(input.horizonId) ||
      iGM_LauncherV2_Horizon_CurrentPath() ||
      iGM_LauncherV2_GameRootPath();
  const targetPath = folderMode
    ? join(baseDir, fileName)
    : join(baseDir, IGM_MARKET_SUBDIRS[input.category], fileName);

  const hue = iGM_DownloadHueCursor;
  iGM_DownloadHueCursor = (iGM_DownloadHueCursor + 67) % 360;

  const task: iGM_LauncherV2_DownloadTask = {
    id: `mkt-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4).toString(36)}`,
    name: input.name,
    versionId: "",
    horizonId: folderMode ? "" : input.horizonId,
    horizonName: folderMode ? "" : input.horizonId,
    loaderLabel: input.channel === "sdk" ? "SDK 通道" : "直连通道",
    state: "running",
    totalFiles: 1,
    doneFiles: 0,
    totalBytes: input.size > 0 ? input.size : 0,
    doneBytes: 0,
    speed: 0,
    message: folderMode ? "正在下载文件…" : "正在安装到视界…",
    hue,
    startedAt: Date.now(),
    finishedAt: 0,
  };

  iGM_DownloadTasks.set(task.id, task);
  iGM_DownloadCancels.set(task.id, false);
  iGM_DownloadPauses.set(task.id, false);
  push({ type: "download:list", tasks: iGM_LauncherV2_Download_Snapshot() });

  void (async () => {
    const size = input.size > 0 ? input.size : await iGM_MarketProbeSize(finalUrl);
    const job: iGM_LauncherV2_DownloadJob = {
      url: targetUrl,
      urls: iGM_MarketCandidateUrls(targetUrl, finalUrl, input.channel),
      path: targetPath,
      sha1: "",
      size,
    };
    await iGM_MarketDownloadRun(task, job, push);
  })().catch((error) => {
    task.state = "failed";
    task.message = `下载失败：${error instanceof Error ? error.message : "未知错误"}`;
    task.finishedAt = Date.now();
    push({ type: "download:list", tasks: iGM_LauncherV2_Download_Snapshot() });
  });

  return { ok: true, message: "已加入下载任务" };
}

/** 取消任务：置取消标记；.part 缓存由下载流程自身在收尾时清理 */
export function iGM_LauncherV2_Download_Cancel(taskId: string): iGM_LauncherV2_DownloadTask[] {
  if (iGM_DownloadTasks.has(taskId)) {
    iGM_DownloadCancels.set(taskId, true);
    // 同时解除暂停，避免暂停中的任务因等待循环不退出而无法取消
    iGM_DownloadPauses.set(taskId, false);
  }
  return iGM_LauncherV2_Download_Snapshot();
}

/**
 * 暂停任务。
 * 内容：仅对运行中的任务生效；暂停后各在途分片与 worker 就地等待，
 *       期间保持连接并续期空闲计时，不产生超时换源，也不丢失已下载字节。
 */
export function iGM_LauncherV2_Download_Pause(taskId: string): iGM_LauncherV2_DownloadTask[] {
  const task = iGM_DownloadTasks.get(taskId);
  if (task && task.state === "running") {
    iGM_DownloadPauses.set(taskId, true);
    task.state = "paused";
    task.speed = 0;
    task.message = "已暂停";
  }
  return iGM_LauncherV2_Download_Snapshot();
}

/** 继续任务：清除暂停标记，下载流程在等待点自动恢复 */
export function iGM_LauncherV2_Download_Resume(taskId: string): iGM_LauncherV2_DownloadTask[] {
  const task = iGM_DownloadTasks.get(taskId);
  if (task && task.state === "paused") {
    iGM_DownloadPauses.set(taskId, false);
    task.state = "running";
    task.message = "正在下载…";
  }
  return iGM_LauncherV2_Download_Snapshot();
}

/** 移除已完成 / 失败 / 已取消 / 已暂停的任务记录（运行中的不可移除） */
export function iGM_LauncherV2_Download_Clear(taskId: string): iGM_LauncherV2_DownloadTask[] {
  const task = iGM_DownloadTasks.get(taskId);
  if (task && (task.state === "running" || task.state === "paused")) {
    return iGM_LauncherV2_Download_Snapshot();
  }
  iGM_DownloadTasks.delete(taskId);
  iGM_DownloadCancels.delete(taskId);
  iGM_DownloadPauses.delete(taskId);
  return iGM_LauncherV2_Download_Snapshot();
}

// 导出 //
export default iGM_LauncherV2_Download_Start;
