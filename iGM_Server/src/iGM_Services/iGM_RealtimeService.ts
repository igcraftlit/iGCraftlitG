/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_RealtimeService.ts
 * 所属层：后端 / 业务逻辑层
 * 路由：G_Realtime（WebSocket），并被 iGM_NotificationService 调用做实时推送
 * 模块：iGM_RealtimeService
 * 作用：实时通信核心——WebSocket 连接注册表、在线用户列表广播、
 *       心跳保活与超时清扫、站内通知实时推送
 * 内容：连接登记/注销/心跳、按用户推送通知、广播在线列表（按用户去重）、
 *       每 60 秒清扫心跳超 120 秒的僵尸连接
 * 说明：本服务不依赖通知服务（依赖方向 iGM_NotificationService → 本服务），
 *       不构成循环依赖；连接句柄以最小接口存储，避免与 ElysiaWS 类型耦合
 */

// 导入依赖 //
import {
  iGM_DeleteOnlineUserByConnection,
  iGM_DeleteStaleOnlineUsers,
  iGM_InsertOnlineUser,
  iGM_ListOnlineUsers,
  iGM_TouchOnlineUser,
} from "../iGM_Repositories/iGM_OnlineUserRepository";
import { iGM_ResolveUserOrgBadge } from "../iGM_Repositories/iGM_OrgVerifyRepository";
import type { iGM_OrgBadgeDto } from "../iGM_Types/iGM_OrgVerify";
import type { iGM_NotificationDto } from "../iGM_Types/iGM_Notification";
import type { iGM_MessageDto } from "../iGM_Types/iGM_Message";

// 类型定义 //
/** 在线用户公开信息 DTO：仅头像、用户名、昵称、认证标识 */
export interface iGM_OnlineUserDto {
  userId: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  verifiedOrg: iGM_OrgBadgeDto | null;
  connectedAt: string;
}

/** WebSocket 连接的最小接口（与具体框架解耦） */
export interface iGM_WsHandle {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

/** 连接注册表条目 */
interface iGM_ConnectionEntry {
  userId: string;
  handle: iGM_WsHandle;
}

/** 模块十：私信相关实时事件 */
export type iGM_MessageRealtimeEvent =
  | {
      type: "message";
      conversationId: string;
      message: iGM_MessageDto;
    }
  | {
      type: "messageRecall";
      conversationId: string;
      messageId: string;
    }
  | {
      type: "messageRead";
      conversationId: string;
      readerId: string;
    };

/** 服务端下行消息 */
export type iGM_ServerMessage =
  | { type: "welcome"; connectionId: string }
  | { type: "onlineList"; count: number; users: iGM_OnlineUserDto[] }
  | { type: "notification"; notification: iGM_NotificationDto }
  | iGM_MessageRealtimeEvent
  | { type: "pong" };

// 核心逻辑 //
/** 活跃连接注册表：connectionId → 连接条目 */
const iGM_Connections = new Map<string, iGM_ConnectionEntry>();

/** 心跳超时阈值：120 秒（客户端每 30 秒 ping 一次，允许丢失 3 次） */
const iGM_HeartbeatTimeoutMs = 120 * 1000;
/** 清扫周期：60 秒 */
const iGM_SweepIntervalMs = 60 * 1000;

/** 向单个连接发送 JSON 消息（发送失败即视为死连接，静默移除） */
function iGM_SendTo(connectionId: string, message: iGM_ServerMessage): void {
  const entry = iGM_Connections.get(connectionId);
  if (!entry) return;
  try {
    entry.handle.send(JSON.stringify(message));
  } catch {
    iGM_Connections.delete(connectionId);
    iGM_DeleteOnlineUserByConnection(connectionId);
  }
}

/** 构建在线用户公开列表（按用户去重，附带认证组织徽标） */
export function iGM_BuildOnlineList(): iGM_OnlineUserDto[] {
  return iGM_ListOnlineUsers().map((row) => ({
    userId: row.iGM_UserId,
    username: row.iGM_Username,
    displayName: row.iGM_DisplayName,
    avatar: row.iGM_Avatar,
    verifiedOrg: iGM_ResolveUserOrgBadge(row.iGM_VerifiedOrgId, row.iGM_Email),
    connectedAt: row.iGM_ConnectedAt,
  }));
}

/** 向全部连接广播最新在线用户列表 */
export function iGM_BroadcastOnlineList(): void {
  const users = iGM_BuildOnlineList();
  const message: iGM_ServerMessage = {
    type: "onlineList",
    count: users.length,
    users,
  };
  for (const connectionId of iGM_Connections.keys()) {
    iGM_SendTo(connectionId, message);
  }
}

/** 登记新连接：落库 + 内存注册 + 广播在线列表 + 下行欢迎帧 */
export function iGM_RegisterConnection(input: {
  userId: string;
  connectionId: string;
  handle: iGM_WsHandle;
  ipAddress: string | null;
  userAgent: string | null;
}): void {
  const now = new Date().toISOString();
  iGM_InsertOnlineUser({
    userId: input.userId,
    connectionId: input.connectionId,
    now,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });
  iGM_Connections.set(input.connectionId, {
    userId: input.userId,
    handle: input.handle,
  });
  iGM_SendTo(input.connectionId, {
    type: "welcome",
    connectionId: input.connectionId,
  });
  iGM_BroadcastOnlineList();
}

/** 注销连接：移除内存注册与数据库记录，并广播在线列表 */
export function iGM_UnregisterConnection(connectionId: string): void {
  const removed = iGM_Connections.delete(connectionId);
  const deleted = iGM_DeleteOnlineUserByConnection(connectionId);
  if (removed || deleted) {
    iGM_BroadcastOnlineList();
  }
}

/** 处理客户端心跳：更新最后心跳时间并回 pong */
export function iGM_Heartbeat(connectionId: string): void {
  if (!iGM_Connections.has(connectionId)) return;
  iGM_TouchOnlineUser(connectionId, new Date().toISOString());
  iGM_SendTo(connectionId, { type: "pong" });
}

/**
 * 向指定用户的全部在线连接推送实时通知
 * 由 iGM_NotificationService 在站内通知写库成功后调用（fire-and-forget）
 */
export function iGM_PushNotificationToUser(
  userId: string,
  notification: iGM_NotificationDto,
): void {
  const message: iGM_ServerMessage = { type: "notification", notification };
  for (const [connectionId, entry] of iGM_Connections) {
    if (entry.userId === userId) {
      iGM_SendTo(connectionId, message);
    }
  }
}

/* ---------- 模块十：私信实时推送 ---------- */

/** 向指定用户的全部在线连接推送私信实时事件（新消息/撤回/已读） */
export function iGM_PushMessageEventToUser(
  userId: string,
  event: iGM_MessageRealtimeEvent,
): void {
  for (const [connectionId, entry] of iGM_Connections) {
    if (entry.userId === userId) {
      iGM_SendTo(connectionId, event);
    }
  }
}

/** 判断用户当前是否有活跃 WebSocket 连接（私信离线通知判断使用） */
export function iGM_IsUserOnline(userId: string): boolean {
  for (const entry of iGM_Connections.values()) {
    if (entry.userId === userId) return true;
  }
  return false;
}

/** 清扫心跳超时的僵尸连接：先关闭连接（触发 close 注销），再兜底删行 */
function iGM_SweepStaleConnections(): void {
  const cutoff = new Date(Date.now() - iGM_HeartbeatTimeoutMs).toISOString();
  const staleIds = iGM_DeleteStaleOnlineUsers(cutoff);
  if (staleIds.length === 0) return;
  for (const connectionId of staleIds) {
    const entry = iGM_Connections.get(connectionId);
    iGM_Connections.delete(connectionId);
    try {
      entry?.handle.close(4000, "heartbeat timeout");
    } catch {
      // 连接可能已被对端关闭，忽略
    }
  }
  console.log(`[iGM_Realtime] 清扫心跳超时连接 ${staleIds.length} 条`);
  iGM_BroadcastOnlineList();
}

// 启动周期清扫计时器（unref 避免阻塞进程退出）
const iGM_SweepTimer = setInterval(iGM_SweepStaleConnections, iGM_SweepIntervalMs);
if (typeof iGM_SweepTimer === "object" && "unref" in iGM_SweepTimer) {
  (iGM_SweepTimer as { unref: () => void }).unref();
}

// 导出 //
export default {
  iGM_BuildOnlineList,
  iGM_BroadcastOnlineList,
  iGM_RegisterConnection,
  iGM_UnregisterConnection,
  iGM_Heartbeat,
  iGM_PushNotificationToUser,
  iGM_PushMessageEventToUser,
  iGM_IsUserOnline,
};
