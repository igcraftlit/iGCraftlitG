/**
 * 文件路径：scripts/iGM_MinecraftVersionSync.ts
 * 所属层：工具脚本层（与前后端同仓库，供本地运维执行）
 * 路由：无（命令行脚本）
 * 模块：iGM_MinecraftVersionSync
 * 作用：从 Mojang 官方清单同步 Minecraft 版本元数据到 iGM_MinecraftVersions 表
 * 内容：参数解析、清单拉取、版本 JSON 与 assets 索引拉取、完整大小计算、
 *       限速与退避重试、幂等写入、日志落盘
 * 说明：
 *   - 模块十八默认同步范围：从最新正式版到 1.12（含）；
 *     指定 --version 只同步单个版本，--to 可改下限，--limit 可限制条数。
 *   - 预计算「完整大小」（客户端 JAR + 依赖库 + natives + assets），
 *     写入 iGM_TotalSize 字段，供前端版本列表与详情页直接展示。
 *   - 仅同步元数据与下载地址，不下载实际游戏文件。
 *   - 限速策略见《项目规则》：请求间隔 1.5-3 秒随机延迟，每 20 条休息 30 秒，
 *     429/503 指数退避最多 5 次，连续失败 5 次暂停 5 分钟。
 * 用法：
 *   bun run scripts/iGM_MinecraftVersionSync.ts
 *   bun run scripts/iGM_MinecraftVersionSync.ts --version=1.20.1
 *   bun run scripts/iGM_MinecraftVersionSync.ts --to=1.12 --resume
 *   bun run scripts/iGM_MinecraftVersionSync.ts --type=release --limit=20
 */

// 导入依赖 //
import { appendFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
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
import {
  iGM_IsGameVersionType,
  type iGM_GameVersionType,
} from "../iGM_Server/src/iGM_Types/iGM_Game";

// 类型定义 //
/** 命令行参数 */
interface iGM_SyncOptions {
  /** 指定单个版本号（优先于 type/limit/to） */
  version: string | null;
  /** 版本类型筛选（批量模式使用） */
  type: iGM_GameVersionType;
  /** 批量模式的下限版本（含），默认 1.12 */
  to: string;
  /** 最多同步条数；0 表示不限 */
  limit: number;
  /** 跳过数据库中已存在的版本 */
  resume: boolean;
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

/** 单条同步结果 */
interface iGM_SyncOutcome {
  version: string;
  ok: boolean;
  skipped: boolean;
  reason: string;
}

// 核心逻辑 //
/** 日志目录与文件（禁止提交 Git，已在 .gitignore 排除） */
const iGM_LogDir = resolve(import.meta.dir, "logs");
const iGM_LogFile = join(iGM_LogDir, "minecraft_version_sync.log");

/** 限速与稳定性参数 */
const iGM_SyncLimits = {
  /** 每个请求之间的随机延迟下限（毫秒） */
  requestDelayMinMs: 1500,
  /** 每个请求之间的随机延迟上限（毫秒） */
  requestDelayMaxMs: 3000,
  /** 每同步多少条休息一次 */
  batchSize: 20,
  /** 批量休息时长（毫秒） */
  batchRestMs: 30000,
  /** 429/503 指数退避最大重试次数 */
  maxRetries: 5,
  /** 连续失败阈值，达到后暂停 */
  maxConsecutiveFailures: 5,
  /** 连续失败暂停时长（毫秒） */
  failurePauseMs: 300000,
} as const;

/** 追加一行日志（同时输出到控制台） */
function iGM_Log(line: string): void {
  const text = `[${new Date().toISOString()}] ${line}`;
  console.log(`[iGM_MinecraftVersionSync] ${line}`);
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

/** 解析命令行参数 */
function iGM_ParseOptions(argv: string[]): iGM_SyncOptions {
  const options: iGM_SyncOptions = {
    version: null,
    type: "release",
    to: "1.12",
    limit: 0,
    resume: false,
  };
  for (const arg of argv) {
    if (arg === "--resume") {
      options.resume = true;
      continue;
    }
    const [key, rawValue = ""] = arg.split("=");
    if (key === "--version") {
      options.version = rawValue.trim() || null;
      continue;
    }
    if (key === "--to") {
      options.to = rawValue.trim() || "1.12";
      continue;
    }
    if (key === "--type") {
      const wanted = rawValue.trim();
      if (iGM_IsGameVersionType(wanted)) {
        options.type = wanted;
      } else {
        throw new Error(`未知的版本类型：${rawValue}（可选 release/snapshot/old_beta/old_alpha）`);
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
        headers: { "User-Agent": "iGCraftLit-Community/1.0 (version-sync)" },
      });
      if (response.ok) {
        return (await response.json()) as T;
      }
      const retryable = response.status === 429 || response.status === 503;
      if (!retryable || attempt > iGM_SyncLimits.maxRetries) {
        throw new Error(`HTTP ${response.status}`);
      }
      const backoff = 1000 * 2 ** (attempt - 1);
      iGM_Log(`请求受限（HTTP ${response.status}），${backoff}ms 后重试（第 ${attempt} 次）`);
      await iGM_Sleep(backoff);
    } catch (error) {
      if (attempt > iGM_SyncLimits.maxRetries) throw error;
      const backoff = 1000 * 2 ** (attempt - 1);
      iGM_Log(`请求异常：${String(error)}，${backoff}ms 后重试（第 ${attempt} 次）`);
      await iGM_Sleep(backoff);
    }
  }
}

/** 同步单个版本（返回写入结果） */
async function iGM_SyncOne(
  entry: { id: string; type?: string; releaseTime?: string; url: string },
  options: iGM_SyncOptions,
): Promise<iGM_SyncOutcome> {
  const version = entry.id;

  if (options.resume && iGM_FindMinecraftVersionByVersion(version)) {
    return { version, ok: true, skipped: true, reason: "数据库中已存在，跳过" };
  }

  const detail = await iGM_FetchJson<iGM_MojangVersionJson>(entry.url);
  const client = detail.downloads?.client ?? null;
  const server = detail.downloads?.server ?? null;
  const type = iGM_IsGameVersionType(detail.type) ? detail.type : options.type;

  // 计算完整大小：需额外拉取 assets 索引（资源对象清单）
  let assetIndexJson: iGM_AssetIndexJson | null = null;
  if (detail.assetIndex?.url) {
    try {
      assetIndexJson = await iGM_FetchJson<iGM_AssetIndexJson>(
        detail.assetIndex.url,
      );
    } catch (error) {
      iGM_Log(`  ${version} 的 assets 索引拉取失败，完整大小按 0 计入：${String(error)}`);
    }
  }
  const totalSize = iGM_ComputeVersionTotalSize(
    detail as unknown as iGM_VersionJson,
    assetIndexJson,
  );

  const now = new Date().toISOString();
  iGM_UpsertMinecraftVersion({
    version,
    type,
    releaseTime: detail.releaseTime ?? entry.releaseTime ?? null,
    clientUrl: client?.url ?? null,
    serverUrl: server?.url ?? null,
    clientSize: typeof client?.size === "number" ? client.size : null,
    serverSize: typeof server?.size === "number" ? server.size : null,
    clientSha1: client?.sha1 ?? null,
    serverSha1: server?.sha1 ?? null,
    totalSize,
    notes: null,
    now,
  });

  const totalMb = (totalSize / 1024 / 1024).toFixed(1);
  return {
    version,
    ok: true,
    skipped: false,
    reason: `已写入（完整大小 ${totalMb} MB）`,
  };
}

/** 主流程 */
async function iGM_Main(): Promise<void> {
  mkdirSync(iGM_LogDir, { recursive: true });
  const options = iGM_ParseOptions(process.argv.slice(2));
  iGM_Log(
    `开始同步：version=${options.version ?? "-"} type=${options.type} to=${options.to} ` +
      `limit=${options.limit || "不限"} resume=${options.resume}`,
  );

  // 确保数据库结构就绪（幂等）
  await iGM_RunMigrations();

  const manifest = await iGM_LoadVersionManifest();
  iGM_Log(`清单拉取完成，共 ${manifest.length} 个版本`);

  // 选择待同步条目：指定版本优先；否则取「最新 → options.to（含）」区间，
  // 清单为发布时间倒序，因此切片后天然是「从最新到 --to」的顺序
  let targets: { id: string; type?: string; releaseTime?: string; url: string }[];
  if (options.version) {
    const matched = manifest.find((item) => item.id === options.version);
    if (!matched) {
      throw new Error(`清单中不存在版本：${options.version}`);
    }
    targets = [matched];
  } else {
    const typed = manifest.filter((item) => item.type === options.type);
    const endIndex = typed.findIndex((item) => item.id === options.to);
    const ranged = endIndex >= 0 ? typed.slice(0, endIndex + 1) : typed;
    if (endIndex < 0) {
      iGM_Log(`清单中未找到下限版本 ${options.to}，改为同步全部 ${options.type}`);
    }
    targets = options.limit > 0 ? ranged.slice(0, options.limit) : ranged;
  }

  if (targets.length === 0) {
    iGM_Log("没有匹配的版本，结束");
    return;
  }
  iGM_Log(`本次待同步 ${targets.length} 个版本`);

  let done = 0;
  let failed = 0;
  let consecutiveFailures = 0;

  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    // 限速：首个请求不延迟，其余请求前随机等待
    if (index > 0) await iGM_RequestDelay();

    try {
      const outcome = await iGM_SyncOne(target, options);
      consecutiveFailures = 0;
      if (outcome.skipped) {
        iGM_Log(`跳过 ${outcome.version}：${outcome.reason}`);
      } else {
        done += 1;
        iGM_Log(`成功 ${outcome.version}：${outcome.reason}`);
      }
    } catch (error) {
      failed += 1;
      consecutiveFailures += 1;
      iGM_Log(`失败 ${target.id}：${String(error)}`);

      if (consecutiveFailures >= iGM_SyncLimits.maxConsecutiveFailures) {
        iGM_Log(
          `连续失败 ${consecutiveFailures} 次，暂停 ${iGM_SyncLimits.failurePauseMs / 1000} 秒`,
        );
        await iGM_Sleep(iGM_SyncLimits.failurePauseMs);
        consecutiveFailures = 0;
      }
    }

    // 每同步 batchSize 条休息一次（最后一条不必休息）
    if (
      (index + 1) % iGM_SyncLimits.batchSize === 0 &&
      index + 1 < targets.length
    ) {
      iGM_Log(`已同步 ${index + 1} 条，休息 ${iGM_SyncLimits.batchRestMs / 1000} 秒`);
      await iGM_Sleep(iGM_SyncLimits.batchRestMs);
    }
  }

  iGM_Log(`同步结束：成功 ${done} 条，失败 ${failed} 条`);
}

// 执行 //
await iGM_Main();