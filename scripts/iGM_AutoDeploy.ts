/**
 * 文件路径：scripts/iGM_AutoDeploy.ts
 * 所属层：本地运维 / 自动部署脚本层
 * 路由：无（本地 CMD 常驻，或由 Windows 任务计划程序定时调用）
 * 模块：iGM_AutoDeploy
 * 作用：轮询主仓库 main 分支，检测到远端更新后自动拉取代码、安装依赖并重启本地后端
 * 内容：导入依赖 / 类型定义 / 配置与日志 / git 查询与拉取 / 工作区保护 /
 *       后端进程回收与重启 / 健康检查 / 轮询主循环
 *
 * 用法：
 *   bun run scripts/iGM_AutoDeploy.ts              常驻轮询（默认每 5 分钟）
 *   bun run scripts/iGM_AutoDeploy.ts --once       只跑一轮（供 Windows 任务计划程序调用）
 *   bun run scripts/iGM_AutoDeploy.ts --dry-run    只检测不执行（本地验证用）
 *
 * 说明：后端运行在本机 CMD，无公网回调入口，因此采用轮询而非 GitHub Webhook。
 *       因此本方案不需要 deploy-backend.yml：GitHub 无法反向通知本机。
 * 日志：scripts/logs/iGM_AutoDeploy.log
 *       scripts/logs/iGM_Server.out.log / iGM_Server.err.log（后端最近一次启动输出）
 */

// 导入依赖 //
import { appendFileSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

// 类型定义 //
/** 远端相对本地的位置关系 */
type iGM_AutoDeploy_RemoteState = "up-to-date" | "behind" | "ahead" | "diverged" | "unknown";

/** 运行配置 */
interface iGM_AutoDeploy_Config {
  /** 仓库根目录 */
  repoRoot: string;
  /** 远端名 */
  remote: string;
  /** 跟踪分支 */
  branch: string;
  /** 轮询间隔（毫秒） */
  intervalMs: number;
  /** 后端工作目录 */
  serverCwd: string;
  /** 后端启动命令（bun run 的子命令） */
  serverCommand: string;
  /** 需要回收的进程命令行特征 */
  killPatterns: string[];
  /** 重启后端的健康检查地址 */
  healthUrl: string;
  /** 健康检查超时（毫秒） */
  healthTimeoutMs: number;
  /** 是否同时重启 cloudflared 隧道 */
  restartTunnel: boolean;
  /** 隧道名 */
  tunnelName: string;
  /** 只检测不执行 */
  dryRun: boolean;
  /** 只跑一轮 */
  once: boolean;
  /** 日志文件 */
  logFile: string;
}

/** 命令执行结果 */
interface iGM_AutoDeploy_CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

// 核心逻辑 //
/** 脚本所在目录与仓库根目录 */
const iGM_AutoDeploy_ScriptDir = import.meta.dir;
const iGM_AutoDeploy_RepoRoot = dirname(iGM_AutoDeploy_ScriptDir);

/** 默认轮询间隔：5 分钟 */
const iGM_AutoDeploy_DefaultIntervalMs = 5 * 60 * 1000;

/** 读取字符串型环境变量 */
function iGM_AutoDeploy_EnvString(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

/** 读取布尔型环境变量（1/true/yes 视为真） */
function iGM_AutoDeploy_EnvBool(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  return value === "1" || value === "true" || value === "yes";
}

/** 读取数字型环境变量 */
function iGM_AutoDeploy_EnvNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** 解析命令行参数与环境变量，组装运行配置 */
function iGM_AutoDeploy_ReadConfig(argv: string[]): iGM_AutoDeploy_Config {
  const serverCwd = iGM_AutoDeploy_EnvString(
    "IGM_DEPLOY_SERVER_CWD",
    join(iGM_AutoDeploy_RepoRoot, "iGM_Server"),
  );
  return {
    repoRoot: iGM_AutoDeploy_RepoRoot,
    remote: iGM_AutoDeploy_EnvString("IGM_DEPLOY_REMOTE", "origin"),
    branch: iGM_AutoDeploy_EnvString("IGM_DEPLOY_BRANCH", "main"),
    intervalMs: iGM_AutoDeploy_EnvNumber("IGM_DEPLOY_INTERVAL_MS", iGM_AutoDeploy_DefaultIntervalMs),
    serverCwd,
    serverCommand: iGM_AutoDeploy_EnvString("IGM_DEPLOY_SERVER_CMD", "dev"),
    killPatterns: iGM_AutoDeploy_EnvString("IGM_DEPLOY_KILL_PATTERNS", "iGM_ServerMain.ts")
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
    healthUrl: iGM_AutoDeploy_EnvString("IGM_DEPLOY_HEALTH_URL", "http://localhost:3001/G_Api_Health"),
    healthTimeoutMs: iGM_AutoDeploy_EnvNumber("IGM_DEPLOY_HEALTH_TIMEOUT_MS", 30000),
    restartTunnel: iGM_AutoDeploy_EnvBool("IGM_DEPLOY_RESTART_TUNNEL", false),
    tunnelName: iGM_AutoDeploy_EnvString("IGM_DEPLOY_TUNNEL_NAME", "igcraftlit-api"),
    dryRun: argv.includes("--dry-run"),
    once: argv.includes("--once"),
    logFile: join(iGM_AutoDeploy_ScriptDir, "logs", "iGM_AutoDeploy.log"),
  };
}

/** 输出日志：同时写控制台与日志文件 */
function iGM_AutoDeploy_Log(config: iGM_AutoDeploy_Config, message: string): void {
  const line = `[${new Date().toISOString()}] [iGM_AutoDeploy] ${message}`;
  console.log(line);
  try {
    appendFileSync(config.logFile, `${line}\n`, "utf8");
  } catch {
    // 日志落盘失败不影响主流程
  }
}

/** 同步执行命令并回收输出 */
function iGM_AutoDeploy_Run(command: string[], cwd: string): iGM_AutoDeploy_CommandResult {
  const proc = Bun.spawnSync(command, { cwd, stdout: "pipe", stderr: "pipe" });
  return {
    code: proc.exitCode ?? -1,
    stdout: proc.stdout.toString().trim(),
    stderr: proc.stderr.toString().trim(),
  };
}

/** 执行 git 子命令 */
function iGM_AutoDeploy_Git(config: iGM_AutoDeploy_Config, args: string[]): iGM_AutoDeploy_CommandResult {
  return iGM_AutoDeploy_Run(["git", ...args], config.repoRoot);
}

/** 查询远端相对本地的位置关系 */
function iGM_AutoDeploy_CheckRemote(config: iGM_AutoDeploy_Config): {
  state: iGM_AutoDeploy_RemoteState;
  localHead: string;
  remoteHead: string;
} {
  const fetch = iGM_AutoDeploy_Git(config, ["fetch", config.remote, config.branch, "--quiet"]);
  if (fetch.code !== 0) {
    iGM_AutoDeploy_Log(config, `git fetch 失败：${fetch.stderr || fetch.stdout}`);
    return { state: "unknown", localHead: "", remoteHead: "" };
  }

  const localHead = iGM_AutoDeploy_Git(config, ["rev-parse", "HEAD"]).stdout;
  const remoteHead = iGM_AutoDeploy_Git(config, ["rev-parse", "FETCH_HEAD"]).stdout;
  if (!localHead || !remoteHead) {
    return { state: "unknown", localHead, remoteHead };
  }
  if (localHead === remoteHead) {
    return { state: "up-to-date", localHead, remoteHead };
  }

  // 本地为远端的祖先：可直接快进拉取
  const ancestor = iGM_AutoDeploy_Git(config, ["merge-base", "--is-ancestor", localHead, remoteHead]);
  if (ancestor.code === 0) {
    return { state: "behind", localHead, remoteHead };
  }

  // 远端为本地祖先：本地存在未推送提交，无需拉取
  const descendant = iGM_AutoDeploy_Git(config, ["merge-base", "--is-ancestor", remoteHead, localHead]);
  return { state: descendant.code === 0 ? "ahead" : "diverged", localHead, remoteHead };
}

/** 脚本自身日志目录相对仓库根的路径，需从脏工作区判定中排除，避免自我阻塞 */
function iGM_AutoDeploy_LogDirRelative(config: iGM_AutoDeploy_Config): string {
  return `${relative(config.repoRoot, dirname(config.logFile)).split(sep).join("/")}/`;
}

/** 工作区是否干净：脏工作区禁止自动拉取，避免覆盖本地未提交改动 */
function iGM_AutoDeploy_HasLocalChanges(config: iGM_AutoDeploy_Config): boolean {
  const status = iGM_AutoDeploy_Git(config, ["status", "--porcelain"]);
  if (status.code !== 0) return false;
  const logDir = iGM_AutoDeploy_LogDirRelative(config);
  return status.stdout
    .split(/\r?\n/)
    .map((line) => line.slice(3).trim().replace(/^"|"$/g, ""))
    .some((path) => path.length > 0 && !path.startsWith(logDir));
}

/** 拉取远端最新代码（仅快进） */
function iGM_AutoDeploy_Pull(config: iGM_AutoDeploy_Config): boolean {
  const pull = iGM_AutoDeploy_Git(config, ["pull", "--ff-only", config.remote, config.branch]);
  if (pull.code !== 0) {
    iGM_AutoDeploy_Log(config, `git pull 失败：${pull.stderr || pull.stdout}`);
    return false;
  }
  iGM_AutoDeploy_Log(config, `git pull 完成：${pull.stdout.split("\n")[0] || "已更新"}`);
  return true;
}

/** 安装依赖 */
function iGM_AutoDeploy_Install(config: iGM_AutoDeploy_Config): boolean {
  const install = iGM_AutoDeploy_Run(["bun", "install"], config.repoRoot);
  if (install.code !== 0) {
    iGM_AutoDeploy_Log(config, `bun install 失败：${install.stderr || install.stdout}`);
    return false;
  }
  iGM_AutoDeploy_Log(config, "bun install 完成");
  return true;
}

/** 通过 PowerShell 按命令行特征查找进程号 */
function iGM_AutoDeploy_FindProcessIds(config: iGM_AutoDeploy_Config, processName: string, patterns: string[]): number[] {
  if (process.platform !== "win32" || patterns.length === 0) return [];
  const conditions = patterns.map((item) => `$_.CommandLine -like '*${item}*'`).join(" -or ");
  const script =
    `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq '${processName}' -and (${conditions}) } ` +
    `| Select-Object -ExpandProperty ProcessId`;
  const result = iGM_AutoDeploy_Run(["powershell", "-NoProfile", "-NonInteractive", "-Command", script], config.repoRoot);
  if (result.code !== 0) return [];
  return result.stdout
    .split(/\r?\n/)
    .map((line) => Number(line.trim()))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
}

/** 结束指定进程及其子进程树，返回是否确有进程被结束 */
function iGM_AutoDeploy_KillTree(config: iGM_AutoDeploy_Config, pid: number): boolean {
  const result = iGM_AutoDeploy_Run(["taskkill", "/F", "/T", "/PID", String(pid)], config.repoRoot);
  return result.code === 0;
}

/** 后端进程号记录文件：bun run 会派生 wrapper 与子进程，需按记录的 PID 整树回收 */
function iGM_AutoDeploy_ServerPidFile(config: iGM_AutoDeploy_Config): string {
  return join(dirname(config.logFile), "iGM_Server.pid");
}

/** 回收正在运行的后端进程（含子进程树） */
function iGM_AutoDeploy_KillBackend(config: iGM_AutoDeploy_Config): number {
  const killed = new Set<number>();

  // 优先按上次记录的 PID 整树回收，覆盖 bun run wrapper 及其子进程
  const pidFile = iGM_AutoDeploy_ServerPidFile(config);
  if (existsSync(pidFile)) {
    const recorded = Number(readFileSync(pidFile, "utf8").trim());
    if (Number.isInteger(recorded) && recorded > 0 && iGM_AutoDeploy_KillTree(config, recorded)) {
      iGM_AutoDeploy_Log(config, `已结束后端进程树 PID=${recorded}`);
      killed.add(recorded);
    }
  }

  // 兜底：按命令行特征回收手工启动的后端进程
  for (const pid of iGM_AutoDeploy_FindProcessIds(config, "bun.exe", config.killPatterns)) {
    if (killed.has(pid)) continue;
    if (iGM_AutoDeploy_KillTree(config, pid)) {
      iGM_AutoDeploy_Log(config, `已结束后端进程 PID=${pid}`);
      killed.add(pid);
    }
  }
  return killed.size;
}

/** 以隐藏窗口的独立进程启动命令，避免子进程随本脚本退出而终止
 *  说明：Bun.spawn 的子进程会附着在本脚本的控制台上，脚本退出（如任务计划程序跑完 --once）
 *        时控制台关闭会连带结束子进程，因此 Windows 下改用 Start-Process 创建独立进程。 */
function iGM_AutoDeploy_StartDetached(
  config: iGM_AutoDeploy_Config,
  filePath: string,
  args: string[],
  cwd: string,
  outLog: string,
  errLog: string,
): number | null {
  if (process.platform !== "win32") {
    const logFd = openSync(config.logFile, "a");
    const proc = Bun.spawn([filePath, ...args], { cwd, stdio: ["ignore", logFd, logFd], env: { ...process.env } });
    proc.unref();
    return proc.pid ?? null;
  }

  const argList = args.map((item) => `'${item}'`).join(",");
  const script =
    `$p = Start-Process -FilePath '${filePath}' -ArgumentList @(${argList}) ` +
    `-WorkingDirectory '${cwd}' -WindowStyle Hidden -PassThru ` +
    `-RedirectStandardOutput '${outLog}' -RedirectStandardError '${errLog}'; Write-Output $p.Id`;
  const result = iGM_AutoDeploy_Run(["powershell", "-NoProfile", "-NonInteractive", "-Command", script], config.repoRoot);
  const pid = Number(result.stdout.trim());
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

/** 启动后端：输出重定向到独立日志文件（每次重启覆盖，便于查看最近一次启动输出） */
function iGM_AutoDeploy_StartBackend(config: iGM_AutoDeploy_Config): number | null {
  const logDir = dirname(config.logFile);
  const pid = iGM_AutoDeploy_StartDetached(
    config,
    process.execPath,
    ["run", config.serverCommand],
    config.serverCwd,
    join(logDir, "iGM_Server.out.log"),
    join(logDir, "iGM_Server.err.log"),
  );
  if (pid) {
    writeFileSync(iGM_AutoDeploy_ServerPidFile(config), String(pid), "utf8");
  }
  return pid;
}

/** 等待后端健康检查通过 */
async function iGM_AutoDeploy_WaitHealthy(config: iGM_AutoDeploy_Config): Promise<boolean> {
  const deadline = Date.now() + config.healthTimeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(config.healthUrl, { signal: AbortSignal.timeout(3000) });
      if (response.ok) return true;
    } catch {
      // 后端尚未就绪，继续等待
    }
    await Bun.sleep(1000);
  }
  return false;
}

/** 重启 cloudflared 隧道，重建到本机后端的连接池 */
function iGM_AutoDeploy_RestartTunnel(config: iGM_AutoDeploy_Config): void {
  const executable = Bun.which("cloudflared");
  if (!executable) {
    iGM_AutoDeploy_Log(config, "未找到 cloudflared 可执行文件，跳过隧道重启");
    return;
  }
  const pids = iGM_AutoDeploy_FindProcessIds(config, "cloudflared.exe", ["tunnel"]);
  for (const pid of pids) {
    iGM_AutoDeploy_Run(["taskkill", "/F", "/T", "/PID", String(pid)], config.repoRoot);
  }
  iGM_AutoDeploy_Log(config, `已结束 cloudflared 进程 ${pids.length} 个，准备重启隧道 ${config.tunnelName}`);
  const logDir = dirname(config.logFile);
  const pid = iGM_AutoDeploy_StartDetached(
    config,
    executable,
    ["tunnel", "run", config.tunnelName, "--protocol", "http2"],
    config.repoRoot,
    join(logDir, "iGM_Cloudflared.out.log"),
    join(logDir, "iGM_Cloudflared.err.log"),
  );
  iGM_AutoDeploy_Log(config, `cloudflared 隧道已拉起 PID=${pid ?? "未知"}`);
}

/** 执行一轮检测与部署 */
async function iGM_AutoDeploy_RunOnce(config: iGM_AutoDeploy_Config): Promise<void> {
  if (iGM_AutoDeploy_HasLocalChanges(config)) {
    iGM_AutoDeploy_Log(config, "本地存在未提交改动，跳过本轮自动部署（保护本地工作区）");
    return;
  }

  const { state, localHead, remoteHead } = iGM_AutoDeploy_CheckRemote(config);
  if (state === "up-to-date") {
    iGM_AutoDeploy_Log(config, `无更新（${config.remote}/${config.branch} @ ${localHead.slice(0, 7)}）`);
    return;
  }
  if (state === "ahead") {
    iGM_AutoDeploy_Log(config, `本地领先远端（存在未推送提交），无需拉取：本地 ${localHead.slice(0, 7)} / 远端 ${remoteHead.slice(0, 7)}`);
    return;
  }
  if (state === "diverged") {
    iGM_AutoDeploy_Log(config, `本地与远端已分叉，跳过自动部署（需人工处理）：本地 ${localHead.slice(0, 7)} / 远端 ${remoteHead.slice(0, 7)}`);
    return;
  }
  if (state === "unknown") {
    iGM_AutoDeploy_Log(config, "无法确定远端状态，跳过本轮");
    return;
  }

  iGM_AutoDeploy_Log(config, `检测到远端更新：${localHead.slice(0, 7)} → ${remoteHead.slice(0, 7)}`);
  if (config.dryRun) {
    iGM_AutoDeploy_Log(config, "[dry-run] 将执行：git pull → bun install → 重启后端");
    return;
  }

  if (!iGM_AutoDeploy_Pull(config)) return;
  if (!iGM_AutoDeploy_Install(config)) return;

  iGM_AutoDeploy_KillBackend(config);
  const pid = iGM_AutoDeploy_StartBackend(config);
  iGM_AutoDeploy_Log(config, `后端已重启 PID=${pid ?? "未知"}（命令：bun run ${config.serverCommand}，目录：${config.serverCwd}）`);

  const healthy = await iGM_AutoDeploy_WaitHealthy(config);
  iGM_AutoDeploy_Log(config, healthy ? `健康检查通过：${config.healthUrl}` : `健康检查超时：${config.healthUrl}`);

  if (config.restartTunnel) {
    iGM_AutoDeploy_RestartTunnel(config);
  }
}

/** 主流程：单轮或常驻轮询 */
async function iGM_AutoDeploy_Main(): Promise<void> {
  const config = iGM_AutoDeploy_ReadConfig(process.argv.slice(2));
  mkdirSync(dirname(config.logFile), { recursive: true });

  iGM_AutoDeploy_Log(
    config,
    `启动：仓库 ${config.repoRoot}，跟踪 ${config.remote}/${config.branch}，间隔 ${config.intervalMs}ms，` +
      `模式 ${config.once ? "单轮" : "常驻"}${config.dryRun ? "（dry-run）" : ""}`,
  );

  if (config.once) {
    await iGM_AutoDeploy_RunOnce(config);
    return;
  }

  // 常驻模式：Ctrl+C 后正常退出
  let stopped = false;
  process.on("SIGINT", () => {
    stopped = true;
  });
  while (!stopped) {
    await iGM_AutoDeploy_RunOnce(config);
    await Bun.sleep(config.intervalMs);
  }
  iGM_AutoDeploy_Log(config, "已停止");
}

// 导出 //
/* 本脚本为直接执行的入口脚本，不对外导出符号 */

await iGM_AutoDeploy_Main();