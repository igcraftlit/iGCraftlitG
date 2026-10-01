/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_ThirdPartyService.ts
 * 所属层：后端 / 业务逻辑层
 * 路由：G_ThirdParty
 * 模块：iGM_ThirdPartyService
 * 作用：模块二十第三方资源（Modrinth）业务编排——资源搜索与详情、
 *       下载任务生命周期、进度落库与实时分发、暂停/取消/重试/清理
 * 内容：搜索结果 DTO 组装、资源详情（元数据 + Fabric 兼容版本）、
 *       任务创建（目录校验 + 重复任务拦截）、任务运行态注册表、订阅分发、
 *       进度事件落库、暂停恢复、取消、重试、删除与清空已完成
 * 说明：
 *   - 下载引擎与 HTTP/WS 上下文完全解耦，本服务持有 taskId → 运行态注册表，
 *     以按 taskId 推送的方式向网站下载中心与启动器同时分发同一份进度；
 *   - 同一 taskId 允许多个客户端订阅（网站与启动器可同时观察同一任务）；
 *   - 资源文件不落本站服务器存储：字节由引擎写入调用方在本地指定的目录。
 */

// 导入依赖 //
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { iGM_Config } from "../iGM_Config/iGM_Config";
import {
  iGM_CreateDownloadTask,
  iGM_DeleteCompletedDownloadTasks,
  iGM_DeleteDownloadTask,
  iGM_FindActiveDownloadTask,
  iGM_FindDownloadTaskById,
  iGM_ListDownloadTasksByUser,
  iGM_UpdateDownloadTask,
} from "../iGM_Repositories/iGM_ThirdPartyRepository";
import {
  iGM_IsDownloadTaskStatus,
  iGM_ToDownloadTaskDto,
  iGM_ToThirdPartyResourceDto,
  iGM_ToThirdPartyVersionDto,
  type iGM_DownloadEvent,
  type iGM_DownloadTaskDto,
  type iGM_DownloadTaskRow,
  type iGM_DownloadTaskStatus,
  type iGM_ThirdPartyResourceDto,
  type iGM_ThirdPartyResourceType,
  type iGM_ThirdPartySearchData,
  type iGM_ThirdPartyVersionDto,
  type iGM_ThirdPartyVersionRow,
} from "../iGM_Types/iGM_ThirdParty";
import type { iGM_UserRow } from "../iGM_Types/iGM_Auth";
import {
  iGM_ModrinthLoadResource,
  iGM_ModrinthSearchResources,
} from "./iGM_ModrinthService";
import {
  iGM_RunThirdPartyDownload,
  iGM_SafeFilename,
  iGM_ThirdPartyError,
  iGM_ValidateThirdPartyTarget,
  type iGM_ThirdPartyCancelSignal,
} from "./iGM_ThirdPartyDownloadService";

// 类型定义 //
/** 任务运行态（内存注册表条目） */
interface iGM_ThirdPartyRuntime {
  taskId: string;
  userId: string;
  targetDir: string;
  /** 下载直链与校验信息（重试时复用） */
  downloadUrl: string;
  filename: string;
  size: number;
  sha1: string | null;
  canceled: iGM_ThirdPartyCancelSignal;
  listeners: Set<(event: iGM_DownloadEvent) => void>;
  /** 最近一次事件：供后订阅的客户端立即补齐状态 */
  lastEvent: iGM_DownloadEvent | null;
  running: boolean;
}

/** 资源搜索入参 */
export interface iGM_ThirdPartySearchQuery {
  q?: string;
  type?: string;
  page?: number;
  pageSize?: number;
}

/** 任务创建入参 */
export interface iGM_ThirdPartyStartInput {
  resourceId: string;
  versionId: string;
  /** 下载目标目录；缺省使用配置的默认下载目录 */
  target?: string;
}

// 核心逻辑 //
/** 任务运行态注册表：taskId → 运行态 */
const iGM_ThirdPartyRuntimes = new Map<string, iGM_ThirdPartyRuntime>();

/* ---------- 搜索与详情 ---------- */

/** 解析资源类型参数：非法或缺省一律按 mod（Modrinth 默认资源类型） */
function iGM_ParseResourceType(raw: string | undefined): iGM_ThirdPartyResourceType {
  const value = (raw ?? "").trim().toLowerCase();
  if (
    value === "shader" ||
    value === "resourcepack" ||
    value === "map" ||
    value === "datapack" ||
    value === "mod"
  ) {
    return value;
  }
  return "mod";
}

/** 搜索第三方资源（仅 Fabric 兼容），结果同时缓存进本地数据库 */
export async function iGM_SearchThirdPartyResources(
  query: iGM_ThirdPartySearchQuery,
): Promise<iGM_ThirdPartySearchData> {
  const result = await iGM_ModrinthSearchResources({
    query: (query.q ?? "").trim(),
    type: iGM_ParseResourceType(query.type),
    page: Number(query.page) || 1,
    pageSize: Number(query.pageSize) || 20,
  });

  return {
    items: result.items.map(iGM_ToThirdPartyResourceDto),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    totalPages: result.totalPages,
  };
}

/** 资源详情（元数据 + Fabric 兼容版本列表） */
export async function iGM_GetThirdPartyResource(
  idOrSlug: string,
  options?: { refresh?: boolean },
): Promise<{
  resource: iGM_ThirdPartyResourceDto;
  versions: iGM_ThirdPartyVersionDto[];
}> {
  const { resource, versions } = await iGM_ModrinthLoadResource(idOrSlug, {
    force: options?.refresh === true,
  });
  return {
    resource: iGM_ToThirdPartyResourceDto(resource),
    versions: versions.map(iGM_ToThirdPartyVersionDto),
  };
}

/* ---------- 进度分发与落库 ---------- */

/** 向任务的全部订阅者分发事件，并记录最近事件 */
function iGM_Dispatch(runtime: iGM_ThirdPartyRuntime, event: iGM_DownloadEvent): void {
  runtime.lastEvent = event;
  for (const listener of runtime.listeners) {
    try {
      listener(event);
    } catch {
      // 单个订阅者异常不影响其它订阅者
    }
  }
}

/**
 * 订阅下载任务进度；返回取消订阅函数
 * 订阅瞬间回放最近一次事件，让后进入的客户端立即补齐状态
 */
export function iGM_SubscribeThirdPartyTask(
  taskId: string,
  listener: (event: iGM_DownloadEvent) => void,
): () => void {
  const runtime = iGM_ThirdPartyRuntimes.get(taskId);
  if (!runtime) return () => undefined;
  runtime.listeners.add(listener);
  if (runtime.lastEvent) {
    try {
      listener(runtime.lastEvent);
    } catch {
      // 忽略回放异常
    }
  }
  return () => {
    runtime.listeners.delete(listener);
  };
}

/** 进度事件落库 */
async function iGM_PersistThirdPartyProgress(
  boardTaskId: string,
  event: iGM_DownloadEvent,
): Promise<void> {
  const now = new Date().toISOString();
  switch (event.type) {
    case "start":
      await iGM_UpdateDownloadTask(boardTaskId, {
        status: "downloading",
        downloaded: 0,
        progress: 0,
        speed: 0,
        eta: null,
        error: null,
        now,
      });
      break;
    case "progress":
      await iGM_UpdateDownloadTask(boardTaskId, {
        status: event.payload.status,
        downloaded: event.payload.downloaded,
        progress: event.payload.percent,
        speed: event.payload.speed,
        eta: event.payload.eta,
        error: event.payload.error,
        now,
      });
      break;
    case "complete":
      await iGM_UpdateDownloadTask(boardTaskId, {
        status: "completed",
        downloaded: event.payload.downloaded,
        progress: 100,
        speed: 0,
        eta: null,
        error: null,
        filePath: event.payload.filePath,
        now,
      });
      break;
    case "error":
      await iGM_UpdateDownloadTask(boardTaskId, {
        status: "failed",
        speed: 0,
        eta: null,
        error: event.payload.error,
        now,
      });
      break;
    case "canceled":
      await iGM_UpdateDownloadTask(boardTaskId, {
        status: "canceled",
        speed: 0,
        eta: null,
        now,
      });
      break;
    default:
      // file_done / retry 不改变任务状态，仅作为过程事件
      break;
  }
}

/* ---------- 任务创建 ---------- */

/** 按本站主键、上游版本号或版本标签定位版本 */
function iGM_ResolveVersion(
  versions: iGM_ThirdPartyVersionRow[],
  versionId: string,
): iGM_ThirdPartyVersionRow | null {
  return (
    versions.find((item) => item.iGM_Id === versionId) ??
    versions.find((item) => item.iGM_SourceId === versionId) ??
    versions.find((item) => item.iGM_Version === versionId) ??
    null
  );
}

/**
 * 创建并启动下载任务
 * 1. 解析资源与版本（未缓存则向上游拉取）；
 * 2. 校验目标目录安全可写；
 * 3. 拦截同一用户对同一版本的重复进行中任务；
 * 4. 落库任务后后台执行下载引擎，并把进度分发给所有订阅者。
 */
export async function iGM_StartThirdPartyDownload(
  user: iGM_UserRow,
  input: iGM_ThirdPartyStartInput,
): Promise<iGM_DownloadTaskDto> {
  const resourceKey = (input.resourceId ?? "").trim();
  const versionKey = (input.versionId ?? "").trim();
  if (!resourceKey) throw new iGM_ThirdPartyError("thirdParty.errors.resourceRequired", 400);
  if (!versionKey) throw new iGM_ThirdPartyError("thirdParty.errors.versionRequired", 400);

  // 创建任务时优先使用本地已缓存版本，避免回源上游导致调用方等待过久
  const { resource, versions } = await iGM_ModrinthLoadResource(resourceKey, {
    allowStale: true,
  });
  const version = iGM_ResolveVersion(versions, versionKey);
  if (!version) throw new iGM_ThirdPartyError("thirdParty.errors.versionNotFound", 404);

  const active = await iGM_FindActiveDownloadTask(user.iGM_Id, version.iGM_Id);
  if (active) throw new iGM_ThirdPartyError("thirdParty.errors.alreadyDownloading", 409);

  const targetDir = await iGM_ValidateThirdPartyTarget(
    input.target?.trim() || iGM_Config.thirdParty.defaultDownloadDir,
  );

  const now = new Date().toISOString();
  const task = await iGM_CreateDownloadTask({
    userId: user.iGM_Id,
    resourceId: resource.iGM_Id,
    versionId: version.iGM_Id,
    source: resource.iGM_Source,
    downloadUrl: version.iGM_DownloadUrl,
    filename: version.iGM_Filename,
    size: version.iGM_Size,
    sha1: version.iGM_Sha1,
    targetDir,
    now,
  });

  const runtime: iGM_ThirdPartyRuntime = {
    taskId: task.iGM_TaskId,
    userId: user.iGM_Id,
    targetDir,
    downloadUrl: task.iGM_DownloadUrl,
    filename: task.iGM_Filename,
    size: task.iGM_Size,
    sha1: task.iGM_Sha1,
    canceled: { aborted: false, paused: false },
    listeners: new Set(),
    lastEvent: null,
    running: true,
  };
  iGM_ThirdPartyRuntimes.set(task.iGM_TaskId, runtime);

  // 后台执行，不阻塞接口响应
  void iGM_RunThirdPartyTask(runtime);

  return iGM_ToDownloadTaskDto(task);
}

/** 执行任务：调用下载引擎并把事件分发到订阅者与数据库 */
async function iGM_RunThirdPartyTask(runtime: iGM_ThirdPartyRuntime): Promise<void> {
  const { taskId } = runtime;
  try {
    await iGM_RunThirdPartyDownload({
      taskId,
      downloadUrl: runtime.downloadUrl,
      filename: runtime.filename,
      size: runtime.size,
      sha1: runtime.sha1,
      targetDir: runtime.targetDir,
      hooks: {
        signal: runtime.canceled,
        onEvent: async (event) => {
          iGM_Dispatch(runtime, event);
          await iGM_PersistThirdPartyProgress(taskId, event);
        },
      },
    });
  } catch (error) {
    const canceled =
      runtime.canceled.aborted ||
      (error instanceof iGM_ThirdPartyError && error.status === 499);
    const messageKey =
      error instanceof iGM_ThirdPartyError
        ? error.message
        : "thirdParty.errors.downloadFailed";
    if (canceled) {
      await iGM_UpdateDownloadTask(taskId, {
        status: "canceled",
        speed: 0,
        eta: null,
        now: new Date().toISOString(),
      });
      iGM_Dispatch(runtime, {
        type: "canceled",
        taskId,
        payload: { status: "canceled" },
        timestamp: Math.floor(Date.now() / 1000),
      });
    } else {
      await iGM_UpdateDownloadTask(taskId, {
        status: "failed",
        speed: 0,
        eta: null,
        error: messageKey,
        now: new Date().toISOString(),
      });
      iGM_Dispatch(runtime, {
        type: "error",
        taskId,
        payload: { status: "failed", error: messageKey },
        timestamp: Math.floor(Date.now() / 1000),
      });
    }
  } finally {
    runtime.running = false;
    // 保留注册表条目一段时间，便于后进入的客户端读取最终状态
    setTimeout(() => {
      const entry = iGM_ThirdPartyRuntimes.get(taskId);
      if (entry && !entry.running && entry.listeners.size === 0) {
        iGM_ThirdPartyRuntimes.delete(taskId);
      }
    }, 10 * 60 * 1000);
  }
}

/* ---------- 任务查询与控制 ---------- */

/** 读取任务并校验归属（仅任务所有者可见） */
async function iGM_RequireTask(
  user: iGM_UserRow,
  taskId: string,
): Promise<iGM_DownloadTaskRow> {
  const row = await iGM_FindDownloadTaskById(taskId);
  if (!row || row.iGM_UserId !== user.iGM_Id) {
    throw new iGM_ThirdPartyError("thirdParty.errors.taskNotFound", 404);
  }
  return row;
}

/** 查询单个下载任务进度（网站与启动器共用同一 taskId） */
export async function iGM_GetThirdPartyDownload(
  user: iGM_UserRow,
  taskId: string,
): Promise<iGM_DownloadTaskDto> {
  return iGM_ToDownloadTaskDto(await iGM_RequireTask(user, taskId));
}

/** 解析任务状态筛选参数（逗号分隔，非法值忽略；空表示不过滤） */
function iGM_ParseTaskStatuses(raw: string | undefined): iGM_DownloadTaskStatus[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => iGM_IsDownloadTaskStatus(item));
}

/** 列出该用户的下载任务（下载中心与启动器下载页共用） */
export async function iGM_ListThirdPartyDownloads(
  user: iGM_UserRow,
  status?: string,
): Promise<iGM_DownloadTaskDto[]> {
  return (
    await iGM_ListDownloadTasksByUser(
      user.iGM_Id,
      iGM_ParseTaskStatuses(status),
    )
  ).map(iGM_ToDownloadTaskDto);
}

/**
 * 暂停 / 恢复下载任务
 * 说明：暂停后引擎在分片之间挂起，已下载分片保留，恢复后继续续传
 */
export async function iGM_PauseThirdPartyDownload(
  user: iGM_UserRow,
  taskId: string,
  paused: boolean,
): Promise<iGM_DownloadTaskDto> {
  const row = await iGM_RequireTask(user, taskId);
  const runtime = iGM_ThirdPartyRuntimes.get(taskId);

  if (runtime?.running) {
    runtime.canceled.paused = paused;
    const status: iGM_DownloadTaskStatus = paused ? "paused" : "downloading";
    iGM_Dispatch(runtime, {
      type: "progress",
      taskId,
      payload: {
        status,
        downloaded: row.iGM_Downloaded,
        total: row.iGM_Size,
        percent: row.iGM_Progress,
        speed: paused ? 0 : row.iGM_Speed,
        eta: paused ? null : row.iGM_Eta,
        error: null,
      },
      timestamp: Math.floor(Date.now() / 1000),
    });
    return await iGM_GetThirdPartyDownload(user, taskId);
  }

  // 无运行态（进程重启或任务已结束）：仅同步数据库状态，不伪造进度
  if (paused && (row.iGM_Status === "downloading" || row.iGM_Status === "pending")) {
    await iGM_UpdateDownloadTask(taskId, {
      status: "paused",
      speed: 0,
      eta: null,
      now: new Date().toISOString(),
    });
  }
  return await iGM_GetThirdPartyDownload(user, taskId);
}

/** 等待任务运行态结束（取消后清理分片前调用，避免引擎继续写入） */
async function iGM_WaitThirdPartyStop(
  runtime: iGM_ThirdPartyRuntime | undefined,
): Promise<void> {
  if (!runtime?.running) return;
  const deadline = Date.now() + 15000;
  while (runtime.running && Date.now() < deadline) {
    await new Promise((done) => setTimeout(done, 200));
  }
}

/**
 * 取消下载任务（运行中置取消信号，否则直接标记为已取消）
 * purge 为 true 时，等运行态结束后一并清除已下载的 .part 分片并删除任务记录
 */
export async function iGM_CancelThirdPartyDownload(
  user: iGM_UserRow,
  taskId: string,
  purge = false,
): Promise<iGM_DownloadTaskDto> {
  const row = await iGM_RequireTask(user, taskId);
  const runtime = iGM_ThirdPartyRuntimes.get(taskId);
  if (runtime?.running) {
    runtime.canceled.paused = false;
    runtime.canceled.aborted = true;
  } else if (row.iGM_Status !== "completed" && row.iGM_Status !== "failed") {
    await iGM_UpdateDownloadTask(taskId, {
      status: "canceled",
      speed: 0,
      eta: null,
      now: new Date().toISOString(),
    });
  }

  if (!purge) return await iGM_GetThirdPartyDownload(user, taskId);

  await iGM_WaitThirdPartyStop(runtime);
  const dto = iGM_ToDownloadTaskDto(
    (await iGM_FindDownloadTaskById(taskId)) ?? { ...row, iGM_Status: "canceled" },
  );
  await iGM_RemovePartialFile(row);
  iGM_ThirdPartyRuntimes.delete(taskId);
  await iGM_DeleteDownloadTask(taskId);
  return dto;
}

/** 清除任务对应的未完成分片（.part），已下载完成的正式文件不触碰 */
async function iGM_RemovePartialFile(row: iGM_DownloadTaskRow): Promise<void> {
  const partPath = join(
    row.iGM_TargetDir,
    `${iGM_SafeFilename(row.iGM_Filename)}.part`,
  );
  await rm(partPath, { force: true }).catch(() => undefined);
}

/**
 * 重试下载任务（失败或已取消的任务重新执行）
 * 说明：保留 .part 分片，引擎按 Range 续传，已完整且校验通过的文件直接跳过
 */
export async function iGM_RetryThirdPartyDownload(
  user: iGM_UserRow,
  taskId: string,
): Promise<iGM_DownloadTaskDto> {
  const row = await iGM_RequireTask(user, taskId);
  const existing = iGM_ThirdPartyRuntimes.get(taskId);
  if (existing?.running) {
    throw new iGM_ThirdPartyError("thirdParty.errors.taskRunning", 409);
  }
  if (row.iGM_Status === "completed") {
    throw new iGM_ThirdPartyError("thirdParty.errors.taskCompleted", 409);
  }

  await iGM_UpdateDownloadTask(taskId, {
    status: "downloading",
    speed: 0,
    eta: null,
    error: null,
    now: new Date().toISOString(),
  });

  const runtime: iGM_ThirdPartyRuntime = {
    taskId,
    userId: row.iGM_UserId,
    targetDir: row.iGM_TargetDir,
    downloadUrl: row.iGM_DownloadUrl,
    filename: row.iGM_Filename,
    size: row.iGM_Size,
    sha1: row.iGM_Sha1,
    canceled: { aborted: false, paused: false },
    listeners: existing?.listeners ?? new Set(),
    lastEvent: null,
    running: true,
  };
  iGM_ThirdPartyRuntimes.set(taskId, runtime);
  void iGM_RunThirdPartyTask(runtime);

  return await iGM_GetThirdPartyDownload(user, taskId);
}

/** 删除下载任务记录（同时清理未完成的 .part 分片；已完成的文件保留在磁盘） */
export async function iGM_DeleteThirdPartyDownload(
  user: iGM_UserRow,
  taskId: string,
): Promise<{ removed: boolean }> {
  const row = await iGM_RequireTask(user, taskId);
  const runtime = iGM_ThirdPartyRuntimes.get(taskId);
  if (runtime?.running) {
    throw new iGM_ThirdPartyError("thirdParty.errors.taskRunning", 409);
  }

  await iGM_RemovePartialFile(row);

  iGM_ThirdPartyRuntimes.delete(taskId);
  return { removed: await iGM_DeleteDownloadTask(taskId) };
}

/** 清空该用户已完成的下载任务记录 */
export async function iGM_ClearCompletedThirdPartyDownloads(
  user: iGM_UserRow,
): Promise<{ removed: number }> {
  return { removed: await iGM_DeleteCompletedDownloadTasks(user.iGM_Id) };
}

// 导出 //
export { iGM_ThirdPartyError };
export default {
  iGM_SearchThirdPartyResources,
  iGM_GetThirdPartyResource,
  iGM_StartThirdPartyDownload,
  iGM_GetThirdPartyDownload,
  iGM_ListThirdPartyDownloads,
  iGM_PauseThirdPartyDownload,
  iGM_CancelThirdPartyDownload,
  iGM_RetryThirdPartyDownload,
  iGM_DeleteThirdPartyDownload,
  iGM_ClearCompletedThirdPartyDownloads,
  iGM_SubscribeThirdPartyTask,
};