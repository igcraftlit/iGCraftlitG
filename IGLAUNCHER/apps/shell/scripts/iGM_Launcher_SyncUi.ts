/**
 * 文件路径：apps/shell/scripts/iGM_Launcher_SyncUi.ts
 * 所属层：桌面外壳 / 构建脚本层
 * 路由：全局（构建期）
 * 模块：iGM_Launcher_SyncUi
 * 作用：把 Next.js 静态导出产物与 LOGO 同步到外壳资源目录，供 Electrobun 打包
 * 内容：清空并复制 apps/launcher-ui/out -> apps/shell/iGM_Launcher_Assets/launcher，
 *       复制项目 LOGO -> iGM_Launcher_Assets/icon.ico
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

  console.log(`[iGM_Launcher_SyncUi] 已同步静态界面 -> ${iGM_Launcher_UiTargetDir}`);
}

/** 资源目录本身（拆出以便 mkdir 调用语义清晰） */
function iGM_Launcher_TargetParent(): string {
  return iGM_Launcher_AssetsDir;
}

// 导出 //
await iGM_Main();