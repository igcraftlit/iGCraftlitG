/**
 * 文件路径：apps/web/src/iGM_Services/iGM_GameClient.ts
 * 所属层：前端 / 基础服务层
 * 路由：调用后端 /G_Game/*
 * 模块：iGM_GameClient
 * 作用：Minecraft 游戏本体一键下载的后端接口唯一前端调用出口
 * 内容：版本列表与详情、创建安装任务、查询/取消进度、WebSocket 进度地址、
 *       已安装版本管理（列表/校验/修复/删除）、原生文件夹选择器
 * 约束：只经 iGM_Request 发请求；类型与后端 iGM_Types/iGM_Game.ts 保持一致；
 *       Minecraft 术语保留英文（release、snapshot、Java Edition）
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
/** 版本类型：release / snapshot / old_beta / old_alpha */
export type iGM_GameVersionType =
  | "release"
  | "snapshot"
  | "old_beta"
  | "old_alpha";

/** 安装任务状态 */
export type iGM_GameInstallStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "canceled";

/** 下载阶段名（fabric 为模块十八新增的「安装 Fabric」阶段） */
export type iGM_GameStage =
  | "manifest"
  | "client"
  | "json"
  | "libraries"
  | "natives"
  | "assets"
  | "fabric"
  | "verify"
  | "assemble"
  | "done";

/** 可执行的模组加载器：none 原版 / fabric Fabric */
export type iGM_GameLoader = "none" | "fabric";

/**
 * 版本 DTO（与后端 iGM_MinecraftVersionDto 对齐）
 * 说明：模块十八仅下发「完整大小」，不再包含客户端与服务端细分大小与校验值
 */
export interface iGM_GameVersion {
  id: string;
  version: string;
  type: iGM_GameVersionType;
  releaseTime: string | null;
  /** 完整大小（字节）；尚未计算时为 null，前端显示「计算中」 */
  totalSize: number | null;
  notes: string | null;
  /** 当前登录用户是否已安装该版本 */
  installed: boolean;
}

/** 安装任务 DTO */
export interface iGM_GameInstall {
  id: string;
  version: string;
  installDir: string;
  /** 模组加载器：none 原版 / fabric Fabric */
  loader: iGM_GameLoader;
  loaderVersion: string | null;
  /** 版本目录名：原版为版本号，Fabric 为 <版本号>-fabric */
  versionDir: string;
  status: iGM_GameInstallStatus;
  progress: number;
  totalFiles: number;
  downloadedFiles: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 模组加载器 DTO（安装确认页展示用） */
export interface iGM_ModLoader {
  slug: string;
  name: string;
  /** i18n 文案键；前端解析为当前语言描述 */
  descriptionKey: string | null;
  /** 是否受支持；false 时前端置灰并标注「敬请期待」 */
  supported: boolean;
}

/** Fabric Loader 版本选项 */
export interface iGM_FabricLoaderOptions {
  versions: string[];
  defaultVersion: string;
}

/** 版本分页数据 */
export interface iGM_GameVersionListData {
  items: iGM_GameVersion[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** 下载进度事件（与后端 iGM_GameProgressEvent 对齐） */
export type iGM_GameProgressEvent =
  | { type: "start"; taskId: string; version: string; totalFiles: number; totalBytes: number }
  | { type: "stage"; stage: iGM_GameStage }
  | {
      type: "progress";
      doneFiles: number;
      totalFiles: number;
      doneBytes: number;
      totalBytes: number;
      percent: number;
      speed: number;
      remainingSeconds: number | null;
    }
  | { type: "file_done"; path: string; size: number }
  | { type: "retry"; path: string; attempt: number; reason: string; cooldownSeconds?: number }
  | { type: "complete"; taskId: string; installDir: string }
  | { type: "error"; taskId: string; message: string }
  | { type: "canceled"; taskId: string };

/** WebSocket 下行消息 */
export type iGM_GameWsMessage =
  | { type: "snapshot"; install: iGM_GameInstall }
  | { type: "event"; event: iGM_GameProgressEvent }
  | { type: "pong" };

/** 版本列表查询参数 */
export interface iGM_GameVersionQuery {
  type?: string;
  search?: string;
  sort?: "newest" | "oldest";
  page?: number;
  pageSize?: number;
}

/** 校验结果 */
export interface iGM_GameVerifyResult {
  total: number;
  ok: number;
  missing: number;
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

/** 可下载版本列表（含当前用户已安装标记） */
export function iGM_ApiListGameVersions(
  query: iGM_GameVersionQuery,
): Promise<iGM_ApiResponse<iGM_GameVersionListData>> {
  return iGM_Get(
    `/G_Game/versions${iGM_BuildQuery({
      type: query.type,
      search: query.search,
      sort: query.sort,
      page: query.page,
      pageSize: query.pageSize,
    })}`,
  );
}

/** 单个版本详情 */
export function iGM_ApiGetGameVersion(
  versionId: string,
): Promise<iGM_ApiResponse<{ version: iGM_GameVersion }>> {
  return iGM_Get(
    `/G_Game/version?versionId=${encodeURIComponent(versionId)}`,
  );
}

/** 模组加载器列表（含 Forge / NeoForge 的置灰占位） */
export function iGM_ApiListGameLoaders(): Promise<
  iGM_ApiResponse<{ items: iGM_ModLoader[] }>
> {
  return iGM_Get("/G_Game/loaders");
}

/** Fabric Loader 版本选项（versions 与默认稳定版） */
export function iGM_ApiListFabricLoaders(): Promise<
  iGM_ApiResponse<iGM_FabricLoaderOptions>
> {
  return iGM_Get("/G_Game/fabric/versions");
}

/** 创建安装任务（installDir 留空则由后端使用默认目录；后端自动补全 .minecraft 与版本目录） */
export function iGM_ApiStartGameInstall(input: {
  version: string;
  /** 模组加载器：none 原版 / fabric Fabric */
  loader?: iGM_GameLoader;
  /** Fabric Loader 版本号；缺省取最新稳定版 */
  loaderVersion?: string;
  installDir?: string;
}): Promise<iGM_ApiResponse<{ install: iGM_GameInstall }>> {
  return iGM_Post("/G_Game/install", input);
}

/** 查询安装任务进度 */
export function iGM_ApiGetGameInstall(
  taskId: string,
): Promise<iGM_ApiResponse<{ install: iGM_GameInstall }>> {
  return iGM_Get(`/G_Game/install/${encodeURIComponent(taskId)}`);
}

/** 取消安装任务 */
export function iGM_ApiCancelGameInstall(
  taskId: string,
  purge = false,
): Promise<iGM_ApiResponse<{ install: iGM_GameInstall }>> {
  return iGM_Post(
    `/G_Game/install/${encodeURIComponent(taskId)}/cancel`,
    { purge },
  );
}

/** 清除未完成任务的残余文件（已下载内容与任务记录一并移除） */
export function iGM_ApiRemoveGameTask(
  taskId: string,
): Promise<iGM_ApiResponse<{ removed: number }>> {
  return iGM_Delete(`/G_Game/install/${encodeURIComponent(taskId)}`);
}

/** 安装任务列表；status 为逗号分隔的状态过滤（省略则返回该用户全部任务） */
export function iGM_ApiListGameInstalls(
  status?: string,
): Promise<iGM_ApiResponse<{ items: iGM_GameInstall[] }>> {
  return iGM_Get(
    `/G_Game/installs${status ? `?status=${encodeURIComponent(status)}` : ""}`,
  );
}

/** 已安装版本列表 */
export function iGM_ApiListInstalledGames(): Promise<
  iGM_ApiResponse<{ items: iGM_GameInstall[] }>
> {
  return iGM_Get("/G_Game/installed");
}

/** 校验安装完整性（逐文件哈希，耗时较长） */
export function iGM_ApiVerifyGameInstall(
  installId: string,
): Promise<iGM_ApiResponse<{ result: iGM_GameVerifyResult }>> {
  return iGM_Post(
    `/G_Game/installed/${encodeURIComponent(installId)}/verify`,
    undefined,
    180000,
  );
}

/** 修复安装（重新校验并补齐缺失文件） */
export function iGM_ApiRepairGameInstall(
  installId: string,
): Promise<iGM_ApiResponse<{ install: iGM_GameInstall }>> {
  return iGM_Post(
    `/G_Game/installed/${encodeURIComponent(installId)}/repair`,
  );
}

/** 删除已安装版本（仅移除该版本的 versions/<version> 目录） */
export function iGM_ApiRemoveGameInstall(
  installId: string,
): Promise<iGM_ApiResponse<{ removed: boolean }>> {
  return iGM_Delete(
    `/G_Game/installed/${encodeURIComponent(installId)}`,
  );
}

/**
 * 调起后端所在机器的原生文件夹选择器
 * 说明：该接口会阻塞等待用户在弹窗中选择，超时放宽到 6 分钟
 */
export function iGM_ApiPickFolder(): Promise<
  iGM_ApiResponse<{ path: string | null }>
> {
  return iGM_Post("/G_Game/pick-folder", undefined, 360000);
}

/** 构造任务进度 WebSocket 地址 */
export function iGM_GetGameWsUrl(taskId: string): string {
  return iGM_GetWsUrl(`/G_Game/install/${encodeURIComponent(taskId)}/ws`);
}

// 导出 //
export default {
  iGM_ApiListGameVersions,
  iGM_ApiGetGameVersion,
  iGM_ApiListGameLoaders,
  iGM_ApiListFabricLoaders,
  iGM_ApiStartGameInstall,
  iGM_ApiGetGameInstall,
  iGM_ApiCancelGameInstall,
  iGM_ApiListGameInstalls,
  iGM_ApiListInstalledGames,
  iGM_ApiVerifyGameInstall,
  iGM_ApiRepairGameInstall,
  iGM_ApiRemoveGameInstall,
  iGM_ApiRemoveGameTask,
  iGM_ApiPickFolder,
  iGM_GetGameWsUrl,
};