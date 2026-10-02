/**
 * 文件路径：apps/shell/src/iGM_Launcher_GameDir.ts
 * 所属层：桌面外壳 / 本地游戏目录层
 * 路由：全局（不对外暴露 URL，仅被 iGM_Launcher_Bridge 调用）
 * 模块：iGM_Launcher_GameDir
 * 作用：自动查找本机已安装的 Minecraft 游戏目录、解析 versions/ 下的版本 json，
 *       并维护版本库的本地缓存文件
 * 内容：默认候选目录（Windows %APPDATA%\.minecraft、macOS Application Support、Linux ~/.minecraft）、
 *       目录扫描（versions/ 子目录遍历 + 版本 json 解析）、已识别目录落盘（data/minecraft/game_dirs.json）、
 *       版本库缓存读写（data/minecraft/version_library.json）；
 *       登记指定目录时对选到 .minecraft 上级目录的情况回退一层再扫描
 *
 * 说明：本模块只识别与记录，绝不修改、删除或移动原游戏目录内的任何文件；
 *       版本库的远端同步（HTTP）由 iGM_Launcher_Bridge.ts 负责，本模块只做缓存读写，
 *       以避免与桥接层互相引用。
 *       Zig 侧对应契约：iGM_Launcher_ScanMinecraftDirs / iGM_Launcher_ParseVersionJson。
 */

// 导入依赖 //
import { existsSync, type Dirent } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, normalize } from "node:path";
import {
  IGM_LAUNCHER_DATA_ROOT,
  IGM_LAUNCHER_GAME_DIRS_FILE,
  IGM_LAUNCHER_INSTANCE_SUBDIRS,
  IGM_LAUNCHER_VERSION_LIBRARY_FILE,
  iGM_Launcher_BuildGameDir,
  iGM_Launcher_DefaultRootDirCandidates,
  iGM_Launcher_DetectLoader,
  iGM_Launcher_EmptyVersionLibrary,
  iGM_Launcher_ExtractFabricLoaderVersion,
  iGM_Launcher_McRootOfParent,
  iGM_Launcher_NewId,
  iGM_Launcher_NormalizeVersionType,
  type iGM_Launcher_GameDir,
  type iGM_Launcher_GameDirScanResult,
  type iGM_Launcher_RootDirInfo,
  type iGM_Launcher_ScannedVersion,
  type iGM_Launcher_VersionLibrary,
} from "@igm-launcher/shared";

// 类型定义 //

/** 落盘结构：已识别游戏目录 */
interface iGM_Launcher_GameDirsFile {
  gameDirs: iGM_Launcher_GameDir[];
}

/** 版本 json 中本模块关心的字段（其余字段一概忽略） */
interface iGM_Launcher_VersionJsonShape {
  id?: unknown;
  type?: unknown;
  inheritsFrom?: unknown;
  /** Fabric 等加载器版本的依赖库列表，用于回填加载器版本号 */
  libraries?: unknown;
}

// 核心逻辑 //

/* ---- 本地文件读写 ---- */

/** 读取 JSON 文件，缺失或解析失败时回退默认值 */
async function iGM_Launcher_GameDir_ReadJson<T>(relativePath: string, fallback: T): Promise<T> {
  const absolutePath = join(IGM_LAUNCHER_DATA_ROOT, relativePath);
  if (!existsSync(absolutePath)) return fallback;
  try {
    return JSON.parse(await readFile(absolutePath, "utf8")) as T;
  } catch (error) {
    console.warn(`[iGM_Launcher_GameDir] 读取失败，使用默认值：${absolutePath}`, error);
    return fallback;
  }
}

/** 写入 JSON 文件，目录不存在时自动创建 */
async function iGM_Launcher_GameDir_WriteJson(relativePath: string, value: unknown): Promise<void> {
  const absolutePath = join(IGM_LAUNCHER_DATA_ROOT, relativePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/* ---- 默认候选目录 ---- */

/**
 * 本机常见 Minecraft 目录候选。
 * 按平台给出官方启动器默认位置，路径统一经 normalize 去掉多余分隔符。
 */
export function iGM_Launcher_GameDir_DefaultCandidates(): string[] {
  // 平台判定与候选拼接复用共享层纯函数，保证主进程与界面回退层口径一致
  return iGM_Launcher_DefaultRootDirCandidates(
    process.platform,
    process.env.APPDATA,
    homedir(),
  ).map((item) => normalize(item));
}

/* ---- 版本 json 解析 ---- */

/**
 * 解析单个版本 json。
 * 目录名与 json 内的 id 不一致时以 json 为准；Fabric 版本号取 inheritsFrom，
 * 加载器与加载器版本由 iGM_Launcher_DetectLoader 统一推断。
 * 解析失败（文件缺失 / 非法 JSON）返回 null，由调用方跳过该版本。
 */
export async function iGM_Launcher_GameDir_ParseVersionJson(
  jsonPath: string,
): Promise<iGM_Launcher_ScannedVersion | null> {
  const absolutePath = normalize(jsonPath);
  if (!existsSync(absolutePath)) return null;

  try {
    const parsed = JSON.parse(await readFile(absolutePath, "utf8")) as iGM_Launcher_VersionJsonShape;
    const dirName = basename(dirname(absolutePath));
    const jsonId = typeof parsed.id === "string" && parsed.id.trim() ? parsed.id.trim() : dirName;
    const inheritsFrom =
      typeof parsed.inheritsFrom === "string" && parsed.inheritsFrom.trim()
        ? parsed.inheritsFrom.trim()
        : null;
    const { loader, loaderVersion } = iGM_Launcher_DetectLoader(dirName, inheritsFrom);
    // 实例目录名统一为 <版本>-<加载器>（不含加载器版本），目录名推断不到时
    // 以版本 json 的 libraries 中 net.fabricmc:fabric-loader:<版本> 为准
    const resolvedLoaderVersion =
      loader === "fabric" && !loaderVersion
        ? iGM_Launcher_ExtractFabricLoaderVersion(parsed.libraries) || loaderVersion
        : loaderVersion;

    return {
      // 版本目录名即实例引用的版本标识，保持与磁盘一致，便于回写启动参数
      id: dirName,
      version: inheritsFrom ?? jsonId,
      type: iGM_Launcher_NormalizeVersionType(parsed.type),
      loader,
      loaderVersion: resolvedLoaderVersion,
      jsonPath: absolutePath,
    };
  } catch (error) {
    console.warn(`[iGM_Launcher_GameDir] 版本 json 解析失败：${absolutePath}`, error);
    return null;
  }
}

/* ---- 目录扫描 ---- */

/**
 * 扫描单个目录：
 * 检查 versions/、libraries/、assets/ 是否存在，并遍历 versions/ 下每个子目录，
 * 读取同名 <version>.json 解析版本信息。
 * 全程只读，不写入被扫描目录。
 */
export async function iGM_Launcher_GameDir_Scan(
  dirPath: string,
): Promise<iGM_Launcher_GameDirScanResult> {
  const absolutePath = normalize(dirPath);
  const versionsDir = join(absolutePath, "versions");
  const result: iGM_Launcher_GameDirScanResult = {
    path: absolutePath,
    exists: existsSync(absolutePath),
    hasVersions: existsSync(versionsDir),
    hasLibraries: existsSync(join(absolutePath, "libraries")),
    hasAssets: existsSync(join(absolutePath, "assets")),
    versions: [],
  };
  if (!result.exists || !result.hasVersions) return result;

  let entries: Dirent[];
  try {
    entries = await readdir(versionsDir, { withFileTypes: true });
  } catch (error) {
    console.warn(`[iGM_Launcher_GameDir] versions 目录读取失败：${versionsDir}`, error);
    return result;
  }

  const versions: iGM_Launcher_ScannedVersion[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const parsed = await iGM_Launcher_GameDir_ParseVersionJson(
      join(versionsDir, entry.name, `${entry.name}.json`),
    );
    if (parsed) versions.push(parsed);
  }
  // 组内按版本号倒序，便于界面直接按年份 / 版本分组展示
  result.versions = versions.sort((a, b) => b.version.localeCompare(a.version, "en"));
  return result;
}

/* ---- 已识别目录（落盘） ---- */

/** 读取已识别目录列表 */
export async function iGM_Launcher_GameDir_Load(): Promise<iGM_Launcher_GameDir[]> {
  const file = await iGM_Launcher_GameDir_ReadJson<iGM_Launcher_GameDirsFile>(
    IGM_LAUNCHER_GAME_DIRS_FILE,
    { gameDirs: [] },
  );
  return Array.isArray(file.gameDirs) ? file.gameDirs : [];
}

/** 保存已识别目录列表 */
export async function iGM_Launcher_GameDir_Save(gameDirs: iGM_Launcher_GameDir[]): Promise<void> {
  await iGM_Launcher_GameDir_WriteJson(IGM_LAUNCHER_GAME_DIRS_FILE, { gameDirs });
}

/** 最近一次扫描结果的内存缓存，供版本库同步判断「已安装」时复用，避免重复遍历磁盘 */
let iGM_Launcher_GameDir_ScanCache: iGM_Launcher_GameDirScanResult[] | null = null;

/** 读取最近一次扫描结果缓存 */
export function iGM_Launcher_GameDir_LastScan(): iGM_Launcher_GameDirScanResult[] | null {
  return iGM_Launcher_GameDir_ScanCache;
}

/** 由扫描结果登记目录记录（保留原有 id / 来源 / 默认标记） */
function iGM_Launcher_GameDir_FromScan(
  scan: iGM_Launcher_GameDirScanResult,
  previous: iGM_Launcher_GameDir | undefined,
  source: iGM_Launcher_GameDir["source"],
): iGM_Launcher_GameDir {
  return {
    id: previous?.id ?? iGM_Launcher_NewId("gdir"),
    path: scan.path,
    source: previous?.source ?? source,
    isDefault: previous?.isDefault ?? false,
    versionCount: scan.versions.length,
    hasVersions: scan.hasVersions,
    hasLibraries: scan.hasLibraries,
    hasAssets: scan.hasAssets,
    scannedAt: new Date().toISOString(),
  };
}

/** 归一化默认标记：保证至多一个默认，非空时必定有一个默认（优先版本数最多者） */
function iGM_Launcher_GameDir_NormalizeDefault(
  gameDirs: iGM_Launcher_GameDir[],
  preferredId?: string,
): iGM_Launcher_GameDir[] {
  if (gameDirs.length === 0) return gameDirs;
  const target =
    (preferredId && gameDirs.find((item) => item.id === preferredId)?.id) ??
    gameDirs.find((item) => item.isDefault)?.id ??
    [...gameDirs].sort((a, b) => b.versionCount - a.versionCount)[0].id;
  return gameDirs.map((item) => ({ ...item, isDefault: item.id === target }));
}

/* ---- 扫描全部 ---- */

/**
 * 扫描全部候选目录：
 * 默认候选目录（仅当真实存在时登记）+ 已登记目录，按路径去重后逐个扫描，
 * 结果落盘并返回，供界面在实例管理页展示与导入。
 */
export async function iGM_Launcher_GameDir_ScanAll(): Promise<{
  gameDirs: iGM_Launcher_GameDir[];
  results: iGM_Launcher_GameDirScanResult[];
}> {
  const previous = await iGM_Launcher_GameDir_Load();
  const previousByPath = new Map(previous.map((item) => [normalize(item.path), item]));

  const targets: { path: string; source: iGM_Launcher_GameDir["source"] }[] = [];
  const seen = new Set<string>();
  for (const candidate of iGM_Launcher_GameDir_DefaultCandidates()) {
    const key = normalize(candidate);
    if (seen.has(key) || !existsSync(key)) continue;
    seen.add(key);
    targets.push({ path: key, source: previousByPath.get(key)?.source ?? "auto" });
  }
  for (const item of previous) {
    const key = normalize(item.path);
    if (seen.has(key) || !existsSync(key)) continue;
    seen.add(key);
    targets.push({ path: key, source: item.source });
  }

  const results: iGM_Launcher_GameDirScanResult[] = [];
  for (const target of targets) {
    results.push(await iGM_Launcher_GameDir_Scan(target.path));
  }

  const gameDirs = iGM_Launcher_GameDir_NormalizeDefault(
    results.map((scan) => iGM_Launcher_GameDir_FromScan(scan, previousByPath.get(scan.path), "auto")),
  );
  await iGM_Launcher_GameDir_Save(gameDirs);
  iGM_Launcher_GameDir_ScanCache = results;
  return { gameDirs, results };
}

/**
 * 扫描指定目录并登记为「手动指定」来源；目录不存在时返回 null。
 * 所选目录不含 versions/ 时会尝试回退到其下的 .minecraft 再扫描，
 * 兼容用户在目录选择器中选到 .minecraft 上级目录的情况。
 */
export async function iGM_Launcher_GameDir_Add(
  dirPath: string,
): Promise<{ gameDirs: iGM_Launcher_GameDir[]; result: iGM_Launcher_GameDirScanResult } | null> {
  let scan = await iGM_Launcher_GameDir_Scan(dirPath);
  if (!scan.exists) return null;

  /*
   * 目录选择器由用户自行浏览选择，常见的误选是 .minecraft 的上级目录
   * （如 %APPDATA% 或自建的 Games 目录）：此时所选目录不含 versions/，
   * 但其中存在 .minecraft/versions/，故回退一层到 .minecraft 再扫描，
   * 保证「浏览并扫描」选到哪一级都能识别到游戏目录。
   */
  if (!scan.hasVersions) {
    const nestedPath = iGM_Launcher_McRootOfParent(scan.path);
    if (normalize(nestedPath) !== scan.path) {
      const nestedScan = await iGM_Launcher_GameDir_Scan(nestedPath);
      if (nestedScan.exists && nestedScan.hasVersions) scan = nestedScan;
    }
  }

  const previous = await iGM_Launcher_GameDir_Load();
  const existed = previous.find((item) => normalize(item.path) === scan.path);
  const rest = previous.filter((item) => normalize(item.path) !== scan.path);
  const record = iGM_Launcher_GameDir_FromScan(scan, existed, "manual");
  const gameDirs = iGM_Launcher_GameDir_NormalizeDefault([...rest, record]);
  await iGM_Launcher_GameDir_Save(gameDirs);

  iGM_Launcher_GameDir_ScanCache = [
    ...(iGM_Launcher_GameDir_ScanCache ?? []).filter((item) => item.path !== scan.path),
    scan,
  ];
  return { gameDirs, result: scan };
}

/** 移除已登记目录（仅移除记录，磁盘上的游戏目录不受影响） */
export async function iGM_Launcher_GameDir_Remove(
  dirId: string,
): Promise<iGM_Launcher_GameDir[] | null> {
  const previous = await iGM_Launcher_GameDir_Load();
  const target = previous.find((item) => item.id === dirId);
  if (!target) return null;
  const gameDirs = iGM_Launcher_GameDir_NormalizeDefault(
    previous.filter((item) => item.id !== dirId),
  );
  await iGM_Launcher_GameDir_Save(gameDirs);
  iGM_Launcher_GameDir_ScanCache =
    iGM_Launcher_GameDir_ScanCache?.filter((item) => item.path !== target.path) ?? null;
  return gameDirs;
}

/** 设为默认游戏目录 */
export async function iGM_Launcher_GameDir_SetDefault(
  dirId: string,
): Promise<iGM_Launcher_GameDir[] | null> {
  const previous = await iGM_Launcher_GameDir_Load();
  if (!previous.some((item) => item.id === dirId)) return null;
  const gameDirs = iGM_Launcher_GameDir_NormalizeDefault(previous, dirId);
  await iGM_Launcher_GameDir_Save(gameDirs);
  return gameDirs;
}

/* ---- 模块六：共享根目录解析与实例目录创建 ---- */

/**
 * 扫描指定共享根目录，返回 versions/ 下已安装的版本。
 * 目录不存在或没有 versions/ 时返回空数组，不写入、不修改被扫描目录。
 */
export async function iGM_Launcher_GameDir_InstalledVersionsOf(
  rootDir: string,
): Promise<iGM_Launcher_ScannedVersion[]> {
  const scan = await iGM_Launcher_GameDir_Scan(rootDir);
  return scan.versions;
}

/**
 * 解析生效的共享根目录（.minecraft 根），优先级：
 * 1) 显式指定的 preferred（已登记记 registered，存在但未登记记 existing-default，否则待创建）；
 * 2) 已登记的默认目录；
 * 3) 系统默认候选中首个真实存在的；
 * 4) 系统默认候选首个（不存在，供确认安装时自动创建）。
 */
export async function iGM_Launcher_GameDir_ResolveRootDir(
  preferred?: string,
): Promise<iGM_Launcher_RootDirInfo> {
  const registered = await iGM_Launcher_GameDir_Load();
  const preferredPath = preferred?.trim() ? normalize(preferred.trim()) : "";

  if (preferredPath) {
    const record = registered.find((item) => normalize(item.path) === preferredPath);
    const exists = existsSync(preferredPath);
    return {
      path: preferredPath,
      exists,
      isDefault: record?.isDefault ?? false,
      source: record ? "registered" : exists ? "existing-default" : "system-default",
    };
  }

  const defaultDir = registered.find((item) => item.isDefault) ?? registered[0];
  if (defaultDir) {
    return {
      path: normalize(defaultDir.path),
      exists: existsSync(defaultDir.path),
      isDefault: true,
      source: "registered",
    };
  }

  const candidates = iGM_Launcher_GameDir_DefaultCandidates();
  const existing = candidates.find((item) => existsSync(item));
  if (existing) {
    return { path: existing, exists: true, isDefault: true, source: "existing-default" };
  }
  return { path: candidates[0] ?? "", exists: false, isDefault: true, source: "system-default" };
}

/**
 * 在共享根目录下创建实例隔离目录 <根目录>/instances/<实例名>，
 * 并补齐 mods / config / saves 等实例子目录。
 * 已存在时只补缺失项，绝不删除或覆盖已有内容。
 */
export async function iGM_Launcher_GameDir_EnsureInstanceDir(
  rootDir: string,
  instanceName: string,
): Promise<{ gameDir: string; created: boolean }> {
  const gameDir = normalize(iGM_Launcher_BuildGameDir(rootDir, instanceName));
  const created = !existsSync(gameDir);
  const instancesDir = dirname(gameDir);
  await mkdir(instancesDir, { recursive: true });
  await mkdir(gameDir, { recursive: true });
  for (const sub of IGM_LAUNCHER_INSTANCE_SUBDIRS) {
    await mkdir(join(gameDir, sub), { recursive: true });
  }
  return { gameDir, created };
}

/* ---- 版本库本地缓存 ---- */

/**
 * 读取版本库缓存。
 * 无缓存时返回空快照，界面据此提示「尚未同步」，绝不伪造版本数据。
 */
export async function iGM_Launcher_VersionLibrary_Load(): Promise<iGM_Launcher_VersionLibrary> {
  const cached = await iGM_Launcher_GameDir_ReadJson<iGM_Launcher_VersionLibrary | null>(
    IGM_LAUNCHER_VERSION_LIBRARY_FILE,
    null,
  );
  if (!cached || !Array.isArray(cached.entries)) return iGM_Launcher_EmptyVersionLibrary();
  return {
    entries: cached.entries,
    syncedAt: cached.syncedAt ?? null,
    source: cached.source === "remote" ? "cache" : (cached.source ?? "cache"),
    total: typeof cached.total === "number" ? cached.total : cached.entries.length,
  };
}

/** 保存版本库缓存（同步失败时保留旧缓存，由调用方保证只在成功时写入） */
export async function iGM_Launcher_VersionLibrary_Save(
  library: iGM_Launcher_VersionLibrary,
): Promise<void> {
  await iGM_Launcher_GameDir_WriteJson(IGM_LAUNCHER_VERSION_LIBRARY_FILE, {
    ...library,
    // 缓存文件只记录「已缓存」语义，来源由读取方回填为 cache
    source: "cache",
  });
}

/**
 * 汇总本地已安装版本号集合（来自扫描结果与已导入实例）。
 * 供桥接层合成版本库条目的 installed 标记。
 */
export function iGM_Launcher_GameDir_InstalledVersions(
  scans: iGM_Launcher_GameDirScanResult[],
  instanceVersions: string[],
): Set<string> {
  const installed = new Set<string>();
  for (const scan of scans) {
    for (const version of scan.versions) {
      installed.add(version.version.trim().toLowerCase());
    }
  }
  for (const version of instanceVersions) {
    const trimmed = version.trim().toLowerCase();
    if (trimmed) installed.add(trimmed);
  }
  return installed;
}

// 导出 //
export default iGM_Launcher_GameDir_ScanAll;
