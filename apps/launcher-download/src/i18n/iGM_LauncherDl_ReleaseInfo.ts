/**
 * 文件路径：apps/launcher-download/src/i18n/iGM_LauncherDl_ReleaseInfo.ts
 * 所属层：前端 / 发布信息配置层
 * 路由：全局
 * 模块：iGM_LauncherDl_Downloader
 * 作用：当前发布版本的机器可读常量单一事实来源（站点与 CLI 共用同一份清单）
 * 内容：常量一律由 public/release.json 派生；该文件同时随静态导出发布为
 *       https://launcher.igcraftlit.com/release.json，供 iGM CLI 的
 *       `igm launcher` 命令读取，避免站点与 CLI 的版本信息出现分叉；
 *       展示文案（标签、提示语）一律来自语言包，此处仅保存语言无关常量
 */

// 导入依赖 //
import iGM_LauncherDl_ReleaseManifest from "../../public/release.json";

// 类型定义 //
/** 发布清单中的单条归档成员（语言无关，仅用于文档展示） */
export type iGM_LauncherDl_ArchiveEntry = string;

// 核心逻辑 //
/** 当前版本号 */
export const iGM_LauncherDl_Version = iGM_LauncherDl_ReleaseManifest.version;

/** 版本展示文本：26.2.4 official version */
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

// 导出 //
export default iGM_LauncherDl_Version;