/**
 * 文件路径：apps/shell/scripts/iGM_LauncherV2_SyncUi.ts
 * 所属层：桌面外壳 / 构建脚本层
 * 路由：全局（构建期）
 * 模块：iGM_LauncherV2_SyncUi
 * 作用：把 Next.js 静态导出产物、Rust 核心二进制、LOGO 与公开配置同步到外壳资源目录，供 Electrobun 打包
 * 内容：清空并复制 apps/launcher-ui/out -> iGM_LauncherV2_Assets/launcher；
 *       从项目根 .env 提取白名单键（client_id 等公开标识 + Mineskin 上传密钥
 *       + 资源市场 CurseForge 检索密钥）
 *       -> iGM_LauncherV2_Assets/iGM_LauncherV2_Config.env，随包分发；
 *       复制 crates/core 的 cargo 产物 -> iGM_LauncherV2_Assets/core（未编译时跳过）；
 *       复制 D:/IGWEB/image/save1.<ext> -> iGM_LauncherV2_Assets/iGM_LauncherV2_Icon.ico（缺失时跳过并提示）
 * 说明：MINESKIN_API_KEY 为皮肤上传密钥，按交付要求随包内置以便解压即用；
 *       安装包不得提交到 Git 或对外公开分发以外的渠道
 */

// 导入依赖 //
import { access, cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

// 类型定义 //
/* （无额外类型） */

// 核心逻辑 //

/** 外壳目录：apps/launcher-v2/apps/shell */
const iGM_LauncherV2_ShellDir = join(import.meta.dir, "..");

/** launcher-v2 项目根：apps/launcher-v2 */
const iGM_LauncherV2_ProjectRoot = join(iGM_LauncherV2_ShellDir, "..", "..");

/** 仓库根：D:/IGWEB */
const iGM_LauncherV2_RepoRoot = join(iGM_LauncherV2_ProjectRoot, "..", "..");

/** 静态导出产物目录 */
const iGM_LauncherV2_UiOutDir = join(iGM_LauncherV2_ProjectRoot, "apps", "launcher-ui", "out");

/** 外壳资源目录（与 electrobun.config.ts 的 build.copy 源路径一致） */
const iGM_LauncherV2_AssetsDir = join(iGM_LauncherV2_ShellDir, "iGM_LauncherV2_Assets");

/** 静态界面目标位置 */
const iGM_LauncherV2_UiTargetDir = join(iGM_LauncherV2_AssetsDir, "launcher");

/** Rust 核心目标位置 */
const iGM_LauncherV2_CoreTargetDir = join(iGM_LauncherV2_AssetsDir, "core");

/** Windows 图标目标位置（与 electrobun.config.ts 的 win.icon 一致） */
const iGM_LauncherV2_IconTarget = join(iGM_LauncherV2_AssetsDir, "iGM_LauncherV2_Icon.ico");

/** 随包分发的公开配置文件（与 electrobun.config.ts 的 build.copy 源路径一致） */
const iGM_LauncherV2_ConfigTarget = join(iGM_LauncherV2_AssetsDir, "iGM_LauncherV2_Config.env");

/** 公开配置来源：项目根 .env */
const iGM_LauncherV2_EnvSource = join(iGM_LauncherV2_ProjectRoot, ".env");

/**
 * 允许进入安装包的白名单键前缀。
 * 前缀内仅限公开客户端标识（client_id 等）、皮肤上传密钥 MINESKIN_API_KEY
 * 与资源市场检索密钥 IGM_CURSEFORGE_API_KEY，
 * 其余键（如 SMTP、数据库口令）一律不得随包分发。
 */
const iGM_LauncherV2_PublicKeyPrefixes = ["IGCRAFTLIT_", "MSA_", "MINESKIN_", "IGM_"];

/** 各平台核心二进制文件名 */
const iGM_LauncherV2_CoreNames = ["igm_core.exe", "igm_core"];

/** cargo 产物目录：由 apps/launcher-v2/.cargo/config.toml 的 target-dir 指向 D 盘缓存（release 优先） */
const iGM_LauncherV2_CoreArtifactDirs = [
  "D:/IGWEB/.cache/rust-target/release",
  "D:/IGWEB/.cache/rust-target/debug",
];

async function iGM_LauncherV2_PathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** 同步静态界面产物 */
async function iGM_LauncherV2_SyncUi(): Promise<void> {
  if (!(await iGM_LauncherV2_PathExists(iGM_LauncherV2_UiOutDir))) {
    throw new Error(
      `未找到静态导出产物：${iGM_LauncherV2_UiOutDir}\n请先执行 bun run ui:build`,
    );
  }

  await rm(iGM_LauncherV2_UiTargetDir, { recursive: true, force: true });
  await mkdir(iGM_LauncherV2_AssetsDir, { recursive: true });
  await cp(iGM_LauncherV2_UiOutDir, iGM_LauncherV2_UiTargetDir, { recursive: true });
  console.log(`[iGM_LauncherV2_SyncUi] 已同步静态界面 -> ${iGM_LauncherV2_UiTargetDir}`);
}

/** 同步 Rust 核心二进制；未编译时创建空目录占位并提示编译命令 */
async function iGM_LauncherV2_SyncCore(): Promise<void> {
  await rm(iGM_LauncherV2_CoreTargetDir, { recursive: true, force: true });
  await mkdir(iGM_LauncherV2_CoreTargetDir, { recursive: true });

  for (const artifactDir of iGM_LauncherV2_CoreArtifactDirs) {
    for (const name of iGM_LauncherV2_CoreNames) {
      const source = join(artifactDir, name);
      if (!(await iGM_LauncherV2_PathExists(source))) continue;
      await cp(source, join(iGM_LauncherV2_CoreTargetDir, name));
      console.log(`[iGM_LauncherV2_SyncUi] 已同步 Rust 核心 -> ${join(iGM_LauncherV2_CoreTargetDir, name)}`);
      return;
    }
  }

  console.warn("[iGM_LauncherV2_SyncUi] 未找到已编译的 Rust 核心，跳过同步（请先执行 bun run core:build）");
}

/** 同步 Windows 图标：从 image/save1.<ext> 自动识别扩展名 */
async function iGM_LauncherV2_SyncIcon(): Promise<void> {
  const imageDir = join(iGM_LauncherV2_RepoRoot, "image");
  if (!(await iGM_LauncherV2_PathExists(imageDir))) {
    console.warn(`[iGM_LauncherV2_SyncUi] 未找到图片目录，跳过图标同步：${imageDir}`);
    return;
  }

  const entries = await readdir(imageDir);
  const logoName = entries.find((name) => /^save1\..+$/i.test(name));
  if (!logoName) {
    console.warn("[iGM_LauncherV2_SyncUi] 未找到 image/save1.<ext>，跳过图标同步");
    return;
  }

  // Electrobun 的 Windows 图标要求 .ico：源文件非 .ico 时保留原文件并提示人工转换
  if (!logoName.toLowerCase().endsWith(".ico")) {
    console.warn(
      `[iGM_LauncherV2_SyncUi] ${logoName} 不是 .ico 格式，已跳过图标同步（需先转换为 icon.ico）`,
    );
    return;
  }

  await mkdir(iGM_LauncherV2_AssetsDir, { recursive: true });
  await cp(join(imageDir, logoName), iGM_LauncherV2_IconTarget);
  console.log(`[iGM_LauncherV2_SyncUi] 已同步图标 -> ${iGM_LauncherV2_IconTarget}`);
}

/**
 * 同步公开配置：从项目根 .env 提取白名单键，写入随包分发文件。
 * 打包版主进程取不到源码树里的 .env（包内 app 目录之外无该文件），
 * 因此必须把 client_id 等公开配置随包带上一份。
 */
async function iGM_LauncherV2_SyncConfig(): Promise<void> {
  if (!(await iGM_LauncherV2_PathExists(iGM_LauncherV2_EnvSource))) {
    console.warn(
      `[iGM_LauncherV2_SyncUi] 未找到配置文件，跳过公开配置同步：${iGM_LauncherV2_EnvSource}`,
    );
    return;
  }

  const lines = (await readFile(iGM_LauncherV2_EnvSource, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) =>
      iGM_LauncherV2_PublicKeyPrefixes.some((prefix) => line.startsWith(prefix)),
    );

  await mkdir(iGM_LauncherV2_AssetsDir, { recursive: true });
  // 头部注释由白名单前缀动态拼装，避免新增前缀后注释与实际过滤规则脱节
  const header = `# 由 scripts/iGM_LauncherV2_SyncUi.ts 从 .env 提取（白名单：${iGM_LauncherV2_PublicKeyPrefixes.join(" / ")}）`;
  await writeFile(
    iGM_LauncherV2_ConfigTarget,
    `${header}\n${lines.join("\n")}\n`,
    "utf8",
  );
  console.log(
    `[iGM_LauncherV2_SyncUi] 已同步公开配置 ${lines.length} 项 -> ${iGM_LauncherV2_ConfigTarget}`,
  );
}

async function iGM_LauncherV2_Main(): Promise<void> {
  await iGM_LauncherV2_SyncUi();
  await iGM_LauncherV2_SyncCore();
  await iGM_LauncherV2_SyncIcon();
  await iGM_LauncherV2_SyncConfig();
}

// 导出 //
await iGM_LauncherV2_Main();
