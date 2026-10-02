/**
 * 文件路径：iGM_Server/src/iGM_Types/iGM_LauncherRelease.ts
 * 所属层：后端 / 类型定义层
 * 路由：G_LauncherRelease
 * 模块：iGM_LauncherRelease
 * 作用：定义启动器历史版本的数据库行类型、对外 DTO 与多语言更新说明结构
 * 内容：更新类型枚举、多语言更新说明、发布行类型、发布 DTO 与列表数据
 */

// 导入依赖 //
// （本文件仅包含类型与常量，无运行时依赖）

// 类型定义 //
/** 更新类型：major 大版本 / minor 小版本 / patch 修复 */
export type iGM_LauncherUpdateType = "major" | "minor" | "patch";

/** 单一语言的更新说明：新增 / 优化 / 修复 三组 */
export interface iGM_LauncherReleaseNotesSection {
  added: string[];
  improved: string[];
  fixed: string[];
}

/** 多语言更新说明（仅支持 zh-CN 与 en） */
export interface iGM_LauncherReleaseNotes {
  "zh-CN"?: iGM_LauncherReleaseNotesSection;
  en?: iGM_LauncherReleaseNotesSection;
}

/** 启动器发布行 */
export interface iGM_LauncherReleaseRow {
  iGM_Id: string;
  iGM_Version: string;
  iGM_ReleasedAt: string;
  iGM_UpdateType: string;
  /** 1 为最新版，0 为历史版本 */
  iGM_IsLatest: number;
  iGM_Channel: string;
  iGM_Platform: string;
  iGM_FileName: string;
  iGM_FileSize: number;
  iGM_FileSizeLabel: string;
  iGM_Sha256: string;
  iGM_DownloadUrl: string;
  iGM_ReleasePageUrl: string;
  /** JSONB 列，驱动直接解析为对象；可能为 null */
  iGM_Notes: iGM_LauncherReleaseNotes | null;
  iGM_CreatedAt: string;
  iGM_UpdatedAt: string;
}

/** 启动器发布 DTO（对外字段，与行字段同名但归一为驼峰语义） */
export interface iGM_LauncherReleaseDto {
  id: string;
  version: string;
  releasedAt: string;
  updateType: iGM_LauncherUpdateType;
  isLatest: boolean;
  channel: string;
  platform: string;
  fileName: string;
  fileSize: number;
  fileSizeLabel: string;
  sha256: string;
  downloadUrl: string;
  releasePageUrl: string;
  notes: iGM_LauncherReleaseNotes;
}

/** 发布写入入参（upsert 用） */
export interface iGM_LauncherReleaseInput {
  version: string;
  releasedAt: string;
  updateType: iGM_LauncherUpdateType;
  isLatest: boolean;
  channel?: string;
  platform?: string;
  fileName: string;
  fileSize: number;
  fileSizeLabel: string;
  sha256: string;
  downloadUrl: string;
  releasePageUrl: string;
  notes: iGM_LauncherReleaseNotes;
}

// 核心逻辑 //
/** 允许的更新类型 */
export const iGM_LauncherUpdateTypes: iGM_LauncherUpdateType[] = [
  "major",
  "minor",
  "patch",
];

/** 判断未知字符串是否为合法更新类型 */
export function iGM_IsLauncherUpdateType(
  value: unknown,
): value is iGM_LauncherUpdateType {
  return (
    typeof value === "string" &&
    iGM_LauncherUpdateTypes.includes(value as iGM_LauncherUpdateType)
  );
}

/** 归一化更新说明：缺省语言回退空数组，保证前端渲染不报错 */
export function iGM_NormalizeReleaseNotes(
  notes: iGM_LauncherReleaseNotes | null,
): iGM_LauncherReleaseNotes {
  const normalizeSection = (
    section: iGM_LauncherReleaseNotesSection | undefined,
  ): iGM_LauncherReleaseNotesSection => ({
    added: Array.isArray(section?.added) ? section!.added : [],
    improved: Array.isArray(section?.improved) ? section!.improved : [],
    fixed: Array.isArray(section?.fixed) ? section!.fixed : [],
  });
  return {
    "zh-CN": normalizeSection(notes?.["zh-CN"]),
    en: normalizeSection(notes?.en),
  };
}

/** 发布行转 DTO */
export function iGM_ToLauncherReleaseDto(
  row: iGM_LauncherReleaseRow,
): iGM_LauncherReleaseDto {
  return {
    id: row.iGM_Id,
    version: row.iGM_Version,
    releasedAt: row.iGM_ReleasedAt,
    updateType: iGM_IsLauncherUpdateType(row.iGM_UpdateType)
      ? row.iGM_UpdateType
      : "patch",
    isLatest: row.iGM_IsLatest === 1,
    channel: row.iGM_Channel,
    platform: row.iGM_Platform,
    fileName: row.iGM_FileName,
    fileSize: Number(row.iGM_FileSize ?? 0),
    fileSizeLabel: row.iGM_FileSizeLabel,
    sha256: row.iGM_Sha256,
    downloadUrl: row.iGM_DownloadUrl,
    releasePageUrl: row.iGM_ReleasePageUrl,
    notes: iGM_NormalizeReleaseNotes(row.iGM_Notes),
  };
}

// 导出 //
export default {
  iGM_LauncherUpdateTypes,
  iGM_IsLauncherUpdateType,
  iGM_NormalizeReleaseNotes,
  iGM_ToLauncherReleaseDto,
};