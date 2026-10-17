/**
 * 文件路径：apps/shell/src/iGM_LauncherV2_Env.ts
 * 所属层：桌面外壳 / 配置读取层
 * 路由：全局
 * 模块：iGM_LauncherV2_Env
 * 作用：读取启动器配置（项目根 .env 与进程环境变量）
 * 内容：Bun 自动加载 .env 的前提是当前工作目录正好落有该文件，而外壳从
 *       apps/shell 启动，故此处以 import.meta.dir 精确定位
 *       apps/launcher-v2/.env 并解析 KEY=VALUE；
 *       进程环境变量优先于文件值，便于本地联调临时覆盖
 * 说明：仅读取公开客户端配置（client_id / 端点 / scope），不读取任何密钥
 */

// 导入依赖 //
import { readFileSync } from "node:fs";
import { join } from "node:path";

// 类型定义 //
/** 已解析的配置键值集合 */
type iGM_LauncherV2_EnvMap = Map<string, string>;

// 核心逻辑 //

/** 项目根 .env 绝对路径：apps/shell/src -> apps/shell -> apps -> apps/launcher-v2/.env */
const IGM_LAUNCHERV2_ENV_PATH = join(import.meta.dir, "..", "..", "..", ".env");

/** 解析结果缓存（进程内只读一次） */
let iGM_LauncherV2_EnvCache: iGM_LauncherV2_EnvMap | null = null;

/** 去除包裹的成对引号 */
function iGM_LauncherV2_EnvUnquote(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** 解析 .env 文本：忽略空行与 # 注释，按第一个 = 切分键值 */
function iGM_LauncherV2_EnvParse(text: string): iGM_LauncherV2_EnvMap {
  const map: iGM_LauncherV2_EnvMap = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = iGM_LauncherV2_EnvUnquote(line.slice(separator + 1));
    if (key) map.set(key, value);
  }
  return map;
}

/** 惰性加载 .env；文件缺失或不可读时返回空表，不阻断启动 */
function iGM_LauncherV2_EnvLoad(): iGM_LauncherV2_EnvMap {
  if (iGM_LauncherV2_EnvCache) return iGM_LauncherV2_EnvCache;
  try {
    iGM_LauncherV2_EnvCache = iGM_LauncherV2_EnvParse(
      readFileSync(IGM_LAUNCHERV2_ENV_PATH, "utf8"),
    );
  } catch {
    console.warn(`[iGM CraftCeon Launcher] 未读取到配置文件：${IGM_LAUNCHERV2_ENV_PATH}`);
    iGM_LauncherV2_EnvCache = new Map();
  }
  return iGM_LauncherV2_EnvCache;
}

// 导出 //

/** 读取配置项：进程环境变量优先，其次 .env 文件；缺失返回 null */
export function iGM_LauncherV2_EnvGet(key: string): string | null {
  const fromProcess = process.env[key]?.trim();
  if (fromProcess) return fromProcess;
  const value = iGM_LauncherV2_EnvLoad().get(key);
  return value && value.length > 0 ? value : null;
}

/** 配置文件绝对路径（启动日志提示用） */
export const IGM_LAUNCHERV2_ENV_FILE = IGM_LAUNCHERV2_ENV_PATH;

export default iGM_LauncherV2_EnvGet;
