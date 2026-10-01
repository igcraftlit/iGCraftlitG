/**
 * 文件路径：iGM_Server/src/iGM_Types/iGM_Game.ts
 * 所属层：后端 / 类型定义层
 * 路由：G_Game、G_Minecraft
 * 模块：iGM_Game
 * 作用：定义 Minecraft 原版游戏与 Fabric 加载器下载相关的数据库行类型、对外 DTO 与进度事件
 * 内容：版本类型/安装状态/文件状态/加载器枚举、四张表的行类型、
 *       版本 DTO（仅完整大小）、安装任务 DTO、加载器 DTO、进度事件与阶段常量
 * 说明：Minecraft 术语保留英文原名（release、snapshot、Fabric、Java Edition）
 */

// 类型定义 //
/** 版本类型：release 正式版 / snapshot 快照 / old_beta 远古 Beta / old_alpha 远古 Alpha */
export type iGM_GameVersionType =
  | "release"
  | "snapshot"
  | "old_beta"
  | "old_alpha";

/**
 * 可执行的模组加载器：none 原版 / fabric Fabric
 * 说明：Forge 与 NeoForge 在 iGM_ModLoaders 中置灰占位，本模块不支持其组装
 */
export type iGM_GameLoader = "none" | "fabric";

/** 安装任务状态：pending 排队中 / running 下载中 / completed 已完成 / failed 失败 / canceled 已取消 */
export type iGM_GameInstallStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "canceled";

/** 安装文件状态：pending 待下载 / done 已完成 / failed 失败 / skipped 已存在跳过 */
export type iGM_GameFileStatus = "pending" | "done" | "failed" | "skipped";

/** 版本元数据行 */
export interface iGM_MinecraftVersionRow {
  iGM_Id: string;
  iGM_Version: string;
  iGM_Type: string;
  iGM_ReleaseTime: string | null;
  iGM_ClientUrl: string | null;
  iGM_ServerUrl: string | null;
  iGM_ClientSize: number | null;
  iGM_ServerSize: number | null;
  iGM_ClientSha1: string | null;
  iGM_ServerSha1: string | null;
  /** 完整大小（客户端 JAR + 依赖库 + natives + assets，单位字节）；尚未计算时为 null */
  iGM_TotalSize: number | null;
  iGM_Notes: string | null;
  iGM_CreatedAt: string;
  iGM_UpdatedAt: string;
}

/** 安装任务行 */
export interface iGM_GameInstallRow {
  iGM_Id: string;
  iGM_UserId: string;
  iGM_Version: string;
  /** 该版本独立的游戏目录（<用户所选目录>/.minecraft/<版本目录名>） */
  iGM_InstallDir: string;
  /** 模组加载器：none 原版 / fabric Fabric */
  iGM_Loader: string;
  /** Fabric Loader 版本号；原版为 null */
  iGM_LoaderVersion: string | null;
  iGM_Status: string;
  iGM_Progress: number;
  iGM_TotalFiles: number;
  iGM_DownloadedFiles: number;
  iGM_Error: string | null;
  iGM_CreatedAt: string;
  iGM_UpdatedAt: string;
}

/** 模组加载器字典行 */
export interface iGM_ModLoaderRow {
  iGM_Id: string;
  iGM_Name: string;
  iGM_Slug: string;
  iGM_Description: string | null;
  iGM_IsSupported: number;
  iGM_SortOrder: number;
  iGM_CreatedAt: string;
}

/** 安装文件行 */
export interface iGM_GameFileRow {
  iGM_Id: string;
  iGM_InstallId: string;
  iGM_Path: string;
  iGM_Url: string | null;
  iGM_Sha1: string | null;
  iGM_Size: number;
  iGM_Status: string;
  iGM_DownloadedAt: string | null;
}

/* ---------- 对外 DTO ---------- */

/**
 * 版本 DTO（不含任何本地磁盘路径）
 * 说明：模块十八仅对外暴露「完整大小」，不再下发客户端与服务端细分大小与校验值
 */
export interface iGM_MinecraftVersionDto {
  id: string;
  version: string;
  type: iGM_GameVersionType;
  releaseTime: string | null;
  /** 完整大小（字节）；尚未计算时为 null，前端显示「计算中」 */
  totalSize: number | null;
  notes: string | null;
  /** 当前登录用户是否已安装该版本（未登录恒为 false） */
  installed: boolean;
}

/** 安装任务 DTO：installDir 为该用户自己选择的目录，可对外返回 */
export interface iGM_GameInstallDto {
  id: string;
  version: string;
  installDir: string;
  /** 模组加载器：none 原版 / fabric Fabric */
  loader: iGM_GameLoader;
  loaderVersion: string | null;
  /** 版本目录名：原版为版本号，Fabric 为 <版本号>-fabric */
  versionDir: string;
  status: iGM_GameInstallStatus;
  /** 总进度百分比（0-100，保留两位小数） */
  progress: number;
  totalFiles: number;
  downloadedFiles: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 模组加载器 DTO（安装确认页展示用） */
export interface iGM_ModLoaderDto {
  slug: string;
  name: string;
  /** i18n 文案键；前端解析为当前语言描述 */
  descriptionKey: string | null;
  /** 是否受支持；false 时前端置灰并标注「敬请期待」 */
  supported: boolean;
}

/** 版本分页数据 */
export interface iGM_MinecraftVersionListData {
  items: iGM_MinecraftVersionDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/* ---------- 下载进度事件 ---------- */

/** 下载阶段名（前端按此渲染“当前阶段”，不下发单个文件细节） */
export type iGM_GameStage =
  | "manifest"
  | "client"
  | "json"
  | "libraries"
  | "natives"
  | "assets"
  | "fabric"
  | "verify"
  | "assemble";

/**
 * 进度事件：严格沿用 iGM CLI Downloader 的事件契约
 * start → stage → progress → file_done → retry → complete / error
 * （canceled 为本模块为支持取消而追加的终态）
 */
export type iGM_GameProgressEvent =
  | {
      type: "start";
      taskId: string;
      version: string;
      totalFiles: number;
      totalBytes: number;
    }
  | { type: "stage"; stage: iGM_GameStage }
  | {
      type: "progress";
      /** 已完成文件数 */
      doneFiles: number;
      /** 总文件数 */
      totalFiles: number;
      /** 已下载字节数 */
      doneBytes: number;
      /** 总字节数 */
      totalBytes: number;
      /** 总进度百分比（0-100） */
      percent: number;
      /** 瞬时速度（字节/秒） */
      speed: number;
      /** 预计剩余秒数（无法估算时为 null） */
      remainingSeconds: number | null;
    }
  | { type: "file_done"; path: string; size: number }
  | {
      type: "retry";
      path: string;
      attempt: number;
      reason: string;
      /** 连续失败触发的冷却秒数，仅冷却事件携带 */
      cooldownSeconds?: number;
    }
  | { type: "complete"; taskId: string; installDir: string }
  | { type: "error"; taskId: string; message: string }
  | { type: "canceled"; taskId: string };

// 核心逻辑 //
/** 允许的版本类型常量 */
export const iGM_GameVersionTypes: iGM_GameVersionType[] = [
  "release",
  "snapshot",
  "old_beta",
  "old_alpha",
];

/** 判断未知字符串是否为合法版本类型 */
export function iGM_IsGameVersionType(
  value: unknown,
): value is iGM_GameVersionType {
  return (
    typeof value === "string" &&
    iGM_GameVersionTypes.includes(value as iGM_GameVersionType)
  );
}

/** 判断未知字符串是否为合法安装状态 */
export function iGM_IsGameInstallStatus(
  value: unknown,
): value is iGM_GameInstallStatus {
  return (
    value === "pending" ||
    value === "running" ||
    value === "completed" ||
    value === "failed" ||
    value === "canceled"
  );
}

/** 版本类型规范化：库中未知值一律视为 release 之外的“其他”快照口径，回退 release */
export function iGM_NormalizeVersionType(value: string): iGM_GameVersionType {
  return iGM_IsGameVersionType(value) ? value : "release";
}

/** 判断未知字符串是否为可执行的模组加载器（none / fabric） */
export function iGM_IsGameLoader(value: unknown): value is iGM_GameLoader {
  return value === "none" || value === "fabric";
}

/** 加载器规范化：库中未知值一律回退原版 */
export function iGM_NormalizeGameLoader(value: string): iGM_GameLoader {
  return iGM_IsGameLoader(value) ? value : "none";
}

/**
 * 计算版本目录名：原版为版本号，Fabric 为 <版本号>-fabric
 * 说明：多版本隔离时同版本不同加载器使用不同目录，互不覆盖
 */
export function iGM_ResolveVersionDir(
  version: string,
  loader: iGM_GameLoader,
): string {
  return loader === "fabric" ? `${version}-fabric` : version;
}

/** 版本行转 DTO（仅暴露完整大小） */
export function iGM_ToMinecraftVersionDto(
  row: iGM_MinecraftVersionRow,
  installed = false,
): iGM_MinecraftVersionDto {
  return {
    id: row.iGM_Id,
    version: row.iGM_Version,
    type: iGM_NormalizeVersionType(row.iGM_Type),
    releaseTime: row.iGM_ReleaseTime,
    totalSize:
      typeof row.iGM_TotalSize === "number" ? row.iGM_TotalSize : null,
    notes: row.iGM_Notes,
    installed,
  };
}

/** 安装任务行转 DTO */
export function iGM_ToGameInstallDto(row: iGM_GameInstallRow): iGM_GameInstallDto {
  const loader = iGM_NormalizeGameLoader(row.iGM_Loader);
  return {
    id: row.iGM_Id,
    version: row.iGM_Version,
    installDir: row.iGM_InstallDir,
    loader,
    loaderVersion: row.iGM_LoaderVersion,
    versionDir: iGM_ResolveVersionDir(row.iGM_Version, loader),
    status: iGM_IsGameInstallStatus(row.iGM_Status) ? row.iGM_Status : "pending",
    progress: row.iGM_Progress,
    totalFiles: row.iGM_TotalFiles,
    downloadedFiles: row.iGM_DownloadedFiles,
    error: row.iGM_Error,
    createdAt: row.iGM_CreatedAt,
    updatedAt: row.iGM_UpdatedAt,
  };
}

/** 模组加载器行转 DTO */
export function iGM_ToModLoaderDto(row: iGM_ModLoaderRow): iGM_ModLoaderDto {
  return {
    slug: row.iGM_Slug,
    name: row.iGM_Name,
    descriptionKey: row.iGM_Description,
    supported: row.iGM_IsSupported === 1,
  };
}

// 导出 //
export default {
  iGM_GameVersionTypes,
  iGM_IsGameVersionType,
  iGM_IsGameInstallStatus,
  iGM_IsGameLoader,
  iGM_NormalizeVersionType,
  iGM_NormalizeGameLoader,
  iGM_ResolveVersionDir,
  iGM_ToMinecraftVersionDto,
  iGM_ToGameInstallDto,
  iGM_ToModLoaderDto,
};