/**
 * 文件路径：apps/shell/src/iGM_Launcher_Java.ts
 * 所属层：桌面外壳 / Java 运行时探测层
 * 路由：全局（不对外暴露 URL，仅被 iGM_Launcher_Bridge 与 iGM_Launcher_Launch 调用）
 * 模块：iGM_Launcher_Java
 * 作用：在本机真实查找 Java 运行时，并运行其二进制探测主版本、发行版与架构
 * 内容：展开共享层给出的扫描根目录占位后逐层查找 bin/java(.exe)，补充 JAVA_HOME
 *       与系统 PATH（where / which java）；探测执行 `java -version` 并解析输出；
 *       返回项一律为真实存在的可执行文件，绝不登记并不存在的路径
 *
 * 说明：模块二的 java:detect / java:test 原为占位实现（硬编码路径、恒标为可用），
 *       本机没有被登记的真实 Java 时，启动引擎回退到 PATH 中的字面量 "java"，
 *       Bun.spawn 抛出的原生错误（Executable not found in $PATH）直接显示给用户；
 *       本模块把检测与探测改为真实行为，供桥接层（检测 / 测试 / 添加）
 *       与启动引擎（选取启动用 Java）共用同一份结果。
 *       Rust 侧对应契约：iGM_Launcher_DetectJava / iGM_Launcher_ProbeJava（尚未实现，
 *       当前由 Bun 侧承担，原生符号就绪后可平滑迁移）。
 */

// 导入依赖 //
import { existsSync, readdirSync, type Dirent } from "node:fs";
import { join, normalize } from "node:path";
import {
  IGM_LAUNCHER_JAVA_SEARCH_ROOTS,
  type iGM_Launcher_JavaVendor,
} from "@igm-launcher/shared";

// 类型定义 //

/** 单个 Java 运行时的探测结果 */
export interface iGM_Launcher_JavaProbe {
  /** 可执行文件绝对路径（已确认存在） */
  path: string;
  /** 主版本号字符串（如 "8" / "17" / "21"），无法解析时为 unknown */
  version: string;
  /** 发行版，无法识别时为 unknown */
  vendor: iGM_Launcher_JavaVendor;
  /** 架构（x64 / x86 / arm64） */
  arch: string;
  /** 是否探测成功（执行 -version 且解析出版本号） */
  ok: boolean;
}

// 核心逻辑 //

/** 目录访问量上限：异常目录结构下也不会拖慢检测 */
const IGM_LAUNCHER_JAVA_MAX_DIRS = 600;
/** 结果数量上限 */
const IGM_LAUNCHER_JAVA_MAX_RESULTS = 32;
/** 递归深度上限：兼容 <根>/<组件>/<平台>/<组件>/bin/java.exe 这类多层结构 */
const IGM_LAUNCHER_JAVA_MAX_DEPTH = 4;
/** 单次探测超时（毫秒）：Java 启动异常时不让主进程无限等待 */
const IGM_LAUNCHER_JAVA_PROBE_TIMEOUT_MS = 3000;
/** 整次检测的总耗时预算（毫秒）：单个 Java 卡死时不会拖垮整次检测（界面桥接调用 8 秒超时） */
const IGM_LAUNCHER_JAVA_SCAN_BUDGET_MS = 4000;

/** 当前平台的可执行文件名（Windows 必须带 .exe，否则 Bun.spawn 找不到） */
function iGM_Launcher_Java_ExeName(): string {
  return process.platform === "win32" ? "java.exe" : "java";
}

/** 展开根目录中的 %ENV% 占位；存在无法展开的占位或结果为空时返回空串 */
function iGM_Launcher_Java_ExpandRoot(rawRoot: string): string {
  let missing = false;
  const expanded = rawRoot.replace(/%([^%]+)%/g, (_raw, name: string) => {
    const value = process.env[name];
    if (!value) missing = true;
    return value ?? "";
  });
  if (missing || expanded.length === 0) return "";
  return normalize(expanded);
}

/** 待扫描根目录：共享层常量（展开占位） + JAVA_HOME */
function iGM_Launcher_Java_Roots(): string[] {
  const roots: string[] = [];
  for (const rawRoot of IGM_LAUNCHER_JAVA_SEARCH_ROOTS) {
    const expanded = iGM_Launcher_Java_ExpandRoot(rawRoot);
    if (expanded) roots.push(expanded);
  }
  const javaHome = process.env.JAVA_HOME?.trim();
  if (javaHome) roots.push(normalize(javaHome));
  return roots;
}

/**
 * 逐层查找目录下的 bin/java(.exe)。
 * 只走目录、深度与访问量均有上限；不跟随符号链接，避免环状结构导致死循环。
 */
function iGM_Launcher_Java_Walk(
  dir: string,
  depth: number,
  found: Set<string>,
  budget: { dirs: number },
): void {
  if (depth < 0 || budget.dirs <= 0 || found.size >= IGM_LAUNCHER_JAVA_MAX_RESULTS) return;
  budget.dirs -= 1;

  const exePath = join(dir, "bin", iGM_Launcher_Java_ExeName());
  if (existsSync(exePath)) found.add(normalize(exePath));

  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    // 无权限或目录已消失：跳过即可，不影响其它根目录
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    iGM_Launcher_Java_Walk(join(dir, entry.name), depth - 1, found, budget);
  }
}

/** 通过系统 PATH 查找 java：Windows 用 where，其它平台用 which */
function iGM_Launcher_Java_FromPath(): string[] {
  const finder = process.platform === "win32" ? "where" : "which";
  try {
    const result = Bun.spawnSync({
      cmd: [finder, "java"],
      stdout: "pipe",
      stderr: "ignore",
      timeout: IGM_LAUNCHER_JAVA_PROBE_TIMEOUT_MS,
    });
    if (result.exitCode !== 0 || !result.stdout) return [];
    return new TextDecoder()
      .decode(result.stdout)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && existsSync(normalize(line)));
  } catch {
    return [];
  }
}

/**
 * 扫描本机真实存在的 Java 可执行文件（不执行探测，供启动引擎快速选取）。
 * 结果按「扫描根目录顺序 -> PATH」排列并去重，顺序稳定可预期。
 */
export function iGM_Launcher_Java_ScanPaths(): string[] {
  const found = new Set<string>();
  const budget = { dirs: IGM_LAUNCHER_JAVA_MAX_DIRS };
  for (const root of iGM_Launcher_Java_Roots()) {
    if (!existsSync(root)) continue;
    iGM_Launcher_Java_Walk(root, IGM_LAUNCHER_JAVA_MAX_DEPTH, found, budget);
  }
  for (const fromPath of iGM_Launcher_Java_FromPath()) found.add(normalize(fromPath));
  return [...found];
}

/* ---- 版本探测 ---- */

/** 从 -version 输出解析主版本号，无法解析时返回空串 */
function iGM_Launcher_Java_ParseVersion(text: string): string {
  // 形如 openjdk version "21.0.5" / java version "1.8.0_431"
  const matched = text.match(/version\s+"([^"]+)"/i);
  if (!matched) return "";
  const raw = matched[1];
  // 1.8.x 一类的旧写法：主版本取第二段
  const parts = raw.split(/[._]/);
  if (parts[0] === "1" && parts.length > 1) return parts[1];
  return parts[0] ?? "";
}

/** 从 -version 输出解析发行版 */
function iGM_Launcher_Java_ParseVendor(text: string): iGM_Launcher_JavaVendor {
  if (/zulu/i.test(text)) return "zulu";
  if (/liberica|bellsoft/i.test(text)) return "liberica";
  if (/temurin|adoptium|eclipse/i.test(text)) return "adoptium";
  if (/oracle|java\(tm\)|hotspot/i.test(text)) return "oracle";
  return "unknown";
}

/** 从 -version 输出解析架构 */
function iGM_Launcher_Java_ParseArch(text: string): string {
  if (/aarch64|arm64/i.test(text)) return "arm64";
  if (/32-bit/i.test(text)) return "x86";
  if (/64-bit/i.test(text)) return "x64";
  return process.arch === "arm64" ? "arm64" : "x64";
}

/**
 * 运行 <java> -version 真实探测。
 * JDK 8 把版本信息写到 stderr、9 及以上写到 stdout，故两路都收集；
 * 文件不存在、不可执行、超时或输出无法解析时 ok 一律为 false。
 */
export function iGM_Launcher_Java_Probe(exePath: string): iGM_Launcher_JavaProbe {
  const path = normalize(exePath);
  const base: iGM_Launcher_JavaProbe = {
    path,
    version: "unknown",
    vendor: "unknown",
    arch: process.arch === "arm64" ? "arm64" : "x64",
    ok: false,
  };
  if (!existsSync(path)) return base;

  let text = "";
  try {
    const result = Bun.spawnSync({
      cmd: [path, "-version"],
      stdout: "pipe",
      stderr: "pipe",
      timeout: IGM_LAUNCHER_JAVA_PROBE_TIMEOUT_MS,
    });
    const decoder = new TextDecoder();
    text = `${decoder.decode(result.stdout ?? new Uint8Array())}\n${decoder.decode(
      result.stderr ?? new Uint8Array(),
    )}`;
  } catch (error) {
    console.warn(`[iGM_Launcher_Java] 探测失败：${path}`, error);
    return base;
  }

  const version = iGM_Launcher_Java_ParseVersion(text);
  if (!version) return base;
  return {
    path,
    version,
    vendor: iGM_Launcher_Java_ParseVendor(text),
    arch: iGM_Launcher_Java_ParseArch(text),
    ok: true,
  };
}

/** 扫描并逐个真实探测，供桥接层 java:detect 使用（整体耗时受预算约束） */
export function iGM_Launcher_Java_Scan(): iGM_Launcher_JavaProbe[] {
  const startedAt = Date.now();
  const results: iGM_Launcher_JavaProbe[] = [];
  for (const path of iGM_Launcher_Java_ScanPaths()) {
    // 已探测出至少一条后超预算即停止：首个 Java 卡死时最多花掉一次探测超时
    if (results.length > 0 && Date.now() - startedAt > IGM_LAUNCHER_JAVA_SCAN_BUDGET_MS) break;
    results.push(iGM_Launcher_Java_Probe(path));
  }
  return results;
}

/** 发行版的展示名（用于自动生成的运行时名称） */
export const IGM_LAUNCHER_JAVA_VENDOR_LABELS: Record<iGM_Launcher_JavaVendor, string> = {
  adoptium: "Adoptium",
  zulu: "Zulu",
  liberica: "Liberica",
  oracle: "Oracle",
  unknown: "系统",
};

// 导出 //
export default iGM_Launcher_Java_Scan;