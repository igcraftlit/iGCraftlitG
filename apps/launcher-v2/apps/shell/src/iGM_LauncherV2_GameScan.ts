/**
 * 文件路径：apps/shell/src/iGM_LauncherV2_GameScan.ts
 * 所属层：桌面外壳 / 游戏目录扫描层
 * 路由：全局
 * 模块：iGM_LauncherV2_GameScan
 * 作用：扫描系统中常见与用户自定义的 .minecraft 目录并做完整性校验
 * 内容：候选来源包括总目录内置 .minecraft、系统常见位置（Windows %APPDATA%\.minecraft、
 *       Linux / macOS ~/.minecraft）与用户保存的自定义路径；
 *       同时存在 versions/、libraries/、assets/ 判定为完整，否则判为残缺；
 *       提供 采用目录 / 删除目录 / 生成标准结构 三种动作并回推最新扫描结果
 * 说明：删除动作由界面做二次确认后才会下发，外壳只负责执行，不重复询问
 */

// 导入依赖 //
import { rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  IGM_LAUNCHERV2_GAME_DIR,
  IGM_LAUNCHERV2_HORIZONS_DIR,
  IGM_LAUNCHERV2_SHARED_DIRS,
  iGM_LauncherV2_EnsureGameStructure,
  iGM_LauncherV2_GameRootPath,
  iGM_LauncherV2_MatrixRootPath,
  iGM_LauncherV2_PathsSnapshot,
  iGM_LauncherV2_SettingsGet,
  iGM_LauncherV2_SettingsSave,
  type iGM_LauncherV2_PathsSnapshot as iGM_LauncherV2_PathsSnapshotType,
} from "./iGM_LauncherV2_Paths";

// 类型定义 //

/** 单个候选目录的扫描结果 */
export interface iGM_LauncherV2_GameCandidate {
  /** 目录绝对路径 */
  path: string;
  /** 完整性：三共享目录齐全为 complete，否则 incomplete */
  status: "complete" | "incomplete";
  /** 来源：内置总目录 / 系统常见位置 / 用户自定义 */
  source: "matrix" | "system" | "custom";
  /** 三项共享目录的存在情况 */
  shared: { assets: boolean; libraries: boolean; versions: boolean };
  /** 已存在的视界数量 */
  horizonCount: number;
  /** 是否为当前采用的游戏根目录 */
  current: boolean;
}

/** 扫描结果快照 */
export interface iGM_LauncherV2_GameScanResult {
  candidates: iGM_LauncherV2_GameCandidate[];
  /** 当前游戏根目录 */
  currentGameRoot: string;
  /** 总目录绝对路径 */
  matrixRoot: string;
  /** 路径快照（供界面展示结构） */
  paths: iGM_LauncherV2_PathsSnapshotType;
}

// 核心逻辑 //

/** 判断路径是否存在且为目录 */
async function iGM_LauncherV2_IsDir(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    return info.isDirectory();
  } catch {
    return false;
  }
}

/** 系统常见 .minecraft 位置（按运行平台） */
function iGM_LauncherV2_SystemCandidates(): string[] {
  const list: string[] = [];
  if (process.platform === "win32") {
    const appData = process.env.APPDATA;
    if (appData) list.push(join(appData, IGM_LAUNCHERV2_GAME_DIR));
  }
  list.push(join(homedir(), IGM_LAUNCHERV2_GAME_DIR));
  return list;
}

/** 统计目录下的子目录数量（用于视界计数与目录计数） */
async function iGM_LauncherV2_ChildDirCount(path: string): Promise<number> {
  try {
    const { readdir } = await import("node:fs/promises");
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).length;
  } catch {
    return 0;
  }
}

/** 构造单个候选结果 */
async function iGM_LauncherV2_DescribeCandidate(
  path: string,
  source: iGM_LauncherV2_GameCandidate["source"],
): Promise<iGM_LauncherV2_GameCandidate | null> {
  if (!(await iGM_LauncherV2_IsDir(path))) return null;

  const shared = {
    assets: await iGM_LauncherV2_IsDir(join(path, "assets")),
    libraries: await iGM_LauncherV2_IsDir(join(path, "libraries")),
    versions: await iGM_LauncherV2_IsDir(join(path, "versions")),
  };
  const complete = shared.assets && shared.libraries && shared.versions;

  return {
    path,
    status: complete ? "complete" : "incomplete",
    source,
    shared,
    horizonCount: await iGM_LauncherV2_ChildDirCount(join(path, IGM_LAUNCHERV2_HORIZONS_DIR)),
    current: false,
  };
}

/** 收集候选目录（去重，保持顺序） */
async function iGM_LauncherV2_CollectCandidates(): Promise<iGM_LauncherV2_GameCandidate[]> {
  const settings = iGM_LauncherV2_SettingsGet();
  const ordered: Array<{ path: string; source: iGM_LauncherV2_GameCandidate["source"] }> = [
    { path: iGM_LauncherV2_MatrixRootPath(), source: "matrix" },
    ...iGM_LauncherV2_SystemCandidates().map((path) => ({
      path,
      source: "system" as const,
    })),
    ...settings.customScanPaths.map((path) => ({ path, source: "custom" as const })),
  ];

  const seen = new Set<string>();
  const results: iGM_LauncherV2_GameCandidate[] = [];
  const current = iGM_LauncherV2_GameRootPath();

  for (const item of ordered) {
    const candidatePath =
      item.source === "matrix" ? join(item.path, IGM_LAUNCHERV2_GAME_DIR) : item.path;
    const key = candidatePath.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const described = await iGM_LauncherV2_DescribeCandidate(candidatePath, item.source);
    if (described) results.push(described);
  }

  const currentKey = current.toLowerCase();
  for (const item of results) item.current = item.path.toLowerCase() === currentKey;
  return results;
}

/** 扫描全部候选目录 */
export async function iGM_LauncherV2_GameScan(): Promise<iGM_LauncherV2_GameScanResult> {
  return {
    candidates: await iGM_LauncherV2_CollectCandidates(),
    currentGameRoot: iGM_LauncherV2_GameRootPath(),
    matrixRoot: iGM_LauncherV2_MatrixRootPath(),
    paths: iGM_LauncherV2_PathsSnapshot(),
  };
}

/** 采用某个目录作为游戏根目录：补齐结构并写入设置 */
export async function iGM_LauncherV2_GameUse(path: string): Promise<iGM_LauncherV2_GameScanResult & { message: string }> {
  const trimmed = path.trim();
  if (!trimmed) throw new Error("目录不能为空");
  await iGM_LauncherV2_EnsureGameStructure(trimmed);
  await iGM_LauncherV2_SettingsSave({ gameRoot: trimmed });
  const result = await iGM_LauncherV2_GameScan();
  return { ...result, message: `已采用游戏目录：${trimmed}` };
}

/** 删除某个目录（界面已二次确认）；删除失败时抛出由调用方提示 */
export async function iGM_LauncherV2_GameDelete(
  path: string,
): Promise<iGM_LauncherV2_GameScanResult & { message: string }> {
  const trimmed = path.trim();
  if (!trimmed) throw new Error("目录不能为空");
  if (trimmed.toLowerCase() === iGM_LauncherV2_GameRootPath().toLowerCase()) {
    throw new Error("当前正在使用的目录不可删除，请先切换到其他目录");
  }
  await rm(trimmed, { recursive: true, force: true });
  const result = await iGM_LauncherV2_GameScan();
  return { ...result, message: `已删除目录：${trimmed}` };
}

/** 生成标准结构：在总目录下创建 .minecraft 及共享 / 视界目录，并采用为当前游戏根目录 */
export async function iGM_LauncherV2_GameGenerate(): Promise<
  iGM_LauncherV2_GameScanResult & { message: string }
> {
  await iGM_LauncherV2_EnsureGameStructure(
    join(iGM_LauncherV2_MatrixRootPath(), IGM_LAUNCHERV2_GAME_DIR),
  );
  await iGM_LauncherV2_SettingsSave({ gameRoot: "" });
  const result = await iGM_LauncherV2_GameScan();
  return { ...result, message: `已生成标准结构：${join(iGM_LauncherV2_MatrixRootPath(), IGM_LAUNCHERV2_GAME_DIR)}` };
}

/** 新增自定义扫描路径 */
export async function iGM_LauncherV2_GameAddScanPath(
  path: string,
): Promise<iGM_LauncherV2_GameScanResult & { message: string }> {
  const trimmed = path.trim();
  if (!trimmed) throw new Error("路径不能为空");
  const settings = iGM_LauncherV2_SettingsGet();
  if (!settings.customScanPaths.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
    await iGM_LauncherV2_SettingsSave({
      customScanPaths: [...settings.customScanPaths, trimmed],
    });
  }
  const result = await iGM_LauncherV2_GameScan();
  return { ...result, message: `已加入扫描列表：${trimmed}` };
}

/** 共享目录常量再导出，便于界面提示完整性判定口径 */
export const IGM_LAUNCHERV2_GAME_SHARED_DIRS = IGM_LAUNCHERV2_SHARED_DIRS;

// 导出 //
export default iGM_LauncherV2_GameScan;
