/**
 * 文件路径：apps/web/src/iGM_Services/iGM_ThirdPartyClient.ts
 * 所属层：前端 / 基础服务层
 * 路由：调用后端 /G_ThirdParty/*
 * 模块：iGM_ThirdPartyClient
 * 作用：第三方资源库（仅 Fabric 兼容 / 仅 Modrinth 来源）后端接口的唯一前端调用出口
 * 内容：资源搜索与详情、创建下载任务、任务查询与列表、暂停/继续、取消、
 *       删除任务与清空已完成、任务进度 WebSocket 地址
 * 约束：只经 iGM_Request 发请求；类型与后端 iGM_Types/iGM_ThirdParty.ts 保持一致；
 *       Minecraft 术语保留英文（Fabric、Modrinth、Shader、Resource Pack、Datapack）
 * 说明：第三方资源文件不落本站服务器，前端只负责元数据展示与下载任务编排
 */

// 导入依赖 //
import {
  iGM_Delete,
  iGM_Get,
  iGM_Post,
  type iGM_ApiResponse,
} from "./iGM_Request";
import { iGM_GetWsUrl } from "./iGM_RealtimeClient";

// 类型定义 //
/** 第三方资源类型：模组 / 光影 / 资源包 / 地图 / 数据包 */
export type iGM_ThirdPartyResourceType =
  | "mod"
  | "shader"
  | "resourcepack"
  | "map"
  | "datapack";

/** 第三方资源 DTO */
export interface iGM_ThirdPartyResource {
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
export interface iGM_ThirdPartyVersion {
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
  versionType: "release" | "beta" | "alpha";
}

/** 下载任务状态 */
export type iGM_DownloadTaskStatus =
  | "pending"
  | "downloading"
  | "paused"
  | "completed"
  | "failed"
  | "canceled";

/** 下载任务 DTO */
export interface iGM_DownloadTask {
  id: string;
  resourceId: string;
  versionId: string;
  source: string;
  name: string;
  type: iGM_ThirdPartyResourceType;
  version: string;
  downloadUrl: string;
  filename: string;
  size: number;
  sha1: string | null;
  status: iGM_DownloadTaskStatus;
  downloaded: number;
  progress: number;
  speed: number;
  eta: number | null;
  error: string | null;
  targetDir: string;
  filePath: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 下载进度事件（与后端 iGM_DownloadEvent 对齐） */
export type iGM_DownloadEvent =
  | {
      type: "start";
      taskId: string;
      payload: {
        status: string;
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
        status: string;
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
        status: string;
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
      payload: { status: string; error: string };
      timestamp: number;
    }
  | {
      type: "canceled";
      taskId: string;
      payload: { status: string };
      timestamp: number;
    };

/** 任务进度 WebSocket 下行消息 */
export type iGM_DownloadWsMessage =
  | { type: "snapshot"; task: iGM_DownloadTask }
  | { type: "event"; event: iGM_DownloadEvent }
  | { type: "pong" };

/** 资源搜索参数 */
export interface iGM_ThirdPartySearchQuery {
  q?: string;
  type?: iGM_ThirdPartyResourceType | "";
  page?: number;
  pageSize?: number;
}

/** 资源搜索分页数据 */
export interface iGM_ThirdPartySearchData {
  items: iGM_ThirdPartyResource[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 资源详情数据 */
export interface iGM_ThirdPartyDetailData {
  resource: iGM_ThirdPartyResource;
  versions: iGM_ThirdPartyVersion[];
}

/** 创建下载任务结果 */
export interface iGM_ThirdPartyDownloadData {
  task: iGM_DownloadTask;
  taskId: string;
  downloadUrl: string;
  filename: string;
  size: number;
  sha1: string | null;
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

/** 搜索第三方资源（仅 Fabric 兼容、仅 Modrinth 来源） */
export function iGM_ApiSearchThirdParty(
  query: iGM_ThirdPartySearchQuery,
): Promise<iGM_ApiResponse<iGM_ThirdPartySearchData>> {
  return iGM_Get(
    `/G_ThirdParty/search${iGM_BuildQuery({
      q: query.q,
      type: query.type,
      page: query.page,
      pageSize: query.pageSize,
    })}`,
  );
}

/** 第三方资源详情（含全部版本） */
export function iGM_ApiGetThirdPartyResource(
  resourceId: string,
): Promise<iGM_ApiResponse<iGM_ThirdPartyDetailData>> {
  return iGM_Get(`/G_ThirdParty/resource/${encodeURIComponent(resourceId)}`);
}

/** 创建下载任务（target 留空则由后端使用默认下载目录） */
export function iGM_ApiStartThirdPartyDownload(input: {
  resourceId: string;
  versionId: string;
  target?: string;
}): Promise<iGM_ApiResponse<iGM_ThirdPartyDownloadData>> {
  return iGM_Post("/G_ThirdParty/download", input);
}

/** 查询单个下载任务 */
export function iGM_ApiGetThirdPartyDownload(
  taskId: string,
): Promise<iGM_ApiResponse<{ task: iGM_DownloadTask }>> {
  return iGM_Get(`/G_ThirdParty/download/${encodeURIComponent(taskId)}`);
}

/** 下载任务列表；status 为逗号分隔的状态过滤（省略则返回该用户全部任务） */
export function iGM_ApiListThirdPartyDownloads(
  status?: string,
): Promise<iGM_ApiResponse<{ items: iGM_DownloadTask[] }>> {
  return iGM_Get(
    `/G_ThirdParty/downloads${
      status ? `?status=${encodeURIComponent(status)}` : ""
    }`,
  );
}

/** 取消下载任务；purge 为 true 时一并清除已下载的残余文件 */
export function iGM_ApiCancelThirdPartyDownload(
  taskId: string,
  purge = false,
): Promise<iGM_ApiResponse<{ task: iGM_DownloadTask }>> {
  return iGM_Post(
    `/G_ThirdParty/download/${encodeURIComponent(taskId)}/cancel`,
    { purge },
  );
}

/** 暂停 / 继续下载任务 */
export function iGM_ApiPauseThirdPartyDownload(
  taskId: string,
  paused: boolean,
): Promise<iGM_ApiResponse<{ task: iGM_DownloadTask }>> {
  return iGM_Post(
    `/G_ThirdParty/download/${encodeURIComponent(taskId)}/pause`,
    { paused },
  );
}

/** 重试失败 / 已取消的任务；后端复用同一任务并保留断点续传 */
export function iGM_ApiRetryThirdPartyDownload(
  taskId: string,
): Promise<iGM_ApiResponse<{ task: iGM_DownloadTask }>> {
  return iGM_Post(
    `/G_ThirdParty/download/${encodeURIComponent(taskId)}/retry`,
    {},
  );
}

/** 删除单个下载任务记录 */
export function iGM_ApiRemoveThirdPartyDownload(
  taskId: string,
): Promise<iGM_ApiResponse<{ removed: boolean }>> {
  return iGM_Delete(`/G_ThirdParty/download/${encodeURIComponent(taskId)}`);
}

/** 清空全部已完成任务 */
export function iGM_ApiClearCompletedThirdPartyDownloads(): Promise<
  iGM_ApiResponse<{ removed: number }>
> {
  return iGM_Delete("/G_ThirdParty/downloads/completed");
}

/** 构造任务进度 WebSocket 地址 */
export function iGM_GetThirdPartyWsUrl(taskId: string): string {
  return iGM_GetWsUrl(`/G_ThirdParty/download/${encodeURIComponent(taskId)}/ws`);
}

// 导出 //
export default {
  iGM_ApiSearchThirdParty,
  iGM_ApiGetThirdPartyResource,
  iGM_ApiStartThirdPartyDownload,
  iGM_ApiGetThirdPartyDownload,
  iGM_ApiListThirdPartyDownloads,
  iGM_ApiCancelThirdPartyDownload,
  iGM_ApiPauseThirdPartyDownload,
  iGM_ApiRetryThirdPartyDownload,
  iGM_ApiRemoveThirdPartyDownload,
  iGM_ApiClearCompletedThirdPartyDownloads,
  iGM_GetThirdPartyWsUrl,
};