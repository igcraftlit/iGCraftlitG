/**
 * 文件路径：apps/shell/src/iGM_LauncherV2_Env.ts
 * 所属层：桌面外壳 / 配置读取层
 * 路由：全局
 * 模块：iGM_LauncherV2_Env
 * 作用：读取启动器配置（随包分发的公开配置、项目根 .env 与进程环境变量）
 * 内容：按候选顺序定位并解析 KEY=VALUE：
 *       (1) 打包版随包分发的 iGM_LauncherV2_Config.env（位于主进程上一级的 app 目录，
 *           由 scripts/iGM_LauncherV2_SyncUi.ts 从 .env 提取公开键生成）；
 *       (2) 开发态项目根 apps/launcher-v2/.env；
 *       进程环境变量优先级最高，便于本地联调临时覆盖
 * 说明：读取公开客户端配置（client_id / 端点 / scope）与皮肤上传密钥 MINESKIN_API_KEY
 *       （该密钥按交付要求随包内置，见 scripts/iGM_LauncherV2_SyncUi.ts 的白名单）
 */

// 导入依赖 //
import { readFileSync } from "node:fs";
import { join } from "node:path";

// 类型定义 //
/** 已解析的配置键值集合 */
type iGM_LauncherV2_EnvMap = Map<string, string>;

// 核心逻辑 //

/** 随包分发的公开配置文件名（与 electrobun.config.ts 的 build.copy 目标一致） */
const IGM_LAUNCHERV2_PACKAGED_CONFIG_NAME = "iGM_LauncherV2_Config.env";

/** 候选配置文件（按优先级）：
 *  打包版：Resources/app/bun -> Resources/app/iGM_LauncherV2_Config.env
 *  开发态：apps/shell/src -> apps/launcher-v2/.env */
const IGM_LAUNCHERV2_ENV_CANDIDATES = [
  join(import.meta.dir, "..", IGM_LAUNCHERV2_PACKAGED_CONFIG_NAME),
  join(import.meta.dir, "..", "..", "..", ".env"),
];

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

/** 惰性加载配置；全部候选缺失或不可读时返回空表，不阻断启动 */
function iGM_LauncherV2_EnvLoad(): iGM_LauncherV2_EnvMap {
  if (iGM_LauncherV2_EnvCache) return iGM_LauncherV2_EnvCache;

  const attempted: string[] = [];
  for (const candidate of IGM_LAUNCHERV2_ENV_CANDIDATES) {
    try {
      iGM_LauncherV2_EnvCache = iGM_LauncherV2_EnvParse(readFileSync(candidate, "utf8"));
      return iGM_LauncherV2_EnvCache;
    } catch {
      attempted.push(candidate);
    }
  }

  console.warn(`[iGM CraftCeon Launcher] 未读取到配置文件，已尝试：${attempted.join(" | ")}`);
  iGM_LauncherV2_EnvCache = new Map();
  return iGM_LauncherV2_EnvCache;
}

// 导出 //

/** 读取配置项：进程环境变量优先，其次配置文件；缺失返回 null */
export function iGM_LauncherV2_EnvGet(key: string): string | null {
  const fromProcess = process.env[key]?.trim();
  if (fromProcess) return fromProcess;
  const value = iGM_LauncherV2_EnvLoad().get(key);
  return value && value.length > 0 ? value : null;
}

export default iGM_LauncherV2_EnvGet;
