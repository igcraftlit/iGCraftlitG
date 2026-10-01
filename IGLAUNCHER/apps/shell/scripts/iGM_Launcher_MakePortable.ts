/**
 * 文件路径：apps/shell/scripts/iGM_Launcher_MakePortable.ts
 * 所属层：桌面外壳 / 构建脚本层
 * 路由：全局（构建期）
 * 模块：iGM_Launcher_MakePortable
 * 作用：从 Electrobun 安装包载荷导出免安装绿色版目录，供用户解压即用
 * 内容：解压 <应用名>-Setup.tar.zst 到临时目录，把其中的应用包整体移动到
 *       build/<平台>/iGM_Launcher_Portable，最后清理临时目录
 *
 * 说明：Electrobun 在 Windows stable 通道只产出安装器（Setup.exe）；
 *       绿色版由安装器同级的 tar.zst 载荷解出，二者内容完全一致。
 */

// 导入依赖 //
import { access, mkdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";

// 类型定义 //
/* （无额外类型） */

// 核心逻辑 //
const iGM_Launcher_ShellDir = join(import.meta.dir, "..");

/** 应用展示名，与 electrobun.config.ts 的 app.name 保持一致 */
const iGM_Launcher_AppName = "iGM Launcher";

/** 应用包目录名（Electrobun 取应用名去空格后的结果） */
const iGM_Launcher_BundleName = "iGMLauncher";

/** 默认平台产物前缀，可用环境变量 IGM_LAUNCHER_BUILD_PREFIX 覆盖 */
function iGM_Launcher_DefaultBuildPrefix(): string {
  const os = process.platform === "win32" ? "win" : process.platform === "darwin" ? "macos" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  return `stable-${os}-${arch}`;
}

const iGM_Launcher_BuildPrefix =
  process.env.IGM_LAUNCHER_BUILD_PREFIX?.trim() || iGM_Launcher_DefaultBuildPrefix();

/** 构建产物目录 */
const iGM_Launcher_BuildDir = join(iGM_Launcher_ShellDir, "build", iGM_Launcher_BuildPrefix);

/** 安装器载荷（绿色版来源） */
const iGM_Launcher_ArchivePath = join(
  iGM_Launcher_BuildDir,
  `${iGM_Launcher_AppName}-Setup.tar.zst`,
);

/** 解压用临时目录 */
const iGM_Launcher_TempDir = join(iGM_Launcher_BuildDir, ".iGM_Launcher_PortableTemp");

/** 绿色版输出目录 */
const iGM_Launcher_PortableDir = join(iGM_Launcher_BuildDir, "iGM_Launcher_Portable");

async function iGM_Launcher_PathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** 调用系统 tar 解压 zstd 压缩包（Windows 10+ 自带 bsdtar，已支持 zstd） */
function iGM_Launcher_ExtractArchive(archive: string, targetDir: string): void {
  const result = Bun.spawnSync(["tar", "-xf", archive, "-C", targetDir], {
    stdout: "inherit",
    stderr: "inherit",
  });
  if (result.exitCode !== 0) {
    throw new Error(`tar 解压失败（退出码 ${result.exitCode}）：${archive}`);
  }
}

async function iGM_Main(): Promise<void> {
  if (!(await iGM_Launcher_PathExists(iGM_Launcher_ArchivePath))) {
    throw new Error(
      `未找到安装器载荷：${iGM_Launcher_ArchivePath}\n请先执行 bun run build:ui && bun run sync:ui && bun run --cwd apps/shell build`,
    );
  }

  await rm(iGM_Launcher_TempDir, { recursive: true, force: true });
  await rm(iGM_Launcher_PortableDir, { recursive: true, force: true });
  await mkdir(iGM_Launcher_TempDir, { recursive: true });

  iGM_Launcher_ExtractArchive(iGM_Launcher_ArchivePath, iGM_Launcher_TempDir);

  const extractedBundle = join(iGM_Launcher_TempDir, iGM_Launcher_BundleName);
  if (!(await iGM_Launcher_PathExists(extractedBundle))) {
    throw new Error(`载荷结构异常，未找到应用包目录：${extractedBundle}`);
  }

  await rename(extractedBundle, iGM_Launcher_PortableDir);
  await rm(iGM_Launcher_TempDir, { recursive: true, force: true });

  console.log(`[iGM_Launcher_MakePortable] 已生成免安装绿色版 -> ${iGM_Launcher_PortableDir}`);
  console.log(`[iGM_Launcher_MakePortable] 启动文件 -> ${join(iGM_Launcher_PortableDir, "bin", "launcher.exe")}`);
}

// 导出 //
await iGM_Main();