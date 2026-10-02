/**
 * 文件路径：apps/shell/src/iGM_Launcher_Usage.ts
 * 所属层：桌面外壳 / 主进程服务层
 * 路由：全局（不对外暴露，由 iGM_Launcher_Main 启动）
 * 模块：iGM_Launcher_Usage
 * 作用：记录启动器累计使用时长并定时写盘
 * 内容：数据文件 IGM_LAUNCHER_DATA_ROOT/usage.json，
 *       结构 { firstStartedAt, totalMs, lastTickAt }；
 *       启动时读文件（不存在则以 now 初始化），把 now - lastTickAt 累加进 totalMs
 *       （单次增量夹紧上限 10 分钟，避免长时间关机后跳变），
 *       更新 lastTickAt 并写盘，随后每 60 秒重复一次心跳
 */

// 导入依赖 //
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  IGM_LAUNCHER_DATA_ROOT,
  IGM_LAUNCHER_USAGE_MAX_DELTA_MS,
  IGM_LAUNCHER_USAGE_TICK_MS,
  IGM_LAUNCHER_USAGE_FILE,
  type iGM_Launcher_UsageFile,
} from "@igm-launcher/shared";

// 类型定义 //
/* （iGM_Launcher_UsageFile 结构由共享层提供） */

// 核心逻辑 //

/** usage.json 绝对路径 */
const IGM_LAUNCHER_USAGE_ABSOLUTE = join(IGM_LAUNCHER_DATA_ROOT, IGM_LAUNCHER_USAGE_FILE);

/** 读取使用时长文件，缺失或损坏时以当前时间初始化 */
async function iGM_Launcher_Usage_Read(): Promise<iGM_Launcher_UsageFile> {
  if (existsSync(IGM_LAUNCHER_USAGE_ABSOLUTE)) {
    try {
      const raw = await readFile(IGM_LAUNCHER_USAGE_ABSOLUTE, "utf8");
      const parsed = JSON.parse(raw) as Partial<iGM_Launcher_UsageFile>;
      if (
        typeof parsed.firstStartedAt === "string" &&
        typeof parsed.totalMs === "number" &&
        typeof parsed.lastTickAt === "string"
      ) {
        return {
          firstStartedAt: parsed.firstStartedAt,
          totalMs: parsed.totalMs,
          lastTickAt: parsed.lastTickAt,
        };
      }
    } catch (error) {
      console.warn("[iGM_Launcher_Usage] 读取失败，重新初始化：", IGM_LAUNCHER_USAGE_ABSOLUTE, error);
    }
  }
  const now = new Date().toISOString();
  return { firstStartedAt: now, totalMs: 0, lastTickAt: now };
}

/** 写入使用时长文件 */
async function iGM_Launcher_Usage_Write(file: iGM_Launcher_UsageFile): Promise<void> {
  await mkdir(dirname(IGM_LAUNCHER_USAGE_ABSOLUTE), { recursive: true });
  await writeFile(IGM_LAUNCHER_USAGE_ABSOLUTE, `${JSON.stringify(file, null, 2)}\n`, "utf8");
}

/** 单次心跳：累加自上次心跳以来的时长（夹紧上限）并写盘 */
async function iGM_Launcher_Usage_Tick(): Promise<void> {
  const file = await iGM_Launcher_Usage_Read();
  const now = Date.now();
  const last = Date.parse(file.lastTickAt);
  const delta = Number.isFinite(last) ? now - last : 0;
  const clamped = Math.min(Math.max(delta, 0), IGM_LAUNCHER_USAGE_MAX_DELTA_MS);
  const next: iGM_Launcher_UsageFile = {
    firstStartedAt: file.firstStartedAt,
    totalMs: file.totalMs + clamped,
    lastTickAt: new Date(now).toISOString(),
  };
  await iGM_Launcher_Usage_Write(next);
}

/** 启动标志：保证心跳只注册一次 */
let iGM_Launcher_Usage_Started = false;

/**
 * 启动累计使用时长记录：立即心跳一次，随后每 60 秒重复。
 * 由 iGM_Launcher_Main 的 iGM_Launcher_Bootstrap 调用一次。
 */
export function iGM_Launcher_Usage_Start(): void {
  if (iGM_Launcher_Usage_Started) return;
  iGM_Launcher_Usage_Started = true;
  void iGM_Launcher_Usage_Tick().catch((error) => {
    console.warn("[iGM_Launcher_Usage] 初始心跳失败：", error);
  });
  setInterval(() => {
    void iGM_Launcher_Usage_Tick().catch((error) => {
      console.warn("[iGM_Launcher_Usage] 心跳失败：", error);
    });
  }, IGM_LAUNCHER_USAGE_TICK_MS);
}

// 导出 //
export default iGM_Launcher_Usage_Start;