/**
 * 文件路径：apps/shell/src/iGM_LauncherV2_Store.ts
 * 所属层：桌面外壳 / 本地存储层
 * 路由：全局
 * 模块：iGM_LauncherV2_Store
 * 作用：社区账号令牌与会话的本地落盘（数据目录）
 * 内容：数据根目录为总目录下的 launcher_data（见 iGM_LauncherV2_Paths）；
 *       会话写入 accounts.json，文件权限 0600（仅当前用户可读写）；
 *       统一提供 Java / 离线账号 / 微软账号 / 皮肤库的落盘路径与通用 JSON 读写；
 *       读取时容忍文件缺失与内容损坏（返回 null 并记录日志），绝不静默丢数据
 * 说明：令牌属于敏感凭据，仅落盘本地，不上报、不写日志正文
 */

// 导入依赖 //
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  IGM_LAUNCHERV2_AUTH_FILE,
  IGM_LAUNCHERV2_INSTALL_FLAG_FILE,
  IGM_LAUNCHERV2_JAVA_FILE,
  IGM_LAUNCHERV2_MICROSOFT_FILE,
  IGM_LAUNCHERV2_OFFLINE_FILE,
  IGM_LAUNCHERV2_SKINS_DIR_NAME,
  IGM_LAUNCHERV2_SKINS_INDEX_FILE,
} from "./iGM_LauncherV2_Constants";
import type { iGM_LauncherV2_AuthUser } from "./iGM_LauncherV2_Ipc";
import { iGM_LauncherV2_LauncherDataPath } from "./iGM_LauncherV2_Paths";

// 类型定义 //

/** 持久化的社区账号会话 */
export interface iGM_LauncherV2_Session {
  /** 访问令牌 */
  accessToken: string;
  /** 刷新令牌（无离线权限时为空串） */
  refreshToken: string;
  /** 令牌类型，通常为 Bearer */
  tokenType: string;
  /** 授权 scope */
  scope: string;
  /** 访问令牌过期时刻（毫秒时间戳） */
  expiresAt: number;
  /** 账号公开信息 */
  user: iGM_LauncherV2_AuthUser;
  /** 落盘时间（ISO 字符串，便于排查） */
  savedAt: string;
}

/** auth.json 文件结构（含版本号，便于将来迁移） */
interface iGM_LauncherV2_AuthFilePayload {
  version: number;
  session: iGM_LauncherV2_Session;
}

// 核心逻辑 //

/** 本地数据根目录（总目录下的 launcher_data） */
export function iGM_LauncherV2_DataRoot(): string {
  return iGM_LauncherV2_LauncherDataPath();
}

/** 账号会话文件绝对路径 */
export function iGM_LauncherV2_AuthPath(): string {
  return join(iGM_LauncherV2_DataRoot(), IGM_LAUNCHERV2_AUTH_FILE);
}

/** 安装完成标记文件绝对路径 */
export function iGM_LauncherV2_InstallFlagPath(): string {
  return join(iGM_LauncherV2_DataRoot(), IGM_LAUNCHERV2_INSTALL_FLAG_FILE);
}

/** auth.json 当前结构版本 */
const IGM_LAUNCHERV2_AUTH_VERSION = 1;

/** 确保数据目录存在 */
async function iGM_LauncherV2_EnsureDataRoot(): Promise<void> {
  await mkdir(iGM_LauncherV2_DataRoot(), { recursive: true });
}

/** 读取会话；文件不存在或结构非法时返回 null */
export async function iGM_LauncherV2_StoreLoad(): Promise<iGM_LauncherV2_Session | null> {
  try {
    const text = (await readFile(iGM_LauncherV2_AuthPath(), "utf8")).trim();
    if (!text) return null;
    const payload = JSON.parse(text) as iGM_LauncherV2_AuthFilePayload;
    const session = payload?.session;
    if (!session || typeof session.accessToken !== "string" || !session.user) return null;
    return session;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      console.warn("[iGM CraftCeon Launcher] 会话文件不可用，将视为未登录：", code ?? error);
    }
    return null;
  }
}

/** 写入会话（权限 0600） */
export async function iGM_LauncherV2_StoreSave(
  session: iGM_LauncherV2_Session,
): Promise<void> {
  await iGM_LauncherV2_EnsureDataRoot();
  const payload: iGM_LauncherV2_AuthFilePayload = {
    version: IGM_LAUNCHERV2_AUTH_VERSION,
    session,
  };
  await writeFile(iGM_LauncherV2_AuthPath(), JSON.stringify(payload, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}

/** 清除会话文件（退出登录） */
export async function iGM_LauncherV2_StoreClear(): Promise<void> {
  await rm(iGM_LauncherV2_AuthPath(), { force: true });
}

/** 是否已通过首次安装向导（标记文件存在即视为已安装） */
export async function iGM_LauncherV2_InstallFlagExists(): Promise<boolean> {
  try {
    await readFile(iGM_LauncherV2_InstallFlagPath(), "utf8");
    return true;
  } catch {
    return false;
  }
}

/** 写入安装完成标记（幂等，重复写入无副作用） */
export async function iGM_LauncherV2_InstallFlagWrite(): Promise<void> {
  await iGM_LauncherV2_EnsureDataRoot();
  await writeFile(iGM_LauncherV2_InstallFlagPath(), new Date().toISOString(), "utf8");
}

/* ---- 通用 JSON 落盘（Java 环境 / 离线账号 / 微软账号共用） ---- */

/** Java 环境列表文件绝对路径 */
export function iGM_LauncherV2_JavaStorePath(): string {
  return join(iGM_LauncherV2_DataRoot(), IGM_LAUNCHERV2_JAVA_FILE);
}

/** 离线账号列表文件绝对路径 */
export function iGM_LauncherV2_OfflineStorePath(): string {
  return join(iGM_LauncherV2_DataRoot(), IGM_LAUNCHERV2_OFFLINE_FILE);
}

/** 微软正版账号文件绝对路径 */
export function iGM_LauncherV2_MicrosoftStorePath(): string {
  return join(iGM_LauncherV2_DataRoot(), IGM_LAUNCHERV2_MICROSOFT_FILE);
}

/** 皮肤库目录绝对路径（本地导入的皮肤与离线账号应用后的皮肤均存放于此） */
export function iGM_LauncherV2_SkinsDir(): string {
  return join(iGM_LauncherV2_DataRoot(), IGM_LAUNCHERV2_SKINS_DIR_NAME);
}

/** 皮肤库索引文件绝对路径 */
export function iGM_LauncherV2_SkinsIndexPath(): string {
  return join(iGM_LauncherV2_SkinsDir(), IGM_LAUNCHERV2_SKINS_INDEX_FILE);
}

/** 读取 JSON 文件；文件缺失或内容损坏时返回 null，绝不抛出 */
export async function iGM_LauncherV2_JsonRead<T>(path: string): Promise<T | null> {
  try {
    const text = (await readFile(path, "utf8")).trim();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      console.warn(`[iGM CraftCeon Launcher] 数据文件不可用：${path}`, code ?? error);
    }
    return null;
  }
}

/** 写入 JSON 文件（默认权限 0600，仅当前用户可读写） */
export async function iGM_LauncherV2_JsonWrite(
  path: string,
  value: unknown,
  mode = 0o600,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2), { encoding: "utf8", mode });
}

// 导出 //
export default iGM_LauncherV2_StoreLoad;
