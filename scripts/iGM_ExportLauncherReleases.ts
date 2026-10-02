/**
 * 文件路径：scripts/iGM_ExportLauncherReleases.ts
 * 所属层：仓库脚本层 / 数据导出
 * 路由：无
 * 模块：iGM_ExportLauncherReleases
 * 作用：启动器发布历史的唯一种子与导出出口（数据库为事实来源）
 * 内容：
 *   1) seed：把基线版本写入数据库 ——
 *      - v26.3.1：优先复用库中已有记录，库中不存在时读取下载站现有 release.json；
 *      - v26.3.2：扫描安装包产物 zip 计算真实大小与 SHA-256，缺失时保留库中已有值；
 *   2) export：从数据库读取全部版本，写出
 *      - apps/launcher-download/public/release-history.json（全部版本，发布日期倒序）
 *      - apps/launcher-download/public/release.json（当前最新版，保持 CLI 既有字段契约）
 * 说明：
 *   - 官网静态 JSON 只允许由本脚本产生，禁止与数据库两处手改；
 *   - 运行方式（工作目录 D:/IGWEB）：
 *       bun run scripts/iGM_ExportLauncherReleases.ts seed
 *       bun run scripts/iGM_ExportLauncherReleases.ts export
 *       bun run scripts/iGM_ExportLauncherReleases.ts seed export
 *   - 可用环境变量覆盖产物目录：IGM_LAUNCHER_ARTIFACT_DIR
 */

// 导入依赖 //
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  iGM_ListLauncherReleases,
  iGM_FindLauncherReleaseByVersion,
  iGM_UpsertLauncherRelease,
  iGM_ClearLatestFlag,
} from "../iGM_Server/src/iGM_Repositories/iGM_LauncherReleaseRepository";
import {
  iGM_ToLauncherReleaseDto,
  type iGM_LauncherReleaseInput,
  type iGM_LauncherReleaseNotes,
} from "../iGM_Server/src/iGM_Types/iGM_LauncherRelease";

// 类型定义 //
/** 下载站 release.json 的既有字段契约（供 iGM CLI 读取） */
interface iGM_ReleaseManifest {
  channel: string;
  version: string;
  versionLabel: string;
  platform: string;
  fileName: string;
  fileSize: number;
  fileSizeLabel: string;
  sha256: string;
  releasedAt: string;
  archiveEntries: string[];
  installerEntry: string;
  downloadUrl: string;
  releasePageUrl: string;
  [key: string]: unknown;
}

// 核心逻辑 //
const iGM_RepoRoot = resolve(import.meta.dir, "..");
const iGM_LauncherDlPublic = join(
  iGM_RepoRoot,
  "apps/launcher-download/public",
);
const iGM_CurrentReleasePath = join(iGM_LauncherDlPublic, "release.json");
const iGM_HistoryPath = join(iGM_LauncherDlPublic, "release-history.json");
const iGM_ArtifactDir =
  process.env.IGM_LAUNCHER_ARTIFACT_DIR ??
  join(iGM_RepoRoot, "IGLAUNCHER/apps/installer/artifacts");
const iGM_GithubRepo = process.env.IGM_GITHUB_REPO ?? "igcraftlit/iGCraftlitG";

/** 归档内成员（与既有安装包约定一致） */
const IGM_ARCHIVE_ENTRIES = [
  "iGM Installer-Setup.exe",
  "iGM Installer-Setup.tar.zst",
  "iGM Installer-Setup.metadata.json",
];
const IGM_INSTALLER_ENTRY = "iGM Installer-Setup.exe";

/** 字节数格式化为 MB 文本（与既有 release.json 的 67.15 MB 口径一致） */
function iGM_FormatSizeLabel(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(2)} MB`;
}

/** 定位指定版本的安装包 zip */
function iGM_FindArtifactZip(version: string): string | null {
  const name = `iGM-CraftCeon-Launcher-Setup-${version}.zip`;
  const path = join(iGM_ArtifactDir, name);
  return existsSync(path) ? path : null;
}

/** 计算文件大小与 SHA-256 */
function iGM_HashFile(path: string): { size: number; sha256: string } {
  const buffer = readFileSync(path);
  return {
    size: statSync(path).size,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}

/** v26.3.1 基线更新说明 */
const IGM_NOTES_26_3_1: iGM_LauncherReleaseNotes = {
  "zh-CN": {
    added: [
      "新增客户端埋点上报，开发者平台可查看各通道调用量",
      "新增启动器下载站点，统一安装包分发入口",
    ],
    improved: [
      "优化 installer 与启动器载荷同步流程，避免安装包内嵌旧版本程序",
      "优化绿色版（portable）产物，安装包与绿色版同源构建",
    ],
    fixed: ["修复安装包内嵌旧版载荷导致的版本不一致问题"],
  },
  en: {
    added: [
      "Added client telemetry reporting for per-channel call statistics",
      "Added the launcher download site as a unified distribution entry",
    ],
    improved: [
      "Improved installer payload syncing to avoid stale launcher payloads",
      "Improved the portable build so installer and portable share one source",
    ],
    fixed: ["Fixed version mismatch caused by stale embedded payloads"],
  },
};

/** v26.3.2 更新说明（严格对齐 26.3.2 提示词的功能清单） */
const IGM_NOTES_26_3_2: iGM_LauncherReleaseNotes = {
  "zh-CN": {
    added: [
      "新增外观与主题系统：极简白、暗夜黑、星图蓝、极光绿、落日橙五套预设主题，支持自定义主色实时预览",
      "新增自定义背景图（JPG / PNG / WebP，5MB 以内）与背景模糊强度调节",
      "首页新增「开始游戏」按钮、累计使用时长与右侧账户面板（社区账号 / 正版账号 / 离线账户最多 6 个）",
      "新增资源中心：下载中心与资源库合并为统一入口，新增树状关系图（兼容 / 依赖 / 衍生关系，支持缩放与拖拽）",
      "官网下载页新增历史版本管理，展示版本号、发布日期、更新类型与新增 / 优化 / 修复内容",
    ],
    improved: [
      "窗口标题改为完整名称 iGM CraftCeon Launcher 并采用品牌艺术字体，窗口图标与官网 LOGO 统一",
      "进入首页时左侧导航自动折叠为图标模式，留出更多展示空间",
      "正版账号登录获取设备码后自动打开默认浏览器完成授权",
      "Java 管理、语言设置、明暗模式统一移入设置页；外观独立为一级菜单",
    ],
    fixed: [
      "修复正版认证过期的历史进度仍显示、造成用户困惑的问题",
      "修复认证失败时错误原因不明确的问题，错误码与原因支持中英双语",
    ],
  },
  en: {
    added: [
      "Added the appearance and theme system: five presets (Minimal White, Night Black, Star Blue, Aurora Green, Sunset Orange) with live custom accent color preview",
      "Added custom background image (JPG / PNG / WebP up to 5MB) with adjustable background blur",
      "Added a Start Game button, cumulative usage hours, and a right-side account panel on the home page (community account / Mojang account / up to 6 offline accounts)",
      "Added the Resource Center: downloads and library merged into one entry, with a tree relationship graph (compatible / dependency / derived, zoom and drag supported)",
      "Added release history on the download site: version, release date, update type, and added / improved / fixed notes",
    ],
    improved: [
      "Window title changed to the full name iGM CraftCeon Launcher with the brand display font; window icon unified with the official logo",
      "The sidebar auto-collapses to icon mode on the home page to free up space",
      "Mojang sign-in now opens the default browser automatically after the device code is issued",
      "Java management, language, and light/dark mode moved into Settings; Appearance is now a top-level menu",
    ],
    fixed: [
      "Fixed stale authentication progress still being shown after expiry",
      "Fixed unclear authentication failures; error codes and reasons are now bilingual",
    ],
  },
};

/** 读取下载站现有 release.json（供 v26.3.1 基线回填） */
function iGM_ReadCurrentManifest(): iGM_ReleaseManifest | null {
  if (!existsSync(iGM_CurrentReleasePath)) return null;
  try {
    return JSON.parse(
      readFileSync(iGM_CurrentReleasePath, "utf8"),
    ) as iGM_ReleaseManifest;
  } catch {
    return null;
  }
}

/** 写入一条基线版本（已存在则保留其发布元数据，仅补齐缺失项） */
async function iGM_SeedRelease(
  version: string,
  isLatest: boolean,
  updateType: "major" | "minor" | "patch",
  notes: iGM_LauncherReleaseNotes,
  releasedAt: string,
  manifest: iGM_ReleaseManifest | null,
  artifact: string | null,
): Promise<void> {
  const existing = await iGM_FindLauncherReleaseByVersion(version);
  const fileName =
    manifest?.fileName ?? `iGM-CraftCeon-Launcher-Setup-${version}.zip`;

  // 大小与校验：优先取产物实测值，其次沿用库中/清单中的既有值
  let fileSize = existing?.iGM_FileSize ?? manifest?.fileSize ?? 0;
  let sha256 = existing?.iGM_Sha256 ?? manifest?.sha256 ?? "";
  if (artifact) {
    const hashed = iGM_HashFile(artifact);
    fileSize = hashed.size;
    sha256 = hashed.sha256;
  }

  const input: iGM_LauncherReleaseInput = {
    version,
    releasedAt,
    updateType,
    isLatest,
    channel: existing?.iGM_Channel ?? manifest?.channel ?? "stable",
    platform: existing?.iGM_Platform ?? manifest?.platform ?? "Windows x64",
    fileName,
    fileSize,
    fileSizeLabel: iGM_FormatSizeLabel(fileSize),
    sha256,
    downloadUrl:
      existing?.iGM_DownloadUrl ??
      manifest?.downloadUrl ??
      `https://github.com/${iGM_GithubRepo}/releases/download/v${version}/${fileName}`,
    releasePageUrl:
      existing?.iGM_ReleasePageUrl ??
      manifest?.releasePageUrl ??
      `https://github.com/${iGM_GithubRepo}/releases/tag/v${version}`,
    notes,
  };
  if (isLatest) await iGM_ClearLatestFlag(version);
  await iGM_UpsertLauncherRelease(input);
  console.log(
    `[iGM_ExportLauncherReleases] 已写入版本 ${version}（${updateType}，最新：${
      isLatest ? "是" : "否"
    }，文件：${fileName}，${input.fileSizeLabel}${artifact ? "，实测" : "，沿用既有值"}）`,
  );
}

/** seed：写入 v26.3.1 与 v26.3.2 两条基线记录 */
async function iGM_Seed(): Promise<void> {
  const manifest = iGM_ReadCurrentManifest();
  const artifactCurrent = process.env.IGM_LAUNCHER_VERSION ?? "26.3.2";
  // v26.3.1 保留既有发布元数据（库中优先，其次当前 release.json）
  await iGM_SeedRelease(
    "26.3.1",
    false,
    "minor",
    IGM_NOTES_26_3_1,
    "2026-10-03",
    manifest,
    null,
  );
  // v26.3.2 为最新版，大小与校验优先取产物实测值
  await iGM_SeedRelease(
    artifactCurrent,
    true,
    "minor",
    IGM_NOTES_26_3_2,
    new Date().toISOString().slice(0, 10),
    null,
    iGM_FindArtifactZip(artifactCurrent),
  );
}

/** export：数据库 → 静态 JSON */
async function iGM_Export(): Promise<void> {
  const rows = await iGM_ListLauncherReleases();
  if (rows.length === 0) {
    throw new Error(
      "[iGM_ExportLauncherReleases] 数据库中没有任何发布记录，请先执行 seed",
    );
  }
  const releases = rows.map(iGM_ToLauncherReleaseDto);

  // 全部版本（发布日期倒序），供官网历史版本列表渲染
  writeFileSync(
    iGM_HistoryPath,
    `${JSON.stringify({ releases }, null, 2)}\n`,
    "utf8",
  );

  // 当前最新版：保持既有字段契约，供站点顶部展示与 iGM CLI 读取
  const latest = releases.find((item) => item.isLatest) ?? releases[0];
  const manifest: iGM_ReleaseManifest = {
    channel: latest.channel,
    version: latest.version,
    versionLabel: `${latest.version} official version`,
    platform: latest.platform,
    fileName: latest.fileName,
    fileSize: latest.fileSize,
    fileSizeLabel: latest.fileSizeLabel,
    sha256: latest.sha256,
    releasedAt: latest.releasedAt.slice(0, 10),
    archiveEntries: IGM_ARCHIVE_ENTRIES,
    installerEntry: IGM_INSTALLER_ENTRY,
    downloadUrl: latest.downloadUrl,
    releasePageUrl: latest.releasePageUrl,
  };
  writeFileSync(
    iGM_CurrentReleasePath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );

  console.log(
    `[iGM_ExportLauncherReleases] 导出完成：${releases.length} 个版本 → release-history.json；当前版本 ${latest.version} → release.json`,
  );
}

async function iGM_Main(): Promise<void> {
  const commands = process.argv.slice(2);
  if (commands.length === 0) {
    console.error(
      "用法：bun run scripts/iGM_ExportLauncherReleases.ts [seed] [export]",
    );
    process.exit(1);
  }
  if (commands.includes("seed")) await iGM_Seed();
  if (commands.includes("export")) await iGM_Export();
  process.exit(0);
}

// 执行 //
await iGM_Main();