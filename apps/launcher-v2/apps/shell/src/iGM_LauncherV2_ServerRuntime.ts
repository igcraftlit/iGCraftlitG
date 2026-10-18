/**
 * 文件路径：apps/shell/src/iGM_LauncherV2_ServerRuntime.ts
 * 所属层：桌面外壳 / 本地开服运行层
 * 路由：全局
 * 模块：iGM_LauncherV2_ServerRuntime
 * 作用：本地服务器（servers/<id>）的进程启停、实时日志、就绪检测与客户端清单局域网直链发布
 * 内容：以 Java 拉起服务器目录内的核心产物——Vanilla / Paper 直接 java -jar <jar> nogui，
 *       Fabric / Forge / NeoForge 优先执行目录内生成的启动脚本（run.bat / start.bat 等），无脚本时回退 jar；
 *       进程 stdout / stderr 逐行接管，写入每台上限 500 行的环形缓冲并经 server:log 实时回推；
 *       stdout 命中 Done ( 即判定就绪，解析 server.properties 的监听端口并用 node:os 取本机局域网 IPv4，
 *       置 state 为 ready 并经 server:runtime 回推；启动期间为 starting，退出为 stopped，启动失败为 error；
 *       就绪即在方块广场「客户端同步大厅」自动写入一条局域网记录（局域网 IP + 监听端口）；
 *       停止先向 stdin 写入 stop（jar 型服务端优雅停机），超时后 Windows 经 taskkill /T /F 强杀进程树；
 *       发布时用 Bun.serve 在局域网暴露服务器目录内的 manifest.json 与客户端 ZIP（仅两个产物，拒绝路径穿越），
 *       端口优先取服务端端口，被占用则退化为随机端口，并把直链回填到方块广场「客户端同步大厅」记录；
 *       状态提示一律使用多语言键 messageKey（外壳不产生中文文案），仅发布结论文案为中文可读字符串
 * 说明：进程句柄保存在模块级 Map（id -> 记录），重复启动同一 id 直接返回；进程退出时清理句柄
 */

// 导入依赖 //
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import type {
  iGM_LauncherV2_InboundMessage,
  iGM_LauncherV2_ServerLogEntry,
  iGM_LauncherV2_ServerRuntime,
  iGM_LauncherV2_ServerRunState,
} from "./iGM_LauncherV2_Ipc";
import { iGM_LauncherV2_Java_List } from "./iGM_LauncherV2_Java";
import { iGM_LauncherV2_LocalServers_Find } from "./iGM_LauncherV2_LocalServers";
import { iGM_LauncherV2_Servers_Add, iGM_LauncherV2_Servers_List } from "./iGM_LauncherV2_Servers";

// 类型定义 //

/** 运行状态回推回调（外壳经契约层回推，供主进程注入 webview 推送） */
export type iGM_LauncherV2_ServerRuntimePush = (message: iGM_LauncherV2_InboundMessage) => void;

/** 模块级运行记录 */
interface iGM_LauncherV2_ServerRuntimeRecord {
  /** 当前运行状态快照 */
  runtime: iGM_LauncherV2_ServerRuntime;
  /** 进程句柄；未运行时为 null */
  proc: ReturnType<typeof Bun.spawn> | null;
  /** 启动 / 停止时注入的回推函数 */
  push: iGM_LauncherV2_ServerRuntimePush;
  /** 是否由用户主动请求停止（用于退出时区分 stopped / error） */
  stopping: boolean;
}

// 核心逻辑 //

/** 日志环形缓冲上限（每台服务器） */
const IGM_LAUNCHERV2_SERVER_LOG_LIMIT = 500;

/** 默认服务端监听端口 */
const IGM_LAUNCHERV2_SERVERRUNTIME_DEFAULT_PORT = 25565;

/** 优雅停止等待上限（毫秒）：超时后强杀进程树 */
const IGM_LAUNCHERV2_SERVERRUNTIME_STOP_GRACE_MS = 15000;

/** 运行中 / 停止中状态集合（用于判定是否已在运行，避免重复拉起） */
const IGM_LAUNCHERV2_SERVERRUNTIME_ACTIVE_STATES: iGM_LauncherV2_ServerRunState[] = [
  "starting",
  "ready",
  "stopping",
];

/** 模块级运行记录表（id -> 记录） */
const iGM_LauncherV2_ServerRuntimeRecords = new Map<string, iGM_LauncherV2_ServerRuntimeRecord>();

/** 模块级日志缓冲表（id -> 环形缓冲） */
const iGM_LauncherV2_ServerRuntimeLogs = new Map<string, iGM_LauncherV2_ServerLogEntry[]>();

/** 模块级局域网静态服务表（id -> 已发布的服务） */
const iGM_LauncherV2_ServerRuntimePublish = new Map<
  string,
  { server: ReturnType<typeof Bun.serve>; port: number; url: string }
>();

/** 取本机局域网 IPv4（取第一个非内部地址；全部缺失时回退回环地址） */
function iGM_ServerRuntimeLanIp(): string {
  const nets = networkInterfaces();
  for (const list of Object.values(nets)) {
    for (const info of list ?? []) {
      if (!info.internal && String(info.family) === "IPv4" && info.address) return info.address;
    }
  }
  return "127.0.0.1";
}

/** 读取 server.properties 中的监听端口；缺失或非法时回退默认端口 */
async function iGM_ServerRuntimeReadPort(dir: string): Promise<number> {
  try {
    const text = await readFile(join(dir, "server.properties"), "utf8");
    const matched = /^\s*server-port\s*=\s*(\d+)\s*$/m.exec(text);
    if (matched) {
      const port = Number.parseInt(matched[1], 10);
      if (port >= 1 && port <= 65535) return port;
    }
  } catch {
    // 配置文件缺失时回退默认端口
  }
  return IGM_LAUNCHERV2_SERVERRUNTIME_DEFAULT_PORT;
}

/** 追加一条日志并回推：写环形缓冲（上限 500 行）后经 server:log 推送 */
function iGM_ServerRuntimeLog(
  id: string,
  push: iGM_LauncherV2_ServerRuntimePush | null,
  stream: iGM_LauncherV2_ServerLogEntry["stream"],
  level: iGM_LauncherV2_ServerLogEntry["level"],
  line: string,
): void {
  const text = line.replace(/\s+$/u, "");
  if (!text.trim()) return;

  const entry: iGM_LauncherV2_ServerLogEntry = {
    time: Date.now(),
    stream,
    level,
    line: text,
  };

  let buffer = iGM_LauncherV2_ServerRuntimeLogs.get(id);
  if (!buffer) {
    buffer = [];
    iGM_LauncherV2_ServerRuntimeLogs.set(id, buffer);
  }
  buffer.push(entry);
  if (buffer.length > IGM_LAUNCHERV2_SERVER_LOG_LIMIT) {
    buffer.splice(0, buffer.length - IGM_LAUNCHERV2_SERVER_LOG_LIMIT);
  }

  try {
    push?.({ type: "server:log", id, entry });
  } catch {
    // 界面通道异常不影响进程运行
  }
}

/** 更新运行状态并经 server:runtime 回推 */
function iGM_ServerRuntimeUpdate(
  id: string,
  patch: Partial<iGM_LauncherV2_ServerRuntime>,
  push: iGM_LauncherV2_ServerRuntimePush,
): void {
  const record = iGM_LauncherV2_ServerRuntimeRecords.get(id);
  if (!record) return;
  record.runtime = { ...record.runtime, ...patch };
  try {
    push({ type: "server:runtime", runtime: { ...record.runtime } });
  } catch {
    // 界面通道异常不影响进程运行
  }
}

/** 持续读取子进程的一条输出流并按行记录；onLine 用于就绪检测 */
async function iGM_ServerRuntimePump(
  id: string,
  stream: ReadableStream<Uint8Array> | number | null | undefined,
  kind: "stdout" | "stderr",
  push: iGM_LauncherV2_ServerRuntimePush,
  onLine?: (line: string, kind: "stdout" | "stderr") => void,
): Promise<string[]> {
  const lines: string[] = [];
  // 仅接管以 pipe 方式建立的流；"ignore" / 继承父进程描述符时拿到的是数字或空值
  if (!stream || typeof stream === "number") return lines;

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let rest = "";

  const flush = (piece: string): void => {
    const text = piece.replace(/\r$/u, "");
    if (!text.trim()) return;
    lines.push(text);
    iGM_ServerRuntimeLog(id, push, kind, kind === "stderr" ? "error" : "info", text);
    try {
      onLine?.(text, kind);
    } catch {
      // 单行观察异常不影响读取后续输出
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      rest += decoder.decode(value, { stream: true });
      const parts = rest.split("\n");
      rest = parts.pop() ?? "";
      for (const part of parts) flush(part);
    }
    rest += decoder.decode();
    flush(rest);
  } catch {
    // 读取中断不影响进程本身
  }

  return lines;
}

/** 选取可用的 Java 可执行文件：优先 Java 列表的默认项，javaw 尽量替换为同目录 java.exe */
async function iGM_ServerRuntimeJavaPath(): Promise<string | null> {
  let path = "";
  try {
    const list = await iGM_LauncherV2_Java_List();
    const preferred = list.items.find((item) => item.id === list.defaultId) ?? list.items[0];
    path = preferred?.path ?? "";
  } catch {
    // Java 列表不可用时改用 PATH
  }
  if (!path) path = Bun.which("java") ?? "";
  if (!path) return null;

  // 服务端需要标准输出与标准错误，javaw 为 GUI 子系统，尽量改用同目录的 java.exe
  if (/javaw\.exe$/i.test(path)) {
    const alt = path.replace(/javaw\.exe$/i, "java.exe");
    if (existsSync(alt)) return alt;
  }
  return path;
}

/** 在目录内按名称取第一个命中的文件（大小写不敏感）；无则返回空串 */
function iGM_ServerRuntimePickFile(files: string[], names: string[]): string {
  const lower = files.map((name) => name.toLowerCase());
  for (const name of names) {
    const index = lower.indexOf(name.toLowerCase());
    if (index >= 0) return files[index];
  }
  return "";
}

/** 在目录内取第一个可用 jar（排除 installer 安装器） */
function iGM_ServerRuntimePickJar(files: string[]): string {
  return files.find((name) => /\.jar$/i.test(name) && !/installer/i.test(name)) ?? "";
}

/** 启动脚本候选：按优先级从目录内实际存在的文件中选择 */
const IGM_LAUNCHERV2_SERVERRUNTIME_SCRIPT_NAMES = [
  "run.bat",
  "start.bat",
  "start_server.bat",
  "launch.bat",
  "run.sh",
  "start.sh",
];

/**
 * 依据核心类型与目录内实际存在的文件解析启动命令。
 * Vanilla / Paper 用 java -jar <jar> nogui；Fabric / Forge / NeoForge 优先执行目录内启动脚本，
 * 无脚本时回退 java -jar（Fabric 的 fabric-server-launch.jar 等）。无法解析时抛错。
 */
async function iGM_ServerRuntimeResolveCommand(
  core: string,
  dir: string,
  javaPath: string,
): Promise<string[]> {
  let files: string[] = [];
  try {
    files = await readdir(dir);
  } catch {
    files = [];
  }

  const isJarCore = core === "vanilla" || core === "paper";
  if (isJarCore) {
    const jar = iGM_ServerRuntimePickFile(files, ["server.jar", "paper.jar"]) ||
      iGM_ServerRuntimePickJar(files);
    if (jar) return [javaPath, "-jar", join(dir, jar), "nogui"];
    throw new Error("no-launch-target");
  }

  const script = iGM_ServerRuntimePickFile(files, IGM_LAUNCHERV2_SERVERRUNTIME_SCRIPT_NAMES);
  if (script) {
    // Windows 批处理脚本需经 cmd.exe 执行；sh 脚本直接执行
    if (script.toLowerCase().endsWith(".bat")) {
      return ["cmd.exe", "/c", join(dir, script), "nogui"];
    }
    return [join(dir, script), "nogui"];
  }

  const jar =
    iGM_ServerRuntimePickFile(files, ["fabric-server-launch.jar", "server.jar", "paper.jar"]) ||
    iGM_ServerRuntimePickJar(files);
  if (jar) return [javaPath, "-jar", join(dir, jar), "nogui"];
  throw new Error("no-launch-target");
}

/** 构造「未运行」默认快照 */
function iGM_ServerRuntimeEmpty(id: string): iGM_LauncherV2_ServerRuntime {
  return {
    id,
    state: "stopped",
    pid: 0,
    lanIp: "",
    port: IGM_LAUNCHERV2_SERVERRUNTIME_DEFAULT_PORT,
    startedAt: 0,
    messageKey: "",
    messageParams: {},
  };
}

/**
 * 启动本地服务端进程。
 * 已在运行（starting / ready / stopping）时不重复拉起，仅回推当前状态；
 * 启动失败（未找到服务器 / 无 Java / 无核心产物）置 error 并经 server:runtime 回推。
 */
export async function iGM_LauncherV2_ServerRuntime_Start(
  id: string,
  push: iGM_LauncherV2_ServerRuntimePush,
): Promise<void> {
  const key = String(id ?? "").trim();
  if (!key) return;

  const existing = iGM_LauncherV2_ServerRuntimeRecords.get(key);
  if (
    existing &&
    existing.proc &&
    IGM_LAUNCHERV2_SERVERRUNTIME_ACTIVE_STATES.includes(existing.runtime.state)
  ) {
    push({ type: "server:runtime", runtime: { ...existing.runtime } });
    return;
  }

  const runtime: iGM_LauncherV2_ServerRuntime = {
    id: key,
    state: "starting",
    pid: 0,
    lanIp: "",
    port: IGM_LAUNCHERV2_SERVERRUNTIME_DEFAULT_PORT,
    startedAt: Date.now(),
    messageKey: "server.local.run.starting",
    messageParams: {},
  };
  iGM_LauncherV2_ServerRuntimeRecords.set(key, {
    runtime,
    proc: null,
    push,
    stopping: false,
  });
  push({ type: "server:runtime", runtime: { ...runtime } });
  iGM_ServerRuntimeLog(key, push, "system", "info", "正在启动本地服务端进程");

  const server = await iGM_LauncherV2_LocalServers_Find(key);
  if (!server) {
    iGM_ServerRuntimeLog(key, push, "system", "error", "未找到本地服务器，无法启动");
    iGM_ServerRuntimeUpdate(
      key,
      { state: "error", messageKey: "server.local.run.error", messageParams: { reason: "server-not-found" } },
      push,
    );
    return;
  }

  let command: string[];
  try {
    const javaPath = await iGM_ServerRuntimeJavaPath();
    if (!javaPath) throw new Error("no-java");
    command = await iGM_ServerRuntimeResolveCommand(server.core, server.dir, javaPath);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    iGM_ServerRuntimeLog(key, push, "system", "error", `启动失败：${reason}`);
    iGM_ServerRuntimeUpdate(
      key,
      { state: "error", messageKey: "server.local.run.error", messageParams: { reason } },
      push,
    );
    return;
  }

  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn(command, {
      cwd: server.dir,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      windowsHide: true,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "spawn-failed";
    iGM_ServerRuntimeLog(key, push, "system", "error", `拉起进程失败：${reason}`);
    iGM_ServerRuntimeUpdate(
      key,
      { state: "error", messageKey: "server.local.run.error", messageParams: { reason } },
      push,
    );
    return;
  }

  const record = iGM_LauncherV2_ServerRuntimeRecords.get(key);
  if (!record) return;
  record.proc = proc;
  const pid = proc.pid ?? 0;
  iGM_ServerRuntimeUpdate(key, { pid }, push);
  iGM_ServerRuntimeLog(key, push, "system", "info", `服务端进程已拉起，pid ${pid}`);

  /** 就绪检测：stdout 出现 Done ( 即判定就绪，解析局域网 IP 与端口 */
  const onLine = (line: string, kind: "stdout" | "stderr"): void => {
    if (kind !== "stdout") return;
    const current = iGM_LauncherV2_ServerRuntimeRecords.get(key);
    if (!current || current.runtime.state !== "starting") return;
    if (!/Done \(/.test(line)) return;

    void (async () => {
      const port = await iGM_ServerRuntimeReadPort(server.dir);
      const lanIp = iGM_ServerRuntimeLanIp();
      iGM_ServerRuntimeUpdate(
        key,
        {
          state: "ready",
          lanIp,
          port,
          messageKey: "server.local.run.ready",
          messageParams: { ip: lanIp, port: String(port) },
        },
        push,
      );
      iGM_ServerRuntimeLog(key, push, "system", "info", `服务端已就绪：${lanIp}:${port}`);

      // 开服成功自动同步：就绪即在方块广场「客户端同步大厅」生成一条记录
      // （清单直链暂空，由服主点击「生成客户端清单外部直链」时回填到同一 id）
      if (lanIp) {
        try {
          await iGM_LauncherV2_Servers_Add({
            name: server.name,
            ip: lanIp,
            port,
            site: "",
            manifest: "",
          });
          // 记录写入后补推一次服务器大厅快照，界面「客户端同步大厅」即刻可见新房间
          const list = await iGM_LauncherV2_Servers_List();
          push({
            type: "server:list",
            items: list.items,
            source: list.source,
            message: list.message,
          });
        } catch (error) {
          console.warn("[iGM CraftCeon Launcher] 自动同步记录写入失败：", error);
        }
      }
    })();
  };

  void (async () => {
    await Promise.all([
      iGM_ServerRuntimePump(key, proc.stdout, "stdout", push, onLine),
      iGM_ServerRuntimePump(key, proc.stderr, "stderr", push),
    ]);
    const exitCode = await proc.exited;

    const current = iGM_LauncherV2_ServerRuntimeRecords.get(key);
    if (!current || current.proc !== proc) return;
    current.proc = null;

    const wasStopping = current.stopping;
    const wasReady = current.runtime.state === "ready";
    const failed = !wasStopping && !wasReady;
    const state: iGM_LauncherV2_ServerRunState = failed ? "error" : "stopped";
    iGM_ServerRuntimeUpdate(
      key,
      {
        state,
        pid: 0,
        messageKey: failed ? "server.local.run.error" : "server.local.run.stopped",
        messageParams: failed ? { reason: `exit-${exitCode}` } : {},
      },
      push,
    );
    iGM_ServerRuntimeLog(
      key,
      push,
      "system",
      failed ? "error" : "info",
      `服务端进程已退出（退出码 ${exitCode}）`,
    );
  })().catch((error) => {
    iGM_ServerRuntimeLog(
      key,
      push,
      "system",
      "error",
      `监听服务端进程失败：${error instanceof Error ? error.message : "unknown"}`,
    );
  });
}

/**
 * 停止本地服务端进程。
 * 先向 stdin 写入 stop 触发优雅停机，超过等待上限仍存活则强杀（Windows 经 taskkill 结束整棵进程树）。
 */
export async function iGM_LauncherV2_ServerRuntime_Stop(
  id: string,
  push: iGM_LauncherV2_ServerRuntimePush,
): Promise<void> {
  const key = String(id ?? "").trim();
  if (!key) return;

  const record = iGM_LauncherV2_ServerRuntimeRecords.get(key);
  if (!record || !record.proc) {
    if (record) {
      iGM_ServerRuntimeUpdate(
        key,
        { state: "stopped", pid: 0, messageKey: "server.local.run.stopped", messageParams: {} },
        push,
      );
    }
    return;
  }

  const proc = record.proc;
  const pid = proc.pid ?? 0;
  record.stopping = true;
  iGM_ServerRuntimeUpdate(
    key,
    { state: "stopping", messageKey: "server.local.run.stopping", messageParams: {} },
    push,
  );
  iGM_ServerRuntimeLog(key, push, "system", "info", "正在停止本地服务端进程");

  // 优雅停机：jar 型服务端从标准输入读取 stop 指令
  try {
    const stdin = proc.stdin as unknown as { write?: (chunk: string) => unknown } | undefined;
    stdin?.write?.("stop\n");
  } catch {
    // 标准输入不可写时直接等待超时后强杀
  }

  const exited = await Promise.race<boolean>([
    proc.exited.then(() => true),
    new Promise<boolean>((resolve) =>
      setTimeout(() => resolve(false), IGM_LAUNCHERV2_SERVERRUNTIME_STOP_GRACE_MS),
    ),
  ]);
  if (exited) return;

  // 超时仍未退出：强杀进程树
  if (process.platform === "win32" && pid > 0) {
    try {
      Bun.spawn(["taskkill", "/PID", String(pid), "/T", "/F"], {
        stdout: "ignore",
        stderr: "ignore",
        windowsHide: true,
      });
    } catch {
      proc.kill();
    }
  } else {
    proc.kill();
  }
  iGM_ServerRuntimeLog(key, push, "system", "info", "优雅停机超时，已强制结束服务端进程");
}

/** 全部运行状态快照 */
export function iGM_LauncherV2_ServerRuntime_List(): iGM_LauncherV2_ServerRuntime[] {
  return [...iGM_LauncherV2_ServerRuntimeRecords.values()].map((record) => ({
    ...record.runtime,
  }));
}

/** 单台运行状态；无记录时返回「已停止」默认快照 */
export function iGM_LauncherV2_ServerRuntime_Get(id: string): iGM_LauncherV2_ServerRuntime {
  const key = String(id ?? "").trim();
  const record = iGM_LauncherV2_ServerRuntimeRecords.get(key);
  if (record) return { ...record.runtime };
  return iGM_ServerRuntimeEmpty(key);
}

/** 日志缓冲全量（返回副本） */
export function iGM_LauncherV2_ServerRuntime_Logs(id: string): iGM_LauncherV2_ServerLogEntry[] {
  const key = String(id ?? "").trim();
  return [...(iGM_LauncherV2_ServerRuntimeLogs.get(key) ?? [])];
}

/** 在服务器目录内查找客户端 ZIP 产物（ServerSync 命名为 <name>-client.zip） */
async function iGM_ServerRuntimeFindClientZip(dir: string): Promise<string> {
  try {
    const files = await readdir(dir);
    return files.find((name) => /-client\.zip$/i.test(name)) ?? "";
  } catch {
    return "";
  }
}

/**
 * 发布客户端清单为局域网外部直链。
 * 前提：服务器已就绪且目录内已生成 manifest.json 与客户端 ZIP；
 * 以 Bun.serve 在 0.0.0.0 暴露这两个产物（端口优先取服务端端口，占用则退化为随机端口），
 * 随后调用 iGM_LauncherV2_Servers_Add 把直链回填到「客户端同步大厅」记录（id 为 my:<lanIp>:<port>）。
 */
export async function iGM_LauncherV2_ServerRuntime_Publish(
  id: string,
): Promise<{ ok: boolean; url: string; message: string }> {
  const key = String(id ?? "").trim();
  if (!key) return { ok: false, url: "", message: "未指定要发布的本地服务器" };

  const record = iGM_LauncherV2_ServerRuntimeRecords.get(key);
  const push = record?.push ?? null;

  const server = await iGM_LauncherV2_LocalServers_Find(key);
  if (!server) {
    return { ok: false, url: "", message: "未找到该本地服务器，无法发布客户端清单" };
  }

  if (!record || record.runtime.state !== "ready") {
    iGM_ServerRuntimeUpdate(
      key,
      { messageKey: "server.local.run.publishFail", messageParams: { reason: "not-ready" } },
      push ?? (() => undefined),
    );
    return { ok: false, url: "", message: "本地服务器尚未就绪，请先启动并等待日志出现 Done 后再发布" };
  }

  const manifestPath = join(server.dir, "manifest.json");
  const zipName = await iGM_ServerRuntimeFindClientZip(server.dir);
  if (!existsSync(manifestPath) || !zipName) {
    iGM_ServerRuntimeUpdate(
      key,
      { messageKey: "server.local.run.publishFail", messageParams: { reason: "manifest-missing" } },
      record.push,
    );
    return {
      ok: false,
      url: "",
      message: "尚未生成客户端清单，请先在清单工作室生成 manifest.json 与客户端 ZIP 后再发布",
    };
  }
  const zipPath = join(server.dir, zipName);

  // 已发布过则直接复用现有直链
  const existingPublish = iGM_LauncherV2_ServerRuntimePublish.get(key);
  if (existingPublish) {
    await iGM_LauncherV2_Servers_Add({
      name: server.name,
      ip: record.runtime.lanIp || iGM_ServerRuntimeLanIp(),
      port: record.runtime.port,
      site: "",
      manifest: existingPublish.url,
    });
    iGM_ServerRuntimeUpdate(
      key,
      {
        messageKey: "server.local.run.publishOk",
        messageParams: { url: existingPublish.url },
      },
      record.push,
    );
    return { ok: true, url: existingPublish.url, message: `已发布客户端清单直链：${existingPublish.url}` };
  }

  iGM_ServerRuntimeUpdate(
    key,
    { messageKey: "server.local.run.publishing", messageParams: {} },
    record.push,
  );

  const handler = (request: Request): Response => {
    let name = "";
    try {
      name = decodeURIComponent(new URL(request.url).pathname.replace(/^\/+/, ""));
    } catch {
      return new Response("Bad Request", { status: 400 });
    }
    if (name !== "manifest.json" && name !== zipName) {
      return new Response("Not Found", { status: 404 });
    }
    const file = name === "manifest.json" ? manifestPath : zipPath;
    const contentType =
      name === "manifest.json" ? "application/json; charset=utf-8" : "application/zip";
    return new Response(Bun.file(file), { headers: { "content-type": contentType } });
  };

  // 端口优先取服务端端口；被占用（服务端本身在监听）时退化为随机端口
  let instance: ReturnType<typeof Bun.serve>;
  try {
    instance = Bun.serve({ hostname: "0.0.0.0", port: record.runtime.port || 0, fetch: handler });
  } catch {
    try {
      instance = Bun.serve({ hostname: "0.0.0.0", port: 0, fetch: handler });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "serve-failed";
      iGM_ServerRuntimeUpdate(
        key,
        { messageKey: "server.local.run.publishFail", messageParams: { reason } },
        record.push,
      );
      return { ok: false, url: "", message: `启动局域网静态服务失败：${reason}` };
    }
  }

  const port = instance.port ?? 0;
  const lanIp = record.runtime.lanIp || iGM_ServerRuntimeLanIp();
  const url = `http://${lanIp}:${port}/manifest.json`;
  iGM_LauncherV2_ServerRuntimePublish.set(key, { server: instance, port, url });

  const filled = await iGM_LauncherV2_Servers_Add({
    name: server.name,
    ip: lanIp,
    port: record.runtime.port,
    site: "",
    manifest: url,
  });

  iGM_ServerRuntimeUpdate(
    key,
    { messageKey: "server.local.run.publishOk", messageParams: { url } },
    record.push,
  );
  iGM_ServerRuntimeLog(key, record.push, "system", "info", `已发布客户端清单直链：${url}`);

  if (!filled.ok) {
    return {
      ok: true,
      url,
      message: `直链已生成（${url}），但回填同步大厅记录失败：${filled.message}`,
    };
  }
  return { ok: true, url, message: `已发布客户端清单直链并回填同步大厅：${url}` };
}

// 导出 //
export default iGM_LauncherV2_ServerRuntime_Start;
