/**
 * 文件路径：iGM_Server/src/iGM_Types/iGM_ThirdParty.ts
 * 所属层：后端 / 类型定义层
 * 路由：G_ThirdParty
 * 模块：iGM_ThirdParty
 * 作用：定义第三方资源（Modrinth）与下载任务相关的数据库行类型、对外 DTO 与进度事件
 * 内容：资源类型/下载状态枚举、三张表的行类型、资源与版本 DTO、下载任务 DTO、
 *       下载进度事件（start / progress / file_done / retry / complete / error / canceled）
 * 说明：后端命名与网站/启动器契约保持一致；Minecraft 术语保留英文原名
 *       （Fabric、Modrinth、Shader、Resource Pack、Datapack）
 */

// 类型定义 //
/**
 * 第三方资源类型
 * mod 模组 / shader 光影 / resourcepack 材质包 / map 地图 / datapack 数据包
 * 说明：本模块仅支持 Fabric 加载器的以上五类资源
 */
export type iGM_ThirdPartyResourceType =
  | "mod"
  | "shader"
  | "resourcepack"
  | "map"
  | "datapack";

/**
 * 下载任务状态
 * pending 排队中 / downloading 下载中 / paused 已暂停 /
 * completed 已完成 / failed 失败 / canceled 已取消
 */
export type iGM_DownloadTaskStatus =
  | "pending"
  | "downloading"
  | "paused"
  | "completed"
  | "failed"
  | "canceled";

/**
 * 资源版本发布类型（对应 Modrinth 的 version_type）
 * release 正式版 / beta 测试版 / alpha 早期测试版
 * 说明：界面据此区分正式版与测试版，下载默认优先推荐正式版
 */
export type iGM_ThirdPartyVersionType = "release" | "beta" | "alpha";

/** 本模块固定的第三方来源平台 */
export const iGM_ThirdPartySource = "modrinth" as const;

/** 第三方资源元数据行 */
export interface iGM_ThirdPartyResourceRow {
  iGM_Id: string;
  iGM_Source: string;
  iGM_SourceId: string;
  iGM_Slug: string | null;
  iGM_Name: string;
  iGM_Type: string;
  iGM_Description: string | null;
  iGM_Author: string | null;
  iGM_CoverUrl: string | null;
  iGM_Downloads: number | null;
  iGM_CreatedAt: string;
  iGM_UpdatedAt: string;
}

/** 第三方资源版本行 */
export interface iGM_ThirdPartyVersionRow {
  iGM_Id: string;
  iGM_ResourceId: string;
  iGM_SourceId: string;
  iGM_Version: string;
  /** JSON 数组字符串，如 ["1.20.1","1.20.2"] */
  iGM_GameVersions: string | null;
  /** JSON 数组字符串，如 ["fabric"] */
  iGM_Loaders: string | null;
  iGM_DownloadUrl: string;
  iGM_Filename: string;
  iGM_Size: number;
  iGM_Sha1: string | null;
  iGM_PublishedAt: string | null;
  /** 版本发布类型：release / beta / alpha，缺省视为 release */
  iGM_VersionType: string | null;
  iGM_CreatedAt: string;
}

/**
 * 下载任务行
 * 说明：资源名称/类型/版本号为查询时连表带回的展示字段，非本表列
 */
export interface iGM_DownloadTaskRow {
  iGM_Id: string;
  iGM_TaskId: string;
  iGM_UserId: string;
  iGM_ResourceId: string;
  iGM_VersionId: string;
  iGM_Source: string;
  iGM_DownloadUrl: string;
  iGM_Filename: string;
  iGM_Size: number;
  iGM_Sha1: string | null;
  iGM_Status: string;
  iGM_Downloaded: number;
  iGM_Progress: number;
  iGM_Speed: number;
  iGM_Eta: number | null;
  iGM_Error: string | null;
  iGM_TargetDir: string;
  iGM_FilePath: string | null;
  iGM_CreatedAt: string;
  iGM_UpdatedAt: string;
  /** 连表带回：资源名称 */
  iGM_ResourceName?: string;
  /** 连表带回：资源类型 */
  iGM_ResourceType?: string;
  /** 连表带回：版本号 */
  iGM_VersionLabel?: string;
}

/* ---------- 对外 DTO ---------- */

/** 第三方资源 DTO */
export interface iGM_ThirdPartyResourceDto {
  id: string;
  source: string;
  sourceId: string;
  slug: string;
  name: string;
  type: iGM_ThirdPartyResourceType;
  description: string | null;
  author: string | null;
  coverUrl: string | null;
  downloads: number | null;
  updatedAt: string;
}

/** 第三方资源版本 DTO */
export interface iGM_ThirdPartyVersionDto {
  id: string;
  version: string;
  gameVersions: string[];
  loaders: string[];
  downloadUrl: string;
  filename: string;
  size: number;
  sha1: string | null;
  publishedAt: string | null;
  /** 版本发布类型：正式版 / 测试版 / 早期测试版 */
  versionType: iGM_ThirdPartyVersionType;
}

/** 下载任务 DTO（网站下载中心与启动器共用） */
export interface iGM_DownloadTaskDto {
  id: string;
  resourceId: string;
  versionId: string;
  source: string;
  /** 资源名称 */
  name: string;
  /** 资源类型 */
  type: iGM_ThirdPartyResourceType;
  /** 资源版本号 */
  version: string;
  downloadUrl: string;
  filename: string;
  size: number;
  sha1: string | null;
  status: iGM_DownloadTaskStatus;
  /** 已下载字节数 */
  downloaded: number;
  /** 总进度百分比（0-100，保留两位小数） */
  progress: number;
  /** 瞬时速度（字节/秒） */
  speed: number;
  /** 预计剩余秒数；无法估算时为 null */
  eta: number | null;
  /** 失败原因（i18n 文案键或英文文案） */
  error: string | null;
  /** 下载目标目录 */
  targetDir: string;
  /** 下载完成后的文件绝对路径；未完成时为 null */
  filePath: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 资源搜索结果分页数据 */
export interface iGM_ThirdPartySearchData {
  items: iGM_ThirdPartyResourceDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/* ---------- 下载进度事件 ---------- */

/**
 * 下载进度事件
 * 结构对齐模块二十约定：{ type, taskId, payload, timestamp }
 * 事件序列：start → progress（含 file_done / retry）→ complete / error / canceled
 */
export type iGM_DownloadEvent =
  | {
      type: "start";
      taskId: string;
      payload: {
        status: iGM_DownloadTaskStatus;
        total: number;
        filename: string;
        size: number;
      };
      timestamp: number;
    }
  | {
      type: "progress";
      taskId: string;
      payload: {
        status: iGM_DownloadTaskStatus;
        downloaded: number;
        total: number;
        percent: number;
        speed: number;
        eta: number | null;
        error: string | null;
      };
      timestamp: number;
    }
  | {
      type: "file_done";
      taskId: string;
      payload: { path: string; size: number };
      timestamp: number;
    }
  | {
      type: "retry";
      taskId: string;
      payload: { attempt: number; reason: string };
      timestamp: number;
    }
  | {
      type: "complete";
      taskId: string;
      payload: {
        status: iGM_DownloadTaskStatus;
        downloaded: number;
        total: number;
        percent: number;
        filePath: string;
      };
      timestamp: number;
    }
  | {
      type: "error";
      taskId: string;
      payload: { status: iGM_DownloadTaskStatus; error: string };
      timestamp: number;
    }
  | {
      type: "canceled";
      taskId: string;
      payload: { status: iGM_DownloadTaskStatus };
      timestamp: number;
    };

// 核心逻辑 //
/** 允许的资源类型常量 */
export const iGM_ThirdPartyResourceTypes: iGM_ThirdPartyResourceType[] = [
  "mod",
  "shader",
  "resourcepack",
  "map",
  "datapack",
];

/** 判断未知字符串是否为合法资源类型 */
export function iGM_IsThirdPartyResourceType(
  value: unknown,
): value is iGM_ThirdPartyResourceType {
  return (
    typeof value === "string" &&
    iGM_ThirdPartyResourceTypes.includes(value as iGM_ThirdPartyResourceType)
  );
}

/** 判断未知字符串是否为合法下载状态 */
export function iGM_IsDownloadTaskStatus(
  value: unknown,
): value is iGM_DownloadTaskStatus {
  return (
    value === "pending" ||
    value === "downloading" ||
    value === "paused" ||
    value === "completed" ||
    value === "failed" ||
    value === "canceled"
  );
}

/** 资源类型规范化：库中未知值一律回退 mod */
export function iGM_NormalizeThirdPartyResourceType(
  value: string,
): iGM_ThirdPartyResourceType {
  return iGM_IsThirdPartyResourceType(value) ? value : "mod";
}

/** 下载状态规范化：库中未知值一律回退 pending */
export function iGM_NormalizeDownloadTaskStatus(
  value: string,
): iGM_DownloadTaskStatus {
  return iGM_IsDownloadTaskStatus(value) ? value : "pending";
}

/** 版本发布类型规范化：库中未知值或空值一律回退 release（正式版） */
export function iGM_NormalizeThirdPartyVersionType(
  value: string | null | undefined,
): iGM_ThirdPartyVersionType {
  const text = (value ?? "").trim().toLowerCase();
  if (text === "beta" || text === "alpha") return text;
  return "release";
}

/** 解析 JSON 字符串数组；非法或为空时返回空数组 */
export function iGM_ParseJsonStringArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

/** 资源行转 DTO */
export function iGM_ToThirdPartyResourceDto(
  row: iGM_ThirdPartyResourceRow,
): iGM_ThirdPartyResourceDto {
  return {
    id: row.iGM_Id,
    source: row.iGM_Source,
    sourceId: row.iGM_SourceId,
    slug: row.iGM_Slug ?? row.iGM_SourceId,
    name: row.iGM_Name,
    type: iGM_NormalizeThirdPartyResourceType(row.iGM_Type),
    description: row.iGM_Description,
    author: row.iGM_Author,
    coverUrl: row.iGM_CoverUrl,
    downloads: row.iGM_Downloads,
    updatedAt: row.iGM_UpdatedAt,
  };
}

/** 版本行转 DTO */
export function iGM_ToThirdPartyVersionDto(
  row: iGM_ThirdPartyVersionRow,
): iGM_ThirdPartyVersionDto {
  return {
    id: row.iGM_Id,
    version: row.iGM_Version,
    gameVersions: iGM_ParseJsonStringArray(row.iGM_GameVersions),
    loaders: iGM_ParseJsonStringArray(row.iGM_Loaders),
    downloadUrl: row.iGM_DownloadUrl,
    filename: row.iGM_Filename,
    size: row.iGM_Size,
    sha1: row.iGM_Sha1,
    publishedAt: row.iGM_PublishedAt,
    versionType: iGM_NormalizeThirdPartyVersionType(row.iGM_VersionType),
  };
}

/** 下载任务行转 DTO（连表字段缺失时给出安全回退） */
export function iGM_ToDownloadTaskDto(row: iGM_DownloadTaskRow): iGM_DownloadTaskDto {
  return {
    id: row.iGM_TaskId,
    resourceId: row.iGM_ResourceId,
    versionId: row.iGM_VersionId,
    source: row.iGM_Source,
    name: row.iGM_ResourceName ?? row.iGM_Filename,
    type: iGM_NormalizeThirdPartyResourceType(row.iGM_ResourceType ?? "mod"),
    version: row.iGM_VersionLabel ?? "",
    downloadUrl: row.iGM_DownloadUrl,
    filename: row.iGM_Filename,
    size: row.iGM_Size,
    sha1: row.iGM_Sha1,
    status: iGM_NormalizeDownloadTaskStatus(row.iGM_Status),
    downloaded: row.iGM_Downloaded,
    progress: row.iGM_Progress,
    speed: row.iGM_Speed,
    eta: row.iGM_Eta,
    error: row.iGM_Error,
    targetDir: row.iGM_TargetDir,
    filePath: row.iGM_FilePath,
    createdAt: row.iGM_CreatedAt,
    updatedAt: row.iGM_UpdatedAt,
  };
}

// 导出 //
export default {
  iGM_ThirdPartySource,
  iGM_ThirdPartyResourceTypes,
  iGM_IsThirdPartyResourceType,
  iGM_IsDownloadTaskStatus,
  iGM_NormalizeThirdPartyResourceType,
  iGM_NormalizeDownloadTaskStatus,
  iGM_NormalizeThirdPartyVersionType,
  iGM_ParseJsonStringArray,
  iGM_ToThirdPartyResourceDto,
  iGM_ToThirdPartyVersionDto,
  iGM_ToDownloadTaskDto,
};