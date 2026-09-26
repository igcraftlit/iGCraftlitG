/**
 * 文件路径：apps/web/src/iGM_Services/iGM_MessageClient.ts
 * 所属层：前端 / 基础服务层
 * 路由：调用后端 /G_Message/*
 * 模块：iGM_MessageClient
 * 作用：私信会话、消息与隐私设置后端接口的唯一前端调用出口
 * 内容：会话列表、未读数、会话详情、打开会话、发送消息、标记已读、
 *       撤回消息、删除会话、隐私设置读写
 * 约束：只经 iGM_Request 发请求；类型与后端 iGM_Types/iGM_Message.ts 保持一致
 */

// 导入依赖 //
import {
  iGM_Delete,
  iGM_Get,
  iGM_Post,
  iGM_Put,
  type iGM_ApiResponse,
} from "./iGM_Request";
import type { iGM_Author } from "./iGM_CommunityClient";

// 类型定义 //
/** 私信允许范围 */
export type iGM_MessageAllowFrom = "everyone" | "friends" | "none";

/** 消息 */
export interface iGM_Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: "text";
  isRead: boolean;
  isRecalled: boolean;
  createdAt: string;
}

/** 会话列表项 */
export interface iGM_ConversationListItem {
  id: string;
  peer: iGM_Author;
  lastMessage: iGM_Message | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

/** 会话详情 */
export interface iGM_ConversationDetail {
  id: string;
  peer: iGM_Author;
  messages: iGM_Message[];
  unreadCount: number;
  updatedAt: string;
}

/** 隐私设置 */
export interface iGM_MessageSettings {
  allowFrom: iGM_MessageAllowFrom;
  updatedAt: string | null;
}

/** 会话列表数据 */
export interface iGM_ConversationListData {
  items: iGM_ConversationListItem[];
  unreadCount: number;
}

// 核心逻辑 //
/** 会话列表 */
export function iGM_ApiListConversations(): Promise<
  iGM_ApiResponse<iGM_ConversationListData>
> {
  return iGM_Get("/G_Message/list");
}

/** 全部未读数 */
export function iGM_ApiGetMessageUnreadCount(): Promise<
  iGM_ApiResponse<{ unreadCount: number }>
> {
  return iGM_Get("/G_Message/unreadCount");
}

/** 会话详情 */
export function iGM_ApiGetConversation(
  conversationId: string,
): Promise<iGM_ApiResponse<{ conversation: iGM_ConversationDetail }>> {
  return iGM_Get(
    `/G_Message/detail?conversationId=${encodeURIComponent(conversationId)}`,
  );
}

/** 打开与指定用户的会话（不存在则创建） */
export function iGM_ApiOpenConversation(
  peerId: string,
): Promise<iGM_ApiResponse<{ conversation: iGM_ConversationDetail }>> {
  return iGM_Post("/G_Message/open", { peerId });
}

/** 发送消息（按会话或对端定位） */
export function iGM_ApiSendMessage(input: {
  conversationId?: string;
  peerId?: string;
  content: string;
}): Promise<iGM_ApiResponse<{ message: iGM_Message }>> {
  return iGM_Post("/G_Message/send", input);
}

/** 标记会话已读 */
export function iGM_ApiMarkConversationRead(
  conversationId: string,
): Promise<iGM_ApiResponse<{ unreadCount: number }>> {
  return iGM_Post("/G_Message/read", { conversationId });
}

/** 撤回消息（限时） */
export function iGM_ApiRecallMessage(
  messageId: string,
): Promise<iGM_ApiResponse<{ recalled: boolean }>> {
  return iGM_Post("/G_Message/recall", { messageId });
}

/** 删除会话（仅对本人隐藏） */
export function iGM_ApiDeleteConversation(
  conversationId: string,
): Promise<iGM_ApiResponse<{ deleted: boolean }>> {
  return iGM_Delete(
    `/G_Message/delete?conversationId=${encodeURIComponent(conversationId)}`,
  );
}

/** 读取隐私设置 */
export function iGM_ApiGetMessageSettings(): Promise<
  iGM_ApiResponse<iGM_MessageSettings>
> {
  return iGM_Get("/G_Message/settings");
}

/** 更新隐私设置 */
export function iGM_ApiUpdateMessageSettings(
  allowFrom: iGM_MessageAllowFrom,
): Promise<iGM_ApiResponse<iGM_MessageSettings>> {
  return iGM_Put("/G_Message/settings", { allowFrom });
}

// 导出 //
export default {
  iGM_ApiListConversations,
  iGM_ApiGetMessageUnreadCount,
  iGM_ApiGetConversation,
  iGM_ApiOpenConversation,
  iGM_ApiSendMessage,
  iGM_ApiMarkConversationRead,
  iGM_ApiRecallMessage,
  iGM_ApiDeleteConversation,
  iGM_ApiGetMessageSettings,
  iGM_ApiUpdateMessageSettings,
};
