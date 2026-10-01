/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_GameService.ts
 * 所属层：后端 / 业务逻辑层
 * 路由：G_Game、G_Minecraft
 * 模块：iGM_GameService
 * 作用：Minecraft 游戏本体下载业务编排——版本列表与详情、安装任务生命周期、
 *       实时进度分发、已安装版本校验/修复/删除
 * 内容：版本分页查询（含“是否已安装”）、任务创建与取消、任务进度订阅、
 *       进度落库、已安装列表、文件校验、失败文件重试修复、按版本卸载
 * 说明：下载引擎与 HTTP 上下文完全解耦；本服务持有任务运行态注册表，
 *       以按 taskId 推送的方式向 WebSocket 订阅者分发进度事件
 */

// 导入依赖 //
import { createHash } from "node:crypto";
import { readFile, rm, stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { iGM_Config } from "../iGM_Config/iGM_Config";
import {
  iGM_CreateGameInstall,
  iGM_DeleteGameFiles,
  iGM_DeleteGameInstall,
  iGM_FindActiveGameInstall,
  iGM_FindGameInstallById,
  iGM_FindMinecraftVersionById,
  iGM_FindMinecraftVersionByVersion,
  iGM_InsertGameFiles,
  iGM_ListGameFiles,
  iGM_ListGameInstallsByUser,
  iGM_ListInstalledVersions,
  iGM_ListMinecraftVersions,
  iGM_ListModLoaders,
  iGM_UpdateGameFileStatus,
  iGM_UpdateGameInstallProgress,
} from "../iGM_Repositories/iGM_GameRepository";
import {
  iGM_GameError,
  iGM_RunGameInstall,
  iGM_ValidateInstallDir,
  type iGM_CancelSignal,
} from "./iGM_GameDownloadService";
import {
  iGM_DefaultFabricLoader,
  iGM_ListFabricLoaders,
  iGM_ResolveFabricLoaderVersion,
} from "./iGM_FabricService";
import {
  iGM_IsGameInstallStatus,
  iGM_IsGameVersionType,
  iGM_NormalizeGameLoader,
  iGM_ResolveVersionDir,
  iGM_ToGameInstallDto,
  iGM_ToMinecraftVersionDto,
  iGM_ToModLoaderDto,
  type iGM_GameFileStatus,
  type iGM_GameInstallDto,
  type iGM_GameInstallRow,
  type iGM_GameInstallStatus,
  type iGM_GameLoader,
  type iGM_GameProgressEvent,
  type iGM_MinecraftVersionDto,
  type iGM_MinecraftVersionListData,
  type iGM_ModLoaderDto,
} from "../iGM_Types/iGM_Game";
import type { iGM_UserRow } from "../iGM_Types/iGM_Auth";

// 类型定义 //
/** 任务运行态（内存注册表条目） */
interface iGM_TaskRuntime {
  taskId: string;
  userId: string;
  version: string;
  installDir: string;
  /** 模组加载器：none 原版 / fabric Fabric */
  loader: iGM_GameLoader;
  /** Fabric Loader 版本号；原版为 null */
  loaderVersion: string | null;
  canceled: iGM_CancelSignal;
  listeners: Set<(event: iGM_GameProgressEvent) => void>;
  /** 最近一次事件：供后订阅的客户端立即补齐状态 */
  lastEvent: iGM_GameProgressEvent | null;
  running: boolean;
}

/** 版本列表查询参数 */
export interface iGM_GameVersionQuery {
  type?: string;
  search?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

/** 文件校验结果 */
export interface iGM_GameVerifyResult {
  total: number;
  ok: number;
  missing: number;
}

// 核心逻辑 //
/** 任务运行态注册表：taskId → 运行态 */
const iGM_TaskRuntimes = new Map<string, iGM_TaskRuntime>();

/* ---------- 版本列表与详情 ---------- */

/** 解析版本类型筛选参数（逗号分隔，非法值忽略） */
function iGM_ParseVersionTypes(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => iGM_IsGameVersionType(item));
}

/** 版本分页列表（附带当前用户“是否已安装”标记） */
export function iGM_ListGameVersions(
  user: iGM_UserRow | null,
  query: iGM_GameVersionQuery,
): iGM_MinecraftVersionListData {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 12));
  const result = iGM_ListMinecraftVersions({
    types: iGM_ParseVersionTypes(query.type),
    search: query.search ?? null,
    sort: query.sort === "oldest" ? "oldest" : "newest",
    page,
    pageSize,
  });
  const installed = user ? iGM_ListInstalledVersions(user.iGM_Id) : new Set<string>();

  return {
    items: result.items.map((row) =>
      iGM_ToMinecraftVersionDto(row, installed.has(row.iGM_Version)),
    ),
    total: result.total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(result.total / pageSize)),
  };
}

/**
 * 版本详情；找不到抛 404
 * 说明：先按主键匹配，未命中再按版本号匹配，便于前端以可读的版本号作为地址参数
 */
export function iGM_GetGameVersion(
  user: iGM_UserRow | null,
  versionId: string,
): iGM_MinecraftVersionDto {
  const row =
    iGM_FindMinecraftVersionById(versionId) ??
    iGM_FindMinecraftVersionByVersion(versionId);
  if (!row) {
    throw new iGM_GameError("game.errors.versionNotFound", 404);
  }
  const installed = user
    ? iGM_ListInstalledVersions(user.iGM_Id).has(row.iGM_Version)
    : false;
  return iGM_ToMinecraftVersionDto(row, installed);
}

/* ---------- 任务进度分发 ---------- */

/** 向任务的全部订阅者分发事件，并记录最近事件 */
function iGM_Dispatch(runtime: iGM_TaskRuntime, event: iGM_GameProgressEvent): void {
  runtime.lastEvent = event;
  for (const listener of runtime.listeners) {
    try {
      listener(event);
    } catch {
      // 单个订阅者异常不影响其它订阅者
    }
  }
}

/** 订阅任务进度；返回取消订阅函数。订阅瞬间回放最近一次事件 */
export function iGM_SubscribeTask(
  taskId: string,
  listener: (event: iGM_GameProgressEvent) => void,
): () => void {
  const runtime = iGM_TaskRuntimes.get(taskId);
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

/* ---------- 安装任务 ---------- */

/** 任务进度落库（节流由引擎保证） */
function iGM_PersistProgress(
  taskId: string,
  event: iGM_GameProgressEvent,
): void {
  const now = new Date().toISOString();
  if (event.type === "progress") {
    iGM_UpdateGameInstallProgress(taskId, {
      status: "running",
      progress: event.percent,
      totalFiles: event.totalFiles,
      downloadedFiles: event.doneFiles,
      now,
    });
    return;
  }
  if (event.type === "start") {
    iGM_UpdateGameInstallProgress(taskId, {
      status: "running",
      totalFiles: event.totalFiles,
      downloadedFiles: 0,
      error: null,
      now,
    });
  }
}

/**
 * 创建并启动安装任务
 * 1. 校验版本已在本站版本库中；2. 解析加载器与 Loader 版本；
 * 3. 校验安装目录安全可写（在其下补全版本目录）；
 * 4. 落库任务与文件明细；5. 后台执行下载引擎并推送进度
 */
export async function iGM_StartGameInstall(
  user: iGM_UserRow,
  input: {
    version: string;
    /** 模组加载器：none 原版 / fabric Fabric；缺省原版 */
    loader?: string;
    /** Fabric Loader 版本号；缺省取最新稳定版 */
    loaderVersion?: string;
    installDir?: string;
  },
): Promise<iGM_GameInstallDto> {
  const version = (input.version ?? "").trim();
  if (!version) throw new iGM_GameError("game.errors.versionRequired", 400);

  const versionRow = iGM_FindMinecraftVersionByVersion(version);
  if (!versionRow) throw new iGM_GameError("game.errors.versionNotFound", 404);

  const loader = iGM_NormalizeGameLoader(input.loader ?? "none");
  let loaderVersion: string | null = null;
  if (loader === "fabric") {
    const loaders = await iGM_ListFabricLoaders();
    loaderVersion = iGM_ResolveFabricLoaderVersion(
      loaders,
      input.loaderVersion,
    );
  }

  const active = iGM_FindActiveGameInstall(user.iGM_Id, version, loader);
  if (active) throw new iGM_GameError("game.errors.alreadyInstalling", 409);

  const versionDir = iGM_ResolveVersionDir(version, loader);
  const installDir = await iGM_ValidateInstallDir(
    input.installDir?.trim() || iGM_Config.game.defaultInstallDir,
    versionDir,
  );

  const now = new Date().toISOString();
  const install = iGM_CreateGameInstall({
    userId: user.iGM_Id,
    version,
    installDir,
    loader,
    loaderVersion,
    now,
  });

  const runtime: iGM_TaskRuntime = {
    taskId: install.iGM_Id,
    userId: user.iGM_Id,
    version,
    installDir,
    loader,
    loaderVersion,
    canceled: { aborted: false },
    listeners: new Set(),
    lastEvent: null,
    running: true,
  };
  iGM_TaskRuntimes.set(install.iGM_Id, runtime);

  // 后台执行，不阻塞接口响应
  void iGM_RunTask(runtime);

  return iGM_ToGameInstallDto(install);
}

/**
 * 执行任务：调用下载引擎并把事件分发到订阅者与数据库
 * 说明：重复执行（修复）与首次执行路径一致——引擎按 SHA1 自动跳过已完整的文件，
 *       文件明细先清空再由引擎重新规划登记，保证记录与实际计划始终一致
 */
async function iGM_RunTask(runtime: iGM_TaskRuntime): Promise<void> {
  const { taskId } = runtime;
  try {
    iGM_DeleteGameFiles(taskId);

    await iGM_RunGameInstall({
      taskId,
      version: runtime.version,
      installDir: runtime.installDir,
      loader: runtime.loader,
      loaderVersion: runtime.loaderVersion,
      hooks: {
        signal: runtime.canceled,
        onEvent: (event) => {
          iGM_Dispatch(runtime, event);
          iGM_PersistProgress(taskId, event);
        },
        onPlan: (files) => {
          iGM_InsertGameFiles(taskId, files);
        },
        onFileStatus: (path, status) => {
          iGM_UpdateGameFileStatus(
            taskId,
            path,
            status as iGM_GameFileStatus,
            new Date().toISOString(),
          );
        },
      },
    });

    iGM_UpdateGameInstallProgress(taskId, {
      status: "completed",
      progress: 100,
      error: null,
      now: new Date().toISOString(),
    });
  } catch (error) {
    const canceled =
      runtime.canceled.aborted ||
      (error instanceof iGM_GameError && error.status === 499);
    const messageKey =
      error instanceof iGM_GameError
        ? error.message
        : "game.errors.installFailed";
    iGM_UpdateGameInstallProgress(taskId, {
      status: canceled ? "canceled" : "failed",
      error: canceled ? null : messageKey,
      now: new Date().toISOString(),
    });
    if (canceled) {
      iGM_Dispatch(runtime, { type: "canceled", taskId });
    } else {
      iGM_Dispatch(runtime, { type: "error", taskId, message: messageKey });
    }
  } finally {
    runtime.running = false;
    // 保留注册表条目一段时间，便于后进入的客户端读取最终状态
    setTimeout(() => {
      const entry = iGM_TaskRuntimes.get(taskId);
      if (entry && entry.listeners.size === 0) {
        iGM_TaskRuntimes.delete(taskId);
      }
    }, 10 * 60 * 1000);
  }
}

/** 查询安装任务（仅任务所有者可见） */
export function iGM_GetGameInstall(
  user: iGM_UserRow,
  taskId: string,
): iGM_GameInstallDto {
  const row = iGM_FindGameInstallById(taskId);
  if (!row || row.iGM_UserId !== user.iGM_Id) {
    throw new iGM_GameError("game.errors.taskNotFound", 404);
  }
  return iGM_ToGameInstallDto(row);
}

/* ---------- 残余文件清除 ---------- */

/** 轮询等待任务运行态结束（用于取消后清除前，避免引擎继续写入） */
async function iGM_WaitRuntimeStop(runtime: iGM_TaskRuntime | undefined): Promise<void> {
  if (!runtime?.running) return;
  const deadline = Date.now() + 15000;
  while (runtime.running && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/**
 * 清除某次安装已写入磁盘的内容：
 * 说明：多版本隔离后，每个版本（含加载器差异）拥有独立目录，
 *       直接整体移除该安装目录即可，不会影响其它已装版本；
 *       仅在安装目录确为绝对路径时执行删除，避免误删。
 * 返回该次任务登记的文件数量（供前端提示清理规模）。
 */
async function iGM_PurgeInstallFiles(row: iGM_GameInstallRow): Promise<number> {
  const files = iGM_ListGameFiles(row.iGM_Id);
  if (isAbsolute(row.iGM_InstallDir)) {
    await rm(row.iGM_InstallDir, { recursive: true, force: true }).catch(
      () => undefined,
    );
  }
  return files.length;
}

/**
 * 取消安装任务（仅运行中的任务可取消）
 * purge 为 true 时，等待运行态结束后一并清除已下载的残余文件并删除该任务记录
 */
export async function iGM_CancelGameInstall(
  user: iGM_UserRow,
  taskId: string,
  purge = false,
): Promise<iGM_GameInstallDto> {
  const row = iGM_FindGameInstallById(taskId);
  if (!row || row.iGM_UserId !== user.iGM_Id) {
    throw new iGM_GameError("game.errors.taskNotFound", 404);
  }
  const runtime = iGM_TaskRuntimes.get(taskId);
  if (runtime?.running) {
    runtime.canceled.aborted = true;
  } else if (!purge) {
    iGM_UpdateGameInstallProgress(taskId, {
      status: "canceled",
      now: new Date().toISOString(),
    });
  }

  if (!purge) {
    return iGM_GetGameInstall(user, taskId);
  }

  await iGM_WaitRuntimeStop(runtime);
  const dto = iGM_ToGameInstallDto(
    iGM_FindGameInstallById(taskId) ?? { ...row, iGM_Status: "canceled" },
  );
  await iGM_PurgeInstallFiles(row);
  iGM_DeleteGameFiles(taskId);
  iGM_DeleteGameInstall(taskId);
  return dto;
}

/**
 * 清除未完成任务（失败/已取消/未开始）的残余：删除已下载文件并移除该任务记录
 * 运行中的任务须先取消；已完成的任务请使用「移除版本」
 */
export async function iGM_RemoveGameTask(
  user: iGM_UserRow,
  taskId: string,
): Promise<{ removed: number }> {
  const row = iGM_FindGameInstallById(taskId);
  if (!row || row.iGM_UserId !== user.iGM_Id) {
    throw new iGM_GameError("game.errors.taskNotFound", 404);
  }
  if (iGM_TaskRuntimes.get(taskId)?.running) {
    throw new iGM_GameError("game.errors.taskRunning", 409);
  }
  if (row.iGM_Status === "completed") {
    throw new iGM_GameError("game.errors.taskCompleted", 409);
  }

  const removed = await iGM_PurgeInstallFiles(row);
  iGM_DeleteGameFiles(taskId);
  iGM_DeleteGameInstall(taskId);
  return { removed };
}

/* ---------- 已安装版本管理 ---------- */

/** 列出该用户已安装完成的版本 */
export function iGM_ListInstalledGameVersions(user: iGM_UserRow): iGM_GameInstallDto[] {
  return iGM_ListGameInstallsByUser(user.iGM_Id, ["completed"]).map(
    iGM_ToGameInstallDto,
  );
}

/** 解析状态筛选参数（逗号分隔，非法值忽略；空表示不过滤） */
function iGM_ParseInstallStatuses(raw: string | undefined): iGM_GameInstallStatus[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => iGM_IsGameInstallStatus(item));
}

/**
 * 列出该用户的安装任务（不限状态，或按 status 参数过滤）
 * 供「安装管理」页展示进行中/失败任务，便于查看进度与取消
 */
export function iGM_ListGameInstalls(
  user: iGM_UserRow,
  status?: string,
): iGM_GameInstallDto[] {
  return iGM_ListGameInstallsByUser(
    user.iGM_Id,
    iGM_ParseInstallStatuses(status),
  ).map(iGM_ToGameInstallDto);
}

/** 校验安装完整性：逐文件比对磁盘是否存在且 SHA1 一致 */
export async function iGM_VerifyGameInstall(
  user: iGM_UserRow,
  installId: string,
): Promise<iGM_GameVerifyResult> {
  const row = iGM_FindGameInstallById(installId);
  if (!row || row.iGM_UserId !== user.iGM_Id) {
    throw new iGM_GameError("game.errors.taskNotFound", 404);
  }
  const files = iGM_ListGameFiles(installId);
  let ok = 0;
  let missing = 0;
  for (const file of files) {
    if (!file.iGM_Sha1) {
      ok += 1;
      continue;
    }
    const absolute = join(row.iGM_InstallDir, ...file.iGM_Path.split("/"));
    try {
      const info = await stat(absolute);
      if (!info.isFile()) {
        missing += 1;
        continue;
      }
      const bytes = await readFile(absolute);
      const digest = createHash("sha1").update(bytes).digest("hex");
      if (digest === file.iGM_Sha1) {
        ok += 1;
      } else {
        missing += 1;
      }
    } catch {
      missing += 1;
    }
  }
  return { total: files.length, ok, missing };
}

/** 修复安装：复位错误状态后重新执行下载（已完整文件由引擎按 SHA1 自动跳过） */
export function iGM_RepairGameInstall(
  user: iGM_UserRow,
  installId: string,
): iGM_GameInstallDto {
  const row = iGM_FindGameInstallById(installId);
  if (!row || row.iGM_UserId !== user.iGM_Id) {
    throw new iGM_GameError("game.errors.taskNotFound", 404);
  }
  const existing = iGM_TaskRuntimes.get(installId);
  if (existing?.running) {
    throw new iGM_GameError("game.errors.taskRunning", 409);
  }

  const runtime: iGM_TaskRuntime = {
    taskId: installId,
    userId: row.iGM_UserId,
    version: row.iGM_Version,
    installDir: row.iGM_InstallDir,
    loader: iGM_NormalizeGameLoader(row.iGM_Loader),
    loaderVersion: row.iGM_LoaderVersion,
    canceled: { aborted: false },
    listeners: existing?.listeners ?? new Set(),
    lastEvent: null,
    running: true,
  };
  iGM_TaskRuntimes.set(installId, runtime);
  iGM_UpdateGameInstallProgress(installId, {
    status: "running",
    error: null,
    now: new Date().toISOString(),
  });

  void iGM_RunTask(runtime);
  return iGM_GetGameInstall(user, installId);
}

/**
 * 删除已安装版本：
 * 说明：多版本隔离后每个版本拥有独立目录，整体移除该版本目录即可；
 *       安全护栏：仅在安装目录确为绝对路径时执行删除，避免误删。
 */
export async function iGM_RemoveGameInstall(
  user: iGM_UserRow,
  installId: string,
): Promise<{ removed: boolean }> {
  const row = iGM_FindGameInstallById(installId);
  if (!row || row.iGM_UserId !== user.iGM_Id) {
    throw new iGM_GameError("game.errors.taskNotFound", 404);
  }
  const runtime = iGM_TaskRuntimes.get(installId);
  if (runtime?.running) {
    throw new iGM_GameError("game.errors.taskRunning", 409);
  }

  if (isAbsolute(row.iGM_InstallDir)) {
    await rm(row.iGM_InstallDir, { recursive: true, force: true }).catch(
      () => undefined,
    );
  }

  iGM_TaskRuntimes.delete(installId);
  iGM_DeleteGameInstall(installId);
  return { removed: true };
}

/* ---------- 模组加载器 ---------- */

/** 列出模组加载器字典（Forge / NeoForge 置灰由前端按 supported 处理） */
export function iGM_ListGameLoaders(): iGM_ModLoaderDto[] {
  return iGM_ListModLoaders().map(iGM_ToModLoaderDto);
}

/**
 * 列出可以安装的 Fabric Loader 版本（含默认稳定版）
 * 说明：游戏版本仅作展示提示，Fabric 元数据中 loader 与游戏版本相互兼容
 */
export async function iGM_ListFabricLoaderOptions(): Promise<{
  versions: string[];
  defaultVersion: string;
}> {
  const loaders = await iGM_ListFabricLoaders();
  return {
    versions: loaders.map((item) => item.version),
    defaultVersion: iGM_DefaultFabricLoader(loaders),
  };
}

// 导出 //
export { iGM_GameError };
export default {
  iGM_ListGameVersions,
  iGM_GetGameVersion,
  iGM_StartGameInstall,
  iGM_GetGameInstall,
  iGM_CancelGameInstall,
  iGM_SubscribeTask,
  iGM_ListInstalledGameVersions,
  iGM_VerifyGameInstall,
  iGM_RepairGameInstall,
  iGM_RemoveGameInstall,
  iGM_ListGameLoaders,
  iGM_ListFabricLoaderOptions,
};