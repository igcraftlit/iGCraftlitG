/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_GameDownloadService.ts
 * 所属层：后端 / 业务逻辑层（可复用引擎）
 * 路由：G_Game（由 iGM_GameService 调用）
 * 模块：iGM_GameDownloadService
 * 作用：Minecraft 游戏本体下载引擎——拉取版本配置、下载客户端与依赖库、
 *       解压 natives、下载 assets、下载 Fabric 加载器依赖、SHA1 校验、
 *       组装符合 Minecraft 目录规范的多版本隔离目录
 * 内容：安装目录安全校验（<所选目录>/.minecraft/<版本目录名>）、版本清单解析、文件清单规划、
 *       并发限速下载、指数退避重试与冷却、断点续传（已校验文件跳过）、
 *       natives 解压、Fabric profile JSON 生成与依赖库下载
 * 说明：本引擎仅依赖 Bun/Node 标准能力，不依赖任何 HTTP 框架上下文，
 *       亦不直接读写数据库，进度经事件回调外发，便于启动器侧复用；
 *       事件契约沿用 iGM CLI Downloader：start / stage / progress /
 *       file_done / retry / complete / error，并追加 canceled 终态
 */

// 导入依赖 //
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, parse, resolve, sep } from "node:path";
import { iGM_Config } from "../iGM_Config/iGM_Config";
import { iGM_Unzip } from "./iGM_ZipService";
import {
  iGM_FetchFabricProfile,
  iGM_ListFabricLoaders,
  iGM_NormalizeFabricProfile,
  iGM_ResolveFabricLibrary,
  iGM_ResolveFabricLoaderVersion,
  type iGM_FabricProfileJson,
} from "./iGM_FabricService";
import type {
  iGM_GameFileStatus,
  iGM_GameLoader,
  iGM_GameProgressEvent,
  iGM_GameStage,
} from "../iGM_Types/iGM_Game";
import { iGM_ResolveVersionDir } from "../iGM_Types/iGM_Game";

// 类型定义 //
/** 业务错误：message 为前端 i18n 文案键 */
export class iGM_GameError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "iGM_GameError";
  }
}

/** 取消信号（与 AbortSignal 解耦，便于任意运行时复用） */
export interface iGM_CancelSignal {
  aborted: boolean;
}

/** 引擎回调：与 HTTP/WS 解耦，由调用方决定如何渲染进度 */
export interface iGM_GameEngineHooks {
  onEvent: (event: iGM_GameProgressEvent) => void;
  /** 单文件状态变化（落库用于断点续传与单独重试） */
  onFileStatus?: (path: string, status: iGM_GameFileStatus) => void;
  /** 文件清单规划完成（落库为 iGM_GameFiles 明细） */
  onPlan?: (
    files: { path: string; url: string | null; sha1: string | null; size: number }[],
  ) => void;
  signal?: iGM_CancelSignal;
}

/** 引擎执行结果 */
export interface iGM_GameEngineResult {
  installDir: string;
  versionDir: string;
  loader: iGM_GameLoader;
  loaderVersion: string | null;
  totalFiles: number;
  totalBytes: number;
  failedFiles: number;
}

/** 规划出的单个待下载文件 */
interface iGM_PlanItem {
  /** 相对安装目录的路径（正斜杠，用于落库与日志） */
  relativePath: string;
  /** 磁盘绝对路径 */
  absolutePath: string;
  url: string;
  sha1: string | null;
  size: number;
  /** 下载后需解压到该相对目录（natives） */
  extractTo?: string;
  extractExclude?: string[];
}

/** Mojang 版本清单条目（同步脚本也使用该结构） */
export interface iGM_ManifestEntry {
  id: string;
  type: string;
  releaseTime: string;
  url: string;
  sha1?: string;
}

/** 版本 JSON 中的依赖库条目 */
interface iGM_LibraryEntry {
  name: string;
  rules?: {
    action: string;
    os?: { name?: string; arch?: string; version?: string };
  }[];
  natives?: Record<string, string>;
  downloads?: {
    artifact?: { path?: string; url: string; sha1: string; size: number };
    classifiers?: Record<
      string,
      { path?: string; url: string; sha1: string; size: number }
    >;
  };
}

/** 版本 JSON（仅声明本引擎使用到的字段） */
export interface iGM_VersionJson {
  id?: string;
  assetIndex?: { id: string; url: string; sha1: string; size: number };
  downloads?: {
    client?: { url: string; sha1: string; size: number };
  };
  libraries?: iGM_LibraryEntry[];
}

/** assets 索引 JSON */
export interface iGM_AssetIndexJson {
  objects: Record<string, { hash: string; size: number }>;
}

// 核心逻辑 //
/** 进度事件节流间隔（毫秒），避免高频事件压垮前端 */
const iGM_ProgressThrottleMs = 250;

/** 版本清单进程内缓存：下载引擎每次安装都会用到 */
let iGM_ManifestCache: iGM_ManifestEntry[] | null = null;

/** 休眠（提供取消信号时按 100ms 粒度响应取消） */
function iGM_Sleep(ms: number, signal?: iGM_CancelSignal): Promise<void> {
  if (!signal) return new Promise((done) => setTimeout(done, ms));
  return new Promise((done) => {
    const deadline = Date.now() + ms;
    const tick = (): void => {
      if (signal.aborted || Date.now() >= deadline) {
        done();
        return;
      }
      setTimeout(tick, Math.min(100, deadline - Date.now()));
    };
    tick();
  });
}

/** 计算 SHA1 十六进制摘要 */
function iGM_Sha1(bytes: Uint8Array): string {
  return createHash("sha1").update(bytes).digest("hex");
}

/** 当前系统在 Mojang 口径下的名称 */
function iGM_CurrentOsName(): string {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "osx";
  return "linux";
}

/** 当前系统在 Mojang 口径下的架构名 */
function iGM_CurrentOsArch(): string {
  if (process.arch === "x64") return "x86_64";
  if (process.arch === "arm64") return "arm64";
  return "x86";
}

/** 当前系统 natives 原生库扩展名 */
function iGM_NativeExtension(): string {
  if (process.platform === "win32") return ".dll";
  if (process.platform === "darwin") return ".dylib";
  return ".so";
}

/** 判断依赖库的 rules 是否允许在当前系统加载 */
function iGM_IsLibraryAllowedOnCurrentOs(rules: iGM_LibraryEntry["rules"]): boolean {
  if (!rules || rules.length === 0) return true;
  const osName = iGM_CurrentOsName();
  const osArch = iGM_CurrentOsArch();
  let allowed = false;
  for (const rule of rules) {
    const ruleOs = rule.os;
    const nameMatched = !ruleOs?.name || ruleOs.name === osName;
    const archMatched = !ruleOs?.arch || ruleOs.arch === osArch;
    // version 为系统版本正则，命中成本高且极少使用，按不约束处理
    if (nameMatched && archMatched) {
      allowed = rule.action === "allow";
    }
  }
  return allowed;
}

/* ---------- 安装目录安全校验 ---------- */

/** 拒绝写入的系统目录（小写比较） */
const iGM_ForbiddenDirNames = [
  "windows",
  "program files",
  "program files (x86)",
  "programdata",
  "system32",
  "syswow64",
  "system volume information",
];

/** Minecraft 规范目录名：所选目录下固定建立该级，再按版本隔离 */
export const iGM_MinecraftDirName = ".minecraft";

/**
 * 解析某版本的独立游戏目录：<用户所选目录>/.minecraft/<版本目录名>
 * 说明：模块十八要求多版本隔离——用户选择的是「根目录」，
 *       其下固定建立 .minecraft 规范目录，再按版本（含加载器差异）建立独立
 *       子目录，目录内自带 versions/、libraries/、assets/、mods/，互不覆盖。
 *       若所选路径末级已是 .minecraft，则仅追加版本目录；
 *       若已精确选到 .minecraft/<版本目录名>，则原样保留；
 *       Windows 下目录名不区分大小写。
 */
export function iGM_ResolveInstallDir(
  rootRaw: string,
  versionDir: string,
): string {
  const normalized = resolve((rootRaw ?? "").trim().replace(/^"(.*)"$/, "$1"));
  const parsed = parse(normalized);
  const base = parsed.base.toLowerCase();
  const parentBase = parse(parsed.dir).base.toLowerCase();
  // 已精确选到 .minecraft/<版本目录名>：原样保留，避免重复嵌套
  if (base === versionDir.toLowerCase() && parentBase === iGM_MinecraftDirName) {
    return normalized;
  }
  // 末级已是 .minecraft：仅追加版本目录
  if (base === iGM_MinecraftDirName) {
    return join(normalized, versionDir);
  }
  return join(normalized, iGM_MinecraftDirName, versionDir);
}

/**
 * 校验并解析版本安装目录：
 * 1. 必须为绝对路径，拒绝相对路径；
 * 2. 拒绝盘符根目录（如 D:\）与文件系统根；
 * 3. 拒绝 Windows 等系统目录及其子目录；
 * 4. 在其下补全 .minecraft 与版本目录两级，保证符合 Minecraft 目录规范并隔离多版本；
 * 5. 目录不存在则创建，并写入探针文件确认可写。
 * 校验失败抛 iGM_GameError，message 为 i18n 文案键。
 */
export async function iGM_ValidateInstallDir(
  rawRoot: string,
  versionDir: string,
): Promise<string> {
  const trimmed = (rawRoot ?? "").trim().replace(/^"(.*)"$/, "$1");
  if (!trimmed) {
    throw new iGM_GameError("game.errors.pathRequired", 400);
  }
  if (!isAbsolute(trimmed)) {
    throw new iGM_GameError("game.errors.pathNotAbsolute", 400);
  }

  const normalized = resolve(trimmed);
  const parsed = parse(normalized);

  // 拒绝盘符根目录（C:\）与 POSIX 根目录（/）
  if (normalized === parsed.root) {
    throw new iGM_GameError("game.errors.pathAtRoot", 400);
  }

  // 拒绝系统目录及其子目录
  const segments = normalized
    .slice(parsed.root.length)
    .split(sep)
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());
  const forbidden = segments.find((segment) =>
    iGM_ForbiddenDirNames.includes(segment),
  );
  if (forbidden) {
    throw new iGM_GameError("game.errors.pathForbidden", 400);
  }

  // 补全目录：最终游戏目录始终为 <所选目录>/.minecraft/<版本目录名>
  const target = iGM_ResolveInstallDir(normalized, versionDir);

  const probe = join(target, ".igm-write-probe");
  try {
    await mkdir(target, { recursive: true });
    await writeFile(probe, "ok", "utf8");
  } catch {
    throw new iGM_GameError("game.errors.pathNotWritable", 400);
  } finally {
    await unlink(probe).catch(() => undefined);
  }

  return target;
}

/* ---------- 版本清单与版本 JSON ---------- */

/** 拉取并缓存 Mojang 官方版本清单（同步脚本与下载引擎共用） */
export async function iGM_LoadVersionManifest(): Promise<iGM_ManifestEntry[]> {
  if (iGM_ManifestCache) return iGM_ManifestCache;
  const response = await fetch(iGM_Config.game.manifestUrl);
  if (!response.ok) {
    throw new iGM_GameError("game.errors.manifestFailed", 502);
  }
  const payload = (await response.json()) as { versions?: iGM_ManifestEntry[] };
  iGM_ManifestCache = payload.versions ?? [];
  return iGM_ManifestCache;
}

/** 拉取并解析版本 JSON */
async function iGM_LoadVersionJson(url: string): Promise<iGM_VersionJson> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new iGM_GameError("game.errors.versionJsonFailed", 502);
  }
  return (await response.json()) as iGM_VersionJson;
}

/* ---------- 文件清单规划 ---------- */

/** 组装单个计划项 */
function iGM_BuildItem(
  installDir: string,
  relativePath: string,
  url: string,
  sha1: string | null,
  size: number,
  extras?: { extractTo?: string; extractExclude?: string[] },
): iGM_PlanItem {
  return {
    relativePath,
    absolutePath: join(installDir, ...relativePath.split("/")),
    url,
    sha1,
    size,
    ...extras,
  };
}

/**
 * 根据版本 JSON 规划全部待下载文件：
 * 客户端主文件、版本配置文件、依赖库、natives 原生库、assets 索引与资源对象
 */
function iGM_PlanFiles(
  installDir: string,
  version: string,
  versionJsonUrl: string,
  versionJson: iGM_VersionJson,
  manifestSha1: string | null,
): iGM_PlanItem[] {
  const items: iGM_PlanItem[] = [];

  // 版本配置文件 <version>.json
  items.push(
    iGM_BuildItem(
      installDir,
      `versions/${version}/${version}.json`,
      versionJsonUrl,
      manifestSha1,
      0,
    ),
  );

  // 客户端主文件 <version>.jar
  const client = versionJson.downloads?.client;
  if (client) {
    items.push(
      iGM_BuildItem(
        installDir,
        `versions/${version}/${version}.jar`,
        client.url,
        client.sha1,
        client.size,
      ),
    );
  }

  // 依赖库与 natives
  const osName = iGM_CurrentOsName();
  for (const library of versionJson.libraries ?? []) {
    if (!iGM_IsLibraryAllowedOnCurrentOs(library.rules)) continue;

    const artifact = library.downloads?.artifact;
    if (artifact?.url && artifact.path) {
      items.push(
        iGM_BuildItem(
          installDir,
          `libraries/${artifact.path}`,
          artifact.url,
          artifact.sha1,
          artifact.size ?? 0,
        ),
      );
    }

    const classifierKey = library.natives?.[osName];
    const classifier = classifierKey
      ? library.downloads?.classifiers?.[classifierKey]
      : undefined;
    if (classifier?.url) {
      const classifierPath =
        classifier.path ??
        artifact?.path?.replace(/\.jar$/, `-${classifierKey}.jar`) ??
        null;
      if (classifierPath) {
        items.push(
          iGM_BuildItem(
            installDir,
            `libraries/${classifierPath}`,
            classifier.url,
            classifier.sha1,
            classifier.size ?? 0,
            {
              extractTo: `versions/${version}/natives`,
              extractExclude: ["META-INF/"],
            },
          ),
        );
      }
    }
  }

  // assets 索引（索引本身也纳入清单，保证 SHA1 校验覆盖）
  const assetIndex = versionJson.assetIndex;
  if (assetIndex) {
    items.push(
      iGM_BuildItem(
        installDir,
        `assets/indexes/${assetIndex.id}.json`,
        assetIndex.url,
        assetIndex.sha1,
        assetIndex.size ?? 0,
      ),
    );
  }

  return items;
}

/** 展开 assets 索引中的全部资源对象为计划项 */
function iGM_PlanAssetObjects(
  installDir: string,
  assetIndexJson: iGM_AssetIndexJson,
  baseUrl: string,
): iGM_PlanItem[] {
  const items: iGM_PlanItem[] = [];
  for (const entry of Object.values(assetIndexJson.objects ?? {})) {
    if (!entry?.hash) continue;
    items.push(
      iGM_BuildItem(
        installDir,
        `assets/objects/${entry.hash.slice(0, 2)}/${entry.hash}`,
        `${baseUrl}/${entry.hash.slice(0, 2)}/${entry.hash}`,
        entry.hash,
        entry.size ?? 0,
      ),
    );
  }
  return items;
}

/**
 * 计算版本「完整大小」（模块十八，供同步脚本预计算写入 totalSize）
 * 口径 = 客户端 JAR + 按当前系统过滤后的依赖库与 natives + assets 索引 + 全部 assets 对象
 * 说明：仅做大小汇总，不产生任何磁盘写入；依赖库过滤规则与真实安装保持一致
 */
export function iGM_ComputeVersionTotalSize(
  versionJson: iGM_VersionJson,
  assetIndexJson: iGM_AssetIndexJson | null,
): number {
  const version = versionJson.id ?? "";
  const files = iGM_PlanFiles("", version, "", versionJson, null);
  const objects = assetIndexJson
    ? iGM_PlanAssetObjects("", assetIndexJson, "")
    : [];
  return [...files, ...objects].reduce((sum, item) => sum + (item.size ?? 0), 0);
}

/**
 * 规划 Fabric 依赖库计划项（模块十八）
 * 说明：Fabric profile JSON 的 libraries 为 maven 坐标，按仓库地址拼出下载地址；
 *       无法推导地址的条目跳过（不影响整包可玩性）
 */
function iGM_PlanFabricLibraries(
  installDir: string,
  profile: iGM_FabricProfileJson,
): iGM_PlanItem[] {
  const items: iGM_PlanItem[] = [];
  for (const library of profile.libraries ?? []) {
    const resolved = iGM_ResolveFabricLibrary(library);
    if (!resolved) continue;
    items.push(
      iGM_BuildItem(
        installDir,
        `libraries/${resolved.relativePath}`,
        resolved.url,
        resolved.sha1,
        resolved.size,
      ),
    );
  }
  return items;
}

/**
 * 构建完整下载计划（供安装服务预先落库文件明细）
 * 说明：原版依赖库与 assets 的相对路径始终以「版本号」为目录名，
 *       Fabric 的 profile JSON 通过 inheritsFrom 指向该原版版本，
 *       因此 Fabric 安装同样需要原版文件，只是整体落在 <版本号>-fabric 目录内
 */
export async function iGM_BuildInstallPlan(input: {
  version: string;
  installDir: string;
  /** 模组加载器：none 原版 / fabric Fabric */
  loader?: iGM_GameLoader;
  /** Fabric Loader 版本号；loader 为 fabric 时必填（缺省则取最新稳定版） */
  loaderVersion?: string | null;
  /** 版本目录名；缺省按 <版本号>[-fabric] 推导 */
  versionDir?: string;
  /** assets 资源对象根地址；省略时取 iGM_Config.game.assetBaseUrl */
  assetBaseUrl?: string;
}): Promise<{
  items: iGM_PlanItem[];
  totalFiles: number;
  totalBytes: number;
  versionJsonUrl: string;
  versionJson: iGM_VersionJson;
  loader: iGM_GameLoader;
  loaderVersion: string | null;
  versionDir: string;
  /** 生成待写入的 Fabric profile JSON（原版为 null） */
  fabricProfile: iGM_FabricProfileJson | null;
  /** Fabric 依赖库的相对路径集合（用于独立划分「安装 Fabric」阶段） */
  fabricPaths: string[];
}> {
  const loader = input.loader === "fabric" ? "fabric" : "none";
  const versionDir =
    input.versionDir ?? iGM_ResolveVersionDir(input.version, loader);

  const manifest = await iGM_LoadVersionManifest();
  const entry = manifest.find((item) => item.id === input.version);
  if (!entry) {
    throw new iGM_GameError("game.errors.versionNotInManifest", 404);
  }
  const versionJsonUrl = entry.url;
  const versionJson = await iGM_LoadVersionJson(versionJsonUrl);
  const items = iGM_PlanFiles(
    input.installDir,
    input.version,
    versionJsonUrl,
    versionJson,
    entry.sha1 ?? null,
  );

  // 展开 assets 对象（索引已在清单中，此处按索引内容追加）
  const assetIndex = versionJson.assetIndex;
  if (assetIndex) {
    const indexResponse = await fetch(assetIndex.url);
    if (indexResponse.ok) {
      const indexJson = (await indexResponse.json()) as iGM_AssetIndexJson;
      // 资源对象固定由官方资源 CDN 提供：<base>/<hash 前两位>/<hash>
      // 不能从 assetIndex.url 推导——该地址指向 piston-meta 上的索引文件本身
      const baseUrl = input.assetBaseUrl ?? iGM_Config.game.assetBaseUrl;
      items.push(...iGM_PlanAssetObjects(input.installDir, indexJson, baseUrl));
    }
  }

  // Fabric：解析 Loader 版本、拉取 profile、追加 Fabric 依赖库
  let loaderVersion: string | null = null;
  let fabricProfile: iGM_FabricProfileJson | null = null;
  const fabricItems: iGM_PlanItem[] = [];
  if (loader === "fabric") {
    const loaders = await iGM_ListFabricLoaders();
    loaderVersion = iGM_ResolveFabricLoaderVersion(
      loaders,
      input.loaderVersion ?? undefined,
    );
    const raw = await iGM_FetchFabricProfile(input.version, loaderVersion);
    fabricProfile = iGM_NormalizeFabricProfile(raw, versionDir, input.version);
    fabricItems.push(...iGM_PlanFabricLibraries(input.installDir, fabricProfile));
    items.push(...fabricItems);
  }

  const totalBytes = items.reduce((sum, item) => sum + (item.size ?? 0), 0);
  return {
    items,
    totalFiles: items.length,
    totalBytes,
    versionJsonUrl,
    versionJson,
    loader,
    loaderVersion,
    versionDir,
    fabricProfile,
    fabricPaths: fabricItems.map((item) => item.relativePath),
  };
}

/* ---------- 下载执行 ---------- */

/** 下载上下文：并发控制、限速、失败计数与进度统计 */
interface iGM_DownloadContext {
  items: iGM_PlanItem[];
  hooks: iGM_GameEngineHooks;
  totalBytes: number;
  doneFiles: number;
  doneBytes: number;
  failedFiles: number;
  consecutiveFailures: number;
  /** 最近 1 秒内已发出的请求时间戳（全局限速滑动窗口） */
  requestWindow: number[];
  lastEmitAt: number;
  startedAt: number;
  speedSampleAt: number;
  speedSampleBytes: number;
  speed: number;
}

/** 发送阶段事件（上下文版） */
function iGM_EmitStage(context: iGM_DownloadContext, stage: iGM_GameStage): void {
  context.hooks.onEvent({ type: "stage", stage });
}

/** 发送阶段事件（直接版，规划前使用） */
function iGM_EmitStageTo(hooks: iGM_GameEngineHooks, stage: iGM_GameStage): void {
  hooks.onEvent({ type: "stage", stage });
}

/** 节流发送进度事件 */
function iGM_EmitProgress(context: iGM_DownloadContext, force = false): void {
  const now = Date.now();
  if (!force && now - context.lastEmitAt < iGM_ProgressThrottleMs) return;
  context.lastEmitAt = now;

  // 速度按最近约 3 秒的滑动窗口估算
  const elapsed = now - context.speedSampleAt;
  if (elapsed >= 3000) {
    context.speed =
      ((context.doneBytes - context.speedSampleBytes) * 1000) / elapsed;
    context.speedSampleAt = now;
    context.speedSampleBytes = context.doneBytes;
  }

  const percent =
    context.totalBytes > 0
      ? Math.min(100, (context.doneBytes * 100) / context.totalBytes)
      : context.items.length > 0
        ? (context.doneFiles * 100) / context.items.length
        : 0;
  const remainingBytes = Math.max(0, context.totalBytes - context.doneBytes);
  const remainingSeconds =
    context.speed > 0 && remainingBytes > 0
      ? Math.round(remainingBytes / context.speed)
      : null;

  context.hooks.onEvent({
    type: "progress",
    doneFiles: context.doneFiles,
    totalFiles: context.items.length,
    doneBytes: context.doneBytes,
    totalBytes: context.totalBytes,
    percent: Number(percent.toFixed(2)),
    speed: Math.round(context.speed),
    remainingSeconds,
  });
}

/**
 * 请求前的限速闸门：全局滑动窗口，限制每秒请求数
 * 说明：资源以大量小文件为主，逐个请求加固定延迟会把整体吞吐压到每秒数次；
 *       改为按「每秒请求数」整体限速，既保留风控保护，又能让并发真正生效。
 *       取 0 表示不限速。
 */
async function iGM_WaitRequestSlot(
  context: iGM_DownloadContext,
): Promise<void> {
  const maxPerSecond = iGM_Config.game.maxRequestsPerSecond;
  if (maxPerSecond <= 0) return;

  for (;;) {
    const now = Date.now();
    context.requestWindow = context.requestWindow.filter(
      (stamp) => now - stamp < 1000,
    );
    if (context.requestWindow.length < maxPerSecond) {
      context.requestWindow.push(now);
      return;
    }
    // 窗口已满：等到最早一次请求离开窗口后再放行
    const wait = Math.max(10, 1000 - (now - context.requestWindow[0]));
    await iGM_Sleep(wait, context.hooks.signal);
    if (context.hooks.signal?.aborted) return;
  }
}

/** 判断磁盘上的文件是否已存在且 SHA1 一致（断点续传依据） */
async function iGM_IsFileValid(item: iGM_PlanItem): Promise<boolean> {
  if (!item.sha1) return false;
  try {
    const info = await stat(item.absolutePath);
    if (!info.isFile()) return false;
    if (item.size > 0 && info.size !== item.size) return false;
    const bytes = await readFile(item.absolutePath);
    return iGM_Sha1(bytes) === item.sha1;
  } catch {
    return false;
  }
}

/**
 * 连续失败达到阈值时进入冷却
 * 返回 true 表示冷却后应继续，false 表示已被取消
 */
async function iGM_HandleCooldown(context: iGM_DownloadContext): Promise<boolean> {
  if (context.consecutiveFailures < iGM_Config.game.maxConsecutiveFailures) {
    return true;
  }
  const cooldownSeconds = Math.round(iGM_Config.game.cooldownMs / 1000);
  context.hooks.onEvent({
    type: "retry",
    path: "",
    attempt: 0,
    reason: "cooldown",
    cooldownSeconds,
  });
  context.consecutiveFailures = 0;
  await iGM_Sleep(iGM_Config.game.cooldownMs, context.hooks.signal);
  return !context.hooks.signal?.aborted;
}

/**
 * 下载单个文件：命中 429/503 时指数退避重试
 * 返回 true 表示成功（含已存在跳过）
 */
async function iGM_DownloadOne(
  context: iGM_DownloadContext,
  item: iGM_PlanItem,
): Promise<boolean> {
  const { hooks } = context;

  // 断点续传：已存在且校验通过的文件直接跳过
  if (await iGM_IsFileValid(item)) {
    context.doneFiles += 1;
    context.doneBytes += item.size;
    context.consecutiveFailures = 0;
    hooks.onFileStatus?.(item.relativePath, "skipped");
    hooks.onEvent({ type: "file_done", path: item.relativePath, size: item.size });
    iGM_EmitProgress(context);
    return true;
  }

  const maxRetries = iGM_Config.game.maxRetries;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    if (hooks.signal?.aborted) return false;
    try {
      await iGM_WaitRequestSlot(context);
      const response = await fetch(item.url);
      if (response.status === 429 || response.status === 503) {
        throw new iGM_GameError("game.errors.rateLimited", response.status);
      }
      if (!response.ok) {
        throw new iGM_GameError("game.errors.downloadFailed", response.status);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());

      // SHA1 校验：不通过视为下载失败，触发重试
      if (item.sha1 && iGM_Sha1(bytes) !== item.sha1) {
        throw new iGM_GameError("game.errors.hashMismatch", 400);
      }

      await mkdir(dirname(item.absolutePath), { recursive: true });
      await writeFile(item.absolutePath, bytes);

      // natives：下载后解压到指定目录
      if (item.extractTo) {
        await iGM_ExtractNatives(item, bytes);
      }

      context.doneFiles += 1;
      context.doneBytes += item.size > 0 ? item.size : bytes.byteLength;
      context.consecutiveFailures = 0;
      hooks.onFileStatus?.(item.relativePath, "done");
      hooks.onEvent({
        type: "file_done",
        path: item.relativePath,
        size: item.size > 0 ? item.size : bytes.byteLength,
      });
      iGM_EmitProgress(context);
      return true;
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : String(error ?? "unknown");
      const retryable =
        error instanceof iGM_GameError
          ? error.status === 429 || error.status === 503 || error.status === 400
          : true;
      hooks.onEvent({
        type: "retry",
        path: item.relativePath,
        attempt,
        reason,
      });
      if (attempt >= maxRetries || !retryable) break;
      // 指数退避：1s、2s、4s、8s…
      await iGM_Sleep(1000 * 2 ** (attempt - 1), hooks.signal);
    }
  }

  context.failedFiles += 1;
  context.consecutiveFailures += 1;
  hooks.onFileStatus?.(item.relativePath, "failed");
  return false;
}

/** 解压 natives jar 到版本目录下的 natives 子目录 */
async function iGM_ExtractNatives(
  item: iGM_PlanItem,
  jarBytes: Uint8Array,
): Promise<void> {
  const targetRelative = item.extractTo;
  if (!targetRelative) return;
  // 由 <installDir>/libraries/<...>/<file>.jar 回退三级得到安装目录
  const installDir = resolve(item.absolutePath, "..", "..", "..");
  const targetDir = join(installDir, ...targetRelative.split("/"));
  const nativeExtension = iGM_NativeExtension();
  const exclude = item.extractExclude ?? [];

  const entries = iGM_Unzip(jarBytes, (name) => {
    if (exclude.some((prefix) => name.startsWith(prefix))) return false;
    return name.toLowerCase().endsWith(nativeExtension);
  });

  await mkdir(targetDir, { recursive: true });
  for (const entry of entries) {
    const fileName = entry.name.split("/").pop() ?? entry.name;
    await writeFile(join(targetDir, fileName), entry.data);
  }
}

/**
 * 执行完整安装流程
 * 1. 规划文件清单并落库；2. 并发限速下载；3. natives 解压；
 * 4. SHA1 校验（下载时逐文件校验）；
 * 5. 组装版本隔离目录（原版：versions/<版本号>；Fabric：额外生成
 *    versions/<版本号>-fabric/<版本号>-fabric.json 与 mods/ 目录）
 */
export async function iGM_RunGameInstall(input: {
  taskId: string;
  version: string;
  installDir: string;
  /** 模组加载器：none 原版 / fabric Fabric */
  loader?: iGM_GameLoader;
  /** Fabric Loader 版本号；缺省取最新稳定版 */
  loaderVersion?: string | null;
  hooks: iGM_GameEngineHooks;
}): Promise<iGM_GameEngineResult> {
  const { hooks } = input;
  const concurrency = Math.min(
    Math.max(1, iGM_Config.game.concurrency),
    iGM_Config.game.maxConcurrency,
  );

  iGM_EmitStageTo(hooks, "manifest");

  const plan = await iGM_BuildInstallPlan({
    version: input.version,
    installDir: input.installDir,
    loader: input.loader,
    loaderVersion: input.loaderVersion ?? null,
  });

  const context: iGM_DownloadContext = {
    items: plan.items,
    hooks,
    totalBytes: plan.totalBytes,
    doneFiles: 0,
    doneBytes: 0,
    failedFiles: 0,
    consecutiveFailures: 0,
    requestWindow: [],
    lastEmitAt: 0,
    startedAt: Date.now(),
    speedSampleAt: Date.now(),
    speedSampleBytes: 0,
    speed: 0,
  };

  // 文件明细落库（断点续传与单独重试依据）
  hooks.onPlan?.(
    plan.items.map((item) => ({
      path: item.relativePath,
      url: item.url,
      sha1: item.sha1,
      size: item.size,
    })),
  );

  hooks.onEvent({
    type: "start",
    taskId: input.taskId,
    version: input.version,
    totalFiles: plan.totalFiles,
    totalBytes: plan.totalBytes,
  });
  iGM_EmitProgress(context, true);

  // Fabric 依赖库单独归入「安装 Fabric」阶段，与原版依赖库区分展示
  const fabricPaths = new Set(plan.fabricPaths);

  // 先下载版本配置与依赖库，再下载资源对象（阶段划分便于前端展示）
  const grouped: { stage: iGM_GameStage; predicate: (item: iGM_PlanItem) => boolean }[] = [
    { stage: "json", predicate: (item) => item.relativePath.endsWith(".json") && item.relativePath.startsWith("versions/") },
    { stage: "client", predicate: (item) => item.relativePath.endsWith(".jar") && item.relativePath.startsWith("versions/") },
    { stage: "libraries", predicate: (item) => item.relativePath.startsWith("libraries/") && !item.extractTo && !fabricPaths.has(item.relativePath) },
    { stage: "natives", predicate: (item) => Boolean(item.extractTo) },
    { stage: "assets", predicate: (item) => item.relativePath.startsWith("assets/") && !fabricPaths.has(item.relativePath) },
    { stage: "fabric", predicate: (item) => fabricPaths.has(item.relativePath) },
  ];
  const handled = new Set<iGM_PlanItem>();

  for (const group of grouped) {
    const targets = context.items.filter(
      (item) => !handled.has(item) && group.predicate(item),
    );
    if (targets.length === 0) continue;
    iGM_EmitStage(context, group.stage);
    const ok = await iGM_RunPool(context, targets, concurrency);
    targets.forEach((item) => handled.add(item));
    if (!ok) {
      throw new iGM_GameError("game.errors.canceled", 499);
    }
    if (!(await iGM_HandleCooldown(context))) {
      throw new iGM_GameError("game.errors.canceled", 499);
    }
  }

  // 收尾阶段：校验与目录组装（下载过程已逐文件校验，此处标记阶段）
  iGM_EmitStage(context, "verify");
  iGM_EmitProgress(context, true);
  iGM_EmitStage(context, "assemble");
  await mkdir(join(input.installDir, "versions", input.version, "natives"), {
    recursive: true,
  });
  // Fabric：写入改写后的 profile JSON，创建版本目录与 mods 目录
  if (plan.fabricProfile) {
    const versionDirPath = join(
      input.installDir,
      "versions",
      plan.versionDir,
    );
    await mkdir(versionDirPath, { recursive: true });
    await mkdir(join(input.installDir, "mods"), { recursive: true });
    await writeFile(
      join(versionDirPath, `${plan.versionDir}.json`),
      JSON.stringify(plan.fabricProfile, null, 2),
      "utf8",
    );
  }
  iGM_EmitProgress(context, true);

  if (hooks.signal?.aborted) {
    throw new iGM_GameError("game.errors.canceled", 499);
  }
  if (context.failedFiles > 0) {
    throw new iGM_GameError("game.errors.partialFailed", 500);
  }

  hooks.onEvent({
    type: "complete",
    taskId: input.taskId,
    installDir: input.installDir,
  });

  return {
    installDir: input.installDir,
    versionDir: plan.versionDir,
    loader: plan.loader,
    loaderVersion: plan.loaderVersion,
    totalFiles: context.items.length,
    totalBytes: context.totalBytes,
    failedFiles: context.failedFiles,
  };
}

/** 固定并发度执行一批计划项；返回 false 表示被取消 */
async function iGM_RunPool(
  context: iGM_DownloadContext,
  targets: iGM_PlanItem[],
  concurrency: number,
): Promise<boolean> {
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (!context.hooks.signal?.aborted) {
      const index = cursor;
      cursor += 1;
      if (index >= targets.length) return;
      await iGM_DownloadOne(context, targets[index]);
    }
  };
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, targets.length); i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return !context.hooks.signal?.aborted;
}

// 导出 //
export default {
  iGM_GameError,
  iGM_ResolveInstallDir,
  iGM_ValidateInstallDir,
  iGM_LoadVersionManifest,
  iGM_BuildInstallPlan,
  iGM_RunGameInstall,
};