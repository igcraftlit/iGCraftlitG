/**
 * 文件路径：iGM_Server/src/iGM_Types/iGM_Message.ts
 * 所属层：后端 / 类型定义层
 * 路由：G_Message
 * 模块：iGM_Message
 * 作用：定义私信会话、消息与隐私设置的数据库行类型与对外 DTO
 * 内容：消息类型与私信范围枚举、会话/消息/设置行、消息 DTO、会话列表项/详情 DTO、
 *       隐私设置 DTO
 * 说明：消息仅会话双方可见；撤回消息内容不下发；管理员无通用查看入口
 */

// 导入依赖 //
import type { iGM_AuthorDto } from "./iGM_Community";

// 类型定义 //
/** 消息类型：text 文本 */
export type iGM_MessageType = "text";

/** 私信允许范围：everyone 所有人 / friends 仅好友 / none 关闭 */
export type iGM_MessageAllowFrom = "everyone" | "friends" | "none";

/** 会话行：userA/userB 按用户 ID 字典序归一 */
export interface iGM_ConversationRow {
  iGM_Id: string;
  iGM_UserAId: string;
  iGM_UserBId: string;
  iGM_LastMessageId: string | null;
  /** 删除会话仅对操作方隐藏：1 表示该方已删除 */
  iGM_DeletedByA: number;
  iGM_DeletedByB: number;
  iGM_CreatedAt: string;
  iGM_UpdatedAt: string;
}

/** 消息行 */
export interface iGM_MessageRow {
  iGM_Id: string;
  iGM_ConversationId: string;
  iGM_SenderId: string;
  iGM_Content: string;
  iGM_Type: iGM_MessageType;
  iGM_IsRead: number;
  iGM_IsRecalled: number;
  iGM_CreatedAt: string;
}

/** 私信隐私设置行 */
export interface iGM_MessageSettingsRow {
  iGM_Id: string;
  iGM_UserId: string;
  iGM_AllowFrom: iGM_MessageAllowFrom;
  iGM_UpdatedAt: string;
}

/* ---------- 对外 DTO ---------- */

/** 消息 DTO */
export interface iGM_MessageDto {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: iGM_MessageType;
  isRead: boolean;
  isRecalled: boolean;
  createdAt: string;
}

/** 会话列表项：对方公开信息 + 最后一条消息 + 未读数 */
export interface iGM_ConversationListItemDto {
  id: string;
  peer: iGM_AuthorDto;
  lastMessage: iGM_MessageDto | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

/** 会话详情：对方信息 + 全部消息 + 当前未读数 */
export interface iGM_ConversationDetailDto {
  id: string;
  peer: iGM_AuthorDto;
  messages: iGM_MessageDto[];
  unreadCount: number;
  updatedAt: string;
}

/** 私信隐私设置 DTO */
export interface iGM_MessageSettingsDto {
  allowFrom: iGM_MessageAllowFrom;
  updatedAt: string | null;
}

// 核心逻辑 //
/** 允许的私信范围常量 */
export const iGM_MessageAllowFromValues: iGM_MessageAllowFrom[] = [
  "everyone",
  "friends",
  "none",
];

/** 允许的消息类型常量 */
export const iGM_MessageTypes: iGM_MessageType[] = ["text"];

/** 判断未知字符串是否为合法私信范围 */
export function iGM_IsMessageAllowFrom(
  value: unknown,
): value is iGM_MessageAllowFrom {
  return (
    typeof value === "string" &&
    iGM_MessageAllowFromValues.includes(value as iGM_MessageAllowFrom)
  );
}

/** 消息行转 DTO；撤回消息清空内容，仅保留撤回标记 */
export function iGM_ToMessageDto(row: iGM_MessageRow): iGM_MessageDto {
  const isRecalled = row.iGM_IsRecalled === 1;
  return {
    id: row.iGM_Id,
    conversationId: row.iGM_ConversationId,
    senderId: row.iGM_SenderId,
    content: isRecalled ? "" : row.iGM_Content,
    type: row.iGM_Type,
    isRead: row.iGM_IsRead === 1,
    isRecalled,
    createdAt: row.iGM_CreatedAt,
  };
}

// 导出 //
export default {
  iGM_MessageAllowFromValues,
  iGM_MessageTypes,
  iGM_IsMessageAllowFrom,
  iGM_ToMessageDto,
};
