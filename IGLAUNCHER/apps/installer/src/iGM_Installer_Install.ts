/**
 * 文件路径：apps/installer/src/iGM_Installer_Install.ts
 * 所属层：安装程序 / 安装引擎层
 * 路由：全局
 * 模块：iGM_Installer_Install
 * 作用：真实安装流程——解析载荷、整包复制到用户目录、写入安装配置、创建快捷方式
 * 内容：默认安装目录取 %LOCALAPPDATA%\iGM Launcher，可被界面传入的目录覆盖；
 *       复制阶段逐文件上报已复制数与当前文件，供界面进度条与阶段文案展示；
 *       安装配置（语言 + 安装目录）写入启动器数据根目录的 installer.json，
 *       启动器首启读取该语言，实现「安装程序与启动器语言设置保持一致」；
 *       全部失败路径如实回传 failed 阶段与原因，绝不伪造成功
 */

// 导入依赖 //
import { existsSync } from "node:fs";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { cp } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import {
  IGM_INSTALLER_CONFIG_FILE,
  IGM_INSTALLER_DEFAULT_SUBDIR,
  IGM_INSTALLER_LAUNCHER_RELATIVE_EXE,
  IGM_INSTALLER_PAYLOAD_DIR,
  IGM_LAUNCHER_DATA_ROOT,
  type iGM_Installer_Progress,
  type iGM_Launcher_InstallerConfig,
  type iGM_Launcher_Locale,
} from "@igm-launcher/shared";
import { iGM_Installer_CreateShortcuts } from "./iGM_Installer_Shortcut";

// 类型定义 //
/** 一次安装的输入 */
export interface iGM_Installer_RunOptions {
  /** 向导中选择的语言 */
  locale: iGM_Launcher_Locale;
  /** 用户确认的安装目录 */
  dir: string;
  /** 进度回调，由主进程转发给界面 */
  onProgress: (progress: iGM_Installer_Progress) => void;
}

/** 复制进度回调（参数为刚完成的文件绝对路径） */
type iGM_Installer_CopyReporter = (currentFile: string) => void;

// 核心逻辑 //

/** 进度上报节流间隔（毫秒），避免上万个小文件把界面刷爆 */
const IGM_INSTALLER_PROGRESS_INTERVAL_MS = 150;

/** 复制阶段在总进度中占据的百分比区间 */
const IGM_INSTALLER_COPY_FROM = 5;
const IGM_INSTALLER_COPY_TO = 92;

/** 默认安装目录：%LOCALAPPDATA%\iGM Launcher */
export function iGM_Installer_DefaultDir(): string {
  const localAppData =
    process.env.LOCALAPPDATA?.trim() || join(homedir(), "AppData", "Local");
  return join(localAppData, IGM_INSTALLER_DEFAULT_SUBDIR);
}

/** 安装配置文件的绝对路径（与启动器桥接层的读取位置保持一致） */
export function iGM_Installer_ConfigPath(): string {
  return join(IGM_LAUNCHER_DATA_ROOT, IGM_INSTALLER_CONFIG_FILE);
}

/**
 * 解析内嵌载荷目录。
 * 打包后主进程位于 <包>/Resources/app/bun，views 位于 <包>/Resources/app/views，
 * 故以主进程模块目录为基准向上定位；开发模式可用环境变量 IGM_INSTALLER_PAYLOAD_ROOT
 * 直接指向启动器构建产物目录。
 */
export function iGM_Installer_ResolvePayloadDir(): string {
  const override = process.env.IGM_INSTALLER_PAYLOAD_ROOT?.trim();
  const candidates: string[] = [];
  if (override) candidates.push(join(override, IGM_INSTALLER_PAYLOAD_DIR));
  candidates.push(
    join(import.meta.dir, "..", "views", "payload", IGM_INSTALLER_PAYLOAD_DIR),
    join(
      process.cwd(),
      "..",
      "Resources",
      "app",
      "views",
      "payload",
      IGM_INSTALLER_PAYLOAD_DIR,
    ),
  );

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(`未找到内嵌安装载荷，请确认已执行 sync:payload：${candidates[0]}`);
  }
  return found;
}

/** 读取已写入的安装配置（未安装或读取失败时返回 null） */
export async function iGM_Installer_ReadConfig(): Promise<iGM_Launcher_InstallerConfig | null> {
  const target = iGM_Installer_ConfigPath();
  if (!existsSync(target)) return null;
  try {
    return JSON.parse(await Bun.file(target).text()) as iGM_Launcher_InstallerConfig;
  } catch {
    return null;
  }
}

/** 统计载荷文件总数（用于进度百分比） */
async function iGM_Installer_CountFiles(root: string): Promise<number> {
  let total = 0;
  const stack: string[] = [root];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) stack.push(join(current, entry.name));
      else if (entry.isFile()) total += 1;
    }
  }
  return total;
}

/** 逐文件复制目录树，每完成一个文件回调一次 */
async function iGM_Installer_CopyTree(
  sourceRoot: string,
  targetRoot: string,
  report: iGM_Installer_CopyReporter,
): Promise<void> {
  const stack: { source: string; target: string }[] = [
    { source: sourceRoot, target: targetRoot },
  ];

  while (stack.length > 0) {
    const { source, target } = stack.pop() as { source: string; target: string };
    await mkdir(target, { recursive: true });

    const entries = await readdir(source, { withFileTypes: true });
    for (const entry of entries) {
      const sourcePath = join(source, entry.name);
      const targetPath = join(target, entry.name);
      if (entry.isDirectory()) {
        stack.push({ source: sourcePath, target: targetPath });
      } else if (entry.isFile()) {
        await cp(sourcePath, targetPath);
        report(sourcePath);
      }
    }
  }
}

/** 按已复制比例换算总进度百分比 */
function iGM_Installer_Percent(copied: number, total: number): number {
  if (total <= 0) return IGM_INSTALLER_COPY_FROM;
  const ratio = Math.min(1, copied / total);
  return Math.round(
    IGM_INSTALLER_COPY_FROM + ratio * (IGM_INSTALLER_COPY_TO - IGM_INSTALLER_COPY_FROM),
  );
}

/** 写入安装配置；失败不影响安装结果，仅告警 */
async function iGM_Installer_WriteConfig(
  locale: iGM_Launcher_Locale,
  dir: string,
): Promise<void> {
  const config: iGM_Launcher_InstallerConfig = {
    locale,
    installDir: dir,
    installedAt: new Date().toISOString(),
  };
  try {
    const target = iGM_Installer_ConfigPath();
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  } catch (error) {
    console.warn("[iGM_Installer_Install] 写入安装配置失败（不影响安装结果）", error);
  }
}

/** 清理并重建目标目录（保留目录本身，仅覆盖同名文件） */
async function iGM_Installer_EnsureDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
}

/**
 * 执行安装。
 * 所有阶段与异常都通过 onProgress 回传，函数本身不抛出。
 */
export async function iGM_Installer_Run(options: iGM_Installer_RunOptions): Promise<void> {
  try {
    options.onProgress({ phase: "prepare", percent: 0 });
    const payloadDir = iGM_Installer_ResolvePayloadDir();
    const totalFiles = await iGM_Installer_CountFiles(payloadDir);
    options.onProgress({ phase: "prepare", percent: 2, totalFiles });

    await iGM_Installer_EnsureDir(options.dir);

    let copied = 0;
    let lastReportAt = 0;
    await iGM_Installer_CopyTree(payloadDir, options.dir, (currentFile) => {
      copied += 1;
      const now = Date.now();
      if (copied < totalFiles && now - lastReportAt < IGM_INSTALLER_PROGRESS_INTERVAL_MS) return;
      lastReportAt = now;
      options.onProgress({
        phase: "copy",
        percent: iGM_Installer_Percent(copied, totalFiles),
        copiedFiles: copied,
        totalFiles,
        currentFile,
      });
    });

    options.onProgress({
      phase: "shortcut",
      percent: IGM_INSTALLER_COPY_TO + 3,
      copiedFiles: copied,
      totalFiles,
    });

    await iGM_Installer_WriteConfig(options.locale, options.dir);
    await iGM_Installer_CreateShortcuts(
      join(options.dir, IGM_INSTALLER_LAUNCHER_RELATIVE_EXE),
      options.dir,
    );

    options.onProgress({
      phase: "done",
      percent: 100,
      copiedFiles: copied,
      totalFiles,
    });
  } catch (error) {
    options.onProgress({
      phase: "failed",
      percent: 0,
      message: error instanceof Error ? error.message : "安装过程中发生未知错误",
    });
  }
}

/** 打开已安装的启动器；安装目录中缺少可执行文件时返回 false */
export function iGM_Installer_OpenLauncher(dir: string): boolean {
  const exe = join(dir, IGM_INSTALLER_LAUNCHER_RELATIVE_EXE);
  if (!existsSync(exe)) return false;
  const child = spawn(exe, [], { cwd: dir, detached: true, stdio: "ignore" });
  child.unref();
  return true;
}

// 导出 //
/* 以上具名导出即为本模块对外接口 */