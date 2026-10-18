/**
 * 文件路径：scripts/iGM_RestartBackend.ts
 * 所属层：根目录脚本 / 运维层
 * 路由：无（命令行脚本）
 * 模块：iGM_RestartBackend
 * 作用：强制结束占用后端端口的进程，并以开发模式重新拉起后端服务
 * 内容：按端口（默认 3001，可用 IGM_BACKEND_PORT 覆盖）定位监听进程后 /F 结束；
 *       随后在 iGM_Server 目录执行 bun run dev（--watch），
 *       确保 OAuth 等最新改动立即生效并在后续改动时自动重载
 * 说明：仅结束监听目标端口的进程，不使用 taskkill /IM bun.exe，
 *       避免误杀启动器构建、其他脚本等无关 Bun 进程
 * 用法：bun run scripts/iGM_RestartBackend.ts
 */

// 导入依赖 //
import { join } from "node:path";

// 类型定义 //

/** 单次结束结果 */
interface iGM_RestartBackend_KillResult {
  pid: number;
  ok: boolean;
}

// 核心逻辑 //

/** 后端监听端口（可用环境变量覆盖） */
const IGM_RESTART_BACKEND_PORT = Number(process.env.IGM_BACKEND_PORT ?? 3001);

/** 后端工程目录 */
const IGM_RESTART_BACKEND_ROOT = join(import.meta.dir, "..", "iGM_Server");

/** 解码子进程输出 */
function iGM_RestartBackend_Decode(value: Uint8Array | undefined): string {
  return value ? new TextDecoder().decode(value) : "";
}

/**
 * 查询监听目标端口的进程号。
 * Windows 走 netstat -ano，按「本地地址以 :端口 结尾」且状态为 LISTENING 的行取末列 PID；
 * 其它平台走 lsof -ti 直接取 PID 列表。
 */
function iGM_RestartBackend_FindListeners(port: number): number[] {
  const pids = new Set<number>();

  if (process.platform === "win32") {
    const result = Bun.spawnSync(["netstat", "-ano", "-p", "TCP"]);
    for (const line of iGM_RestartBackend_Decode(result.stdout).split(/\r?\n/)) {
      const cols = line.trim().split(/\s+/);
      // 形如：TCP  0.0.0.0:3001  0.0.0.0:0  LISTENING  30104
      if (
        cols.length >= 5 &&
        cols[0] === "TCP" &&
        cols[1]?.endsWith(`:${port}`) &&
        cols[3] === "LISTENING"
      ) {
        const pid = Number(cols[4]);
        if (Number.isInteger(pid) && pid > 0) pids.add(pid);
      }
    }
    return [...pids];
  }

  const result = Bun.spawnSync(["lsof", "-ti", `tcp:${port}`]);
  for (const token of iGM_RestartBackend_Decode(result.stdout).split(/\s+/)) {
    const pid = Number(token);
    if (Number.isInteger(pid) && pid > 0) pids.add(pid);
  }
  return [...pids];
}

/** 强制结束一组进程号；跳过脚本自身，绝不批量杀 bun.exe */
function iGM_RestartBackend_Kill(pids: number[]): iGM_RestartBackend_KillResult[] {
  const results: iGM_RestartBackend_KillResult[] = [];

  for (const pid of pids) {
    if (pid === process.pid) continue;

    const command =
      process.platform === "win32"
        ? ["taskkill", "/F", "/PID", String(pid)]
        : ["kill", "-9", String(pid)];
    const result = Bun.spawnSync(command);
    results.push({ pid, ok: result.exitCode === 0 });
  }

  return results;
}

/** 主流程：结束旧进程 -> 等待端口释放 -> 以开发模式拉起后端并保持前台运行 */
async function iGM_RestartBackend_Main(): Promise<void> {
  console.log(`[iGM RestartBackend] 目标端口：${IGM_RESTART_BACKEND_PORT}`);
  console.log(`[iGM RestartBackend] 后端目录：${IGM_RESTART_BACKEND_ROOT}`);

  const listeners = iGM_RestartBackend_FindListeners(IGM_RESTART_BACKEND_PORT);
  if (listeners.length === 0) {
    console.log("[iGM RestartBackend] 端口当前无监听进程，直接启动后端。");
  } else {
    console.log(`[iGM RestartBackend] 结束占用进程：${listeners.join(", ")}`);
    for (const item of iGM_RestartBackend_Kill(listeners)) {
      console.log(
        `[iGM RestartBackend] PID ${item.pid} ${item.ok ? "已结束" : "结束失败（可能已退出）"}`,
      );
    }
  }

  // 等待端口释放，避免新进程因端口占用启动失败
  for (let i = 0; i < 20; i += 1) {
    if (iGM_RestartBackend_FindListeners(IGM_RESTART_BACKEND_PORT).length === 0) break;
    await Bun.sleep(250);
  }

  console.log("[iGM RestartBackend] 以开发模式（--watch）启动后端…");
  const child = Bun.spawn(["bun", "run", "dev"], {
    cwd: IGM_RESTART_BACKEND_ROOT,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "ignore",
  });

  process.on("exit", () => {
    try {
      child.kill();
    } catch {
      /* 子进程可能已退出，忽略 */
    }
  });

  // 保持前台运行，直到后端进程结束
  await child.exited;
  console.log(`[iGM RestartBackend] 后端进程已退出（exit code ${child.exitCode}）。`);
}

// 导出 //
await iGM_RestartBackend_Main();
