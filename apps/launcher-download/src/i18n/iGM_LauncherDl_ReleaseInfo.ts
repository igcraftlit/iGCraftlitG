/**
 * 文件路径：apps/launcher-download/src/i18n/iGM_LauncherDl_ReleaseInfo.ts
 * 所属层：前端 / 发布信息配置层
 * 路由：全局
 * 模块：iGM_LauncherDl_Downloader
 * 作用：当前发布版本与历史版本的机器可读常量单一事实来源（站点与 CLI 共用同一份清单）
 * 内容：
 *   1) 当前版本常量一律由 public/release.json 派生；该文件同时随静态导出发布为
 *      https://launcher.igcraftlit.com/release.json，供 iGM CLI 的
 *      `igm launcher` 命令读取，避免站点与 CLI 的版本信息出现分叉；
 *   2) 历史版本列表由 public/release-history.json 派生，供官网「历史版本管理」渲染；
 *   3) 展示文案（标签、提示语）一律来自语言包，此处仅保存语言无关常量与取值辅助函数
 */

// 导入依赖 //
import iGM_LauncherDl_ReleaseManifest from "../../public/release.json";
import iGM_LauncherDl_ReleaseHistoryManifest from "../../public/release-history.json";

// 类型定义 //
/** 发布清单中的单条归档成员（语言无关，仅用于文档展示） */
export type iGM_LauncherDl_ArchiveEntry = string;

/** 更新类型：大版本 / 小版本 / 修复 */
export type iGM_LauncherDl_UpdateType = "major" | "minor" | "patch";

/** 单个语言的更新说明：新增 / 优化 / 修复三组列表，空组可缺省 */
export interface iGM_LauncherDl_ReleaseNoteGroup {
  added?: string[];
  improved?: string[];
  fixed?: string[];
}

/** 更新说明：语言（zh-CN / en 等）→ 三组列表 */
export type iGM_LauncherDl_ReleaseNotes = Record<
  string,
  iGM_LauncherDl_ReleaseNoteGroup
>;

/** 历史版本单条发布记录（与 scripts/iGM_ExportLauncherReleases.ts 导出结构一致） */
export interface iGM_LauncherDl_ReleaseHistoryItem {
  id: string;
  version: string;
  releasedAt: string;
  updateType: iGM_LauncherDl_UpdateType;
  isLatest: boolean;
  channel: string;
  platform: string;
  fileName: string;
  fileSize: number;
  fileSizeLabel: string;
  sha256: string;
  downloadUrl: string;
  releasePageUrl: string;
  notes: iGM_LauncherDl_ReleaseNotes;
}

// 核心逻辑 //
/** 当前版本号 */
export const iGM_LauncherDl_Version = iGM_LauncherDl_ReleaseManifest.version;

/** 版本展示文本：26.3.1 official version */
export const iGM_LauncherDl_VersionLabel =
  iGM_LauncherDl_ReleaseManifest.versionLabel;

/** 受支持平台（当前仅 Windows x64） */
export const iGM_LauncherDl_Platform = iGM_LauncherDl_ReleaseManifest.platform;

/** 下载文件名（zip 归档，内含安装引导程序与载荷） */
export const iGM_LauncherDl_FileName = iGM_LauncherDl_ReleaseManifest.fileName;

/** 归档内安装引导程序文件名（解压后需要运行的可执行文件） */
export const iGM_LauncherDl_InstallerEntry =
  iGM_LauncherDl_ReleaseManifest.installerEntry;

/** 归档内全部成员文件名 */
export const iGM_LauncherDl_ArchiveEntries: iGM_LauncherDl_ArchiveEntry[] =
  iGM_LauncherDl_ReleaseManifest.archiveEntries;

/** 文件大小（字节） */
export const iGM_LauncherDl_FileSize =
  iGM_LauncherDl_ReleaseManifest.fileSize;

/** 文件大小展示文本：68.12 MB */
export const iGM_LauncherDl_FileSizeLabel =
  iGM_LauncherDl_ReleaseManifest.fileSizeLabel;

/** 安装包 SHA256 校验值 */
export const iGM_LauncherDl_Sha256 = iGM_LauncherDl_ReleaseManifest.sha256;

/** 下载地址（GitHub Releases 归档直链，可直接产生真实下载） */
export const iGM_LauncherDl_DownloadHref =
  iGM_LauncherDl_ReleaseManifest.downloadUrl;

/** 发布页地址（人类可读的版本说明页） */
export const iGM_LauncherDl_ReleasePageHref =
  iGM_LauncherDl_ReleaseManifest.releasePageUrl;

/** 当前版本发布时间 */
export const iGM_LauncherDl_ReleaseDate =
  iGM_LauncherDl_ReleaseManifest.releasedAt;

/** 构建时间：构建期由 next.config.ts 注入，用于构建标识 */
export const iGM_LauncherDl_BuildTime =
  process.env.NEXT_PUBLIC_IGM_BUILD_TIME ?? "";

/** 全部历史版本（构建期常量，原始顺序，供排序辅助函数取用） */
export const iGM_LauncherDl_ReleaseHistory: iGM_LauncherDl_ReleaseHistoryItem[] =
  iGM_LauncherDl_ReleaseHistoryManifest.releases.map((release) => ({
    ...release,
    updateType: release.updateType as iGM_LauncherDl_UpdateType,
    notes: release.notes as iGM_LauncherDl_ReleaseNotes,
  }));

/** 取版本列表：最新版置顶，其余按发布日期倒序（日期字符串为 YYYY-MM-DD，可直接比较） */
export function iGM_LauncherDl_GetReleaseHistory(): iGM_LauncherDl_ReleaseHistoryItem[] {
  const latest = iGM_LauncherDl_ReleaseHistory.filter(
    (release) => release.isLatest,
  );
  const rest = iGM_LauncherDl_ReleaseHistory.filter(
    (release) => !release.isLatest,
  ).sort((a, b) =>
    a.releasedAt < b.releasedAt ? 1 : a.releasedAt > b.releasedAt ? -1 : 0,
  );
  return [...latest, ...rest];
}

/**
 * 按语言取更新说明：优先自身语言，其次英文，最后简体中文；
 * 目标语言缺失时（如 zh-TW / ja / ru）统一回退英文，保证列表始终有内容。
 */
export function iGM_LauncherDl_GetReleaseNotes(
  notes: iGM_LauncherDl_ReleaseNotes,
  locale: string,
): iGM_LauncherDl_ReleaseNoteGroup {
  return notes[locale] ?? notes.en ?? notes["zh-CN"] ?? {};
}

// 导出 //
export default iGM_LauncherDl_Version;