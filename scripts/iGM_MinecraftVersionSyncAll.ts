/**
 * 文件路径：scripts/iGM_MinecraftVersionSyncAll.ts
 * 所属层：工具脚本层（与前后端同仓库，供本地运维执行）
 * 路由：无（命令行脚本）
 * 模块：iGM_MinecraftVersionSyncAll
 * 作用：把 Minecraft 全部版本的元数据同步到本地 SQLite（iGM_MinecraftVersions 表）
 * 内容：参数解析、存储占用基线采集与增量监测、清单拉取、版本 JSON 与 assets 索引拉取、
 *       完整大小计算、幂等写入、断点续传记录、限速与退避重试、日志落盘
 * 说明：
 *   - 模块十九：范围为清单中的全部版本（release / snapshot / old_beta / old_alpha）；
 *     与模块十七脚本的区别是默认不设下限版本、默认不限类型，且增加存储占用熔断。
 *   - 存储监测口径：SQLite 数据库文件（含 -wal / -shm）+ 日志目录 + 临时缓存目录；
 *     每处理 15 个版本统计一次，相比脚本启动基线增长超过 --max-size（默认 100MB）即停止。
 *   - 每处理完一个版本把版本号追加到进度文件，--resume 时可跳过已完成版本续传。
 *   - 并发为 1，全程串行；每 15 个版本休息 5 秒，请求间隔 1.5-3 秒随机延迟。
 *   - 仅同步元数据与下载地址，不下载实际游戏文件。
 * 用法：
 *   bun run scripts/iGM_MinecraftVersionSyncAll.ts
 *   bun run scripts/iGM_MinecraftVersionSyncAll.ts --resume
 *   bun run scripts/iGM_MinecraftVersionSyncAll.ts --type=snapshot --limit=50
 *   bun run scripts/iGM_MinecraftVersionSyncAll.ts --max-size=100
 */

// 导入依赖 //
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { iGM_Config } from "../iGM_Server/src/iGM_Config/iGM_Config";
import { iGM_RunMigrations } from "../iGM_Server/src/iGM_Database/iGM_Database";
import {
  iGM_FindMinecraftVersionByVersion,
  iGM_UpsertMinecraftVersion,
} from "../iGM_Server/src/iGM_Repositories/iGM_GameRepository";
import {
  iGM_ComputeVersionTotalSize,
  iGM_LoadVersionManifest,
  type iGM_AssetIndexJson,
  type iGM_VersionJson,
} from "../iGM_Server/src/iGM_Services/iGM_GameDownloadService";
import { iGM_IsGameVersionType } from "../iGM_Server/src/iGM_Types/iGM_Game";

// 类型定义 //
/** 版本类型筛选：all 表示全部版本 */
type iGM_SyncAllType = "release" | "snapshot" | "all";

/** 命令行参数 */
interface iGM_SyncAllOptions {
  /** 从进度文件断点续传 */
  resume: boolean;
  /** 版本类型筛选，默认 all */
  type: iGM_SyncAllType;
  /** 最多处理条数；0 表示不限 */
  limit: number;
  /** 存储增长上限（MB），默认 100 */
  maxSizeMb: number;
}

/** Mojang 下载条目（client / server） */
interface iGM_MojangDownload {
  url?: string;
  size?: number;
  sha1?: string;
}

/** Mojang 版本详情 JSON 精简结构（含完整大小计算所需字段） */
interface iGM_MojangVersionJson {
  id?: string;
  type?: string;
  releaseTime?: string;
  assetIndex?: { id: string; url: string; sha1: string; size: number };
  downloads?: {
    client?: iGM_MojangDownload;
    server?: iGM_MojangDownload;
  };
  libraries?: unknown[];
}

// 核心逻辑 //
/** 日志目录与文件（禁止提交 Git，已在 .gitignore 排除） */
const iGM_LogDir = resolve(import.meta.dir, "logs");
const iGM_LogFile = join(iGM_LogDir, "minecraft_version_sync_all.log");
/** 断点续传进度文件：每处理完一个版本追加一行版本号 */
const iGM_ProgressFile = join(
  iGM_LogDir,
  "minecraft_version_sync_all.progress",
);
/** 临时缓存目录（脚本本身不落缓存，若存在则一并计入存储占用） */
const iGM_CacheDir = resolve(import.meta.dir, ".cache");

/** 限速与稳定性参数 */
const iGM_SyncLimits = {
  /** 每个请求之间的随机延迟下限（毫秒） */
  requestDelayMinMs: 1500,
  /** 每个请求之间的随机延迟上限（毫秒） */
  requestDelayMaxMs: 3000,
  /** 每处理多少条休息一次 */
  batchSize: 15,
  /** 批量休息时长（毫秒） */
  batchRestMs: 5000,
  /** 429/503 指数退避最大重试次数 */
  maxRetries: 5,
  /** 连续失败阈值，达到后暂停 */
  maxConsecutiveFailures: 5,
  /** 连续失败暂停时长（毫秒） */
  failurePauseMs: 30000,
} as const;

/** 追加一行日志（同时输出到控制台） */
function iGM_Log(line: string): void {
  const text = `[${new Date().toISOString()}] ${line}`;
  console.log(`[iGM_MinecraftVersionSyncAll] ${line}`);
  appendFileSync(iGM_LogFile, `${text}\n`, "utf8");
}

/** 休眠 */
function iGM_Sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

/** 请求间隔的随机延迟 */
function iGM_RequestDelay(): Promise<void> {
  const { requestDelayMinMs, requestDelayMaxMs } = iGM_SyncLimits;
  const ms =
    requestDelayMinMs +
    Math.floor(Math.random() * (requestDelayMaxMs - requestDelayMinMs + 1));
  return iGM_Sleep(ms);
}

/** 字节数格式化为 MB 文本 */
function iGM_FormatMb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/* ---------- 存储占用监测 ---------- */

/** 单个文件大小（不存在按 0 计） */
function iGM_FileSize(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

/** 目录内所有文件总大小（递归；不存在按 0 计） */
function iGM_DirSize(dir: string): number {
  let total = 0;
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else total += iGM_FileSize(full);
    }
  };
  try {
    walk(dir);
  } catch {
    return total;
  }
  return total;
}

/** 数据库文件总大小（含 WAL 与 SHM 边车文件） */
function iGM_DatabaseSize(): number {
  const file = resolve(iGM_Config.databasePath);
  return (
    iGM_FileSize(file) + iGM_FileSize(`${file}-wal`) + iGM_FileSize(`${file}-shm`)
  );
}

/** 当前总占用 = 数据库 + 日志目录 + 临时缓存目录 */
function iGM_MeasureUsage(): number {
  return iGM_DatabaseSize() + iGM_DirSize(iGM_LogDir) + iGM_DirSize(iGM_CacheDir);
}

/* ---------- 断点续传 ---------- */

/** 读取进度文件中已完成的版本号集合 */
function iGM_ReadProgress(): Set<string> {
  try {
    const text = readFileSync(iGM_ProgressFile, "utf8");
    return new Set(
      text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    );
  } catch {
    return new Set<string>();
  }
}

/** 记录一个已完成版本（追加写，保留断点） */
function iGM_AppendProgress(version: string): void {
  appendFileSync(iGM_ProgressFile, `${version}\n`, "utf8");
}

/* ---------- 参数与请求 ---------- */

/** 解析命令行参数 */
function iGM_ParseOptions(argv: string[]): iGM_SyncAllOptions {
  const options: iGM_SyncAllOptions = {
    resume: false,
    type: "all",
    limit: 0,
    maxSizeMb: 100,
  };
  for (const arg of argv) {
    if (arg === "--resume") {
      options.resume = true;
      continue;
    }
    const [key, rawValue = ""] = arg.split("=");
    if (key === "--type") {
      const wanted = rawValue.trim();
      if (wanted === "release" || wanted === "snapshot" || wanted === "all") {
        options.type = wanted;
      } else {
        throw new Error(`未知的版本类型：${rawValue}（可选 release/snapshot/all）`);
      }
      continue;
    }
    if (key === "--limit") {
      const parsed = Number.parseInt(rawValue, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.limit = parsed;
      }
      continue;
    }
    if (key === "--max-size") {
      const parsed = Number.parseFloat(rawValue);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.maxSizeMb = parsed;
      }
      continue;
    }
    if (arg.startsWith("--")) {
      throw new Error(`未知参数：${arg}`);
    }
  }
  return options;
}

/**
 * 带限速与退避重试的 JSON 拉取
 * 429/503 指数退避；其余非 2xx 直接失败，由上层计入连续失败
 */
async function iGM_FetchJson<T>(url: string): Promise<T> {
  let attempt = 0;
  while (true) {
    attempt += 1;
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "iGCraftLit-Community/1.0 (version-sync-all)" },
      });
      if (response.ok) {
        return (await response.json()) as T;
      }
      const retryable = response.status === 429 || response.status === 503;
      if (!retryable || attempt > iGM_SyncLimits.maxRetries) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      const backoff = 1000 * 2 ** (attempt - 1);
      iGM_Log(
        `请求受限（HTTP ${response.status}），${backoff}ms 后重试（第 ${attempt} 次）`,
      );
      await iGM_Sleep(backoff);
    } catch (error) {
      if (attempt > iGM_SyncLimits.maxRetries) throw error;
      const backoff = 1000 * 2 ** (attempt - 1);
      iGM_Log(`请求异常：${String(error)}，${backoff}ms 后重试（第 ${attempt} 次）`);
      await iGM_Sleep(backoff);
    }
  }
}

/* ---------- 单版本同步 ---------- */

/** 拉取并解析单个版本的元数据，计算完整大小 */
async function iGM_FetchVersionMeta(
  entry: { id: string; type: string; releaseTime: string; url: string },
): Promise<{
  version: string;
  type: string;
  releaseTime: string | null;
  client: iGM_MojangDownload | null;
  server: iGM_MojangDownload | null;
  totalSize: number;
}> {
  const detail = await iGM_FetchJson<iGM_MojangVersionJson>(entry.url);
  const client = detail.downloads?.client ?? null;
  const server = detail.downloads?.server ?? null;
  // 类型以详情为准，缺失时回退清单条目，最后兜底 release
  const type = iGM_IsGameVersionType(detail.type)
    ? detail.type
    : iGM_IsGameVersionType(entry.type)
      ? entry.type
      : "release";

  // 完整大小 = 客户端 JAR + 依赖库 + natives + assets 索引与对象
  let assetIndexJson: iGM_AssetIndexJson | null = null;
  if (detail.assetIndex?.url) {
    try {
      assetIndexJson = await iGM_FetchJson<iGM_AssetIndexJson>(
        detail.assetIndex.url,
      );
    } catch (error) {
      iGM_Log(
        `版本=${entry.id} 状态=警告 assets 索引拉取失败，完整大小按 0 计入 错误=${String(error)}`,
      );
    }
  }
  const totalSize = iGM_ComputeVersionTotalSize(
    detail as unknown as iGM_VersionJson,
    assetIndexJson,
  );

  return {
    version: entry.id,
    type,
    releaseTime: detail.releaseTime ?? entry.releaseTime ?? null,
    client,
    server,
    totalSize,
  };
}

/* ---------- 主流程 ---------- */

/** 主流程 */
async function iGM_Main(): Promise<void> {
  mkdirSync(iGM_LogDir, { recursive: true });
  const options = iGM_ParseOptions(process.argv.slice(2));
  const startedAt = Date.now();

  // 存储基线在写入任何日志之前采集，日志自身增长也纳入监测
  const baseline = iGM_MeasureUsage();

  iGM_Log(
    `开始同步全部版本：type=${options.type} limit=${options.limit || "不限"} ` +
      `maxSize=${options.maxSizeMb}MB resume=${options.resume}`,
  );
  iGM_Log(`存储基线=${iGM_FormatMb(baseline)}（数据库 + 日志目录 + 缓存目录）`);

  // 确保数据库结构就绪（幂等）
  await iGM_RunMigrations();

  const manifest = await iGM_LoadVersionManifest();
  iGM_Log(`清单拉取完成，共 ${manifest.length} 个版本`);

  const completed = options.resume ? iGM_ReadProgress() : new Set<string>();
  if (options.resume) {
    iGM_Log(`断点续传：进度文件已完成 ${completed.size} 个版本`);
  }

  // 类型筛选：all 表示全部（release / snapshot / old_beta / old_alpha）
  const typed =
    options.type === "all"
      ? manifest
      : manifest.filter((item) => item.type === options.type);
  // 先剔除已完成版本，再套用 limit，保证续传时 limit 指向真正待处理的版本
  const pending = typed.filter((item) => !completed.has(item.id));
  const targets = options.limit > 0 ? pending.slice(0, options.limit) : pending;

  if (targets.length === 0) {
    iGM_Log("没有待同步的版本，结束");
    return;
  }
  iGM_Log(`本次待同步 ${targets.length} 个版本`);

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  let consecutiveFailures = 0;
  let lastVersion = "";
  let stoppedBySize = false;
  const failures: string[] = [];
  const maxBytes = options.maxSizeMb * 1024 * 1024;

  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    // 限速：首个请求不延迟，其余请求前随机等待
    if (index > 0) await iGM_RequestDelay();

    try {
      if (iGM_FindMinecraftVersionByVersion(target.id)) {
        skipped += 1;
        lastVersion = target.id;
        iGM_AppendProgress(target.id);
        iGM_Log(
          `版本=${target.id} 类型=${target.type} 状态=跳过（已存在） ` +
            `累计=${uploaded} 占用=${iGM_FormatMb(iGM_MeasureUsage())}`,
        );
      } else {
        const meta = await iGM_FetchVersionMeta(target);
        iGM_UpsertMinecraftVersion({
          version: meta.version,
          type: meta.type,
          releaseTime: meta.releaseTime,
          clientUrl: meta.client?.url ?? null,
          serverUrl: meta.server?.url ?? null,
          clientSize:
            typeof meta.client?.size === "number" ? meta.client.size : null,
          serverSize:
            typeof meta.server?.size === "number" ? meta.server.size : null,
          clientSha1: meta.client?.sha1 ?? null,
          serverSha1: meta.server?.sha1 ?? null,
          totalSize: meta.totalSize,
          notes: null,
          now: new Date().toISOString(),
        });
        uploaded += 1;
        lastVersion = meta.version;
        iGM_AppendProgress(meta.version);
        iGM_Log(
          `版本=${meta.version} 类型=${meta.type} 状态=成功 ` +
            `完整大小=${iGM_FormatMb(meta.totalSize)} 累计=${uploaded} ` +
            `占用=${iGM_FormatMb(iGM_MeasureUsage())}`,
        );
      }
      consecutiveFailures = 0;
    } catch (error) {
      failed += 1;
      consecutiveFailures += 1;
      const message = String(error);
      failures.push(`${target.id}：${message}`);
      iGM_Log(
        `版本=${target.id} 类型=${target.type} 状态=失败 ` +
          `累计=${uploaded} 占用=${iGM_FormatMb(iGM_MeasureUsage())} 错误=${message}`,
      );

      if (consecutiveFailures >= iGM_SyncLimits.maxConsecutiveFailures) {
        iGM_Log(
          `连续失败 ${consecutiveFailures} 次，暂停 ${iGM_SyncLimits.failurePauseMs / 1000} 秒`,
        );
        await iGM_Sleep(iGM_SyncLimits.failurePauseMs);
        consecutiveFailures = 0;
      }
    }

    // 每处理 batchSize 个版本：先做存储熔断检查，再休息
    if ((index + 1) % iGM_SyncLimits.batchSize === 0) {
      const usage = iGM_MeasureUsage();
      const growth = usage - baseline;
      if (growth > maxBytes) {
        stoppedBySize = true;
        iGM_Log(
          `存储增长 ${iGM_FormatMb(growth)} 超过上限 ${options.maxSizeMb} MB，立即停止上传`,
        );
        iGM_Log(
          `停止原因=存储占用超限 已上传=${uploaded} 当前总占用=${iGM_FormatMb(usage)} ` +
            `已写入的最后一个版本=${lastVersion || "无"}`,
        );
        break;
      }
      if (index + 1 < targets.length) {
        iGM_Log(
          `已处理 ${index + 1} 个版本，休息 ${iGM_SyncLimits.batchRestMs / 1000} 秒` +
            `（当前占用 ${iGM_FormatMb(usage)}，增长 ${iGM_FormatMb(growth)}）`,
        );
        await iGM_Sleep(iGM_SyncLimits.batchRestMs);
      }
    }
  }

  // 结束汇总
  const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
  iGM_Log("==== 同步结束 ====");
  iGM_Log(`成功上传：${uploaded}`);
  iGM_Log(`跳过（已存在）：${skipped}`);
  iGM_Log(`失败：${failed}`);
  for (const item of failures) iGM_Log(`  失败明细：${item}`);
  iGM_Log(`总耗时：${elapsedSeconds} 秒`);
  iGM_Log(`数据库文件最终大小：${iGM_FormatMb(iGM_DatabaseSize())}`);
  iGM_Log(`是否因超过 ${options.maxSizeMb} MB 而停止：${stoppedBySize ? "是" : "否"}`);
  iGM_Log(`下次续传起始位置：${lastVersion || "从头开始"}`);
  if (lastVersion) {
    iGM_Log("提示：下次运行可加 --resume 从断点继续");
  }
}

// 执行 //
await iGM_Main();