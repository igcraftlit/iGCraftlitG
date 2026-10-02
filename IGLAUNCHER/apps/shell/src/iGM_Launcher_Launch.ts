/**
 * 文件路径：apps/shell/src/iGM_Launcher_Launch.ts
 * 所属层：桌面外壳 / 启动引擎层
 * 路由：全局（不对外暴露 URL，仅被 iGM_Launcher_Bridge 调用）
 * 模块：iGM_Launcher_Launch
 * 作用：用已下载的游戏文件与离线角色身份真实拉起 Minecraft Java 进程
 * 内容：Java 运行时选取、版本 json 链解析（原版与 Fabric 的 inheritsFrom 合并）、
 *       classpath 拼装、natives 解压到实例目录、JVM 与游戏参数拼装、进程拉起与状态跟踪
 *
 * 说明：目录规则与模块七一致——versions / libraries / assets 为全部实例共享、只存一份，
 *       实例 gameDir 为 <共享根>/instances/<实例名>，进程工作目录与 --gameDir 均指向它；
 *       启动登录方式分两种：离线启动使用本地离线角色名与离线 UUID、--accessToken 固定为 0、
 *       user_type 为 legacy；正版启动使用已绑定微软账号的真实访问令牌、UUID、玩家名与 XUID、
 *       user_type 为 msa（令牌由桥接层在主进程内解析后传入，绝不进入渲染进程）；
 *       启动过程按阶段推进 stage / progress，供独立启动进度页展示进度条；
 *       进程运行状态只在主进程内存中维护，退出即如实标记，绝不伪造「运行中」；
 *       游戏标准输出与错误输出全部落盘到实例目录下的 logs/，便于排查启动失败原因。
 *       模块九：Java 选取在已登记运行时全部不可用时回退到真实扫描结果（含系统 PATH），
 *       本机确实没有可用 Java 时给出可照做的中文提示，不再回退到字面量 "java"。
 *       Zig 侧对应契约：iGM_Launcher_LaunchInstance / iGM_Launcher_LaunchStatus。
 */

// 导入依赖 //
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import { inflateRawSync } from "node:zlib";
import {
  IGM_LAUNCHER_APP_NAME,
  IGM_LAUNCHER_BRIDGE_FAILED,
  IGM_LAUNCHER_BRIDGE_INVALID,
  IGM_LAUNCHER_BRIDGE_NOT_FOUND,
  IGM_LAUNCHER_LAUNCH_LOG_RELATIVE,
  IGM_LAUNCHER_LAUNCH_NATIVES_DIR_NAME,
  IGM_LAUNCHER_LAUNCH_USER_TYPE,
  IGM_LAUNCHER_LAUNCH_USER_TYPE_OFFICIAL,
  IGM_LAUNCHER_VERSION,
  iGM_Launcher_LaunchStageProgress,
  iGM_Launcher_MakeOfflineUuid,
  iGM_Launcher_McRootOfParent,
  iGM_Launcher_RootDirOfInstance,
  iGM_Launcher_SafePlayerName,
  iGM_Launcher_VersionDirName,
  type iGM_Launcher_AccountSession,
  type iGM_Launcher_InstanceRecord,
  type iGM_Launcher_JavaRuntime,
  type iGM_Launcher_LaunchMode,
  type iGM_Launcher_LaunchStage,
  type iGM_Launcher_LaunchState,
  type iGM_Launcher_LaunchStatus,
} from "@igm-launcher/shared";
import { iGM_Launcher_Java_ScanPaths } from "./iGM_Launcher_Java";

// 类型定义 //

/** 版本 json 中的平台 / 特性规则 */
interface iGM_Launcher_LaunchRule {
  action?: string;
  os?: { name?: string };
  /** 特性开关：键为特性名，值为期望的布尔值 */
  features?: Record<string, boolean>;
}

/** 版本 json 中的参数条目：字符串或带规则的数组 */
type iGM_Launcher_LaunchArgument =
  | string
  | { rules?: iGM_Launcher_LaunchRule[]; value?: string | string[] };

/** 版本 json 中的依赖库 */
interface iGM_Launcher_LaunchLibrary {
  name?: string;
  url?: string;
  rules?: iGM_Launcher_LaunchRule[];
  /** 平台 -> classifier 名（如 windows -> natives-windows） */
  natives?: Record<string, string>;
  downloads?: {
    artifact?: { path?: string; url?: string; size?: number; sha1?: string };
    classifiers?: Record<string, { path?: string; url?: string; size?: number; sha1?: string }>;
  };
}

/** 本模块关心的版本 json 字段（原版 json 与 Fabric profile 共用形状） */
interface iGM_Launcher_LaunchVersionJson {
  id?: string;
  inheritsFrom?: string;
  type?: string;
  mainClass?: string;
  assets?: string;
  assetIndex?: { id?: string };
  downloads?: { client?: { path?: string } };
  libraries?: iGM_Launcher_LaunchLibrary[];
  arguments?: {
    game?: iGM_Launcher_LaunchArgument[];
    jvm?: iGM_Launcher_LaunchArgument[];
  };
  /** 1.12 及更早版本的启动参数写法（单行字符串） */
  minecraftArguments?: string;
}

/** 版本 json 链：child 为实例引用的版本（加载器 profile 或原版），parent 为原版 */
interface iGM_Launcher_LaunchChain {
  child: iGM_Launcher_LaunchVersionJson;
  parent: iGM_Launcher_LaunchVersionJson | null;
  childPath: string;
  parentPath: string | null;
}

/** 启动任务：状态快照 + 进程句柄 */
interface iGM_Launcher_LaunchTask {
  status: iGM_Launcher_LaunchStatus;
  child: ReturnType<typeof Bun.spawn> | null;
}

/** 正版启动身份（由桥接层在主进程内解析绑定密钥后传入，令牌绝不回传渲染进程） */
export interface iGM_Launcher_LaunchOfficialIdentity {
  /** Minecraft UUID（带连字符） */
  uuid: string;
  /** Minecraft 玩家名 */
  name: string;
  /** Minecraft 访问令牌 */
  accessToken: string;
  /** Xbox XUID */
  xuid: string;
}

/** 启动入参（由桥接层组装，本模块不读任何落盘文件） */
export interface iGM_Launcher_LaunchRequest {
  instance: iGM_Launcher_InstanceRecord;
  account: iGM_Launcher_AccountSession;
  javas: iGM_Launcher_JavaRuntime[];
  defaultJavaId: string | null;
  /** 生效的共享根目录（.minecraft 根），缺省时由实例目录反推 */
  rootDir?: string;
  /** 启动登录方式：offline 离线 / official 正版（缺省按离线处理） */
  mode?: iGM_Launcher_LaunchMode;
  /** 正版启动身份：mode 为 official 时必填 */
  official?: iGM_Launcher_LaunchOfficialIdentity | null;
  /** 正版启动使用的 MSA Client ID（写入 --clientId） */
  clientId?: string;
}

/** 启动结果：成功回传状态快照，失败回传可读原因 */
export type iGM_Launcher_LaunchResult =
  | { success: true; status: iGM_Launcher_LaunchStatus }
  | { success: false; code: number; message: string };

// 核心逻辑 //

/** 未检测到可用 Java 时的统一提示（启动前预检与 spawn 失败映射共用） */
const IGM_LAUNCHER_LAUNCH_NO_JAVA_MESSAGE =
  "未检测到可用的 Java 运行时，请先在「Java 管理」中点击检测或手动添加 java.exe 后重试";

/** 运行中的启动任务表（按实例 id 索引，仅存内存） */
const iGM_Launcher_LaunchTasks = new Map<string, iGM_Launcher_LaunchTask>();

/** 最近一次启动的实例 id（不带实例 id 查询时使用） */
let iGM_Launcher_LaunchLastInstanceId: string | null = null;

/* ---- 通用工具 ---- */

/** 当前平台对应的官方 os 名 */
function iGM_Launcher_Launch_OsName(): string {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "osx";
  return "linux";
}

/** classpath 分隔符 */
function iGM_Launcher_Launch_PathSeparator(): string {
  return process.platform === "win32" ? ";" : ":";
}

/** 由 maven 坐标推导仓库相对路径：group:artifact:version[:classifier] */
function iGM_Launcher_Launch_MavenPath(name: string): string {
  const [group, artifact, version, classifier] = name.split(":");
  const groupPath = (group ?? "").replace(/\./g, "/");
  const suffix = classifier ? `-${classifier}` : "";
  return `${groupPath}/${artifact}/${version}/${artifact}-${version}${suffix}.jar`;
}

/** 启动时注入的特性开关（自定义分辨率按实例窗口尺寸启用） */
function iGM_Launcher_Launch_Features(): Record<string, boolean> {
  return {
    is_demo_user: false,
    has_custom_resolution: true,
    has_quick_plays_support: false,
    is_quick_play_singleplayer: false,
    is_quick_play_multiplayer: false,
    is_quick_play_realms: false,
  };
}

/**
 * 规则判定：无 rules 视为允许；逐条匹配当前平台与特性，最后一条命中规则决定结果
 * （与官方启动器一致）。arch 与 os.version 不做匹配，避免误判导致参数丢失。
 */
function iGM_Launcher_Launch_AllowRules(
  rules: iGM_Launcher_LaunchRule[] | undefined,
  features: Record<string, boolean>,
): boolean {
  if (!rules || rules.length === 0) return true;
  const osName = iGM_Launcher_Launch_OsName();
  let allowed = false;
  for (const rule of rules) {
    const osMatched = !rule.os?.name || rule.os.name === osName;
    const featureMatched =
      !rule.features ||
      Object.entries(rule.features).every(
        ([key, expect]) => (features[key] ?? false) === expect,
      );
    if (osMatched && featureMatched) allowed = rule.action === "allow";
  }
  return allowed;
}

/** 收集参数条目（过滤规则不允许的条目，展开字符串数组） */
function iGM_Launcher_Launch_CollectArguments(
  entries: iGM_Launcher_LaunchArgument[] | undefined,
  features: Record<string, boolean>,
): string[] {
  const result: string[] = [];
  for (const entry of entries ?? []) {
    if (typeof entry === "string") {
      result.push(entry);
      continue;
    }
    if (!iGM_Launcher_Launch_AllowRules(entry.rules, features)) continue;
    const value = entry.value;
    if (typeof value === "string") result.push(value);
    else if (Array.isArray(value)) result.push(...value);
  }
  return result;
}

/** 按空白切分参数文本，保留引号内的完整片段 */
function iGM_Launcher_Launch_SplitArgs(text: string): string[] {
  const matched = text.match(/"([^"]*)"|'([^']*)'|(\S+)/g) ?? [];
  return matched
    .map((item) => item.replace(/^["']|["']$/g, ""))
    .filter((item) => item.length > 0);
}

/** 模板占位替换：${key} 形式，未登记的占位符原样保留 */
function iGM_Launcher_Launch_ApplyTemplate(
  value: string,
  vars: Record<string, string>,
): string {
  return value.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (raw, key: string) => vars[key] ?? raw);
}

/** 读取并解析版本 json，缺失或非法时返回 null */
async function iGM_Launcher_Launch_ReadVersionJson(
  jsonPath: string,
): Promise<iGM_Launcher_LaunchVersionJson | null> {
  if (!existsSync(jsonPath)) return null;
  try {
    return JSON.parse(await readFile(jsonPath, "utf8")) as iGM_Launcher_LaunchVersionJson;
  } catch (error) {
    console.warn(`[iGM_Launcher_Launch] 版本 json 解析失败：${jsonPath}`, error);
    return null;
  }
}

/* ---- natives 解压 ---- */

/** 定位 zip 中央目录结束记录（EOCD），未找到返回 -1 */
function iGM_Launcher_Launch_FindEocd(buffer: Buffer): number {
  for (let index = buffer.length - 22; index >= 0 && index >= buffer.length - 66_000; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) return index;
  }
  return -1;
}

/**
 * 解压 natives 压缩包到目标目录。
 * 只做最小实现：按中央目录逐条读取，stored（0）与 deflate（8）两种压缩方式，
 * 跳过目录项与 META-INF；返回解压出的文件数。压缩包结构异常时抛错，由调用方如实上报。
 */
function iGM_Launcher_Launch_ExtractZip(zipPath: string, destDir: string): number {
  const buffer = readFileSync(zipPath);
  const eocd = iGM_Launcher_Launch_FindEocd(buffer);
  if (eocd < 0) throw new Error(`依赖库结构异常：${zipPath}`);

  const total = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const root = normalize(destDir);
  let files = 0;

  for (let index = 0; index < total; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;

    if (!name || name.endsWith("/") || name.includes("..")) continue;
    if (name.startsWith("META-INF/")) continue;
    if (localOffset + 30 > buffer.length) continue;
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) continue;

    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const raw = buffer.subarray(dataStart, dataStart + compressedSize);
    const content = method === 0 ? raw : method === 8 ? inflateRawSync(raw) : null;
    if (!content) continue;

    const target = normalize(join(root, name));
    if (!target.startsWith(root)) continue;
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
    files += 1;
  }

  return files;
}

/* ---- Java 运行时选取 ---- */

/**
 * 选取启动用 Java：
 * 实例指定 -> 全局默认 -> 已配置列表中首个文件存在的运行时 -> 真实扫描本机（含 PATH）。
 * 已登记的运行时可能已被卸载，故一律以文件是否真实存在为准（不看 available 字段）；
 * 全部落空时返回空串，由调用方给出「未检测到可用 Java」的可读提示，
 * 不再回退到字面量 "java"（Windows 上 Bun.spawn 找不到该可执行文件会抛原生错误）。
 */
function iGM_Launcher_Launch_JavaPath(
  instance: iGM_Launcher_InstanceRecord,
  javas: iGM_Launcher_JavaRuntime[],
  defaultJavaId: string | null,
): string {
  const candidates: (iGM_Launcher_JavaRuntime | undefined)[] = [
    instance.javaId ? javas.find((item) => item.id === instance.javaId) : undefined,
    defaultJavaId ? javas.find((item) => item.id === defaultJavaId) : undefined,
    javas.find((item) => item.path.trim().length > 0 && existsSync(normalize(item.path))),
  ];
  for (const candidate of candidates) {
    if (candidate && candidate.path.trim() && existsSync(normalize(candidate.path))) {
      return normalize(candidate.path);
    }
  }
  // 未登记但本机已安装：真实扫描常见安装目录与系统 PATH，日志中会如实记录实际使用的路径
  return iGM_Launcher_Java_ScanPaths()[0] ?? "";
}

/* ---- 共享根目录 ---- */

/** 解析共享根目录：实例 gameDir 反推 -> 目录本身即 .minecraft 根 -> 传入的生效根目录 */
function iGM_Launcher_Launch_ResolveRoot(
  instance: iGM_Launcher_InstanceRecord,
  preferred?: string,
): string {
  const fromGameDir = iGM_Launcher_RootDirOfInstance(instance.directory);
  if (fromGameDir) return normalize(fromGameDir);
  const directory = normalize(instance.directory || "");
  if (directory && existsSync(join(directory, "versions"))) return directory;
  const fallback = preferred?.trim() ?? "";
  return fallback ? normalize(iGM_Launcher_McRootOfParent(fallback)) : "";
}

/* ---- 版本链解析 ---- */

/**
 * 解析版本 json 链：
 * 实例引用的版本目录名由 <版本号>-<加载器> 规则得出，其 json 缺失时直接判定未安装；
 * json 带 inheritsFrom（Fabric profile）时继续读取被继承的原版 json。
 */
async function iGM_Launcher_Launch_ResolveChain(
  rootDir: string,
  versionId: string,
): Promise<iGM_Launcher_LaunchChain | null> {
  const childPath = join(rootDir, "versions", versionId, `${versionId}.json`);
  const child = await iGM_Launcher_Launch_ReadVersionJson(childPath);
  if (!child) return null;

  const inheritsFrom = typeof child.inheritsFrom === "string" ? child.inheritsFrom.trim() : "";
  if (!inheritsFrom) {
    return { child, parent: null, childPath, parentPath: null };
  }

  const parentPath = join(rootDir, "versions", inheritsFrom, `${inheritsFrom}.json`);
  const parent = await iGM_Launcher_Launch_ReadVersionJson(parentPath);
  if (!parent) return null;
  return { child, parent, childPath, parentPath };
}

/* ---- 启动主流程 ---- */

/** 组装启动命令（不含 Java 可执行文件本身） */
interface iGM_Launcher_LaunchCommand {
  jvmArgs: string[];
  mainClass: string;
  gameArgs: string[];
  logPath: string;
  nativesDir: string;
  classpathCount: number;
}

/**
 * 组装完整启动命令。
 * classpath = 全部可用依赖库（原版 + 加载器）+ 客户端 jar；
 * natives 按当前平台的 classifier 解压到实例目录并作为 -Djava.library.path；
 * 依赖库或客户端 jar 缺失时如实抛错，提示重新下载补齐。
 */
async function iGM_Launcher_Launch_BuildCommand(
  request: iGM_Launcher_LaunchRequest,
  rootDir: string,
  javaPath: string,
): Promise<iGM_Launcher_LaunchCommand> {
  const { instance } = request;
  const versionId = iGM_Launcher_VersionDirName(instance.minecraftVersion, instance.loader);
  const chain = await iGM_Launcher_Launch_ResolveChain(rootDir, versionId);
  if (!chain) {
    throw new iGM_Launcher_LaunchError(
      IGM_LAUNCHER_BRIDGE_NOT_FOUND,
      `共享根目录中未找到版本 ${versionId}，请先在版本库完成下载安装`,
    );
  }

  const { child, parent } = chain;
  const features = iGM_Launcher_Launch_Features();
  const osName = iGM_Launcher_Launch_OsName();
  const librariesDir = join(rootDir, "libraries");
  const assetsDir = join(rootDir, "assets");

  // 依赖库：父版本在前、子版本在后，官方启动器按此顺序拼装 classpath
  const libraries: iGM_Launcher_LaunchLibrary[] = [
    ...(parent?.libraries ?? []),
    ...(child.libraries ?? []),
  ];

  const classpath: string[] = [];
  const nativesJars: string[] = [];
  const missing: string[] = [];

  for (const library of libraries) {
    if (!iGM_Launcher_Launch_AllowRules(library.rules, features)) continue;

    const artifact = library.downloads?.artifact;
    const relative =
      artifact?.path ?? (library.name ? iGM_Launcher_Launch_MavenPath(library.name) : "");
    if (relative) {
      const absolute = join(librariesDir, relative);
      if (existsSync(absolute)) classpath.push(absolute);
      else missing.push(relative);
    }

    const classifierKey = library.natives?.[osName];
    const classifier = classifierKey
      ? library.downloads?.classifiers?.[classifierKey]
      : undefined;
    const classifierRelative =
      classifier?.path ??
      (classifierKey && library.name
        ? iGM_Launcher_Launch_MavenPath(`${library.name}:${classifierKey}`)
        : "");
    if (classifierRelative) {
      const absolute = join(librariesDir, classifierRelative);
      if (existsSync(absolute)) nativesJars.push(absolute);
      else missing.push(classifierRelative);
    }
  }

  if (missing.length > 0) {
    throw new iGM_Launcher_LaunchError(
      IGM_LAUNCHER_BRIDGE_INVALID,
      `缺少 ${missing.length} 个依赖库文件（如 ${missing[0]}），请在版本库重新下载该版本补齐文件`,
    );
  }

  // 客户端 jar 始终来自被继承的原版版本目录
  const clientVersion =
    (typeof child.inheritsFrom === "string" && child.inheritsFrom.trim()) || versionId;
  const clientJar = join(rootDir, "versions", clientVersion, `${clientVersion}.jar`);
  if (!existsSync(clientJar)) {
    throw new iGM_Launcher_LaunchError(
      IGM_LAUNCHER_BRIDGE_NOT_FOUND,
      `缺少客户端文件 versions/${clientVersion}/${clientVersion}.jar，请重新下载该版本`,
    );
  }
  classpath.push(clientJar);

  // natives 解压：只在本机存在对应分类器文件时执行，解压目录即 java.library.path
  const gameDir = normalize(instance.directory || join(rootDir, "instances", instance.name));
  const nativesDir = join(gameDir, IGM_LAUNCHER_LAUNCH_NATIVES_DIR_NAME);
  for (const jar of nativesJars) {
    mkdirSync(nativesDir, { recursive: true });
    iGM_Launcher_Launch_ExtractZip(jar, nativesDir);
  }

  // 模板变量：与官方启动器保持同名占位符
  // 正版启动注入真实访问令牌与微软账号身份；离线启动沿用本地离线角色与固定令牌 0
  const official = request.mode === "official" ? request.official : null;
  if (request.mode === "official" && !official) {
    throw new iGM_Launcher_LaunchError(
      IGM_LAUNCHER_BRIDGE_INVALID,
      "正版启动缺少可用的 Minecraft 账号绑定，请先在账户页绑定微软正版账号",
    );
  }
  const playerName = iGM_Launcher_SafePlayerName(
    official ? official.name : request.account.offlineName || request.account.userName,
  );
  const playerUuid = (
    official ? official.uuid : request.account.offlineUuid || iGM_Launcher_MakeOfflineUuid()
  ).replace(/-/g, "");
  const accessToken = official ? official.accessToken : "0";
  const assetIndexName =
    child.assetIndex?.id ?? parent?.assetIndex?.id ?? child.assets ?? parent?.assets ?? "";
  const separator = iGM_Launcher_Launch_PathSeparator();
  const vars: Record<string, string> = {
    auth_player_name: playerName,
    version_name: versionId,
    game_directory: gameDir,
    assets_root: assetsDir,
    assets_index_name: assetIndexName,
    auth_uuid: playerUuid,
    auth_access_token: accessToken,
    auth_session: `token:${accessToken}:${playerUuid}`,
    user_type: official ? IGM_LAUNCHER_LAUNCH_USER_TYPE_OFFICIAL : IGM_LAUNCHER_LAUNCH_USER_TYPE,
    version_type: parent?.type ?? "release",
    user_properties: "{}",
    natives_directory: nativesDir,
    launcher_name: IGM_LAUNCHER_APP_NAME,
    launcher_version: IGM_LAUNCHER_VERSION,
    classpath: classpath.join(separator),
    classpath_separator: separator,
    library_directory: librariesDir,
    resolution_width: String(instance.windowWidth),
    resolution_height: String(instance.windowHeight),
    clientid: official ? request.clientId ?? "" : "",
    auth_xuid: official ? official.xuid : "",
  };
  const render = (items: string[]): string[] =>
    items.map((item) => iGM_Launcher_Launch_ApplyTemplate(item, vars));

  // JVM 参数：内存与实例自定义参数在前，版本 json 提供的参数在后（后者优先级更高）
  const jvmFromJson = render(
    iGM_Launcher_Launch_CollectArguments(
      [...(parent?.arguments?.jvm ?? []), ...(child.arguments?.jvm ?? [])],
      features,
    ),
  );
  const jvmArgs: string[] = [
    `-Xmx${Math.max(512, instance.maxMemoryMb)}M`,
    `-Xms${Math.max(256, instance.minMemoryMb)}M`,
    ...iGM_Launcher_Launch_SplitArgs(instance.jvmArgs ?? ""),
  ];
  if (jvmFromJson.length > 0) {
    jvmArgs.push(...jvmFromJson);
  } else {
    // 老版本 json 未声明 JVM 参数：补齐 classpath 与 natives 路径
    jvmArgs.push(`-Djava.library.path=${nativesDir}`, "-cp", classpath.join(separator));
  }

  // 游戏参数：优先 arguments.game（含规则），否则回退老式 minecraftArguments
  const gameFromJson =
    (child.arguments?.game?.length || parent?.arguments?.game?.length)
      ? render(
          iGM_Launcher_Launch_CollectArguments(
            [...(parent?.arguments?.game ?? []), ...(child.arguments?.game ?? [])],
            features,
          ),
        )
      : render(
          iGM_Launcher_Launch_SplitArgs(
            child.minecraftArguments ?? parent?.minecraftArguments ?? "",
          ),
        );
  const gameArgs = [...gameFromJson, ...iGM_Launcher_Launch_SplitArgs(instance.gameArgs ?? "")];

  const mainClass = child.mainClass ?? parent?.mainClass ?? "";
  if (!mainClass) {
    throw new iGM_Launcher_LaunchError(
      IGM_LAUNCHER_BRIDGE_INVALID,
      `版本 ${versionId} 的启动配置缺少主类，版本 json 可能不完整`,
    );
  }

  return {
    jvmArgs,
    mainClass,
    gameArgs,
    logPath: join(gameDir, IGM_LAUNCHER_LAUNCH_LOG_RELATIVE),
    nativesDir,
    classpathCount: classpath.length,
  };
}

/** 启动流程内的可读错误（携带响应码，由桥接层透传给界面） */
class iGM_Launcher_LaunchError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = "iGM_Launcher_LaunchError";
    this.code = code;
  }
}

/** 把游戏输出同时写入日志文件，保证进程管道不被填满 */
async function iGM_Launcher_Launch_PipeLog(
  stream: ReadableStream<Uint8Array> | null,
  logPath: string,
): Promise<void> {
  if (!stream) return;
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    if (!value) continue;
    try {
      await appendFile(logPath, decoder.decode(value, { stream: true }), "utf8");
    } catch {
      // 日志写入失败不影响游戏进程，忽略即可
    }
  }
}

/** 更新启动阶段与对应进度（引擎内统一入口，界面按 stage / progress 展示进度条） */
function iGM_Launcher_Launch_SetStage(
  status: iGM_Launcher_LaunchStatus,
  stage: iGM_Launcher_LaunchStage,
): void {
  status.stage = stage;
  status.progress = iGM_Launcher_LaunchStageProgress(stage);
  status.stageMessage = `stage_${stage}`;
}

/**
 * 启动实例：真实拉起 Java 进程并登记状态。
 * 同一实例已在运行时直接拒绝，避免重复拉起导致存档冲突。
 * 启动过程中按阶段推进 stage / progress，供独立启动进度页展示进度条。
 */
export async function iGM_Launcher_Launch_Start(
  request: iGM_Launcher_LaunchRequest,
): Promise<iGM_Launcher_LaunchResult> {
  const { instance } = request;
  const running = iGM_Launcher_LaunchTasks.get(instance.id);
  if (running && (running.status.state === "starting" || running.status.state === "running")) {
    return {
      success: false,
      code: IGM_LAUNCHER_BRIDGE_INVALID,
      message: `实例「${instance.name}」已在运行中`,
    };
  }

  const mode: iGM_Launcher_LaunchMode = request.mode === "official" ? "official" : "offline";
  const versionId = iGM_Launcher_VersionDirName(instance.minecraftVersion, instance.loader);
  const status: iGM_Launcher_LaunchStatus = {
    instanceId: instance.id,
    instanceName: instance.name,
    versionId,
    mode,
    stage: "preparing",
    progress: iGM_Launcher_LaunchStageProgress("preparing"),
    stageMessage: "stage_preparing",
    playerName: iGM_Launcher_SafePlayerName(
      mode === "official"
        ? request.official?.name ?? ""
        : request.account.offlineName || request.account.userName,
    ),
    pid: 0,
    state: "starting",
    javaPath: "",
    gameDir: normalize(instance.directory || ""),
    logPath: "",
    startedAt: new Date().toISOString(),
    exitedAt: null,
    exitCode: null,
    error: "",
  };
  const task: iGM_Launcher_LaunchTask = { status, child: null };
  iGM_Launcher_LaunchTasks.set(instance.id, task);
  iGM_Launcher_LaunchLastInstanceId = instance.id;

  try {
    const rootDir = iGM_Launcher_Launch_ResolveRoot(instance, request.rootDir);
    if (!rootDir) {
      throw new iGM_Launcher_LaunchError(
        IGM_LAUNCHER_BRIDGE_INVALID,
        "尚未确定共享 .minecraft 根目录，请先在设置中配置游戏目录",
      );
    }
    iGM_Launcher_Launch_SetStage(status, "java");
    const javaPath = iGM_Launcher_Launch_JavaPath(
      instance,
      request.javas,
      request.defaultJavaId,
    );
    // 启动前预检：本机确实没有可用 Java 时给出可照做的中文提示，不把原生错误抛给界面
    if (!javaPath) {
      throw new iGM_Launcher_LaunchError(
        IGM_LAUNCHER_BRIDGE_NOT_FOUND,
        IGM_LAUNCHER_LAUNCH_NO_JAVA_MESSAGE,
      );
    }
    iGM_Launcher_Launch_SetStage(status, "building");
    const command = await iGM_Launcher_Launch_BuildCommand(request, rootDir, javaPath);
    await mkdir(dirname(command.logPath), { recursive: true });
    await appendFile(
      command.logPath,
      `\n===== ${new Date().toISOString()} 启动 ${instance.name}（${versionId}） =====\n` +
        `登录方式：${mode === "official" ? "正版账号" : "离线角色"}（${status.playerName}）\n` +
        `Java：${javaPath}\nGameDir：${status.gameDir}\n依赖库：${command.classpathCount} 个\n`,
      "utf8",
    );

    iGM_Launcher_Launch_SetStage(status, "spawning");
    const child = Bun.spawn({
      cmd: [javaPath, ...command.jvmArgs, command.mainClass, ...command.gameArgs],
      cwd: status.gameDir,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });

    task.child = child;
    status.javaPath = javaPath;
    status.logPath = command.logPath;
    status.pid = child.pid;
    status.state = "running";
    iGM_Launcher_Launch_SetStage(status, "running");

    void iGM_Launcher_Launch_PipeLog(child.stdout, command.logPath);
    void iGM_Launcher_Launch_PipeLog(child.stderr, command.logPath);
    void child.exited.then(
      (code) => {
        const current = iGM_Launcher_LaunchTasks.get(instance.id);
        if (current !== task) return;
        status.state = "exited";
        status.exitCode = code;
        status.exitedAt = new Date().toISOString();
        if (code !== 0) status.error = `游戏进程已退出（退出码 ${code}）`;
      },
      (error: unknown) => {
        const current = iGM_Launcher_LaunchTasks.get(instance.id);
        if (current !== task) return;
        status.state = "failed";
        iGM_Launcher_Launch_SetStage(status, "failed");
        status.exitedAt = new Date().toISOString();
        status.error = error instanceof Error ? error.message : "游戏进程异常退出";
      },
    );

    return { success: true, status: { ...status } };
  } catch (error) {
    status.state = "failed";
    iGM_Launcher_Launch_SetStage(status, "failed");
    status.exitedAt = new Date().toISOString();
    const raw = error instanceof Error ? error.message : "启动失败";
    // Bun.spawn 找不到可执行文件时抛原生错误（Executable not found in $PATH），
    // 此类文本对用户毫无意义，统一换成可照做的中文提示，其余错误如实透传
    status.error = /executable not found|not found in \$?PATH/i.test(raw)
      ? IGM_LAUNCHER_LAUNCH_NO_JAVA_MESSAGE
      : raw;
    const code =
      error instanceof iGM_Launcher_LaunchError ? error.code : IGM_LAUNCHER_BRIDGE_FAILED;
    return { success: false, code, message: status.error };
  }
}

/** 查询启动状态：不带实例 id 时取最近一次启动的实例 */
export function iGM_Launcher_Launch_Status(
  instanceId?: string,
): iGM_Launcher_LaunchStatus | null {
  const id = instanceId?.trim() || iGM_Launcher_LaunchLastInstanceId || "";
  const task = id ? iGM_Launcher_LaunchTasks.get(id) : undefined;
  return task ? { ...task.status } : null;
}

// 导出 //
export default iGM_Launcher_Launch_Start;