/**
 * 文件路径：apps/shell/scripts/iGM_Launcher_SyncUi.ts
 * 所属层：桌面外壳 / 构建脚本层
 * 路由：全局（构建期）
 * 模块：iGM_Launcher_SyncUi
 * 作用：把 Next.js 静态导出产物、LOGO 与下载器 SDK 动态库同步到外壳资源目录，供 Electrobun 打包
 * 内容：清空并复制 apps/launcher-ui/out -> apps/shell/iGM_Launcher_Assets/launcher，
 *       复制项目 LOGO -> iGM_Launcher_Assets/icon.ico，
 *       复制 zig-core 的 zig build 产物 -> iGM_Launcher_Assets/sdk（未编译时跳过）
 */

// 导入依赖 //
import { cp, mkdir, rm, access } from "node:fs/promises";
import { join } from "node:path";

// 类型定义 //
/* （无额外类型） */

// 核心逻辑 //
const iGM_Launcher_ShellDir = join(import.meta.dir, "..");
const iGM_Launcher_ProjectRoot = join(iGM_Launcher_ShellDir, "..", "..");

/** 静态导出产物目录 */
const iGM_Launcher_UiOutDir = join(iGM_Launcher_ProjectRoot, "apps", "launcher-ui", "out");

/** 外壳资源目录（与 electrobun.config.ts 的 build.copy 源路径一致） */
const iGM_Launcher_AssetsDir = join(iGM_Launcher_ShellDir, "iGM_Launcher_Assets");

/** 静态界面在资源目录中的目标位置 */
const iGM_Launcher_UiTargetDir = join(iGM_Launcher_AssetsDir, "launcher");

/** 项目 LOGO（主站复用，自动识别为 .ico） */
const iGM_Launcher_LogoSource = join(iGM_Launcher_ProjectRoot, "image", "save1.ico");

const iGM_Launcher_IconTarget = join(iGM_Launcher_AssetsDir, "icon.ico");

/** 下载器 SDK 动态库在资源目录中的目标位置（与 build.copy 的 "sdk" 目标一致） */
const iGM_Launcher_SdkTargetDir = join(iGM_Launcher_AssetsDir, "sdk");

/** SDK 构建产物目录（zig-core 的 zig build 输出） */
const iGM_Launcher_SdkArtifactDirs = [
  join(iGM_Launcher_ProjectRoot, "zig-core", "zig-out", "bin"),
];

/** 各平台动态库文件名（与 iGM_Launcher_SDK.ts 的解析规则一致） */
const iGM_Launcher_SdkLibraryNames = [
  "igm_downloader.dll",
  "libigm_downloader.dylib",
  "libigm_downloader.so",
];

async function iGM_Launcher_PathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function iGM_Main(): Promise<void> {
  if (!(await iGM_Launcher_PathExists(iGM_Launcher_UiOutDir))) {
    throw new Error(
      `未找到静态导出产物：${iGM_Launcher_UiOutDir}\n请先执行 bun run build:ui`,
    );
  }

  await rm(iGM_Launcher_UiTargetDir, { recursive: true, force: true });
  await mkdir(iGM_Launcher_TargetParent(), { recursive: true });
  await cp(iGM_Launcher_UiOutDir, iGM_Launcher_UiTargetDir, { recursive: true });

  if (await iGM_Launcher_PathExists(iGM_Launcher_LogoSource)) {
    await cp(iGM_Launcher_LogoSource, iGM_Launcher_IconTarget);
  } else {
    console.warn(`[iGM_Launcher_SyncUi] 未找到 LOGO，跳过图标同步：${iGM_Launcher_LogoSource}`);
  }

  await iGM_Launcher_SyncSdk();

  console.log(`[iGM_Launcher_SyncUi] 已同步静态界面 -> ${iGM_Launcher_UiTargetDir}`);
}

/**
 * 同步下载器 SDK 动态库：
 * 从 zig 产物目录取各平台库文件复制到资源目录；
 * 未编译时仅创建空目录占位，交由构建阶段静默跳过，不阻断打包。
 */
async function iGM_Launcher_SyncSdk(): Promise<void> {
  await rm(iGM_Launcher_SdkTargetDir, { recursive: true, force: true });
  await mkdir(iGM_Launcher_SdkTargetDir, { recursive: true });

  let copied = 0;
  for (const artifactDir of iGM_Launcher_SdkArtifactDirs) {
    for (const libName of iGM_Launcher_SdkLibraryNames) {
      const source = join(artifactDir, libName);
      if (!(await iGM_Launcher_PathExists(source))) continue;
      await cp(source, join(iGM_Launcher_SdkTargetDir, libName));
      copied += 1;
    }
    if (copied > 0) break;
  }

  if (copied === 0) {
    console.warn(
      "[iGM_Launcher_SyncUi] 未找到已编译的 SDK 动态库，跳过同步（请先执行 bun run build:zig）",
    );
  } else {
    console.log(`[iGM_Launcher_SyncUi] 已同步 ${copied} 个 SDK 动态库 -> ${iGM_Launcher_SdkTargetDir}`);
  }
}

/** 资源目录本身（拆出以便 mkdir 调用语义清晰） */
function iGM_Launcher_TargetParent(): string {
  return iGM_Launcher_AssetsDir;
}

// 导出 //
await iGM_Main();