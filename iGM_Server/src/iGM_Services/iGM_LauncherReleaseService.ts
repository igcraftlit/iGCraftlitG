/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_LauncherReleaseService.ts
 * 所属层：后端 / 业务逻辑层
 * 路由：G_LauncherRelease
 * 模块：iGM_LauncherReleaseService
 * 作用：启动器历史版本的读取与写入编排
 * 内容：全部版本列表（最新版置顶语义由 DTO 的 isLatest 承载）、
 *       最新版本读取、按版本 upsert（写入前保证最新版唯一）、
 *       类目种子数据（v26.3.1 / v26.3.2 两条发布记录）
 */

// 导入依赖 //
import {
  iGM_ClearLatestFlag,
  iGM_FindLatestLauncherRelease,
  iGM_ListLauncherReleases,
  iGM_UpsertLauncherRelease,
} from "../iGM_Repositories/iGM_LauncherReleaseRepository";
import {
  iGM_ToLauncherReleaseDto,
  type iGM_LauncherReleaseDto,
  type iGM_LauncherReleaseInput,
} from "../iGM_Types/iGM_LauncherRelease";

// 类型定义 //
/** 发布列表数据 */
export interface iGM_LauncherReleaseListData {
  items: iGM_LauncherReleaseDto[];
  total: number;
}

// 核心逻辑 //
/** 列出全部启动器版本（发布日期倒序），已转 DTO */
export async function iGM_ListLauncherReleasesService(): Promise<iGM_LauncherReleaseListData> {
  const rows = await iGM_ListLauncherReleases();
  const items = rows.map(iGM_ToLauncherReleaseDto);
  return { items, total: items.length };
}

/** 读取最新版本，无记录时返回 null */
export async function iGM_GetLatestLauncherReleaseService(): Promise<iGM_LauncherReleaseDto | null> {
  const row = await iGM_FindLatestLauncherRelease();
  return row ? iGM_ToLauncherReleaseDto(row) : null;
}

/**
 * 写入 / 覆盖一条发布记录。
 * 若本次标记为最新版，先清除其余版本的最新标记，保证最新版全局唯一。
 */
export async function iGM_UpsertLauncherReleaseService(
  input: iGM_LauncherReleaseInput,
): Promise<iGM_LauncherReleaseDto> {
  if (input.isLatest) await iGM_ClearLatestFlag(input.version);
  await iGM_UpsertLauncherRelease(input);
  const rows = await iGM_ListLauncherReleases();
  const row = rows.find((item) => item.iGM_Version === input.version);
  if (!row) throw new Error(`[iGM_LauncherRelease] 写入后未找到版本：${input.version}`);
  return iGM_ToLauncherReleaseDto(row);
}

// 导出 //
export default {
  iGM_ListLauncherReleasesService,
  iGM_GetLatestLauncherReleaseService,
  iGM_UpsertLauncherReleaseService,
};