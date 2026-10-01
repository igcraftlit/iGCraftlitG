/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_Game.ts
 * 所属层：后端 / 路由层
 * 路由：/G_Game/*
 * 模块：G_Game
 * 作用：Minecraft 游戏本体一键下载接口集合
 * 内容：可下载版本列表、创建安装任务、任务列表与进度查询、WebSocket 实时进度、
 *       取消任务（可一并清除残余）、清除未完成任务残余、已安装版本管理
 *       （列表/校验/修复/删除）、原生文件夹选择器
 * 约束：统一响应 { success, code, message, data }；
 *       所有写操作要求登录并做基础限流；进度推送按 taskId 订阅
 */

// 导入依赖 //
import { Elysia } from "elysia";
import { iGM_Config } from "../iGM_Config/iGM_Config";
import { iGM_Ok } from "../iGM_Types/iGM_Response";
import { iGM_AuthError } from "../iGM_Services/iGM_AuthService";
import { iGM_CheckRateLimit } from "../iGM_Services/iGM_RateLimitService";
import {
  iGM_GetClientIp,
  iGM_RequireUser,
  iGM_ResolveRequestUser,
  type iGM_NetworkServer,
} from "../iGM_Middleware/iGM_AuthGuard";
import {
  iGM_BoolField,
  iGM_CurrentUser,
  iGM_EnforceRateLimit,
  iGM_Field,
  iGM_Query,
  type iGM_RouteContext,
} from "./iGM_RouteSupport";
import { iGM_PickFolder } from "../iGM_Services/iGM_FolderPickerService";
import {
  iGM_CancelGameInstall,
  iGM_GetGameInstall,
  iGM_GetGameVersion,
  iGM_ListFabricLoaderOptions,
  iGM_ListGameInstalls,
  iGM_ListGameLoaders,
  iGM_ListGameVersions,
  iGM_ListInstalledGameVersions,
  iGM_RemoveGameInstall,
  iGM_RemoveGameTask,
  iGM_RepairGameInstall,
  iGM_StartGameInstall,
  iGM_SubscribeTask,
  iGM_VerifyGameInstall,
} from "../iGM_Services/iGM_GameService";
import type { iGM_GameInstallDto, iGM_GameProgressEvent } from "../iGM_Types/iGM_Game";
import type { iGM_UserRow } from "../iGM_Types/iGM_Auth";

// 类型定义 //
/** 带路径参数的上下文（Elysia 在动态路由下注入 params） */
type iGM_GameContext = iGM_RouteContext & {
  params?: Record<string, string>;
};

/** WebSocket 下行消息：快照、进度事件与心跳回执 */
export type iGM_GameWsMessage =
  | { type: "snapshot"; install: iGM_GameInstallDto }
  | { type: "event"; event: iGM_GameProgressEvent }
  | { type: "pong" };

/** WS 握手期挂到上下文的数据 */
interface iGM_GameWsExtra {
  iGM_WsUser?: iGM_UserRow;
  iGM_WsTaskId?: string;
  iGM_WsUnsubscribe?: () => void;
}

// 核心逻辑 //
/** 读取路径参数 */
function iGM_Param(ctx: iGM_GameContext, key: string): string {
  return ctx.params?.[key] ?? "";
}

/** 解析分页与筛选参数 */
function iGM_ReadVersionQuery(ctx: iGM_RouteContext) {
  return {
    type: iGM_Query(ctx.query, "type") || undefined,
    search: iGM_Query(ctx.query, "search") || undefined,
    sort: iGM_Query(ctx.query, "sort") || undefined,
    page: Number(iGM_Query(ctx.query, "page", "1")),
    pageSize: Number(iGM_Query(ctx.query, "pageSize", "12")),
  };
}

/* ---------- 版本列表 ---------- */
function iGM_HandleVersions(ctx: iGM_RouteContext) {
  return iGM_Ok(iGM_ListGameVersions(iGM_CurrentUser(ctx), iGM_ReadVersionQuery(ctx)));
}

/* ---------- 版本详情 ---------- */
function iGM_HandleVersionDetail(ctx: iGM_RouteContext) {
  const versionId = iGM_Query(ctx.query, "versionId");
  return iGM_Ok({
    version: iGM_GetGameVersion(iGM_CurrentUser(ctx), versionId),
  });
}

/* ---------- 模组加载器列表 ---------- */
function iGM_HandleLoaders() {
  return iGM_Ok({ items: iGM_ListGameLoaders() });
}

/* ---------- Fabric Loader 版本列表 ---------- */
async function iGM_HandleFabricLoaders() {
  return iGM_Ok(await iGM_ListFabricLoaderOptions());
}

/* ---------- 创建安装任务 ---------- */
async function iGM_HandleInstall(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "gameInstall", `user:${user.iGM_Id}`);
  const install = await iGM_StartGameInstall(user, {
    version: iGM_Field(ctx.body, "version"),
    loader: iGM_Field(ctx.body, "loader") || undefined,
    loaderVersion: iGM_Field(ctx.body, "loaderVersion") || undefined,
    installDir: iGM_Field(ctx.body, "installDir") || undefined,
  });
  ctx.set.status = 201;
  return iGM_Ok({ install }, "game.messages.started");
}

/* ---------- 查询任务进度 ---------- */
function iGM_HandleInstallStatus(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  const taskId = iGM_Param(ctx as iGM_GameContext, "taskId");
  return iGM_Ok({ install: iGM_GetGameInstall(user, taskId) });
}

/* ---------- 取消任务（可选一并清除已下载的残余文件） ---------- */
async function iGM_HandleCancel(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "gameWrite", `user:${user.iGM_Id}`);
  const taskId = iGM_Param(ctx as iGM_GameContext, "taskId");
  const purge = iGM_BoolField(ctx.body, "purge");
  return iGM_Ok(
    { install: await iGM_CancelGameInstall(user, taskId, purge) },
    purge ? "game.messages.canceledAndPurged" : "game.messages.canceled",
  );
}

/* ---------- 清除未完成任务的残余文件 ---------- */
async function iGM_HandlePurgeTask(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "gameWrite", `user:${user.iGM_Id}`);
  const taskId = iGM_Param(ctx as iGM_GameContext, "taskId");
  return iGM_Ok(
    await iGM_RemoveGameTask(user, taskId),
    "game.messages.purged",
  );
}

/* ---------- 安装任务列表（进行中/失败/已取消） ---------- */
function iGM_HandleInstalls(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  return iGM_Ok({
    items: iGM_ListGameInstalls(user, iGM_Query(ctx.query, "status") || undefined),
  });
}

/* ---------- 已安装版本列表 ---------- */
function iGM_HandleInstalled(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  return iGM_Ok({ items: iGM_ListInstalledGameVersions(user) });
}

/* ---------- 校验安装完整性 ---------- */
async function iGM_HandleVerify(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "gameWrite", `user:${user.iGM_Id}`);
  const installId = iGM_Param(ctx as iGM_GameContext, "installId");
  return iGM_Ok({ result: await iGM_VerifyGameInstall(user, installId) });
}

/* ---------- 修复安装 ---------- */
function iGM_HandleRepair(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "gameWrite", `user:${user.iGM_Id}`);
  const installId = iGM_Param(ctx as iGM_GameContext, "installId");
  return iGM_Ok(
    { install: iGM_RepairGameInstall(user, installId) },
    "game.messages.repairing",
  );
}

/* ---------- 删除已安装版本 ---------- */
async function iGM_HandleRemove(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "gameWrite", `user:${user.iGM_Id}`);
  const installId = iGM_Param(ctx as iGM_GameContext, "installId");
  return iGM_Ok(
    await iGM_RemoveGameInstall(user, installId),
    "game.messages.removed",
  );
}

/* ---------- 原生文件夹选择器 ---------- */
async function iGM_HandlePickFolder(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "gameFolderPick", `user:${user.iGM_Id}`);
  return iGM_Ok({ path: await iGM_PickFolder() });
}

/* ---------- WebSocket 进度推送 ---------- */

/**
 * 握手守卫：Origin 白名单 + 连接限流 + 会话鉴权 + 任务归属校验
 * 校验失败即拒绝 upgrade，客户端收到对应 HTTP 错误
 */
function iGM_GameWsBeforeHandle(context: {
  request: Request;
  server: iGM_NetworkServer | null;
  set: { status: number; headers: Record<string, string> };
  params?: Record<string, string>;
}): void {
  const origin = context.request.headers.get("Origin") ?? "";
  if (!iGM_Config.corsOrigins.includes(origin)) {
    throw new iGM_AuthError("auth.errors.forbidden", 403);
  }
  const ip = iGM_GetClientIp(context.request, context.server);
  const rule = iGM_Config.rateLimits.wsConnect;
  const limit = iGM_CheckRateLimit("wsConnect", `ip:${ip}`, rule.windowMs, rule.max);
  if (!limit.allowed) {
    context.set.headers["Retry-After"] = String(limit.retryAfterSeconds);
    throw new iGM_AuthError("auth.errors.tooManyRequests", 429);
  }
  const user = iGM_ResolveRequestUser(context.request);
  if (!user) throw new iGM_AuthError("auth.errors.unauthorized", 401);

  const taskId = context.params?.taskId ?? "";
  // 任务归属校验：非本人任务直接拒绝
  iGM_GetGameInstall(user, taskId);

  const extra = context as unknown as iGM_GameWsExtra;
  extra.iGM_WsUser = user;
  extra.iGM_WsTaskId = taskId;
}

/** G_Game 游戏本体下载路由集合 */
export const G_Game = new Elysia({ name: "G_Game" })
  .get("/G_Game/versions", iGM_HandleVersions as never)
  .get("/G_Game/version", iGM_HandleVersionDetail as never)
  .get("/G_Game/loaders", iGM_HandleLoaders as never)
  .get("/G_Game/fabric/versions", iGM_HandleFabricLoaders as never)
  .post("/G_Game/install", iGM_HandleInstall as never)
  .get("/G_Game/install/:taskId", iGM_HandleInstallStatus as never)
  .post("/G_Game/install/:taskId/cancel", iGM_HandleCancel as never)
  .delete("/G_Game/install/:taskId", iGM_HandlePurgeTask as never)
  .get("/G_Game/installs", iGM_HandleInstalls as never)
  .get("/G_Game/installed", iGM_HandleInstalled as never)
  .post("/G_Game/installed/:installId/verify", iGM_HandleVerify as never)
  .post("/G_Game/installed/:installId/repair", iGM_HandleRepair as never)
  .delete("/G_Game/installed/:installId", iGM_HandleRemove as never)
  .post("/G_Game/pick-folder", iGM_HandlePickFolder as never)
  .ws("/G_Game/install/:taskId/ws", {
    beforeHandle: iGM_GameWsBeforeHandle as never,

    // 连接建立：下发当前任务快照并订阅后续进度事件
    open(ws) {
      const data = ws.data as unknown as iGM_GameWsExtra & {
        params?: Record<string, string>;
      };
      const user = data.iGM_WsUser;
      const taskId = data.iGM_WsTaskId ?? data.params?.taskId ?? "";
      if (!user || !taskId) {
        ws.close(4401, "unauthorized");
        return;
      }
      // 快照：让进入页面的客户端立即看到当前状态
      ws.send(
        JSON.stringify({
          type: "snapshot",
          install: iGM_GetGameInstall(user, taskId),
        }),
      );
      data.iGM_WsUnsubscribe = iGM_SubscribeTask(taskId, (event) => {
        ws.send(JSON.stringify({ type: "event", event }));
      });
    },

    // 客户端消息：仅识别 ping 心跳
    message(ws, raw) {
      const message = raw as { type?: string };
      if (message && message.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
      }
    },

    // 连接关闭：取消订阅，避免内存泄漏
    close(ws) {
      const data = ws.data as unknown as iGM_GameWsExtra;
      data.iGM_WsUnsubscribe?.();
    },
  });

// 导出 //
export default G_Game;