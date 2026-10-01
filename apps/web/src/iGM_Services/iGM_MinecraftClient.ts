/**
 * 文件路径：apps/web/src/iGM_Services/iGM_MinecraftClient.ts
 * 所属层：前端 / 基础服务层
 * 路由：调用后端 /G_Minecraft/*
 * 模块：iGM_MinecraftClient
 * 作用：Minecraft 资源分区后端接口的唯一前端调用出口
 * 内容：分区资源列表（类型/版本/加载器/平台筛选与搜索）、表单选项字典、
 *       资源详情、创建、编辑、删除、下载地址构造
 * 约束：只经 iGM_Request 发请求；类型与后端 iGM_Types/iGM_Resource.ts 保持一致；
 *       Minecraft 术语保留英文（Forge、Fabric、Java Edition）
 */

// 导入依赖 //
import {
  iGM_Delete,
  iGM_Get,
  iGM_Post,
  iGM_Put,
  type iGM_ApiResponse,
} from "./iGM_Request";
import { iGM_Config } from "./iGM_Config";
import type { iGM_ResourceDetail, iGM_ResourceListData } from "./iGM_ResourceClient";
import type {
  iGM_GameVersion,
  iGM_GameVersionListData,
} from "./iGM_GameClient";

// 类型定义 //
/** 分区列表查询参数 */
export interface iGM_MinecraftQuery {
  type?: string;
  version?: string;
  loader?: string;
  platform?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

/** 表单选项字典 */
export interface iGM_MinecraftOptions {
  resourceTypes: string[];
  /** 分区浏览类型（含 minecraft_version 本体分区） */
  partitionTypes: string[];
  versionOptions: string[];
  loaders: string[];
  platforms: string[];
}

/** 本体分区版本查询参数（模块十七） */
export interface iGM_MinecraftVersionQuery {
  type?: string;
  search?: string;
  sort?: "newest" | "oldest";
  page?: number;
  pageSize?: number;
}

/** 创建/编辑提交载荷（多选字段以数组提交） */
export interface iGM_MinecraftPayload {
  resourceId?: string;
  title: string;
  description: string;
  resourceType: string;
  mcVersions: string[];
  loaders: string[];
  platforms: string[];
  license: string;
  originalAuthor: string;
  originalUrl: string;
  changelog: string;
  fileId: string;
  coverFileId: string | null;
  /** 标签原始字符串，后端解析 */
  tags: string;
}

// 核心逻辑 //
/** 拼接查询字符串（跳过空值） */
function iGM_BuildQuery(
  params: Record<string, string | number | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

/** 分区资源列表 */
export function iGM_ApiListMinecraft(
  query: iGM_MinecraftQuery,
): Promise<iGM_ApiResponse<iGM_ResourceListData>> {
  return iGM_Get(
    `/G_Minecraft/list${iGM_BuildQuery({
      type: query.type,
      version: query.version,
      loader: query.loader,
      platform: query.platform,
      search: query.search,
      page: query.page,
      pageSize: query.pageSize,
    })}`,
  );
}

/** 表单选项字典 */
export function iGM_ApiMinecraftOptions(): Promise<
  iGM_ApiResponse<iGM_MinecraftOptions>
> {
  return iGM_Get("/G_Minecraft/options");
}

/** 资源详情 */
export function iGM_ApiGetMinecraft(
  resourceId: string,
): Promise<iGM_ApiResponse<{ resource: iGM_ResourceDetail }>> {
  return iGM_Get(
    `/G_Minecraft/detail?resourceId=${encodeURIComponent(resourceId)}`,
  );
}

/** 创建资源 */
export function iGM_ApiCreateMinecraft(
  payload: iGM_MinecraftPayload,
): Promise<iGM_ApiResponse<{ resource: iGM_ResourceDetail }>> {
  return iGM_Post("/G_Minecraft/create", payload);
}

/** 编辑资源 */
export function iGM_ApiUpdateMinecraft(
  payload: iGM_MinecraftPayload,
): Promise<iGM_ApiResponse<{ resource: iGM_ResourceDetail }>> {
  return iGM_Put("/G_Minecraft/edit", payload);
}

/** 删除资源 */
export function iGM_ApiDeleteMinecraft(
  resourceId: string,
): Promise<iGM_ApiResponse<{ deleted: boolean }>> {
  return iGM_Delete(
    `/G_Minecraft/delete?resourceId=${encodeURIComponent(resourceId)}`,
  );
}

/** 本体分区版本列表（模块十七：资源库 Minecraft 本体分区） */
export function iGM_ApiListMinecraftVersions(
  query: iGM_MinecraftVersionQuery,
): Promise<iGM_ApiResponse<iGM_GameVersionListData>> {
  return iGM_Get(
    `/G_Minecraft/versions${iGM_BuildQuery({
      type: query.type,
      search: query.search,
      sort: query.sort,
      page: query.page,
      pageSize: query.pageSize,
    })}`,
  );
}

/** 本体分区版本详情（模块十七） */
export function iGM_ApiGetMinecraftVersion(
  versionId: string,
): Promise<iGM_ApiResponse<{ version: iGM_GameVersion }>> {
  return iGM_Get(`/G_Minecraft/version/${encodeURIComponent(versionId)}`);
}

/** 资源下载地址（附件，浏览器直接打开触发下载） */
export function iGM_MinecraftDownloadUrl(resourceId: string): string {
  return `${iGM_Config.apiBase}/G_Minecraft/download?resourceId=${encodeURIComponent(resourceId)}`;
}

// 导出 //
export default {
  iGM_ApiListMinecraft,
  iGM_ApiMinecraftOptions,
  iGM_ApiGetMinecraft,
  iGM_ApiCreateMinecraft,
  iGM_ApiUpdateMinecraft,
  iGM_ApiDeleteMinecraft,
  iGM_ApiListMinecraftVersions,
  iGM_ApiGetMinecraftVersion,
  iGM_MinecraftDownloadUrl,
};
