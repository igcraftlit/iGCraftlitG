/**
 * 文件路径：apps/installer/scripts/iGM_Installer_SyncUi.ts
 * 所属层：安装程序 / 构建脚本层
 * 路由：全局（构建期）
 * 模块：iGM_Installer_SyncUi
 * 作用：把安装向导静态产物与 LOGO 同步到安装程序资源目录，供 Electrobun 打包
 * 内容：清空并复制 apps/launcher-ui/out -> apps/installer/iGM_Installer_Assets/installer，
 *       复制项目 LOGO -> iGM_Installer_Assets/icon.ico
 *
 * 说明：安装向导与启动器界面同属 apps/launcher-ui 的一次静态导出，
 *       本次导出同时产出 index.html（启动器）与 G_Installer.html（安装向导）。
 */

// 导入依赖 //
import { access, cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

// 类型定义 //
/* （无额外类型） */

// 核心逻辑 //
const iGM_Installer_AppDir = join(import.meta.dir, "..");
const iGM_Installer_ProjectRoot = join(iGM_Installer_AppDir, "..", "..");

/** 静态导出产物目录（与启动器界面共用） */
const iGM_Installer_UiOutDir = join(iGM_Installer_ProjectRoot, "apps", "launcher-ui", "out");

/** 资源目录（与 electrobun.config.ts 的 build.copy 源路径一致） */
const iGM_Installer_AssetsDir = join(iGM_Installer_AppDir, "iGM_Installer_Assets");

/** 安装向导界面在资源目录中的目标位置 */
const iGM_Installer_UiTargetDir = join(iGM_Installer_AssetsDir, "installer");

/** 项目 LOGO（主站复用，自动识别为 .ico） */
const iGM_Installer_LogoSource = join(iGM_Installer_ProjectRoot, "image", "save1.ico");

const iGM_Installer_IconTarget = join(iGM_Installer_AssetsDir, "icon.ico");

async function iGM_Installer_PathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function iGM_Main(): Promise<void> {
  if (!(await iGM_Installer_PathExists(iGM_Installer_UiOutDir))) {
    throw new Error(
      `未找到静态导出产物：${iGM_Installer_UiOutDir}\n请先执行 bun run build:ui`,
    );
  }

  await rm(iGM_Installer_UiTargetDir, { recursive: true, force: true });
  await mkdir(iGM_Installer_AssetsDir, { recursive: true });
  await cp(iGM_Installer_UiOutDir, iGM_Installer_UiTargetDir, { recursive: true });

  if (await iGM_Installer_PathExists(iGM_Installer_LogoSource)) {
    await cp(iGM_Installer_LogoSource, iGM_Installer_IconTarget);
  } else {
    console.warn(
      `[iGM_Installer_SyncUi] 未找到 LOGO，跳过图标同步：${iGM_Installer_LogoSource}`,
    );
  }

  console.log(`[iGM_Installer_SyncUi] 已同步安装向导界面 -> ${iGM_Installer_UiTargetDir}`);
}

// 导出 //
await iGM_Main();