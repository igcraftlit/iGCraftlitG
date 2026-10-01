/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_Realtime.ts
 * 所属层：后端 / 路由层
 * 路由：WebSocket /G_Realtime/ws
 * 模块：G_Realtime
 * 作用：实时通信 WebSocket 端点（Bun + Elysia 原生 WebSocket）
 * 内容：连接鉴权（HttpOnly 会话 Cookie）与 Origin 白名单校验、
 *       连接登记与在线列表广播、ping/pong 心跳保活、断开注销
 * 约束：仅登录用户可连接；握手 Origin 必须在 CORS 白名单内；
 *       心跳超时由 iGM_RealtimeService 周期清扫
 */

// 导入依赖 //
import { Elysia } from "elysia";
import { iGM_Config } from "../iGM_Config/iGM_Config";
import { iGM_AuthError } from "../iGM_Services/iGM_AuthService";
import { iGM_CheckRateLimit } from "../iGM_Services/iGM_RateLimitService";
import { iGM_RandomUuid } from "../iGM_Services/iGM_SecurityService";
import {
  iGM_GetClientIp,
  iGM_ResolveRequestUser,
  type iGM_NetworkServer,
} from "../iGM_Middleware/iGM_AuthGuard";
import {
  iGM_Heartbeat,
  iGM_RegisterConnection,
  iGM_UnregisterConnection,
} from "../iGM_Services/iGM_RealtimeService";
import type { iGM_UserRow } from "../iGM_Types/iGM_Auth";

// 类型定义 //
/** ws beforeHandle 中挂到上下文、供 open 读取的鉴权结果 */
interface iGM_WsContextExtra {
  iGM_WsUser?: iGM_UserRow;
  iGM_WsConnectionId?: string;
  /** 握手期解析的客户端 IP（与限流同口径） */
  iGM_WsIp?: string;
}

/** 客户端上行消息 */
interface iGM_ClientMessage {
  type?: string;
}

// 核心逻辑 //
/**
 * 握手前置守卫（异步：会话解析已迁移为异步数据层）：
 * 1. Origin 必须存在于 CORS 白名单（浏览器 WebSocket 握手必带 Origin）；
 * 2. 连接限流（按客户端 IP，iGM_CheckRateLimit 仍为同步函数，不加 await）；
 * 3. Cookie 会话鉴权，通过则把用户与连接 ID 挂到上下文供 open 使用。
 * 抛出错误时 Elysia 不执行 upgrade，客户端收到对应 HTTP 错误。
 */
async function iGM_WsBeforeHandle(context: {
  request: Request;
  server: iGM_NetworkServer | null;
  set: { status: number; headers: Record<string, string> };
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
  if (!user) {
    throw new iGM_AuthError("auth.errors.unauthorized", 401);
  }

  const extra = context as unknown as iGM_WsContextExtra;
  extra.iGM_WsUser = user;
  extra.iGM_WsConnectionId = iGM_RandomUuid();
  extra.iGM_WsIp = ip;
}

/** G_Realtime 实时通信路由集合 */
export const G_Realtime = new Elysia({ name: "G_Realtime" }).ws(
  "/G_Realtime/ws",
  {
    // 握手鉴权与限流（失败即拒绝 upgrade）
    beforeHandle: iGM_WsBeforeHandle as never,

    // 连接建立：登记在线状态并广播在线列表
    async open(ws) {
      const data = ws.data as unknown as iGM_WsContextExtra & {
        request: Request;
      };
      const user = data.iGM_WsUser;
      const connectionId = data.iGM_WsConnectionId;
      if (!user || !connectionId) {
        ws.close(4401, "unauthorized");
        return;
      }
      await iGM_RegisterConnection({
        userId: user.iGM_Id,
        connectionId,
        handle: ws,
        ipAddress: data.iGM_WsIp ?? null,
        userAgent: data.request.headers.get("User-Agent"),
      });
    },

    // 客户端消息：仅识别 ping 心跳，其余忽略
    async message(ws, raw) {
      const data = ws.data as unknown as iGM_WsContextExtra;
      const connectionId = data.iGM_WsConnectionId;
      if (!connectionId) return;
      const message = raw as iGM_ClientMessage;
      if (message && message.type === "ping") {
        await iGM_Heartbeat(connectionId);
      }
    },

    // 连接关闭：注销在线状态并广播
    async close(ws) {
      const data = ws.data as unknown as iGM_WsContextExtra;
      if (data.iGM_WsConnectionId) {
        await iGM_UnregisterConnection(data.iGM_WsConnectionId);
      }
    },
  },
);

// 导出 //
export default G_Realtime;
