/**
 * 文件路径：apps/launcher-download/src/i18n/iGM_LauncherDl_ReleaseInfo.ts
 * 所属层：前端 / 发布信息配置层
 * 路由：全局
 * 模块：iGM_LauncherDl_Downloader
 * 作用：当前发布版本的机器可读常量单一事实来源
 * 内容：版本号、平台、安装包文件名、下载占位地址、发布时间；
 *       展示文案（标签、待填占位）一律来自语言包，此处仅保存语言无关常量
 */

// 导入依赖 //
// （本文件仅包含常量，无运行时依赖）

// 类型定义 //
// （无）

// 核心逻辑 //
/** 当前版本号：构建期由 next.config.ts 注入，缺省回退 26.1.2 */
export const iGM_LauncherDl_Version =
  process.env.NEXT_PUBLIC_IGM_VERSION ?? "26.1.2";

/** 版本展示文本：26.1.2 official version */
export const iGM_LauncherDl_VersionLabel = `${iGM_LauncherDl_Version} official version`;

/** 受支持平台（当前仅 Windows x64） */
export const iGM_LauncherDl_Platform = "Windows x64";

/** 安装包文件名 */
export const iGM_LauncherDl_FileName = `iGM-CraftCeon-Launcher-Setup-${iGM_LauncherDl_Version}.exe`;

/** 下载占位地址（仅展示，点击不产生真实下载） */
export const iGM_LauncherDl_DownloadHref = `/downloads/${iGM_LauncherDl_FileName}`;

/** 当前版本发布时间 */
export const iGM_LauncherDl_ReleaseDate = "2026-10-01";

/** 构建时间：构建期由 next.config.ts 注入，用于构建标识 */
export const iGM_LauncherDl_BuildTime =
  process.env.NEXT_PUBLIC_IGM_BUILD_TIME ?? "";

// 导出 //
export default iGM_LauncherDl_Version;