/**
 * 文件路径：apps/shell/src/iGM_LauncherV2_Core.ts
 * 所属层：桌面外壳 / 原生核心桥接层
 * 路由：全局
 * 模块：iGM_LauncherV2_Core
 * 作用：与 Rust 核心（crates/core，Tokio）以 Stdio JSON 通信的 Sidecar 客户端
 * 内容：定位 igm_core 可执行文件（环境变量 -> 开发构建产物 -> 打包资源目录）；
 *       Bun.spawn 拉起进程，逐行读取标准输出并按行写回请求；
 *       模块一仅实现 {"cmd":"ping"} -> {"status":"ok"} 的连通性验证；
 *       进程退出或启动失败一律如实上报不可用，并给出已搜索的候选路径便于排查
 */

// 导入依赖 //
import { existsSync } from "node:fs";
import { join } from "node:path";
import { IGM_LAUNCHERV2_CORE_PING_TIMEOUT_MS } from "./iGM_LauncherV2_Constants";
import type { iGM_LauncherV2_InboundMessage } from "./iGM_LauncherV2_Ipc";

// 类型定义 //

/** Rust 核心连通性结果 */
export interface iGM_LauncherV2_CoreStatus {
  state: "ok" | "unavailable";
  detail: string;
  version: string;
}

/** 一次待回应的请求 */
interface iGM_LauncherV2_CoreRequest {
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Rust 侧回包结构（模块一仅用 status / version） */
interface iGM_LauncherV2_CoreReply {
  status?: string;
  version?: string;
  message?: string;
  [key: string]: unknown;
}

// 核心逻辑 //

/** 可执行文件名（Windows 带 .exe 后缀） */
const IGM_LAUNCHERV2_CORE_BINARY = process.platform === "win32" ? "igm_core.exe" : "igm_core";

/** 项目根目录：apps/shell/src -> apps/shell -> apps -> apps/launcher-v2 */
const IGM_LAUNCHERV2_PROJECT_ROOT = join(import.meta.dir, "..", "..", "..");

/** 已拉起的核心进程 */
let iGM_LauncherV2_CoreProcess: Bun.Subprocess<"pipe", "pipe", "pipe"> | null = null;

/** 等待回包的请求队列（按发出顺序配对，模块一为单请求场景） */
const iGM_LauncherV2_CorePending: iGM_LauncherV2_CoreRequest[] = [];

/** 标准输出按行累积的缓冲区 */
let iGM_LauncherV2_CoreBuffer = "";

/** 核心标准错误输出（失败时并入提示信息） */
let iGM_LauncherV2_CoreStderr = "";

/** 核心进程是否已退出 */
let iGM_LauncherV2_CoreExited = false;

/** 候选可执行文件路径（按优先级排列，便于日志与排查） */
function iGM_LauncherV2_CoreCandidates(): string[] {
  const fromEnv = process.env.IGM_CORE_PATH?.trim();
  const candidates = [
    fromEnv,
    // 开发构建产物（cargo build --release / cargo build）
    join(IGM_LAUNCHERV2_PROJECT_ROOT, "crates", "core", "target", "release", IGM_LAUNCHERV2_CORE_BINARY),
    join(IGM_LAUNCHERV2_PROJECT_ROOT, "crates", "core", "target", "debug", IGM_LAUNCHERV2_CORE_BINARY),
    // 同步脚本产出的打包资源目录（Electrobun build.copy 映射为包内 core 目录）
    join(import.meta.dir, "..", "iGM_LauncherV2_Assets", "core", IGM_LAUNCHERV2_CORE_BINARY),
    // 打包后运行的工作目录兜底（最终包内路径待打包模块确认）
    join(process.cwd(), "core", IGM_LAUNCHERV2_CORE_BINARY),
  ].filter((value): value is string => Boolean(value));
  return candidates;
}

/** 解析可执行文件绝对路径；未找到返回 null */
export function iGM_LauncherV2_CoreResolvePath(): string | null {
  for (const candidate of iGM_LauncherV2_CoreCandidates()) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** 交付一条回包：按队列顺序交给最早等待的请求 */
function iGM_LauncherV2_CoreDispatch(line: string): void {
  const request = iGM_LauncherV2_CorePending.shift();
  if (!request) return;
  clearTimeout(request.timer);

  let parsed: iGM_LauncherV2_CoreReply;
  try {
    parsed = JSON.parse(line) as iGM_LauncherV2_CoreReply;
  } catch (error) {
    request.reject(new Error(`核心回包不是合法 JSON：${line.slice(0, 200)}`));
    return;
  }
  request.resolve(parsed);
}

/** 拒绝全部在途请求（进程退出或启动失败时） */
function iGM_LauncherV2_CoreRejectAll(error: Error): void {
  while (iGM_LauncherV2_CorePending.length > 0) {
    const request = iGM_LauncherV2_CorePending.shift();
    if (!request) break;
    clearTimeout(request.timer);
    request.reject(error);
  }
}

/** 持续读取标准输出并按行分发；同时收集标准错误用于诊断 */
async function iGM_LauncherV2_CorePump(
  process: Bun.Subprocess<"pipe", "pipe", "pipe">,
): Promise<void> {
  const decoder = new TextDecoder();

  /** 逐块读取标准输出，整流成行后分发 */
  const readStdout = async (): Promise<void> => {
    const reader = process.stdout.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        iGM_LauncherV2_CoreBuffer += decoder.decode(value, { stream: true });

        let index = iGM_LauncherV2_CoreBuffer.indexOf("\n");
        while (index >= 0) {
          const line = iGM_LauncherV2_CoreBuffer.slice(0, index).trim();
          iGM_LauncherV2_CoreBuffer = iGM_LauncherV2_CoreBuffer.slice(index + 1);
          if (line) iGM_LauncherV2_CoreDispatch(line);
          index = iGM_LauncherV2_CoreBuffer.indexOf("\n");
        }
      }
    } finally {
      reader.releaseLock();
    }
  };

  /** 收集标准错误输出，仅用于失败诊断 */
  const readStderr = async (): Promise<void> => {
    const reader = process.stderr.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        iGM_LauncherV2_CoreStderr += decoder.decode(value, { stream: true });
      }
    } finally {
      reader.releaseLock();
    }
  };

  await Promise.allSettled([readStdout(), readStderr()]);
}

/** 拉起核心进程；失败时返回可读原因 */
async function iGM_LauncherV2_CoreEnsure(): Promise<{ ok: true } | { ok: false; detail: string }> {
  if (iGM_LauncherV2_CoreProcess && !iGM_LauncherV2_CoreExited) return { ok: true };

  const binary = iGM_LauncherV2_CoreResolvePath();
  if (!binary) {
    return {
      ok: false,
      detail: `未找到 igm_core 可执行文件，已搜索：${iGM_LauncherV2_CoreCandidates().join(" | ")}`,
    };
  }

  try {
    const process = Bun.spawn([binary], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    iGM_LauncherV2_CoreProcess = process;
    iGM_LauncherV2_CoreExited = false;
    iGM_LauncherV2_CoreBuffer = "";
    iGM_LauncherV2_CoreStderr = "";

    void iGM_LauncherV2_CorePump(process);

    process.exited.then((code) => {
      iGM_LauncherV2_CoreExited = true;
      iGM_LauncherV2_CoreProcess = null;
      const detail = iGM_LauncherV2_CoreStderr.trim();
      iGM_LauncherV2_CoreRejectAll(
        new Error(`核心进程已退出（退出码 ${code}）${detail ? `：${detail}` : ""}`),
      );
      console.warn(`[iGM CraftCeon Launcher] Rust 核心进程退出，退出码 ${code}`);
    });

    console.log(`[iGM CraftCeon Launcher] Rust 核心已拉起：${binary}`);
    return { ok: true };
  } catch (error) {
    iGM_LauncherV2_CoreProcess = null;
    return {
      ok: false,
      detail: `无法启动核心进程：${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** 发送一条指令并等待回包 */
function iGM_LauncherV2_CoreRequest(
  command: Record<string, unknown>,
  timeoutMs: number,
): Promise<iGM_LauncherV2_CoreReply> {
  const process = iGM_LauncherV2_CoreProcess;
  if (!process) return Promise.reject(new Error("核心进程未运行"));

  return new Promise<iGM_LauncherV2_CoreReply>((resolve, reject) => {
    const timer = setTimeout(() => {
      const index = iGM_LauncherV2_CorePending.findIndex((item) => item.timer === timer);
      if (index >= 0) iGM_LauncherV2_CorePending.splice(index, 1);
      reject(new Error(`核心响应超时（${timeoutMs}ms）`));
    }, timeoutMs);

    iGM_LauncherV2_CorePending.push({ resolve, reject, timer });

    try {
      process.stdin.write(`${JSON.stringify(command)}\n`);
      void process.stdin.flush();
    } catch (error) {
      clearTimeout(timer);
      const index = iGM_LauncherV2_CorePending.findIndex((item) => item.timer === timer);
      if (index >= 0) iGM_LauncherV2_CorePending.splice(index, 1);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

// 导出 //

/**
 * 连通性验证：向核心发送 {"cmd":"ping"}，期望收到 {"status":"ok"}。
 * 失败不抛出异常，而是以不可用状态与原因返回，供界面如实展示。
 */
export async function iGM_LauncherV2_Core_Ping(): Promise<iGM_LauncherV2_CoreStatus> {
  const ensured = await iGM_LauncherV2_CoreEnsure();
  if (!ensured.ok) return { state: "unavailable", detail: ensured.detail, version: "" };

  try {
    const reply = await iGM_LauncherV2_CoreRequest(
      { cmd: "ping" },
      IGM_LAUNCHERV2_CORE_PING_TIMEOUT_MS,
    );
    if (reply.status === "ok") {
      return { state: "ok", detail: "", version: String(reply.version ?? "") };
    }
    return {
      state: "unavailable",
      detail: `核心返回异常：${JSON.stringify(reply).slice(0, 200)}`,
      version: "",
    };
  } catch (error) {
    return {
      state: "unavailable",
      detail: error instanceof Error ? error.message : "核心通信失败",
      version: "",
    };
  }
}

/** 连通性结果转回推消息 */
export function iGM_LauncherV2_Core_ToMessage(
  status: iGM_LauncherV2_CoreStatus,
): iGM_LauncherV2_InboundMessage {
  return {
    type: "core:status",
    state: status.state,
    detail: status.detail,
    version: status.version,
  };
}

/** 退出前优雅关闭核心进程 */
export function iGM_LauncherV2_Core_Dispose(): void {
  const process = iGM_LauncherV2_CoreProcess;
  iGM_LauncherV2_CoreProcess = null;
  if (!process) return;
  try {
    process.stdin.write(`${JSON.stringify({ cmd: "shutdown" })}\n`);
    void process.stdin.flush();
    process.stdin.end();
  } catch {
    // 写入失败说明进程已退出，直接进入下面的强制回收
  }
  setTimeout(() => {
    if (!iGM_LauncherV2_CoreExited) process.kill();
  }, 300);
}
