/**
 * 文件路径：apps/shell/src/iGM_LauncherV2_Paths.ts
 * 所属层：桌面外壳 / 路径与设置层
 * 路由：全局
 * 模块：iGM_LauncherV2_Paths
 * 作用：三端专属总目录命名、标准目录结构生成与启动器设置读写
 * 内容：按运行操作系统动态生成总目录名（Windows 为 iGML_Matrix，Linux / macOS 为 igml_matrix）；
 *       用户选定的根目录指针落盘于用户主目录下的引导目录，实际数据位于
 *       <根目录>/<总目录>/{launcher_data,.minecraft}；
 *       launcher_data 内含账号与皮肤数据、settings.json 与 logs/；
 *       .minecraft 内含共享的 assets / libraries / versions 与隔离的 horizons/<视界>；
 *       提供结构创建、设置读写与路径快照
 * 说明：所有子进程（含 Java 启动、下载）一律以本模块给出的路径为准，避免各处自行拼接
 */

// 导入依赖 //
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { iGM_LauncherV2_DownloadSource } from "./iGM_LauncherV2_Versions";

// 类型定义 //

/** 下载通道：用户自选，外壳不做任何优先级与降级推断 */
export type iGM_LauncherV2_DownloadChannel = "sdk" | "direct";

/** 当前激活账号的类型：正版 / 离线；空串表示尚未选择 */
export type iGM_LauncherV2_AccountKind = "" | "msa" | "offline";

/** 当前激活账号（全局唯一，启动游戏时严格以此为准） */
export interface iGM_LauncherV2_CurrentAccount {
  /** 账号类型 */
  kind: iGM_LauncherV2_AccountKind;
  /** msa 类型为标准化 UUID；offline 类型为离线账号标识；未选择时为空串 */
  id: string;
}

/** 启动器持久化设置 */
export interface iGM_LauncherV2_Settings {
  /** 结构版本号，便于将来迁移 */
  version: number;
  /**
   * 游戏根目录覆盖路径。
   * 为空表示使用总目录下的 .minecraft；非空表示用户直接选用已有的 .minecraft 目录。
   */
  gameRoot: string;
  /** 用户选定的下载通道 */
  downloadChannel: iGM_LauncherV2_DownloadChannel;
  /** 用户选定的下载源 */
  downloadSource: iGM_LauncherV2_DownloadSource;
  /** 当前选中的视界标识；为空表示尚未选择 */
  horizonId: string;
  /** 用户保存的自定义待扫描目录列表 */
  customScanPaths: string[];
  /**
   * 当前激活账号。
   * 持久化于设置文件，重启后仍然有效；启动游戏时严格读取本字段，
   * 为空则拒绝启动并提示用户先选择账号。
   */
  currentAccount: iGM_LauncherV2_CurrentAccount;
}

/** 路径快照（供界面展示当前结构） */
export interface iGM_LauncherV2_PathsSnapshot {
  /** 运行平台（process.platform） */
  platform: string;
  /** 专属总目录名 */
  matrixDirName: string;
  /** 用户选定的根目录 */
  userRoot: string;
  /** 总目录绝对路径 */
  matrixRoot: string;
  /** 启动器本地数据目录 */
  launcherData: string;
  /** 日志目录 */
  logs: string;
  /** 游戏根目录（可能为已有 .minecraft 目录） */
  gameRoot: string;
  /** 视界存放目录 */
  horizons: string;
}

// 核心逻辑 //

/** 专属总目录名：按运行操作系统动态生成 */
export const IGM_LAUNCHERV2_MATRIX_DIR_NAME = process.platform === "win32" ? "iGML_Matrix" : "igml_matrix";

/** 根目录指针所在引导目录名（位于用户主目录，仅存放指针文件） */
export const IGM_LAUNCHERV2_BOOTSTRAP_DIR_NAME = ".igm-craftceon-launcher-v2";

/** 根目录指针文件名 */
export const IGM_LAUNCHERV2_BOOT_POINTER_FILE = "boot.json";

/** 启动器本地数据目录名 */
export const IGM_LAUNCHERV2_LAUNCHER_DATA_DIR = "launcher_data";

/** 日志目录名 */
export const IGM_LAUNCHERV2_LOGS_DIR = "logs";

/** 游戏核心目录名 */
export const IGM_LAUNCHERV2_GAME_DIR = ".minecraft";

/** 视界存放目录名 */
export const IGM_LAUNCHERV2_HORIZONS_DIR = "horizons";

/** 设置文件名 */
export const IGM_LAUNCHERV2_SETTINGS_FILE = "settings.json";

/** 新建视界时须生成的子目录 */
export const IGM_LAUNCHERV2_HORIZON_SUBDIRS = [
  "mods",
  "resourcepacks",
  "shaderpacks",
  "saves",
  "config",
] as const;

/** 共享目录（位于游戏根目录下，各视界共用） */
export const IGM_LAUNCHERV2_SHARED_DIRS = ["assets", "libraries", "versions"] as const;

/** 设置默认值 */
const IGM_LAUNCHERV2_SETTINGS_DEFAULT: iGM_LauncherV2_Settings = {
  version: 1,
  gameRoot: "",
  downloadChannel: "direct",
  downloadSource: "mojang",
  horizonId: "",
  customScanPaths: [],
  currentAccount: { kind: "", id: "" },
};

/** 当前用户根目录（默认取系统用户主目录） */
let iGM_LauncherV2_UserRootState: string = homedir();

/** 当前设置缓存（PathsInit 后可用） */
let iGM_LauncherV2_SettingsState: iGM_LauncherV2_Settings = { ...IGM_LAUNCHERV2_SETTINGS_DEFAULT };

/** 根目录指针文件绝对路径 */
export function iGM_LauncherV2_BootPointerPath(): string {
  return join(homedir(), IGM_LAUNCHERV2_BOOTSTRAP_DIR_NAME, IGM_LAUNCHERV2_BOOT_POINTER_FILE);
}

/** 默认根目录（未显式选择时使用系统用户主目录） */
export function iGM_LauncherV2_UserRootDefault(): string {
  return homedir();
}

/** 当前用户根目录 */
export function iGM_LauncherV2_UserRootPath(): string {
  return iGM_LauncherV2_UserRootState;
}

/** 专属总目录绝对路径 */
export function iGM_LauncherV2_MatrixRootPath(): string {
  return join(iGM_LauncherV2_UserRootState, IGM_LAUNCHERV2_MATRIX_DIR_NAME);
}

/** 启动器本地数据目录绝对路径 */
export function iGM_LauncherV2_LauncherDataPath(): string {
  return join(iGM_LauncherV2_MatrixRootPath(), IGM_LAUNCHERV2_LAUNCHER_DATA_DIR);
}

/** 日志目录绝对路径 */
export function iGM_LauncherV2_LogsPath(): string {
  return join(iGM_LauncherV2_LauncherDataPath(), IGM_LAUNCHERV2_LOGS_DIR);
}

/** 设置文件绝对路径 */
export function iGM_LauncherV2_SettingsPath(): string {
  return join(iGM_LauncherV2_LauncherDataPath(), IGM_LAUNCHERV2_SETTINGS_FILE);
}

/** 游戏根目录（存在用户覆盖时优先使用覆盖路径） */
export function iGM_LauncherV2_GameRootPath(): string {
  const override = iGM_LauncherV2_SettingsState.gameRoot.trim();
  return override || join(iGM_LauncherV2_MatrixRootPath(), IGM_LAUNCHERV2_GAME_DIR);
}

/** 视界存放目录绝对路径 */
export function iGM_LauncherV2_HorizonsPath(): string {
  return join(iGM_LauncherV2_GameRootPath(), IGM_LAUNCHERV2_HORIZONS_DIR);
}

/** 路径快照 */
export function iGM_LauncherV2_PathsSnapshot(): iGM_LauncherV2_PathsSnapshot {
  return {
    platform: process.platform,
    matrixDirName: IGM_LAUNCHERV2_MATRIX_DIR_NAME,
    userRoot: iGM_LauncherV2_UserRootState,
    matrixRoot: iGM_LauncherV2_MatrixRootPath(),
    launcherData: iGM_LauncherV2_LauncherDataPath(),
    logs: iGM_LauncherV2_LogsPath(),
    gameRoot: iGM_LauncherV2_GameRootPath(),
    horizons: iGM_LauncherV2_HorizonsPath(),
  };
}

/** 读取根目录指针；文件缺失或结构非法时回退到系统用户主目录 */
async function iGM_LauncherV2_ReadBootPointer(): Promise<void> {
  try {
    const text = (await readFile(iGM_LauncherV2_BootPointerPath(), "utf8")).trim();
    if (!text) return;
    const parsed = JSON.parse(text) as { userRoot?: unknown };
    if (typeof parsed.userRoot === "string" && parsed.userRoot.trim()) {
      iGM_LauncherV2_UserRootState = parsed.userRoot.trim();
    }
  } catch {
    // 指针缺失或损坏时保持默认根目录，不抛出
  }
}

/**
 * 归一化当前账号字段。
 * 设置文件缺失该字段、或内容非法（类型不符 / 未知 kind）时统一回落到「未选择」，
 * 保证启动时读到的永远是结构合法值。
 */
function iGM_LauncherV2_NormalizeCurrentAccount(raw: unknown): iGM_LauncherV2_CurrentAccount {
  if (!raw || typeof raw !== "object") return { kind: "", id: "" };
  const candidate = raw as { kind?: unknown; id?: unknown };
  if (candidate.kind !== "msa" && candidate.kind !== "offline") return { kind: "", id: "" };
  if (typeof candidate.id !== "string") return { kind: "", id: "" };
  return { kind: candidate.kind, id: candidate.id.trim() };
}

/** 读取当前激活账号（同步读取设置缓存） */
export function iGM_LauncherV2_CurrentAccountGet(): iGM_LauncherV2_CurrentAccount {
  return iGM_LauncherV2_SettingsState.currentAccount;
}

/**
 * 设置当前激活账号并落盘。
 * 正版与离线账号的激活状态由此单一字段统一表达，避免两套 current 互相打架；
 * 后续启动游戏严格读取本字段。
 */
export async function iGM_LauncherV2_CurrentAccountSet(
  kind: iGM_LauncherV2_AccountKind,
  id: string,
): Promise<iGM_LauncherV2_Settings> {
  return iGM_LauncherV2_SettingsSave({ currentAccount: { kind, id: id.trim() } });
}

/** 读取设置文件并与默认值合并 */
export async function iGM_LauncherV2_SettingsLoad(): Promise<iGM_LauncherV2_Settings> {
  const base = { ...IGM_LAUNCHERV2_SETTINGS_DEFAULT };
  try {
    const text = (await readFile(iGM_LauncherV2_SettingsPath(), "utf8")).trim();
    if (text) {
      const parsed = JSON.parse(text) as Partial<iGM_LauncherV2_Settings>;
      if (typeof parsed.gameRoot === "string") base.gameRoot = parsed.gameRoot;
      if (parsed.downloadChannel === "sdk" || parsed.downloadChannel === "direct") {
        base.downloadChannel = parsed.downloadChannel;
      }
      if (parsed.downloadSource === "mojang" || parsed.downloadSource === "bmclapi" || parsed.downloadSource === "backup") {
        base.downloadSource = parsed.downloadSource;
      }
      if (typeof parsed.horizonId === "string") base.horizonId = parsed.horizonId;
      if (Array.isArray(parsed.customScanPaths)) {
        base.customScanPaths = parsed.customScanPaths.filter(
          (item): item is string => typeof item === "string",
        );
      }
      base.currentAccount = iGM_LauncherV2_NormalizeCurrentAccount(parsed.currentAccount);
    }
  } catch {
    // 设置缺失或损坏时使用默认值
  }
  iGM_LauncherV2_SettingsState = base;
  return base;
}

/** 当前设置（同步读取缓存） */
export function iGM_LauncherV2_SettingsGet(): iGM_LauncherV2_Settings {
  return iGM_LauncherV2_SettingsState;
}

/** 合并写入设置并返回最新设置 */
export async function iGM_LauncherV2_SettingsSave(
  patch: Partial<Omit<iGM_LauncherV2_Settings, "version">>,
): Promise<iGM_LauncherV2_Settings> {
  const next: iGM_LauncherV2_Settings = { ...iGM_LauncherV2_SettingsState, ...patch };
  iGM_LauncherV2_SettingsState = next;
  await mkdir(iGM_LauncherV2_LauncherDataPath(), { recursive: true });
  await writeFile(iGM_LauncherV2_SettingsPath(), JSON.stringify(next, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  return next;
}

/** 在指定游戏根目录下创建共享目录与视界目录 */
export async function iGM_LauncherV2_EnsureGameStructure(gameRoot: string): Promise<void> {
  await mkdir(gameRoot, { recursive: true });
  for (const dir of IGM_LAUNCHERV2_SHARED_DIRS) {
    await mkdir(join(gameRoot, dir), { recursive: true });
  }
  await mkdir(join(gameRoot, IGM_LAUNCHERV2_HORIZONS_DIR), { recursive: true });
}

/** 创建标准目录结构：总目录 + launcher_data + logs + 默认 .minecraft */
export async function iGM_LauncherV2_EnsureStructure(): Promise<void> {
  await mkdir(iGM_LauncherV2_MatrixRootPath(), { recursive: true });
  await mkdir(iGM_LauncherV2_LogsPath(), { recursive: true });
  await iGM_LauncherV2_EnsureGameStructure(join(iGM_LauncherV2_MatrixRootPath(), IGM_LAUNCHERV2_GAME_DIR));
}

/**
 * 迁移启动器本地数据目录。
 * 根目录变更时，旧根目录下的 launcher_data（microsoft.json 正版凭据、offline.json 离线账号、
 * java.json、皮肤库、accounts.json 社区会话、settings.json）必须随之前移；
 * 否则新根目录下这些文件都读不到，会出现「未找到正版凭据」「离线账号消失」这类假性丢失。
 * 规则：只补齐目标目录中不存在的文件，绝不覆盖已存在内容；logs 目录不迁移（体积会持续增长）。
 */
async function iGM_LauncherV2_MigrateLauncherData(from: string, to: string): Promise<void> {
  const exists = async (path: string): Promise<boolean> => {
    try {
      await stat(path);
      return true;
    } catch {
      return false;
    }
  };

  if (!(await exists(from)) || from === to) return;
  await mkdir(to, { recursive: true });

  const entries = await readdir(from, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === IGM_LAUNCHERV2_LOGS_DIR) continue;
    const source = join(from, entry.name);
    const target = join(to, entry.name);

    if (entry.isDirectory()) {
      // 目录（如 skins/）逐个子项补齐，已存在的文件留给目标侧的版本
      await mkdir(target, { recursive: true });
      const children = await readdir(source, { withFileTypes: true });
      for (const child of children) {
        if (!child.isFile()) continue;
        const childTarget = join(target, child.name);
        if (await exists(childTarget)) continue;
        await copyFile(join(source, child.name), childTarget);
      }
      continue;
    }

    if (!entry.isFile()) continue;
    if (await exists(target)) continue;
    await copyFile(source, target);
  }
}

/**
 * 设置用户根目录。
 * 写入指针文件后立即生成完整结构，并把旧根目录下的账号与设置数据迁移过来；
 * 返回最新路径快照供界面展示。
 */
export async function iGM_LauncherV2_SetUserRoot(root: string): Promise<iGM_LauncherV2_PathsSnapshot> {
  const trimmed = root.trim();
  if (!trimmed) throw new Error("根目录不能为空");

  const previousData = join(
    iGM_LauncherV2_UserRootState,
    IGM_LAUNCHERV2_MATRIX_DIR_NAME,
    IGM_LAUNCHERV2_LAUNCHER_DATA_DIR,
  );
  const changed = iGM_LauncherV2_UserRootState !== trimmed;

  iGM_LauncherV2_UserRootState = trimmed;
  await mkdir(join(homedir(), IGM_LAUNCHERV2_BOOTSTRAP_DIR_NAME), { recursive: true });
  await writeFile(
    iGM_LauncherV2_BootPointerPath(),
    JSON.stringify({ version: 1, userRoot: trimmed }, null, 2),
    { encoding: "utf8", mode: 0o600 },
  );
  await iGM_LauncherV2_EnsureStructure();

  // 根目录变更时迁移账号凭据与本地数据，避免造成「凭据 / 账号丢失」
  if (changed) {
    try {
      await iGM_LauncherV2_MigrateLauncherData(previousData, iGM_LauncherV2_LauncherDataPath());
    } catch (error) {
      console.warn("[iGM CraftCeon Launcher] 迁移本地账号数据失败：", error);
    }
  }

  // 根目录变化后，设置文件随之迁移到新位置
  await iGM_LauncherV2_SettingsSave({});
  return iGM_LauncherV2_PathsSnapshot();
}

/** 初始化：读取根目录指针、生成结构并载入设置 */
export async function iGM_LauncherV2_PathsInit(): Promise<iGM_LauncherV2_PathsSnapshot> {
  await iGM_LauncherV2_ReadBootPointer();
  await iGM_LauncherV2_EnsureStructure();
  await iGM_LauncherV2_SettingsLoad();
  return iGM_LauncherV2_PathsSnapshot();
}

// 导出 //
export default iGM_LauncherV2_PathsInit;
