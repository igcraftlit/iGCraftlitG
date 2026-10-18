/**
 * 文件路径：apps/shell/src/iGM_LauncherV2_Launch.ts
 * 所属层：桌面外壳 / 游戏启动层
 * 路由：全局
 * 模块：iGM_LauncherV2_Launch
 * 作用：按视界拼装 Minecraft 启动命令并拉起游戏进程
 * 内容：由视界标识定位视界目录与版本 JSON（versions/<版本 id>/<版本 id>.json）；
 *       依 libraries 的 rules 过滤拼装 classpath（含原生库分类器）并追加客户端 JAR；
 *       依 arguments.game / arguments.jvm 的 rules 过滤并逐一替换占位符
 *       （auth_player_name、game_directory、assets_root 等），未识别占位符原样保留并记入提示；
 *       账号参数严格以设置中的全局当前账号（currentAccount）为准：
 *       未选择任何账号时直接拒绝并提示「请先选择要启动的账号」；
 *       正版分支读取 microsoft.json 的 account.name / account.uuid / minecraftAccessToken
 *       （超期则先经微软刷新链续期），注入 --username / --uuid / --accessToken / --userType msa；
 *       离线分支按 id 定位离线账号，使用 OfflinePlayer:<昵称> 推导的标准 UUID，
 *       注入 --username / --uuid / --userType legacy 与占位用 --accessToken 0；
 *       两者均带 --gameDir <视界路径>，且与 ${game_directory} 的替换值一致；
 *       按版本所需 Java 主版本从 Java 列表中选取满足且最高者，缺失时提示去 Java 管理添加；
 *       以 Bun.spawn 拉起进程（cwd 为视界目录）并同时接管 stdout / stderr：
 *       逐行解析后既写入 <launcher_data>/logs/launch.log，也经通知回调实时推送到界面
 *       「错误控制台」；进程退出后按退出码与 stderr 摘要更新状态，失败原因不再静默；
 *       同时按 10%（验证 Java 与依赖库）→ 30%（构建 JVM 参数）→ 50%（拉起 Java 进程）
 *       → 70%（捕获到 Setting user / Loading Minecraft）→ 100%（启动成功）回推启动进度，
 *       stderr 命中严重错误特征时立即置失败并中止进度推进，供界面弹出红色错误日志
 * 说明：本模块只负责启动；版本 JSON 由下载阶段写入 gameRoot/versions；
 *       正版刷新链复用与 MSA 模块相同的端点与凭据文件，不修改 MSA 模块
 */

// 导入依赖 //
import { appendFileSync, mkdirSync } from "node:fs";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  IGM_LAUNCHERV2_APP_NAME,
  IGM_LAUNCHERV2_MSA_CLIENT_ID,
  IGM_LAUNCHERV2_MSA_SCOPE,
  IGM_LAUNCHERV2_MSA_TOKEN_URL,
  IGM_LAUNCHERV2_VERSION,
} from "./iGM_LauncherV2_Constants";
import { iGM_LauncherV2_Horizon_List, iGM_LauncherV2_Horizon_ReadMeta } from "./iGM_LauncherV2_Horizon";
import { iGM_LauncherV2_Java_List } from "./iGM_LauncherV2_Java";
import {
  iGM_LauncherV2_Offline_ById,
  iGM_LauncherV2_OfflineUuid,
} from "./iGM_LauncherV2_OfflineAccount";
import {
  IGM_LAUNCHERV2_HORIZON_SUBDIRS,
  iGM_LauncherV2_CurrentAccountGet,
  iGM_LauncherV2_GameRootPath,
  iGM_LauncherV2_LogsPath,
} from "./iGM_LauncherV2_Paths";
import {
  iGM_LauncherV2_JsonRead,
  iGM_LauncherV2_JsonWrite,
  iGM_LauncherV2_MicrosoftStorePath,
} from "./iGM_LauncherV2_Store";

// 类型定义 //

/** 启动状态 */
export interface iGM_LauncherV2_GameState {
  /** 是否正在运行 */
  running: boolean;
  /** 当前/最近一次启动的视界标识 */
  horizonId: string;
  /** 状态或错误提示 */
  message: string;
  /** 游戏进程 pid；未运行时为 0 */
  pid: number;
}

/** 启动日志条目（同时用于界面错误控制台与 logs/launch.log） */
export interface iGM_LauncherV2_LaunchLogEntry {
  /** 产生时间（毫秒时间戳） */
  time: number;
  /** 来源：启动器自身提示 / Java 标准输出 / Java 标准错误 */
  stream: "system" | "stdout" | "stderr";
  /** 级别：stderr 与启动器自身错误为 error，其余为 info */
  level: "info" | "error";
  /** 单行文本（已去除行尾空白） */
  line: string;
}

/** 启动日志通知回调（由主进程注入，用于实时推送给界面） */
export type iGM_LauncherV2_LaunchLogNotifier = (entry: iGM_LauncherV2_LaunchLogEntry) => void;

/** 游戏启动阶段进度（界面启动遮罩据此渲染） */
export interface iGM_LauncherV2_LaunchProgress {
  /** 当前进度百分比：10 / 30 / 50 / 70 / 100 */
  percent: number;
  /** 阶段说明文案 */
  stage: string;
  /** 是否已判定失败（严重报错导致启动中止，进度不再推进） */
  failed: boolean;
}

/** 启动进度通知回调（由主进程注入，用于实时推送给界面） */
export type iGM_LauncherV2_LaunchProgressNotifier = (
  progress: iGM_LauncherV2_LaunchProgress,
) => void;

/** 版本 JSON 中与启动相关的最小结构（字段缺失一律容错） */
interface iGM_LauncherV2_VersionJson {
  id?: unknown;
  type?: unknown;
  mainClass?: unknown;
  assets?: unknown;
  assetIndex?: { id?: unknown };
  javaVersion?: { majorVersion?: unknown };
  libraries?: unknown;
  arguments?: { game?: unknown; jvm?: unknown };
  minecraftArguments?: unknown;
}

/** 版本 JSON 中的依赖库条目 */
interface iGM_LauncherV2_LibraryItem {
  rules?: unknown;
  natives?: Record<string, unknown>;
  downloads?: {
    artifact?: { path?: unknown };
    classifiers?: Record<string, { path?: unknown }>;
  };
}

/** 规则条目（os / features / action） */
interface iGM_LauncherV2_Rule {
  action?: unknown;
  os?: { name?: unknown; arch?: unknown };
  features?: Record<string, unknown>;
}

/** 参数条目：字符串或带规则的对象 */
interface iGM_LauncherV2_ArgItem {
  rules?: unknown;
  value?: unknown;
}

/** 启动所需的账号参数 */
interface iGM_LauncherV2_AuthParams {
  username: string;
  uuid: string;
  accessToken: string;
  userType: "legacy" | "msa";
}

/** microsoft.json 文件结构（与 MSA 模块落盘格式一致，此处仅读取） */
interface iGM_LauncherV2_MsaFilePayload {
  version: number;
  account: { uuid: string; name: string; avatar: string };
  refreshToken: string;
  minecraftAccessToken: string;
  savedAt: string;
}

// 核心逻辑 //

/** 微软令牌相关端点（与 MSA 模块保持一致） */
const IGM_LAUNCHERV2_LAUNCH_XBL_URL = "https://user.auth.xboxlive.com/user/authenticate";
const IGM_LAUNCHERV2_LAUNCH_XSTS_URL = "https://xsts.auth.xboxlive.com/xsts/authorize";
const IGM_LAUNCHERV2_LAUNCH_MC_LOGIN_URL =
  "https://api.minecraftservices.com/authentication/login_with_xbox";

/**
 * Minecraft 访问令牌有效期（毫秒）。
 * microsoft.json 未记录独立过期时间字段，故以落盘时间 savedAt 加 24 小时估算；
 * 距到期不足 60 秒即视为需要刷新。
 */
const IGM_LAUNCHERV2_LAUNCH_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const IGM_LAUNCHERV2_LAUNCH_TOKEN_SKEW_MS = 60 * 1000;

/** 当前启动状态（供 LaunchState 返回） */
let iGM_LauncherV2_LaunchCurrent: iGM_LauncherV2_GameState = {
  running: false,
  horizonId: "",
  message: "",
  pid: 0,
};

/** 最近一条错误信息（供 LaunchLastError 返回） */
let iGM_LauncherV2_LaunchLastErrorState = "";

/** 启动日志环形缓冲上限（超出后丢弃最早条目） */
const IGM_LAUNCHERV2_LAUNCH_LOG_LIMIT = 300;

/** 启动日志缓冲（供界面「错误控制台」随时读取） */
let iGM_LauncherV2_LaunchLogs: iGM_LauncherV2_LaunchLogEntry[] = [];

/** 启动日志通知回调（由主进程注入；未注入时仅写日志文件） */
let iGM_LauncherV2_LaunchLogNotify: iGM_LauncherV2_LaunchLogNotifier | null = null;

/** 启动日志文件绝对路径 */
function iGM_LauncherV2_LaunchLogPath(): string {
  return join(iGM_LauncherV2_LogsPath(), "launch.log");
}

/** 注入启动日志通知回调（主进程启动时调用，传入 null 可解除） */
export function iGM_LauncherV2_SetLaunchLogNotify(
  notify: iGM_LauncherV2_LaunchLogNotifier | null,
): void {
  iGM_LauncherV2_LaunchLogNotify = notify;
}

/** 读取启动日志缓冲（副本，供界面初始化错误控制台） */
export function iGM_LauncherV2_LaunchLogsSnapshot(): iGM_LauncherV2_LaunchLogEntry[] {
  return [...iGM_LauncherV2_LaunchLogs];
}

/** 清空启动日志缓冲（仅清内存缓冲，不删日志文件） */
export function iGM_LauncherV2_LaunchLogClear(): void {
  iGM_LauncherV2_LaunchLogs = [];
}

/* ---- 启动进度 ---- */

/** 当前启动进度（界面首次查询或事件回推时读取） */
let iGM_LauncherV2_LaunchProgressCurrent: iGM_LauncherV2_LaunchProgress = {
  percent: 0,
  stage: "",
  failed: false,
};

/** 启动进度通知回调（由主进程注入；未注入时静默丢弃） */
let iGM_LauncherV2_LaunchProgressNotify: iGM_LauncherV2_LaunchProgressNotifier | null = null;

/** 启动成功确认定时器（捕获到初始化标记后延迟确认，避免过早宣告成功） */
let iGM_LauncherV2_LaunchReadyTimer: ReturnType<typeof setTimeout> | null = null;

/** 启动兜底定时器（长时间未捕获初始化标记时，进程存活即视为成功） */
let iGM_LauncherV2_LaunchFallbackTimer: ReturnType<typeof setTimeout> | null = null;

/** 注入启动进度通知回调（主进程启动时调用，传入 null 可解除） */
export function iGM_LauncherV2_SetLaunchProgressNotify(
  notify: iGM_LauncherV2_LaunchProgressNotifier | null,
): void {
  iGM_LauncherV2_LaunchProgressNotify = notify;
}

/** 查询当前启动进度（副本） */
export function iGM_LauncherV2_LaunchProgressState(): iGM_LauncherV2_LaunchProgress {
  return { ...iGM_LauncherV2_LaunchProgressCurrent };
}

/** 清理启动相关定时器（进程退出或重新启动时调用） */
function iGM_LauncherV2_LaunchProgressClearTimers(): void {
  if (iGM_LauncherV2_LaunchReadyTimer) {
    clearTimeout(iGM_LauncherV2_LaunchReadyTimer);
    iGM_LauncherV2_LaunchReadyTimer = null;
  }
  if (iGM_LauncherV2_LaunchFallbackTimer) {
    clearTimeout(iGM_LauncherV2_LaunchFallbackTimer);
    iGM_LauncherV2_LaunchFallbackTimer = null;
  }
}

/** 回推一帧启动进度（同时缓存供界面查询） */
function iGM_LauncherV2_LaunchProgressPush(percent: number, stage: string, failed = false): void {
  iGM_LauncherV2_LaunchProgressCurrent = { percent, stage, failed };
  try {
    iGM_LauncherV2_LaunchProgressNotify?.({ ...iGM_LauncherV2_LaunchProgressCurrent });
  } catch {
    // 界面通道异常不影响启动
  }
}

/** 置失败并中止进度推进（保留当前百分比，仅标记失败与原因） */
function iGM_LauncherV2_LaunchProgressFail(stage: string): void {
  if (iGM_LauncherV2_LaunchProgressCurrent.failed) return;
  iGM_LauncherV2_LaunchProgressClearTimers();
  iGM_LauncherV2_LaunchProgressPush(
    iGM_LauncherV2_LaunchProgressCurrent.percent,
    stage,
    true,
  );
}

/** 判定为启动成功（仅在未失败且尚未达到 100% 时生效） */
function iGM_LauncherV2_LaunchProgressSucceed(stage: string): void {
  const current = iGM_LauncherV2_LaunchProgressCurrent;
  if (current.failed || current.percent >= 100) return;
  iGM_LauncherV2_LaunchProgressClearTimers();
  iGM_LauncherV2_LaunchProgressPush(100, stage);
}

/** 启动成功特征：Java 输出中出现即视为已进入游戏初始化 */
const IGM_LAUNCHERV2_LAUNCH_READY_PATTERN = /Setting user|Loading Minecraft/i;

/** 严重错误特征：stderr 命中即判定启动失败（异常栈、类加载失败、JVM 无法创建等） */
const IGM_LAUNCHERV2_LAUNCH_FATAL_PATTERNS: RegExp[] = [
  /Exception in thread/i,
  /UnsupportedClassVersionError/i,
  /Could not find or load main class/i,
  /Could not create the Java Virtual Machine/i,
  /Unable to access jarfile/i,
  /A fatal error has been detected/i,
  /NoClassDefFoundError/i,
  /ClassNotFoundException/i,
  /java\.lang\.Error/i,
];

/**
 * 观察一行进程输出并推进启动进度。
 * 仅在「已拉起进程」（50%）之后才接受 70% 与失败判定，
 * 避免构建参数阶段的启动器自身提示误触发；命中失败特征后不再推进。
 */
function iGM_LauncherV2_LaunchProgressObserve(
  line: string,
  kind: "stdout" | "stderr",
): void {
  const current = iGM_LauncherV2_LaunchProgressCurrent;
  if (current.failed || current.percent < 50) return;

  if (current.percent < 70 && IGM_LAUNCHERV2_LAUNCH_READY_PATTERN.test(line)) {
    iGM_LauncherV2_LaunchProgressPush(70, "已进入游戏初始化（Setting user / Loading Minecraft）");
    // 捕获到初始化标记后再观察 3 秒，无严重报错即确认启动成功
    if (!iGM_LauncherV2_LaunchReadyTimer) {
      iGM_LauncherV2_LaunchReadyTimer = setTimeout(() => {
        iGM_LauncherV2_LaunchProgressSucceed("启动成功");
      }, 3000);
    }
    return;
  }

  if (kind === "stderr" && IGM_LAUNCHERV2_LAUNCH_FATAL_PATTERNS.some((item) => item.test(line))) {
    iGM_LauncherV2_LaunchProgressFail(`检测到严重错误：${iGM_LauncherV2_Tail(line, 200)}`);
  }
}

/** 进程已拉起后启动兜底：25 秒内未捕获初始化标记但进程仍存活，按成功收尾 */
function iGM_LauncherV2_LaunchProgressScheduleFallback(): void {
  iGM_LauncherV2_LaunchProgressClearTimers();
  iGM_LauncherV2_LaunchFallbackTimer = setTimeout(() => {
    if (!iGM_LauncherV2_LaunchCurrent.running) return;
    if (iGM_LauncherV2_LaunchProgressCurrent.percent < 100) {
      iGM_LauncherV2_LaunchProgressSucceed("启动成功（未捕获到初始化标记，进程保持运行）");
    }
  }, 25000);
}

/**
 * 记录一条启动日志。
 * 同时做三件事：写入内存环形缓冲、追加到 logs/launch.log、经回调实时推送给界面；
 * 三处各自容错，任一处失败都不影响游戏启动本身。
 */
function iGM_LauncherV2_LaunchLogAppend(
  stream: iGM_LauncherV2_LaunchLogEntry["stream"],
  line: string,
  level?: iGM_LauncherV2_LaunchLogEntry["level"],
): void {
  const text = line.replace(/\s+$/u, "");
  if (!text.trim()) return;

  const entry: iGM_LauncherV2_LaunchLogEntry = {
    time: Date.now(),
    stream,
    level: level ?? (stream === "stderr" ? "error" : "info"),
    line: text,
  };

  iGM_LauncherV2_LaunchLogs.push(entry);
  if (iGM_LauncherV2_LaunchLogs.length > IGM_LAUNCHERV2_LAUNCH_LOG_LIMIT) {
    iGM_LauncherV2_LaunchLogs.splice(
      0,
      iGM_LauncherV2_LaunchLogs.length - IGM_LAUNCHERV2_LAUNCH_LOG_LIMIT,
    );
  }

  try {
    mkdirSync(iGM_LauncherV2_LogsPath(), { recursive: true });
    appendFileSync(
      iGM_LauncherV2_LaunchLogPath(),
      `[${new Date(entry.time).toISOString()}] [${entry.stream}] ${entry.line}\n`,
      "utf8",
    );
  } catch {
    // 日志文件不可写时不阻断启动
  }

  try {
    iGM_LauncherV2_LaunchLogNotify?.(entry);
  } catch {
    // 界面通道异常不影响启动
  }
}

/** 启动器自身提示（system 流，info 级别） */
function iGM_LauncherV2_LaunchLogSystem(line: string): void {
  iGM_LauncherV2_LaunchLogAppend("system", line, "info");
}

/**
 * 持续读取子进程的一条输出流并按行记录。
 * Java 在崩溃时会把异常栈整片写入 stderr，逐行解析可保证界面按到达顺序实时展示；
 * 返回本次读取到的全部行，供进程退出时汇总摘要。
 */
async function iGM_LauncherV2_PumpStream(
  stream: ReadableStream<Uint8Array> | null | undefined,
  kind: "stdout" | "stderr",
): Promise<string[]> {
  const lines: string[] = [];
  if (!stream) return lines;

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let rest = "";

  const flush = (piece: string): void => {
    const text = piece.replace(/\r$/u, "");
    if (!text.trim()) return;
    lines.push(text);
    iGM_LauncherV2_LaunchLogAppend(kind, text);
    // 顺带观察输出以推进启动进度（成功标记与严重错误判定）
    iGM_LauncherV2_LaunchProgressObserve(text, kind);
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
  } catch (error) {
    iGM_LauncherV2_LaunchLogAppend(
      "system",
      `读取游戏进程 ${kind} 失败：${error instanceof Error ? error.message : "未知错误"}`,
      "error",
    );
  }

  return lines;
}

/** 运行平台名（用于依赖库与参数规则判定） */
function iGM_LauncherV2_PlatformName(): string {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "osx";
  return "linux";
}

/** 运行架构名（用于依赖库规则判定） */
function iGM_LauncherV2_PlatformArch(): string {
  if (process.arch === "arm64") return "arm64";
  if (process.arch === "ia32") return "x86";
  return "x86_64";
}

/** 启动器不启用的可选特性（演示账号、自定义分辨率等一律为 false） */
const IGM_LAUNCHERV2_LAUNCH_FEATURES: Record<string, boolean> = {
  is_demo_user: false,
  has_custom_resolution: false,
  has_quick_plays_support: false,
  is_quick_play_singleplayer: false,
  is_quick_play_multiplayer: false,
  is_quick_play_realms: false,
};

/** 类路径分隔符：Windows 用分号，其余平台用冒号 */
const IGM_LAUNCHERV2_CLASSPATH_SEP = process.platform === "win32" ? ";" : ":";

/** 单条规则是否匹配当前平台与特性 */
function iGM_LauncherV2_RuleMatches(rule: iGM_LauncherV2_Rule): boolean {
  const platform = iGM_LauncherV2_PlatformName();
  const arch = iGM_LauncherV2_PlatformArch();

  if (rule.os) {
    if (typeof rule.os.name === "string" && rule.os.name !== platform) return false;
    if (typeof rule.os.arch === "string" && rule.os.arch !== arch) return false;
  }

  if (rule.features && typeof rule.features === "object") {
    for (const [key, expected] of Object.entries(rule.features)) {
      if (Boolean(IGM_LAUNCHERV2_LAUNCH_FEATURES[key]) !== Boolean(expected)) return false;
    }
  }

  return true;
}

/** 规则集合是否允许：无规则默认允许；命中规则时按 action 覆写，最后一条命中者为准 */
function iGM_LauncherV2_RulesAllow(rules: unknown): boolean {
  if (!Array.isArray(rules) || rules.length === 0) return true;
  let allow = false;
  for (const item of rules) {
    const rule = item as iGM_LauncherV2_Rule;
    if (!rule || typeof rule !== "object") continue;
    if (iGM_LauncherV2_RuleMatches(rule)) allow = rule.action === "allow";
  }
  return allow;
}

/** 视界内标准子目录补齐（saves 等不存在时创建） */
async function iGM_LauncherV2_EnsureHorizonDirs(horizonDir: string): Promise<void> {
  await mkdir(horizonDir, { recursive: true });
  for (const dir of IGM_LAUNCHERV2_HORIZON_SUBDIRS) {
    await mkdir(join(horizonDir, dir), { recursive: true });
  }
}

/**
 * 由视界标识推导版本 id。
 * 视界命名约定为「<版本 id>-<加载器或 Vanilla>」，故在 gameRoot/versions 的既有目录中
 * 选取「等于视界标识」或「是视界标识前缀（其后紧邻 -）」的最长者；无匹配时回退视界标识本身。
 */
async function iGM_LauncherV2_ResolveVersionId(
  horizonId: string,
  gameRoot: string,
): Promise<string> {
  let ids: string[] = [];
  try {
    const entries = await readdir(join(gameRoot, "versions"), { withFileTypes: true });
    ids = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  } catch {
    ids = [];
  }
  const matches = ids.filter(
    (id) => horizonId === id || horizonId.startsWith(`${id}-`),
  );
  matches.sort((a, b) => b.length - a.length);
  return matches[0] ?? horizonId;
}

/** 读取版本 JSON；缺失或损坏返回 null */
async function iGM_LauncherV2_ReadVersionJson(
  gameRoot: string,
  versionId: string,
): Promise<iGM_LauncherV2_VersionJson | null> {
  const path = join(gameRoot, "versions", versionId, `${versionId}.json`);
  try {
    const text = (await readFile(path, "utf8")).trim();
    if (!text) return null;
    return JSON.parse(text) as iGM_LauncherV2_VersionJson;
  } catch {
    return null;
  }
}

/** 依 libraries 规则过滤拼装 classpath（含原生库分类器），末尾追加客户端 JAR */
function iGM_LauncherV2_BuildClasspath(
  version: iGM_LauncherV2_VersionJson,
  gameRoot: string,
  versionId: string,
): string {
  const platform = iGM_LauncherV2_PlatformName();
  const entries: string[] = [];
  const libraries = Array.isArray(version.libraries) ? version.libraries : [];

  for (const item of libraries) {
    const lib = item as iGM_LauncherV2_LibraryItem;
    if (!iGM_LauncherV2_RulesAllow(lib.rules)) continue;

    const artifact = lib.downloads?.artifact;
    if (artifact && typeof artifact.path === "string") {
      entries.push(join(gameRoot, "libraries", artifact.path));
    }

    // 原生库分类器：优先按 natives 映射取键，回退到常见 natives-<平台> 键
    const nativeKey =
      typeof lib.natives?.[platform] === "string"
        ? (lib.natives[platform] as string)
        : `natives-${platform}`;
    const classifier = lib.downloads?.classifiers?.[nativeKey];
    if (classifier && typeof classifier.path === "string") {
      entries.push(join(gameRoot, "libraries", classifier.path));
    }
  }

  entries.push(join(gameRoot, "versions", versionId, `${versionId}.jar`));
  return entries.join(IGM_LAUNCHERV2_CLASSPATH_SEP);
}

/** 替换字符串中的 ${占位符}；未识别者原样保留并记入 unknownOut */
function iGM_LauncherV2_Substitute(
  value: string,
  map: Record<string, string>,
  unknownOut: Set<string>,
): string {
  return value.replace(/\$\{([^}]+)\}/g, (whole, name: string) => {
    const key = name.trim();
    if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
    unknownOut.add(key);
    return whole;
  });
}

/**
 * 展开参数集合：字符串项直接取用（按空白拆分以兼容 minecraftArguments）；
 * 对象项按 rules 判定，命中后取 value（字符串或字符串数组）逐项替换占位符。
 */
function iGM_LauncherV2_ExpandArgs(
  raw: unknown,
  map: Record<string, string>,
  unknownOut: Set<string>,
): string[] {
  const out: string[] = [];

  if (typeof raw === "string") {
    for (const piece of raw.split(/\s+/)) {
      if (piece) out.push(iGM_LauncherV2_Substitute(piece, map, unknownOut));
    }
    return out;
  }
  if (!Array.isArray(raw)) return out;

  for (const item of raw) {
    if (typeof item === "string") {
      out.push(iGM_LauncherV2_Substitute(item, map, unknownOut));
      continue;
    }
    const entry = item as iGM_LauncherV2_ArgItem;
    if (!entry || typeof entry !== "object") continue;
    if (!iGM_LauncherV2_RulesAllow(entry.rules)) continue;

    const value = entry.value;
    if (typeof value === "string") {
      out.push(iGM_LauncherV2_Substitute(value, map, unknownOut));
    } else if (Array.isArray(value)) {
      for (const piece of value) {
        if (typeof piece === "string") out.push(iGM_LauncherV2_Substitute(piece, map, unknownOut));
      }
    }
  }
  return out;
}

/** 保证参数中存在指定标志（缺失则补上标志与值） */
function iGM_LauncherV2_EnsureFlag(args: string[], flag: string, value: string): void {
  if (!args.includes(flag)) args.push(flag, value);
}

/** 取文本末尾若干字符作为摘要 */
function iGM_LauncherV2_Tail(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length > max ? trimmed.slice(trimmed.length - max) : trimmed;
}

/** Java 主版本 → 是否可用于字符串版本号（"17.0.9" / "1.8.0_402"） */
function iGM_LauncherV2_JavaMajor(version: string): number {
  const value = (version || "").trim();
  if (!value) return 0;
  if (value.startsWith("1.")) {
    const major = Number.parseInt(value.split(".")[1] ?? "", 10);
    return Number.isFinite(major) ? major : 0;
  }
  const major = Number.parseInt(value, 10);
  return Number.isFinite(major) ? major : 0;
}

/**
 * 版本 id 所需的最低 Java 主版本。
 * 映射依据：1.18 及以上（含 1.20+）需 Java 17，1.17 需 Java 16，更早版本用 Java 8。
 * 优先以版本 JSON 的 javaVersion.majorVersion 为准，本函数作为其缺失时的回退。
 */
function iGM_LauncherV2_RequiredJavaMajor(versionId: string): number {
  const matched = /^1\.(\d+)/.exec(versionId.trim());
  if (!matched) return 8;
  const minor = Number.parseInt(matched[1], 10);
  if (!Number.isFinite(minor)) return 8;
  if (minor >= 18) return 17;
  if (minor === 17) return 16;
  return 8;
}

/**
 * 选取满足所需主版本且版本最高的 Java 可执行文件。
 * 返回 javaw 路径；无可用项时返回 null（由调用方提示去 Java 管理添加）。
 */
async function iGM_LauncherV2_SelectJava(requiredMajor: number): Promise<string | null> {
  const { items } = await iGM_LauncherV2_Java_List();
  const usable = items
    .map((item) => ({ path: item.path, major: iGM_LauncherV2_JavaMajor(item.version) }))
    .filter((item) => item.path && item.major >= requiredMajor);
  if (usable.length === 0) return null;

  usable.sort((a, b) => b.major - a.major || a.path.localeCompare(b.path));
  return usable[0].path;
}

/** 微软令牌是否已过期（按 savedAt + 24 小时估算） */
function iGM_LauncherV2_MsaTokenExpired(payload: iGM_LauncherV2_MsaFilePayload): boolean {
  const saved = Date.parse(payload.savedAt ?? "");
  if (!Number.isFinite(saved)) return true;
  return Date.now() >= saved + IGM_LAUNCHERV2_LAUNCH_TOKEN_TTL_MS - IGM_LAUNCHERV2_LAUNCH_TOKEN_SKEW_MS;
}

/**
 * 刷新正版 Minecraft 访问令牌（微软令牌 → Xbox Live → XSTS → Minecraft 登录），
 * 成功后回写 microsoft.json 并返回新的 Minecraft 访问令牌；任一步失败抛出可读错误。
 */
async function iGM_LauncherV2_MsaRefreshToken(
  payload: iGM_LauncherV2_MsaFilePayload,
): Promise<string> {
  if (!payload.refreshToken) throw new Error("缺少微软刷新令牌，请重新进行微软正版验证");

  // 1) 微软令牌续期
  const tokenResponse = await fetch(IGM_LAUNCHERV2_MSA_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      client_id: IGM_LAUNCHERV2_MSA_CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: payload.refreshToken,
      scope: IGM_LAUNCHERV2_MSA_SCOPE,
    }),
  });
  const microsoft = (await tokenResponse.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!microsoft.access_token) {
    throw new Error(
      microsoft.error_description || microsoft.error || "微软令牌刷新失败，请重新进行微软正版验证",
    );
  }

  // 2) Xbox Live 用户认证
  const xblResponse = await fetch(IGM_LAUNCHERV2_LAUNCH_XBL_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      Properties: {
        AuthMethod: "RPS",
        SiteName: "user.auth.xboxlive.com",
        RpsTicket: `d=${microsoft.access_token}`,
      },
      RelyingParty: "http://auth.xboxlive.com",
      TokenType: "JWT",
    }),
  });
  const xbl = (await xblResponse.json().catch(() => ({}))) as {
    Token?: string;
  };
  if (!xblResponse.ok || !xbl.Token) throw new Error("Xbox Live 认证失败，请重新进行微软正版验证");

  // 3) XSTS 授权
  const xstsResponse = await fetch(IGM_LAUNCHERV2_LAUNCH_XSTS_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      Properties: { SandboxId: "RETAIL", UserTokens: [xbl.Token] },
      RelyingParty: "rp://api.minecraftservices.com/",
      TokenType: "JWT",
    }),
  });
  const xsts = (await xstsResponse.json().catch(() => ({}))) as {
    Token?: string;
    DisplayClaims?: { xui?: Array<{ uhs?: string }> };
  };
  const uhs = xsts.DisplayClaims?.xui?.[0]?.uhs ?? "";
  if (!xstsResponse.ok || !xsts.Token || !uhs) throw new Error("XSTS 授权失败，请重新进行微软正版验证");

  // 4) Minecraft Services 登录
  const mcResponse = await fetch(IGM_LAUNCHERV2_LAUNCH_MC_LOGIN_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ identityToken: `XBL3.0 x=${uhs};${xsts.Token}` }),
  });
  const minecraft = (await mcResponse.json().catch(() => ({}))) as {
    access_token?: string;
    error?: string;
    errorMessage?: string;
  };
  if (!mcResponse.ok || !minecraft.access_token) {
    throw new Error(
      minecraft.errorMessage || minecraft.error || "Minecraft 登录失败，请重新进行微软正版验证",
    );
  }

  await iGM_LauncherV2_JsonWrite(iGM_LauncherV2_MicrosoftStorePath(), {
    ...payload,
    minecraftAccessToken: minecraft.access_token,
    refreshToken: microsoft.refresh_token || payload.refreshToken,
    savedAt: new Date().toISOString(),
  } satisfies iGM_LauncherV2_MsaFilePayload);

  return minecraft.access_token;
}

/**
 * 解析启动账号参数。
 * 严格以设置中的全局当前账号 currentAccount 为准，不再自行按「已绑定正版优先」推断：
 * - kind 为空：拒绝启动并提示用户先选择账号；
 * - kind 为 msa：读取 microsoft.json 的 account.name / account.uuid / minecraftAccessToken，
 *   令牌按 savedAt + 24 小时判定过期（含 60 秒提前量），过期则经微软刷新链续期后回写；
 * - kind 为 offline：按 currentAccount.id 定位离线账号，UUID 取落盘值或
 *   由 `OfflinePlayer:<昵称>` 重新推导，保证与 Minecraft 离线模式一致。
 * 任一路径缺少必要账号或凭据时抛出具可读信息、可直接照做的错误。
 */
async function iGM_LauncherV2_ResolveAuth(): Promise<iGM_LauncherV2_AuthParams> {
  const active = iGM_LauncherV2_CurrentAccountGet();

  if (active.kind !== "msa" && active.kind !== "offline") {
    throw new Error("请先选择要启动的账号（在首页账号栏点选正版或离线账号）");
  }

  if (active.kind === "msa") {
    const storePath = iGM_LauncherV2_MicrosoftStorePath();
    const payload = await iGM_LauncherV2_JsonRead<iGM_LauncherV2_MsaFilePayload>(storePath);
    if (!payload?.account?.uuid || !payload.account.name) {
      throw new Error(
        `未找到正版凭据（读取路径：${storePath}）。请重新进行微软正版验证，或改选离线账号启动`,
      );
    }

    const accessToken =
      payload.minecraftAccessToken && !iGM_LauncherV2_MsaTokenExpired(payload)
        ? payload.minecraftAccessToken
        : await iGM_LauncherV2_MsaRefreshToken(payload);

    return {
      username: payload.account.name,
      uuid: payload.account.uuid.replace(/-/g, ""),
      accessToken,
      userType: "msa",
    };
  }

  const offline = await iGM_LauncherV2_Offline_ById(active.id);
  if (!offline) {
    throw new Error(
      `当前选择的离线账号不存在（id：${active.id}），请在首页账号栏重新选择或新增离线账号`,
    );
  }
  return {
    username: offline.name,
    uuid: (offline.uuid || iGM_LauncherV2_OfflineUuid(offline.name)).replace(/-/g, ""),
    accessToken: "0",
    userType: "legacy",
  };
}

/** 组装失败态（running 为 false）并记录最后一条错误，同时写入启动日志 */
function iGM_LauncherV2_LaunchFailure(horizonId: string, message: string): iGM_LauncherV2_GameState {
  iGM_LauncherV2_LaunchLastErrorState = message;
  iGM_LauncherV2_LaunchLogAppend("system", `启动失败：${message}`, "error");
  // 启动进度同步置失败并中止推进，界面据此弹出红色错误日志
  iGM_LauncherV2_LaunchProgressFail(`启动失败：${message}`);
  iGM_LauncherV2_LaunchCurrent = { running: false, horizonId, message, pid: 0 };
  return { ...iGM_LauncherV2_LaunchCurrent };
}

/**
 * 启动指定视界。
 * connect 为可选的「一键进服」直连目标：传入后会在游戏参数中追加
 * --server <地址> 与 --port <端口>，让游戏启动后直接连接该服务器。
 */
export async function iGM_LauncherV2_LaunchStart(
  horizonId: string,
  connect?: { server: string; port: number },
): Promise<iGM_LauncherV2_GameState> {
  // 已在运行：不重复拉起，返回当前状态
  if (iGM_LauncherV2_LaunchCurrent.running) {
    return {
      ...iGM_LauncherV2_LaunchCurrent,
      message: `已有游戏正在运行（视界：${iGM_LauncherV2_LaunchCurrent.horizonId}），未重复启动`,
    };
  }

  const target = horizonId.trim();
  if (!target) return iGM_LauncherV2_LaunchFailure("", "未指定要启动的视界");

  // 启动进度起点：校验 Java 环境与依赖库是否齐备
  iGM_LauncherV2_LaunchProgressClearTimers();
  iGM_LauncherV2_LaunchProgressPush(10, "验证 Java 与依赖库");

  try {
    // 1) 定位视界
    const list = await iGM_LauncherV2_Horizon_List();
    const horizon = list.items.find((item) => item.id === target);
    if (!horizon) return iGM_LauncherV2_LaunchFailure(target, `视界不存在：${target}`);
    const horizonDir = horizon.path;
    await iGM_LauncherV2_EnsureHorizonDirs(horizonDir);

    const gameRoot = iGM_LauncherV2_GameRootPath();

    // 2) 定位版本 JSON：优先使用视界元数据中记录的版本，其次由视界名称推导，
    //    逐个尝试读取，任一可用即采用（放宽完整性校验，避免因命名不符而无法启动）
    const meta = await iGM_LauncherV2_Horizon_ReadMeta(target);
    const candidates: string[] = [];
    if (meta?.versionId && meta.versionId.trim()) candidates.push(meta.versionId.trim());
    const derived = await iGM_LauncherV2_ResolveVersionId(target, gameRoot);
    if (!candidates.includes(derived)) candidates.push(derived);
    if (candidates.length === 0) candidates.push(target);

    let versionId = candidates[0];
    let version: iGM_LauncherV2_VersionJson | null = null;
    for (const candidate of candidates) {
      const loaded = await iGM_LauncherV2_ReadVersionJson(gameRoot, candidate);
      if (loaded) {
        versionId = candidate;
        version = loaded;
        break;
      }
    }
    if (!version) {
      return iGM_LauncherV2_LaunchFailure(
        target,
        `未找到可用版本文件（已尝试：${candidates.join("、")}），请先在资源中心下载该版本`,
      );
    }
    const mainClass = typeof version.mainClass === "string" ? version.mainClass : "";
    if (!mainClass) return iGM_LauncherV2_LaunchFailure(target, "版本文件缺少 mainClass，无法启动");

    // 3) 账号参数（离线 / 正版分支，正版可能先刷新令牌）
    const auth = await iGM_LauncherV2_ResolveAuth();

    // 4) 类路径与原生目录
    const classpath = iGM_LauncherV2_BuildClasspath(version, gameRoot, versionId);
    const nativesDir = join(gameRoot, "versions", versionId, "natives");
    await mkdir(nativesDir, { recursive: true });

    const assetIndexId =
      (typeof version.assetIndex?.id === "string" && version.assetIndex.id) ||
      (typeof version.assets === "string" && version.assets) ||
      versionId;
    const versionType = typeof version.type === "string" ? version.type : "release";
    const assetsRoot = join(gameRoot, "assets");

    // 5) 占位符替换表
    const unknown = new Set<string>();
    const map: Record<string, string> = {
      auth_player_name: auth.username,
      version_name: versionId,
      profile_name: versionId,
      game_directory: horizonDir,
      assets_root: assetsRoot,
      assets_index_name: assetIndexId,
      auth_uuid: auth.uuid,
      auth_access_token: auth.accessToken,
      auth_session: `token:${auth.accessToken}:${auth.uuid}`,
      user_type: auth.userType,
      version_type: versionType,
      user_properties: "{}",
      natives_directory: nativesDir,
      classpath,
      launcher_name: IGM_LAUNCHERV2_APP_NAME,
      launcher_version: IGM_LAUNCHERV2_VERSION,
      game_assets: join(assetsRoot, "virtual", "legacy"),
      library_directory: join(gameRoot, "libraries"),
    };

    // 6) JVM 参数与游戏参数
    const jvmArgs = iGM_LauncherV2_ExpandArgs(version.arguments?.jvm, map, unknown);
    const gameArgs = iGM_LauncherV2_ExpandArgs(
      version.arguments?.game ?? version.minecraftArguments,
      map,
      unknown,
    );

    // JVM 参数未含 -cp 时补齐；老版本默认补 java.library.path 与启动器标识
    if (!jvmArgs.includes("-cp") && !jvmArgs.includes("-classpath")) {
      jvmArgs.push("-Djava.library.path=" + nativesDir);
      jvmArgs.push("-cp", classpath);
    }

    // 强制补齐账号与关键参数，保证离线 / 正版参数合法
    iGM_LauncherV2_EnsureFlag(gameArgs, "--username", auth.username);
    iGM_LauncherV2_EnsureFlag(gameArgs, "--uuid", auth.uuid);
    iGM_LauncherV2_EnsureFlag(gameArgs, "--accessToken", auth.accessToken);
    iGM_LauncherV2_EnsureFlag(gameArgs, "--userType", auth.userType);
    iGM_LauncherV2_EnsureFlag(gameArgs, "--gameDir", horizonDir);
    iGM_LauncherV2_EnsureFlag(gameArgs, "--version", versionId);
    iGM_LauncherV2_EnsureFlag(gameArgs, "--assetsDir", assetsRoot);
    iGM_LauncherV2_EnsureFlag(gameArgs, "--assetIndex", assetIndexId);
    iGM_LauncherV2_EnsureFlag(gameArgs, "--userProperties", "{}");

    // 一键进服：追加直连参数（--server / --port），游戏启动后直接进入该服务器
    if (connect && connect.server.trim()) {
      iGM_LauncherV2_EnsureFlag(gameArgs, "--server", connect.server.trim());
      iGM_LauncherV2_EnsureFlag(gameArgs, "--port", String(connect.port));
    }

    // 启动进度：参数拼装完毕
    iGM_LauncherV2_LaunchProgressPush(30, "构建 JVM 参数");

    // 7) Java 选择
    const requiredMajor =
      typeof version.javaVersion?.majorVersion === "number"
        ? version.javaVersion.majorVersion
        : iGM_LauncherV2_RequiredJavaMajor(versionId);
    const javaPath = await iGM_LauncherV2_SelectJava(requiredMajor);
    if (!javaPath) {
      return iGM_LauncherV2_LaunchFailure(
        target,
        `未找到满足要求的 Java（需要 Java ${requiredMajor} 及以上），请到 Java 管理中添加`,
      );
    }

    // 8) 拉起进程：stdout / stderr 全部接管，逐行写入日志文件并实时推送给界面
    const command = [javaPath, ...jvmArgs, mainClass, ...gameArgs];
    iGM_LauncherV2_LaunchLogAppend(
      "system",
      `账号：${auth.username}（${auth.userType === "msa" ? "正版" : "离线"}），UUID ${auth.uuid}`,
    );
    // 命令全文含访问令牌，写日志前必须脱敏，避免凭据落盘
    iGM_LauncherV2_LaunchLogAppend(
      "system",
      `启动命令：${command
        .map((piece) =>
          piece === auth.accessToken && auth.accessToken !== "0" ? "<访问令牌已隐藏>" : piece,
        )
        .join(" ")}`,
    );

    const subprocess = Bun.spawn(command, {
      cwd: horizonDir,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      windowsHide: true,
    });

    const pid = subprocess.pid ?? 0;
    const unknownNote =
      unknown.size > 0 ? `；未识别占位符：${[...unknown].join("、")}（保持原样）` : "";
    iGM_LauncherV2_LaunchLastErrorState = "";
    iGM_LauncherV2_LaunchCurrent = {
      running: true,
      horizonId: target,
      message: `游戏已启动（视界：${target}，pid ${pid}）${unknownNote}`,
      pid,
    };
    // 启动进度：Java 进程已拉起，等待初始化标记；同时启动兜底计时
    iGM_LauncherV2_LaunchProgressPush(50, "拉起 Java 进程");
    iGM_LauncherV2_LaunchProgressScheduleFallback();
    iGM_LauncherV2_LaunchLogAppend("system", `游戏进程已拉起，pid ${pid}`);
    console.log(`[iGM CraftCeon Launcher] 启动游戏：${target}，pid ${pid}${unknownNote}`);

    // 9) 持续读取两条输出流，进程退出后按退出码与 stderr 摘要更新状态
    const boundPid = pid;
    void (async () => {
      const [stdoutLines, stderrLines] = await Promise.all([
        iGM_LauncherV2_PumpStream(subprocess.stdout, "stdout"),
        iGM_LauncherV2_PumpStream(subprocess.stderr, "stderr"),
      ]);
      const exitCode = await subprocess.exited;

      // 仅当本次进程仍是当前记录时才覆写，避免并发启动造成状态错乱
      if (iGM_LauncherV2_LaunchCurrent.pid !== boundPid) return;

      // 崩溃原因优先取 stderr 末几行（Java 异常栈在此），stderr 为空时回退 stdout
      const source = stderrLines.length > 0 ? stderrLines : stdoutLines;
      const tail = iGM_LauncherV2_Tail(source.slice(-6).join(" | "), 1200);
      const summary =
        exitCode === 0
          ? "游戏进程已正常退出"
          : `游戏异常退出（退出码 ${exitCode}）${tail ? `：${tail}` : "，详见启动日志"}`;

      iGM_LauncherV2_LaunchLastErrorState = exitCode === 0 ? "" : summary;
      iGM_LauncherV2_LaunchLogAppend(
        "system",
        `${summary}（完整日志：${iGM_LauncherV2_LaunchLogPath()}）`,
        exitCode === 0 ? "info" : "error",
      );
      // 启动进度收尾：异常退出置失败并保留错误原因，正常退出则确认成功
      iGM_LauncherV2_LaunchProgressClearTimers();
      if (exitCode === 0) {
        iGM_LauncherV2_LaunchProgressSucceed("启动成功");
      } else if (!iGM_LauncherV2_LaunchProgressCurrent.failed) {
        iGM_LauncherV2_LaunchProgressFail(summary);
      }
      iGM_LauncherV2_LaunchCurrent = {
        running: false,
        horizonId: target,
        message: summary,
        pid: 0,
      };
      console.log(`[iGM CraftCeon Launcher] ${summary}`);
    })().catch((error) => {
      console.warn("[iGM CraftCeon Launcher] 监听游戏进程失败：", error);
    });

    return { ...iGM_LauncherV2_LaunchCurrent };
  } catch (error) {
    return iGM_LauncherV2_LaunchFailure(
      target,
      error instanceof Error ? error.message : "启动失败",
    );
  }
}

/** 查询当前启动状态 */
export function iGM_LauncherV2_LaunchState(): iGM_LauncherV2_GameState {
  return { ...iGM_LauncherV2_LaunchCurrent };
}

/** 结束后端保存的最后一条错误信息 */
export function iGM_LauncherV2_LaunchLastError(): string {
  return iGM_LauncherV2_LaunchLastErrorState;
}

// 导出 //
export default iGM_LauncherV2_LaunchStart;
