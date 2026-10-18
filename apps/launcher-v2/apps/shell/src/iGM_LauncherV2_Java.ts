/**
 * 文件路径：apps/shell/src/iGM_LauncherV2_Java.ts
 * 所属层：桌面外壳 / 运行环境管理层
 * 路由：全局
 * 模块：iGM_LauncherV2_Java
 * 作用：本地 Java 运行环境的扫描、探测、增删与全局默认项持久化
 * 内容：扫描来源覆盖五类——① 环境变量（JAVA_HOME / JDK_HOME / JRE_HOME 以及 PATH 各段）；
 *       ② Windows 注册表（HKLM / HKCU 的 JavaSoft 各子键，含 WOW6432Node 32 位视图）；
 *       ③ 常见安装目录（Program Files 与 LOCALAPPDATA 下各发行版，递归限深）；
 *       ④ 命令行 `where java` / `where javaw` 的解析结果；
 *       ⑤ .minecraft 自带运行时（用户目录与启动器游戏根目录两处）；
 *       候选一律归一到 bin 目录内的 javaw.exe（缺失时回退 java.exe）后按 bin 目录去重；
 *       版本探测执行 `java -version`（windowsHide 隐藏黑框）并同时捕获 stdout 与 stderr
 *       （Java 的版本信息默认写入 stderr），经三级正则解析出版本号；
 *       扫描结果与手动添加条目合并落盘 launcher_data/java.json，默认项失效时自动回落；
 *       扫描结束无论成功与否都携带一条可读结论文案供界面明确提示
 * 说明：探测命令仅本地执行，不上报；单条候选失败只跳过该条，绝不中断整体扫描
 */

// 导入依赖 //
import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { IGM_LAUNCHERV2_JAVA_PROBE_TIMEOUT_MS } from "./iGM_LauncherV2_Constants";
import type { iGM_LauncherV2_JavaRuntime } from "./iGM_LauncherV2_Ipc";
import { iGM_LauncherV2_GameRootPath } from "./iGM_LauncherV2_Paths";
import {
  iGM_LauncherV2_JavaStorePath,
  iGM_LauncherV2_JsonRead,
  iGM_LauncherV2_JsonWrite,
} from "./iGM_LauncherV2_Store";

// 类型定义 //

/** java.json 文件结构 */
interface iGM_LauncherV2_JavaFilePayload {
  version: number;
  defaultId: string;
  items: iGM_LauncherV2_JavaRuntime[];
}

/** Java 列表快照（供界面渲染；message 为本次操作的可读结论文案） */
export interface iGM_LauncherV2_JavaListResult {
  items: iGM_LauncherV2_JavaRuntime[];
  defaultId: string;
  message: string;
}

/** 一个 Java 环境对应的可执行文件对（launcher 用于启动，probe 用于读版本） */
interface iGM_LauncherV2_JavaExecutable {
  launcher: string;
  probe: string;
}

/** 扫描诊断计数（用于拼装结论文案） */
interface iGM_LauncherV2_JavaScanStat {
  /** 去重后的候选 bin 目录数量 */
  candidates: number;
  /** 本次扫描新发现的条目数 */
  scanned: number;
  /** 探测到版本号的条目数 */
  resolved: number;
}

// 核心逻辑 //

/** 当前结构版本 */
const IGM_LAUNCHERV2_JAVA_VERSION = 1;

/** 启动用可执行文件名（Windows 用 javaw.exe 以免弹出控制台窗口） */
const IGM_LAUNCHERV2_JAVA_LAUNCHER = process.platform === "win32" ? "javaw.exe" : "java";

/** 探测版本用可执行文件名（javaw.exe 无标准错误输出，必须用 java.exe） */
const IGM_LAUNCHERV2_JAVA_PROBE = process.platform === "win32" ? "java.exe" : "java";

/** 扫描递归限深：覆盖 JDK 目录与 .minecraft/runtime 的常见层级即可，避免遍历过深 */
const IGM_LAUNCHERV2_JAVA_MAX_DEPTH = 5;

/** 一级解析：`java version "17.0.2"` / `openjdk version "1.8.0_402"` */
const IGM_LAUNCHERV2_JAVA_VERSION_RE = /version\s+"([^"]+)"/i;

/** 二级解析：输出未加引号时的宽松匹配（`openjdk 17.0.2`） */
const IGM_LAUNCHERV2_JAVA_VERSION_LOOSE_RE =
  /(?:openjdk|java|jdk)[^0-9\n]{0,24}?([0-9]+(?:\.[0-9]+)*(?:[._][0-9]+)*)/i;

/** 三级解析：正文中任意形如 `17.0.2` / `1.8.0_301` 的版本号 */
const IGM_LAUNCHERV2_JAVA_VERSION_BARE_RE = /\b([0-9]+\.[0-9][0-9._]*)/;

/** Oracle / OpenJDK 在 Windows 注册表登记的键（含 32 位视图与当前用户视图） */
const IGM_LAUNCHERV2_JAVA_REGISTRY_KEYS = [
  "HKLM\\SOFTWARE\\JavaSoft\\Java Runtime Environment",
  "HKLM\\SOFTWARE\\JavaSoft\\Java Development Kit",
  "HKLM\\SOFTWARE\\JavaSoft\\JDK",
  "HKLM\\SOFTWARE\\WOW6432Node\\JavaSoft\\Java Runtime Environment",
  "HKLM\\SOFTWARE\\WOW6432Node\\JavaSoft\\Java Development Kit",
  "HKLM\\SOFTWARE\\WOW6432Node\\JavaSoft\\JDK",
  "HKCU\\SOFTWARE\\JavaSoft\\Java Runtime Environment",
  "HKCU\\SOFTWARE\\JavaSoft\\Java Development Kit",
  "HKCU\\SOFTWARE\\JavaSoft\\JDK",
];

/** 环境变量中可能指向 JDK / JRE 根目录的键 */
const IGM_LAUNCHERV2_JAVA_ENV_KEYS = ["JAVA_HOME", "JDK_HOME", "JRE_HOME"];

/** 由路径推导供应商标识 */
function iGM_LauncherV2_JavaVendor(path: string): string {
  const lower = path.toLowerCase();
  const rules: Array<[string, string]> = [
    ["adoptium", "Eclipse Adoptium"],
    ["temurin", "Eclipse Temurin"],
    ["adoptopenjdk", "AdoptOpenJDK"],
    ["zulu", "Azul Zulu"],
    ["corretto", "Amazon Corretto"],
    ["liberica", "BellSoft Liberica"],
    ["bellsoft", "BellSoft Liberica"],
    ["graalvm", "GraalVM"],
    ["microsoft", "Microsoft Build"],
    ["semeru", "IBM Semeru"],
    ["openjdk", "OpenJDK"],
    ["oracle", "Oracle"],
    ["javapath", "Oracle"],
  ];
  for (const [keyword, label] of rules) {
    if (lower.includes(keyword)) return label;
  }
  return "未知供应商";
}

/**
 * 条目标识：以 bin 目录归一（小写 + 统一为正斜杠）作为键。
 * 采用 bin 目录而非具体可执行文件，是因为同一环境可能被 JAVA_HOME、PATH、目录扫描
 * 分别以 javaw.exe 与 java.exe 命中，按目录归一才能保证只收录一条。
 */
function iGM_LauncherV2_JavaId(executablePath: string): string {
  return dirname(executablePath).replace(/\\/g, "/").toLowerCase();
}

/** 从 `java -version` 全文解析版本号；三级正则依次尝试，均不中返回空串 */
function iGM_LauncherV2_JavaParseVersion(raw: string): string {
  const text = raw ?? "";
  if (!text.trim()) return "";
  const quoted = IGM_LAUNCHERV2_JAVA_VERSION_RE.exec(text);
  if (quoted?.[1]) return quoted[1].trim();
  const loose = IGM_LAUNCHERV2_JAVA_VERSION_LOOSE_RE.exec(text);
  if (loose?.[1]) return loose[1].trim();
  const bare = IGM_LAUNCHERV2_JAVA_VERSION_BARE_RE.exec(text);
  return bare?.[1]?.trim() ?? "";
}

/** 执行一条本地命令并返回 stdout + stderr 合并文本（超时或失败返回空串） */
async function iGM_LauncherV2_JavaRun(command: string[]): Promise<string> {
  try {
    const subprocess = Bun.spawn(command, {
      stdout: "pipe",
      stderr: "pipe",
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      try {
        subprocess.kill();
      } catch {
        // 进程可能已退出，忽略
      }
    }, IGM_LAUNCHERV2_JAVA_PROBE_TIMEOUT_MS);

    const [stdout, stderr] = await Promise.all([
      new Response(subprocess.stdout).text(),
      new Response(subprocess.stderr).text(),
    ]);
    await subprocess.exited;
    clearTimeout(timer);
    return `${stdout}\n${stderr}`;
  } catch {
    return "";
  }
}

/**
 * 以 `java -version` 探测版本号。
 * 关键点：Java 的版本信息默认写入 stderr 而非 stdout，故两路都必须捕获；
 * windowsHide 必须为 true，否则 Windows 上会闪出黑色控制台窗口。
 */
async function iGM_LauncherV2_JavaProbeVersion(versionExe: string): Promise<string> {
  if (!versionExe || !existsSync(versionExe)) return "";
  const output = await iGM_LauncherV2_JavaRun([versionExe, "-version"]);
  return iGM_LauncherV2_JavaParseVersion(output);
}

/**
 * 在 bin 目录内解析可执行文件对。
 * launcher 优先 javaw.exe（启动不弹窗），probe 必须是 java.exe（javaw 无控制台输出）。
 */
function iGM_LauncherV2_JavaResolve(binDir: string): iGM_LauncherV2_JavaExecutable | null {
  const launcher = join(binDir, IGM_LAUNCHERV2_JAVA_LAUNCHER);
  const probe = join(binDir, IGM_LAUNCHERV2_JAVA_PROBE);
  const hasLauncher = existsSync(launcher);
  const hasProbe = existsSync(probe);

  if (hasLauncher) return { launcher, probe: hasProbe ? probe : launcher };
  if (hasProbe) return { launcher: probe, probe };
  return null;
}

/** 由可执行文件路径组装一条运行时记录（探测版本） */
async function iGM_LauncherV2_JavaDescribe(
  executable: iGM_LauncherV2_JavaExecutable,
  source: iGM_LauncherV2_JavaRuntime["source"],
): Promise<iGM_LauncherV2_JavaRuntime> {
  const version = await iGM_LauncherV2_JavaProbeVersion(executable.probe);
  return {
    id: iGM_LauncherV2_JavaId(executable.launcher),
    path: executable.launcher,
    version,
    vendor: iGM_LauncherV2_JavaVendor(executable.launcher),
    source,
  };
}

/** 在目录内递归收集含可执行文件的 bin 目录（限深，逐目录容错） */
async function iGM_LauncherV2_JavaFindIn(
  root: string,
  depth: number,
  found: Set<string>,
): Promise<void> {
  if (depth > IGM_LAUNCHERV2_JAVA_MAX_DEPTH) return;

  if (iGM_LauncherV2_JavaResolve(root)) found.add(root);
  const bin = join(root, "bin");
  if (iGM_LauncherV2_JavaResolve(bin)) found.add(bin);

  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    // 权限不足或目录不存在：跳过该分支
    return;
  }

  for (const entry of entries) {
    const child = join(root, entry);
    try {
      const info = await stat(child);
      if (!info.isDirectory()) continue;
    } catch {
      continue;
    }
    await iGM_LauncherV2_JavaFindIn(child, depth + 1, found);
  }
}

/** 来源①：环境变量——JAVA_HOME / JDK_HOME / JRE_HOME 的 bin，以及 PATH 各段 */
function iGM_LauncherV2_JavaBinsFromEnv(): string[] {
  const bins = new Set<string>();

  for (const key of IGM_LAUNCHERV2_JAVA_ENV_KEYS) {
    const value = (process.env[key] ?? "").trim().replace(/^"|"$/g, "");
    if (!value) continue;
    bins.add(value);
    bins.add(join(value, "bin"));
  }

  for (const segment of (process.env.PATH ?? "").split(";")) {
    const value = segment.trim().replace(/^"|"$/g, "");
    if (value) bins.add(value);
  }

  return [...bins];
}

/** 来源④：`where java` 与 `where javaw` 的结果（解析出所在 bin 目录） */
async function iGM_LauncherV2_JavaBinsFromWhere(): Promise<string[]> {
  if (process.platform !== "win32") return [];
  const bins = new Set<string>();

  for (const keyword of ["java", "javaw"]) {
    const output = await iGM_LauncherV2_JavaRun(["where", keyword]);
    for (const line of output.split(/\r?\n/)) {
      const value = line.trim();
      if (!/\.exe$/i.test(value) || !existsSync(value)) continue;
      bins.add(dirname(value));
    }
  }

  return [...bins];
}

/**
 * 来源②：Windows 注册表。
 * 逐键执行 `reg query <键> /s` 并抽取所有 `JavaHome` 值；
 * 键不存在时 reg 会输出错误信息并以非零码退出，此处一律忽略，不影响整体扫描。
 */
async function iGM_LauncherV2_JavaBinsFromRegistry(): Promise<string[]> {
  if (process.platform !== "win32") return [];
  const bins = new Set<string>();

  for (const key of IGM_LAUNCHERV2_JAVA_REGISTRY_KEYS) {
    const output = await iGM_LauncherV2_JavaRun(["reg", "query", key, "/s"]);
    for (const line of output.split(/\r?\n/)) {
      const matched = /^\s*JavaHome\s+REG_SZ\s+(.+?)\s*$/i.exec(line);
      const value = matched?.[1]?.trim();
      if (!value) continue;
      bins.add(value);
      bins.add(join(value, "bin"));
    }
  }

  return [...bins];
}

/** 来源③⑤：常见安装目录与 .minecraft 自带运行时 */
function iGM_LauncherV2_JavaRoots(): string[] {
  const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  const localAppData = process.env.LOCALAPPDATA ?? "";
  const appData = process.env.APPDATA ?? "";
  const commonFiles = process.env.CommonProgramFiles ?? "C:\\Program Files\\Common Files";

  const roots = [
    join(programFiles, "Java"),
    join(programFilesX86, "Java"),
    join(programFiles, "Eclipse Adoptium"),
    join(programFiles, "Eclipse Foundation"),
    join(programFilesX86, "Eclipse Adoptium"),
    join(programFiles, "AdoptOpenJDK"),
    join(programFilesX86, "AdoptOpenJDK"),
    join(programFiles, "Zulu"),
    join(programFilesX86, "Zulu"),
    join(programFiles, "BellSoft"),
    join(programFiles, "BellSoft\\LibericaJDK"),
    join(programFiles, "Amazon Corretto"),
    join(programFiles, "Microsoft"),
    join(programFiles, "Semeru"),
    join(programFiles, "IBM"),
    join(programFiles, "GraalVM"),
    // Oracle 的 javapath 快捷目录（bin 内的 java.exe / javaw.exe 直接位于该目录）
    join(commonFiles, "Oracle", "Java", "javapath"),
    localAppData ? join(localAppData, "Programs", "Eclipse Adoptium") : "",
    localAppData ? join(localAppData, "Programs", "Zulu") : "",
    localAppData ? join(localAppData, "Programs", "Microsoft") : "",
    localAppData ? join(localAppData, "Programs", "BellSoft") : "",
    localAppData ? join(localAppData, "Programs", "Java") : "",
    appData ? join(appData, ".minecraft", "runtime") : "",
    appData ? join(appData, ".minecraft", "java") : "",
    // 启动器自己的游戏根目录下的自带运行时
    (() => {
      try {
        const gameRoot = iGM_LauncherV2_GameRootPath();
        return gameRoot ? join(gameRoot, "runtime") : "";
      } catch {
        return "";
      }
    })(),
  ];

  return roots.filter((root): root is string => Boolean(root) && existsSync(root));
}

/** 去重合并：同一 bin 目录只保留一条，并把 id 归一为当前标识方案 */
function iGM_LauncherV2_JavaDedupe(
  items: iGM_LauncherV2_JavaRuntime[],
): iGM_LauncherV2_JavaRuntime[] {
  const seen = new Set<string>();
  const result: iGM_LauncherV2_JavaRuntime[] = [];
  for (const item of items) {
    if (!item?.path) continue;
    const id = iGM_LauncherV2_JavaId(item.path);
    if (seen.has(id)) continue;
    seen.add(id);
    result.push({ ...item, id });
  }
  return result;
}

/** 读取落盘状态（缺失时返回空列表；载入时自愈旧标识方案） */
async function iGM_LauncherV2_JavaState(): Promise<iGM_LauncherV2_JavaFilePayload> {
  const payload = await iGM_LauncherV2_JsonRead<iGM_LauncherV2_JavaFilePayload>(
    iGM_LauncherV2_JavaStorePath(),
  );
  if (!payload || !Array.isArray(payload.items)) {
    return { version: IGM_LAUNCHERV2_JAVA_VERSION, defaultId: "", items: [] };
  }

  const items = iGM_LauncherV2_JavaDedupe(payload.items);
  const defaultId = items.some((item) => item.id === payload.defaultId)
    ? payload.defaultId
    : (items[0]?.id ?? "");
  return { version: IGM_LAUNCHERV2_JAVA_VERSION, defaultId, items };
}

/** 落盘状态 */
async function iGM_LauncherV2_JavaSave(state: iGM_LauncherV2_JavaFilePayload): Promise<void> {
  await iGM_LauncherV2_JsonWrite(iGM_LauncherV2_JavaStorePath(), state);
}

/** 列表查询：返回已落盘的条目与默认项 */
export async function iGM_LauncherV2_Java_List(): Promise<iGM_LauncherV2_JavaListResult> {
  const state = await iGM_LauncherV2_JavaState();
  return { items: state.items, defaultId: state.defaultId, message: "" };
}

/**
 * 全盘扫描：合并「扫描得到的条目」与「手动添加的条目」。
 * 手动条目优先保留；默认项若已失效则回落为列表首项；
 * 无论是否扫到结果，都返回一条可读结论文案供界面提示。
 */
export async function iGM_LauncherV2_Java_Scan(): Promise<iGM_LauncherV2_JavaListResult> {
  const previous = await iGM_LauncherV2_JavaState();
  const manual = previous.items.filter((item) => item.source === "manual");

  // 汇总五类来源为候选 bin 目录集合（去重由 Set 完成）
  const binDirs = new Set<string>();
  for (const bin of iGM_LauncherV2_JavaBinsFromEnv()) binDirs.add(bin);
  for (const bin of await iGM_LauncherV2_JavaBinsFromWhere()) binDirs.add(bin);
  for (const bin of await iGM_LauncherV2_JavaBinsFromRegistry()) binDirs.add(bin);
  for (const root of iGM_LauncherV2_JavaRoots()) {
    await iGM_LauncherV2_JavaFindIn(root, 0, binDirs);
  }

  // 解析每个候选目录的可执行文件并探测版本（并发探测，单条失败不影响其余）
  const executables: iGM_LauncherV2_JavaExecutable[] = [];
  for (const bin of binDirs) {
    const resolved = iGM_LauncherV2_JavaResolve(bin);
    if (resolved) executables.push(resolved);
  }
  const scanned = await Promise.all(
    executables.map((executable) => iGM_LauncherV2_JavaDescribe(executable, "scanned")),
  );

  const items = iGM_LauncherV2_JavaDedupe([...manual, ...scanned]);
  const defaultId = items.some((item) => item.id === previous.defaultId)
    ? previous.defaultId
    : (items[0]?.id ?? "");

  await iGM_LauncherV2_JavaSave({ version: IGM_LAUNCHERV2_JAVA_VERSION, defaultId, items });

  const stat: iGM_LauncherV2_JavaScanStat = {
    candidates: executables.length,
    scanned: scanned.length,
    resolved: items.filter((item) => item.version).length,
  };
  return { items, defaultId, message: iGM_LauncherV2_JavaScanMessage(stat, items.length) };
}

/** 拼装扫描结论文案：命中时给出数量统计，未命中时给出已检查范围与下一步动作 */
function iGM_LauncherV2_JavaScanMessage(stat: iGM_LauncherV2_JavaScanStat, total: number): string {
  if (total === 0) {
    return (
      "未在本机发现 Java 环境（已检查环境变量 JAVA_HOME/JDK_HOME/JRE_HOME 与 PATH、" +
      "Windows 注册表 JavaSoft 各子键、常见安装目录与 .minecraft 自带运行时）。" +
      "请点击【手动添加 Java 路径】选择 javaw.exe 或 java.exe。"
    );
  }

  const unresolved = stat.candidates - stat.resolved;
  const unresolvedNote = unresolved > 0 ? `，其中 ${unresolved} 个未能解析版本号` : "";
  return `扫描完成：检查 ${stat.candidates} 个安装位置，本次新发现 ${stat.scanned} 个，当前共收录 ${total} 个 Java 环境${unresolvedNote}。`;
}

/**
 * 手动添加一条：接受 javaw.exe 或 java.exe，探测版本后入库。
 * 版本无法解析时拒绝收录并提示，避免把非 Java 可执行文件写进列表；
 * 同一 bin 目录已存在条目时直接返回，不重复收录。
 */
export async function iGM_LauncherV2_Java_Add(
  launcherPath: string,
): Promise<iGM_LauncherV2_JavaListResult & { added: boolean }> {
  const state = await iGM_LauncherV2_JavaState();
  const normalized = launcherPath.trim();

  if (!normalized || !existsSync(normalized)) {
    return { items: state.items, defaultId: state.defaultId, added: false, message: "所选文件不存在，请重新选择 javaw.exe 或 java.exe" };
  }

  const fileName = basename(normalized).toLowerCase();
  if (fileName !== IGM_LAUNCHERV2_JAVA_LAUNCHER && fileName !== IGM_LAUNCHERV2_JAVA_PROBE) {
    return {
      items: state.items,
      defaultId: state.defaultId,
      added: false,
      message: `请选择 ${IGM_LAUNCHERV2_JAVA_LAUNCHER} 或 ${IGM_LAUNCHERV2_JAVA_PROBE} 文件（通常位于 Java 安装目录的 bin 文件夹内）`,
    };
  }

  // 统一到该 bin 目录内更合适的可执行文件对（优先 javaw.exe），保证与自动扫描结果同键
  const resolved = iGM_LauncherV2_JavaResolve(dirname(normalized));
  if (!resolved) {
    return {
      items: state.items,
      defaultId: state.defaultId,
      added: false,
      message: "该目录内未找到可用的 Java 可执行文件，请确认所选路径是否正确",
    };
  }

  const id = iGM_LauncherV2_JavaId(resolved.launcher);
  if (state.items.some((item) => item.id === id)) {
    return { items: state.items, defaultId: state.defaultId, added: false, message: "该 Java 环境已在列表中" };
  }

  const entry = await iGM_LauncherV2_JavaDescribe(resolved, "manual");
  if (!entry.version) {
    return {
      items: state.items,
      defaultId: state.defaultId,
      added: false,
      message: "无法解析该文件的 Java 版本，请确认是否为有效的 Java 可执行文件",
    };
  }

  const items = iGM_LauncherV2_JavaDedupe([...state.items, entry]);
  const defaultId = state.defaultId || entry.id;
  await iGM_LauncherV2_JavaSave({ version: IGM_LAUNCHERV2_JAVA_VERSION, defaultId, items });
  return { items, defaultId, added: true, message: `已添加 Java ${entry.version}（${entry.vendor}）` };
}

/** 删除一条：默认项被删除时回落为列表首项 */
export async function iGM_LauncherV2_Java_Remove(
  id: string,
): Promise<iGM_LauncherV2_JavaListResult> {
  const state = await iGM_LauncherV2_JavaState();
  const items = state.items.filter((item) => item.id !== id);
  const defaultId =
    state.defaultId === id || !items.some((item) => item.id === state.defaultId)
      ? (items[0]?.id ?? "")
      : state.defaultId;
  await iGM_LauncherV2_JavaSave({ version: IGM_LAUNCHERV2_JAVA_VERSION, defaultId, items });
  return { items, defaultId, message: "已移除该 Java 环境" };
}

/** 设为全局默认 */
export async function iGM_LauncherV2_Java_SetDefault(
  id: string,
): Promise<iGM_LauncherV2_JavaListResult> {
  const state = await iGM_LauncherV2_JavaState();
  if (!state.items.some((item) => item.id === id)) return iGM_LauncherV2_Java_List();

  await iGM_LauncherV2_JavaSave({
    version: IGM_LAUNCHERV2_JAVA_VERSION,
    defaultId: id,
    items: state.items,
  });
  return { items: state.items, defaultId: id, message: "已设为全局默认 Java" };
}
