/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_ThirdParty.ts
 * 所属层：后端 / 路由层
 * 路由：/G_ThirdParty/*
 * 模块：G_ThirdParty
 * 作用：模块二十第三方资源（Modrinth，仅 Fabric 兼容）搜索、详情与下载任务接口集合
 * 内容：资源搜索、资源详情（含 Fabric 兼容版本）、创建下载任务、任务查询与列表、
 *       暂停/继续、取消（可一并清除残余分片）、重试、删除任务、清空已完成、
 *       任务进度 WebSocket 实时推送
 * 约束：统一响应 { success, code, message, data }；
 *       浏览类接口允许匿名（按 IP 限流），下载类接口必须登录并按用户限流；
 *       资源文件不落本站服务器存储，下载直链来自 Modrinth
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
  iGM_ClientIp,
  iGM_CurrentUser,
  iGM_EnforceRateLimit,
  iGM_Field,
  iGM_Query,
  type iGM_RouteContext,
} from "./iGM_RouteSupport";
import {
  iGM_CancelThirdPartyDownload,
  iGM_ClearCompletedThirdPartyDownloads,
  iGM_DeleteThirdPartyDownload,
  iGM_GetThirdPartyDownload,
  iGM_GetThirdPartyResource,
  iGM_ListThirdPartyDownloads,
  iGM_PauseThirdPartyDownload,
  iGM_RetryThirdPartyDownload,
  iGM_SearchThirdPartyResources,
  iGM_StartThirdPartyDownload,
  iGM_SubscribeThirdPartyTask,
} from "../iGM_Services/iGM_ThirdPartyService";
import type {
  iGM_DownloadEvent,
  iGM_DownloadTaskDto,
} from "../iGM_Types/iGM_ThirdParty";
import type { iGM_UserRow } from "../iGM_Types/iGM_Auth";

// 类型定义 //
/** 带路径参数的上下文（Elysia 在动态路由下注入 params） */
type iGM_ThirdPartyContext = iGM_RouteContext & {
  params?: Record<string, string>;
};

/** WebSocket 下行消息：快照、进度事件与心跳回执 */
export type iGM_ThirdPartyWsMessage =
  | { type: "snapshot"; task: iGM_DownloadTaskDto }
  | { type: "event"; event: iGM_DownloadEvent }
  | { type: "pong" };

/** WS 握手期挂到上下文的数据 */
interface iGM_ThirdPartyWsExtra {
  iGM_WsUser?: iGM_UserRow;
  iGM_WsTaskId?: string;
  iGM_WsUnsubscribe?: () => void;
}

// 核心逻辑 //
/** 读取路径参数 */
function iGM_Param(ctx: iGM_ThirdPartyContext, key: string): string {
  return ctx.params?.[key] ?? "";
}

/* ---------- 资源搜索与详情（允许匿名，按 IP 限流） ---------- */

async function iGM_HandleSearch(ctx: iGM_RouteContext) {
  iGM_EnforceRateLimit(ctx, "thirdPartySearch", `ip:${iGM_ClientIp(ctx)}`);
  return iGM_Ok(
    await iGM_SearchThirdPartyResources({
      q: iGM_Query(ctx.query, "q"),
      type: iGM_Query(ctx.query, "type"),
      page: Number(iGM_Query(ctx.query, "page", "1")),
      pageSize: Number(iGM_Query(ctx.query, "pageSize", "20")),
    }),
  );
}

async function iGM_HandleResourceDetail(ctx: iGM_RouteContext) {
  iGM_EnforceRateLimit(ctx, "thirdPartySearch", `ip:${iGM_ClientIp(ctx)}`);
  const resourceId = iGM_Param(ctx as iGM_ThirdPartyContext, "id");
  const refresh = iGM_Query(ctx.query, "refresh") === "true";
  return iGM_Ok(
    await iGM_GetThirdPartyResource(decodeURIComponent(resourceId), { refresh }),
  );
}

/* ---------- 下载任务 ---------- */

async function iGM_HandleStartDownload(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "thirdPartyDownload", `user:${user.iGM_Id}`);
  const task = await iGM_StartThirdPartyDownload(user, {
    resourceId: iGM_Field(ctx.body, "resourceId"),
    versionId: iGM_Field(ctx.body, "versionId"),
    target: iGM_Field(ctx.body, "target") || undefined,
  });
  ctx.set.status = 201;
  return iGM_Ok(
    {
      task,
      taskId: task.id,
      downloadUrl: task.downloadUrl,
      filename: task.filename,
      size: task.size,
      sha1: task.sha1,
    },
    "thirdParty.messages.started",
  );
}

async function iGM_HandleDownloadStatus(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  const taskId = iGM_Param(ctx as iGM_ThirdPartyContext, "taskId");
  return iGM_Ok({ task: await iGM_GetThirdPartyDownload(user, taskId) });
}

async function iGM_HandleDownloadList(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  return iGM_Ok({
    items: await iGM_ListThirdPartyDownloads(
      user,
      iGM_Query(ctx.query, "status") || undefined,
    ),
  });
}

async function iGM_HandlePause(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "thirdPartyTask", `user:${user.iGM_Id}`);
  const taskId = iGM_Param(ctx as iGM_ThirdPartyContext, "taskId");
  return iGM_Ok({
    task: await iGM_PauseThirdPartyDownload(
      user,
      taskId,
      iGM_BoolField(ctx.body, "paused"),
    ),
  });
}

async function iGM_HandleCancel(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "thirdPartyTask", `user:${user.iGM_Id}`);
  const taskId = iGM_Param(ctx as iGM_ThirdPartyContext, "taskId");
  const purge = iGM_BoolField(ctx.body, "purge");
  return iGM_Ok({
    task: await iGM_CancelThirdPartyDownload(user, taskId, purge),
  });
}

async function iGM_HandleRetry(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "thirdPartyTask", `user:${user.iGM_Id}`);
  const taskId = iGM_Param(ctx as iGM_ThirdPartyContext, "taskId");
  return iGM_Ok({ task: await iGM_RetryThirdPartyDownload(user, taskId) });
}

async function iGM_HandleRemove(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "thirdPartyTask", `user:${user.iGM_Id}`);
  const taskId = iGM_Param(ctx as iGM_ThirdPartyContext, "taskId");
  return iGM_Ok(await iGM_DeleteThirdPartyDownload(user, taskId));
}

async function iGM_HandleClearCompleted(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "thirdPartyTask", `user:${user.iGM_Id}`);
  return iGM_Ok(await iGM_ClearCompletedThirdPartyDownloads(user));
}

/* ---------- WebSocket 进度推送 ---------- */

/**
 * 握手守卫：Origin 白名单 + 连接限流 + 会话鉴权 + 任务归属校验
 * 校验失败即拒绝 upgrade，客户端收到对应 HTTP 错误
 */
async function iGM_ThirdPartyWsBeforeHandle(context: {
  request: Request;
  server: iGM_NetworkServer | null;
  set: { status: number; headers: Record<string, string> };
  params?: Record<string, string>;
}): Promise<void> {
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
  const user = await iGM_ResolveRequestUser(context.request);
  if (!user) throw new iGM_AuthError("auth.errors.unauthorized", 401);

  const taskId = context.params?.taskId ?? "";
  // 任务归属校验：非本人任务直接拒绝
  await iGM_GetThirdPartyDownload(user, taskId);

  const extra = context as unknown as iGM_ThirdPartyWsExtra;
  extra.iGM_WsUser = user;
  extra.iGM_WsTaskId = taskId;
}

/** G_ThirdParty 第三方资源路由集合 */
export const G_ThirdParty = new Elysia({ name: "G_ThirdParty" })
  .get("/G_ThirdParty/search", iGM_HandleSearch as never)
  .get("/G_ThirdParty/resource/:id", iGM_HandleResourceDetail as never)
  .post("/G_ThirdParty/download", iGM_HandleStartDownload as never)
  .get("/G_ThirdParty/downloads", iGM_HandleDownloadList as never)
  .delete("/G_ThirdParty/downloads/completed", iGM_HandleClearCompleted as never)
  .get("/G_ThirdParty/download/:taskId", iGM_HandleDownloadStatus as never)
  .post("/G_ThirdParty/download/:taskId/pause", iGM_HandlePause as never)
  .post("/G_ThirdParty/download/:taskId/cancel", iGM_HandleCancel as never)
  .post("/G_ThirdParty/download/:taskId/retry", iGM_HandleRetry as never)
  .delete("/G_ThirdParty/download/:taskId", iGM_HandleRemove as never)
  .ws("/G_ThirdParty/download/:taskId/ws", {
    beforeHandle: iGM_ThirdPartyWsBeforeHandle as never,

    // 连接建立：下发当前任务快照并订阅后续进度事件
    async open(ws) {
      const data = ws.data as unknown as iGM_ThirdPartyWsExtra & {
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
          task: await iGM_GetThirdPartyDownload(user, taskId),
        }),
      );
      data.iGM_WsUnsubscribe = iGM_SubscribeThirdPartyTask(taskId, (event) => {
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
      const data = ws.data as unknown as iGM_ThirdPartyWsExtra;
      data.iGM_WsUnsubscribe?.();
    },
  });

// 导出 //
export default G_ThirdParty;