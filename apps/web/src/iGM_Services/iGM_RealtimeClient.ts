/**
 * 文件路径：apps/web/src/iGM_Services/iGM_RealtimeClient.ts
 * 所属层：前端 / 基础服务层
 * 路由：全局（G_Realtime 页与 WebSocketProvider 使用）
 * 模块：iGM_RealtimeClient
 * 作用：WebSocket 基础地址解析与消息类型定义
 * 内容：根据当前域名推导 ws/wss 地址、上行/下行消息类型
 * 说明：复刻 iGM_GetApiBase 模式，HTTP → WS 自动转换
 */

// 导入依赖 //
import { iGM_GetApiBase } from "./iGM_Config";

// 类型定义 //
/** 模块十：私信消息推送体 */
export interface iGM_WsDirectMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: "text";
  isRead: boolean;
  isRecalled: boolean;
  createdAt: string;
}

/** 模块十：私信实时事件（新消息 / 撤回 / 对端已读） */
export type iGM_WsMessageEvent =
  | {
      type: "message";
      conversationId: string;
      message: iGM_WsDirectMessage;
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

/** 服务端下行消息类型 */
export type iGM_WsMessage =
  | { type: "welcome"; connectionId: string }
  | { type: "onlineList"; count: number; users: iGM_WsOnlineUser[] }
  | { type: "notification"; notification: iGM_WsNotification }
  | iGM_WsMessageEvent
  | { type: "pong" };

/** 客户端上行消息 */
export interface iGM_WsClientMessage {
  type: "ping";
}

/** 在线用户公开信息（由服务端广播） */
export interface iGM_WsOnlineUser {
  userId: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  /** 认证组织徽标（未认证为 null） */
  verifiedOrg: { id: string; name: string; slug: string; isOwner?: boolean } | null;
  connectedAt: string;
}

/** 实时通知精简信息（由服务端推送） */
export interface iGM_WsNotification {
  id: string;
  type: string;
  title: string;
  content: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

// 核心逻辑 //
/** 从 API 基础地址推导 WebSocket 地址（http→ws，https→wss） */
export function iGM_GetWsBase(): string {
  const explicit = process.env.NEXT_PUBLIC_IGM_WS_BASE?.replace(/\/$/, "");
  if (explicit) return explicit;

  const apiBase = iGM_GetApiBase();
  if (apiBase.startsWith("https://")) {
    return apiBase.replace("https://", "wss://");
  }
  return apiBase.replace("http://", "ws://");
}

/** 构造完整 WebSocket URL（含具体路径） */
export function iGM_GetWsUrl(path: string): string {
  const base = iGM_GetWsBase();
  return `${base}${path}`;
}

// 导出 //
export default {
  iGM_GetWsBase,
  iGM_GetWsUrl,
};
