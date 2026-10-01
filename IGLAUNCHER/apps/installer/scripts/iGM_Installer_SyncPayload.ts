/**
 * 文件路径：apps/installer/scripts/iGM_Installer_SyncPayload.ts
 * 所属层：安装程序 / 构建脚本层
 * 路由：全局（构建期）
 * 模块：iGM_Installer_SyncPayload
 * 作用：把已构建完成的启动器**绿色版**同步为安装程序内嵌载荷
 * 内容：复制 apps/shell/build/<平台前缀>/iGM_Launcher_Portable
 *       -> apps/installer/iGM_Installer_Assets/payload/iGMLauncher，
 *       目标目录名保持 iGMLauncher 与共享常量 IGM_INSTALLER_PAYLOAD_DIR 一致，
 *       该目录经 electrobun.config.ts 的 build.copy 打包为 views://payload，
 *       安装时由主进程整包复制到用户选择的安装目录。
 *
 * 关键说明：载荷源必须是 **绿色版**（iGM_Launcher_Portable），
 * 它包含完整的 bun.exe / Electron 核心 dll / main.js / preload / views，
 * 复制后可直接运行；不能用自解压形态的 iGMLauncher（只有 launcher.exe + tar.zst，
 * 运行时需要同目录 .installer 文件夹，双击会报 "installer package incomplete"）。
 *
 * 依赖：必须先依次执行 build:app 和 portable，否则绿色版不存在，脚本直接报错终止。
 */

// 导入依赖 //
import { access, cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

// 类型定义 //
/* （无额外类型） */

// 核心逻辑 //
const iGM_Installer_AppDir = join(import.meta.dir, "..");
const iGM_Installer_ProjectRoot = join(iGM_Installer_AppDir, "..", "..");

/** 载荷在资源目录中的父目录（build.copy 映射为 views/payload） */
const iGM_Installer_PayloadRoot = join(iGM_Installer_AppDir, "iGM_Installer_Assets", "payload");

/** 载荷目录名，与共享常量 IGM_INSTALLER_PAYLOAD_DIR 保持一致 */
const iGM_Installer_PayloadName = "iGMLauncher";

/** 载荷源目录：shell 绿色版（portable），包含完整可运行文件 */
const iGM_Installer_PayloadSourceName = "iGM_Launcher_Portable";

/** 默认平台产物前缀，可用环境变量 IGM_INSTALLER_BUILD_PREFIX 覆盖 */
function iGM_Installer_DefaultBuildPrefix(): string {
  const os =
    process.platform === "win32" ? "win" : process.platform === "darwin" ? "macos" : "linux";
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  return `stable-${os}-${arch}`;
}

const iGM_Installer_BuildPrefix =
  process.env.IGM_INSTALLER_BUILD_PREFIX?.trim() || iGM_Installer_DefaultBuildPrefix();

/** 启动器构建产物目录（绿色版，完整可运行形态） */
const iGM_Installer_PayloadSource = join(
  iGM_Installer_ProjectRoot,
  "apps",
  "shell",
  "build",
  iGM_Installer_BuildPrefix,
  iGM_Installer_PayloadSourceName,
);

const iGM_Installer_PayloadTarget = join(iGM_Installer_PayloadRoot, iGM_Installer_PayloadName);

async function iGM_Installer_PathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function iGM_Main(): Promise<void> {
  if (!(await iGM_Installer_PathExists(iGM_Installer_PayloadSource))) {
    throw new Error(
      `未找到启动器构建产物：${iGM_Installer_PayloadSource}\n请先执行 bun run build:app`,
    );
  }

  await rm(iGM_Installer_PayloadRoot, { recursive: true, force: true });
  await mkdir(iGM_Installer_PayloadRoot, { recursive: true });
  await cp(iGM_Installer_PayloadSource, iGM_Installer_PayloadTarget, { recursive: true });

  console.log(`[iGM_Installer_SyncPayload] 已同步启动器载荷 -> ${iGM_Installer_PayloadTarget}`);
}

// 导出 //
await iGM_Main();