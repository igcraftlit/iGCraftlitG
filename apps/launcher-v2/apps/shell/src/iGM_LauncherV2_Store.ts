/**
 * 文件路径：apps/shell/src/iGM_LauncherV2_Store.ts
 * 所属层：桌面外壳 / 本地存储层
 * 路由：全局
 * 模块：iGM_LauncherV2_Store
 * 作用：社区账号令牌与会话的本地落盘（数据目录）
 * 内容：数据根目录取系统用户主目录下的 .igm-craftceon-launcher-v2；
 *       会话写入 auth.json，文件权限 0600（仅当前用户可读写）；
 *       读取时容忍文件缺失与内容损坏（返回 null 并记录日志），绝不静默丢数据
 * 说明：令牌属于敏感凭据，仅落盘本地，不上报、不写日志正文
 */

// 导入依赖 //
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  IGM_LAUNCHERV2_AUTH_FILE,
  IGM_LAUNCHERV2_DATA_DIR_NAME,
} from "./iGM_LauncherV2_Constants";
import type { iGM_LauncherV2_AuthUser } from "./iGM_LauncherV2_Ipc";

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

/** 本地数据根目录 */
export const IGM_LAUNCHERV2_DATA_ROOT = join(homedir(), IGM_LAUNCHERV2_DATA_DIR_NAME);

/** 令牌文件绝对路径 */
export const IGM_LAUNCHERV2_AUTH_PATH = join(IGM_LAUNCHERV2_DATA_ROOT, IGM_LAUNCHERV2_AUTH_FILE);

/** auth.json 当前结构版本 */
const IGM_LAUNCHERV2_AUTH_VERSION = 1;

/** 确保数据目录存在 */
async function iGM_LauncherV2_EnsureDataRoot(): Promise<void> {
  await mkdir(IGM_LAUNCHERV2_DATA_ROOT, { recursive: true });
}

/** 读取会话；文件不存在或结构非法时返回 null */
export async function iGM_LauncherV2_StoreLoad(): Promise<iGM_LauncherV2_Session | null> {
  try {
    const text = (await readFile(IGM_LAUNCHERV2_AUTH_PATH, "utf8")).trim();
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
  await writeFile(IGM_LAUNCHERV2_AUTH_PATH, JSON.stringify(payload, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
}

/** 清除会话文件（退出登录） */
export async function iGM_LauncherV2_StoreClear(): Promise<void> {
  await rm(IGM_LAUNCHERV2_AUTH_PATH, { force: true });
}

// 导出 //
export default iGM_LauncherV2_StoreLoad;
