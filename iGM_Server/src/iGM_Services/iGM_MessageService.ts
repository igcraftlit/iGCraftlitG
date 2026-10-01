/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_MessageService.ts
 * 所属层：后端 / 业务逻辑层
 * 路由：G_Message
 * 模块：iGM_MessageService
 * 作用：一对一私信会话、消息与隐私设置的业务编排
 * 内容：会话列表（未读数、最后消息）、打开会话、发送消息、标记已读、
 *       限时撤回、删除会话（仅对本人隐藏）、隐私设置读写
 * 安全：消息仅会话双方可见，管理员无通用查看入口；双向拉黑禁止私信；
 *       按接收方隐私设置（所有人/好友/关闭）拦截；撤回时限 2 分钟
 * 实时：复用模块九 WebSocket，新消息/撤回/已读即时推送；接收方离线时
 *       经通知服务做站内与邮件提醒
 */

// 导入依赖 //
import {
  iGM_CountAllUnread,
  iGM_CountConversationUnread,
  iGM_FindConversationById,
  iGM_FindMessageById,
  iGM_GetMessageSettings,
  iGM_GetOrCreateConversation,
  iGM_IsConversationHiddenFor,
  iGM_ListConversations,
  iGM_ListMessages,
  iGM_MarkConversationDeleted,
  iGM_MarkConversationReadBy,
  iGM_RecallMessage,
  iGM_CreateMessage,
  iGM_TouchConversationWithMessage,
  iGM_UpsertMessageSettings,
} from "../iGM_Repositories/iGM_MessageRepository";
import { iGM_FindUserById, iGM_FindUsersByIds } from "../iGM_Repositories/iGM_UserRepository";
import { iGM_ResolveUserOrgBadge } from "../iGM_Repositories/iGM_OrgVerifyRepository";
import { iGM_FindFriendEither } from "../iGM_Repositories/iGM_SocialRepository";
import { iGM_GetBlockDirection } from "./iGM_SocialService";
import { iGM_SanitizeContent } from "./iGM_ContentService";
import { iGM_Notify } from "./iGM_NotificationService";
import {
  iGM_IsUserOnline,
  iGM_PushMessageEventToUser,
} from "./iGM_RealtimeService";
import type { iGM_UserRow } from "../iGM_Types/iGM_Auth";
import type { iGM_AuthorDto } from "../iGM_Types/iGM_Community";
import type {
  iGM_ConversationDetailDto,
  iGM_ConversationListItemDto,
  iGM_MessageAllowFrom,
  iGM_MessageDto,
  iGM_MessageSettingsDto,
} from "../iGM_Types/iGM_Message";
import { iGM_IsMessageAllowFrom, iGM_ToMessageDto } from "../iGM_Types/iGM_Message";

// 类型定义 //
/** 私信业务错误：message 为前端 i18n 文案键，status 为 HTTP 状态码 */
export class iGM_MessageError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "iGM_MessageError";
  }
}

/** 会话列表数据 */
export interface iGM_ConversationListData {
  items: iGM_ConversationListItemDto[];
  unreadCount: number;
}

// 核心逻辑 //
/** 消息长度上限与撤回时限 */
const iGM_MessageMaxLength = 2000;
/** 撤回时限：发送后 2 分钟内 */
const iGM_RecallWindowMs = 2 * 60 * 1000;

/** 用户行转作者简要 DTO（含认证组织徽标） */
async function iGM_ToAuthorDto(user: iGM_UserRow): Promise<iGM_AuthorDto> {
  return {
    id: user.iGM_Id,
    username: user.iGM_Username,
    displayName: user.iGM_DisplayName,
    avatar: user.iGM_Avatar,
    role: user.iGM_Role,
    verifiedOrg: await iGM_ResolveUserOrgBadge(
      user.iGM_VerifiedOrgId ?? null,
      user.iGM_Email,
    ),
  };
}

/* ---------- 通用校验 ---------- */

/** 由会话与当前用户解析对端，非参与方抛 403 */
async function iGM_ResolvePeer(
  conversation: { iGM_UserAId: string; iGM_UserBId: string },
  user: iGM_UserRow,
): Promise<iGM_UserRow> {
  const peerId =
    conversation.iGM_UserAId === user.iGM_Id
      ? conversation.iGM_UserBId
      : conversation.iGM_UserBId === user.iGM_Id
        ? conversation.iGM_UserAId
        : null;
  if (!peerId) throw new iGM_MessageError("auth.errors.forbidden", 403);
  const peer = await iGM_FindUserById(peerId);
  if (!peer || peer.iGM_Status !== "active") {
    throw new iGM_MessageError("social.errors.userNotFound", 404);
  }
  return peer;
}

/** 双向拉黑拦截 */
async function iGM_RejectBlocked(user: iGM_UserRow, peerId: string): Promise<void> {
  if (await iGM_GetBlockDirection(user.iGM_Id, peerId)) {
    throw new iGM_MessageError("social.errors.blocked", 422);
  }
}

/** 接收方隐私设置拦截：none 拒绝；friends 仅 accepted 好友可发 */
async function iGM_EnforceRecipientPrivacy(
  sender: iGM_UserRow,
  recipient: iGM_UserRow,
): Promise<void> {
  const settings = await iGM_GetMessageSettings(recipient.iGM_Id);
  const allowFrom: iGM_MessageAllowFrom = settings?.iGM_AllowFrom ?? "everyone";
  if (allowFrom === "none") {
    throw new iGM_MessageError("message.errors.closed", 422);
  }
  if (allowFrom === "friends") {
    const friendship = await iGM_FindFriendEither(sender.iGM_Id, recipient.iGM_Id);
    if (!friendship || friendship.iGM_Status !== "accepted") {
      throw new iGM_MessageError("message.errors.friendsOnly", 422);
    }
  }
}

/** 校验消息内容：净化后非空，限长 */
function iGM_ValidateMessageContent(raw: unknown): string {
  const content = iGM_SanitizeContent(String(raw ?? ""));
  if (content.length < 1) {
    throw new iGM_MessageError("message.errors.contentRequired", 422);
  }
  if (content.length > iGM_MessageMaxLength) {
    throw new iGM_MessageError("message.errors.contentTooLong", 422);
  }
  return content;
}

/* ---------- 会话列表 / 详情 ---------- */

/** 会话列表：对端信息 + 最后消息 + 未读数 */
export async function iGM_ListConversationsService(
  user: iGM_UserRow,
): Promise<iGM_ConversationListData> {
  const rows = await iGM_ListConversations(user.iGM_Id);
  if (rows.length === 0) {
    return { items: [], unreadCount: await iGM_CountAllUnread(user.iGM_Id) };
  }

  const peerIds = rows.map((row) =>
    row.iGM_UserAId === user.iGM_Id ? row.iGM_UserBId : row.iGM_UserAId,
  );
  const peers = await iGM_FindUsersByIds(peerIds);
  const peerMap = new Map(peers.map((item) => [item.iGM_Id, item]));

  const lastMessageIds = rows
    .map((row) => row.iGM_LastMessageId)
    .filter((id): id is string => Boolean(id));
  const lastMessageMap = await iGM_GetMessagesByIds(lastMessageIds);

  const items: iGM_ConversationListItemDto[] = [];
  for (const row of rows) {
    const peerId =
      row.iGM_UserAId === user.iGM_Id ? row.iGM_UserBId : row.iGM_UserAId;
    const peerRow = peerMap.get(peerId);
    const lastMessage = row.iGM_LastMessageId
      ? (lastMessageMap.get(row.iGM_LastMessageId) ?? null)
      : null;
    items.push({
      id: row.iGM_Id,
      peer: peerRow
        ? await iGM_ToAuthorDto(peerRow)
        : {
            id: peerId,
            username: "unknown",
            displayName: null,
            avatar: null,
            role: "user",
            verifiedOrg: null,
          },
      lastMessage,
      unreadCount: await iGM_CountConversationUnread(row.iGM_Id, user.iGM_Id),
      createdAt: row.iGM_CreatedAt,
      updatedAt: row.iGM_UpdatedAt,
    });
  }

  return {
    items,
    unreadCount: await iGM_CountAllUnread(user.iGM_Id),
  };
}

/** 按 ID 批量读取消息并转 DTO（去重），返回 id -> dto 映射 */
async function iGM_GetMessagesByIds(ids: string[]): Promise<Map<string, iGM_MessageDto>> {
  const unique = Array.from(new Set(ids)).filter(Boolean);
  const map = new Map<string, iGM_MessageDto>();
  if (unique.length === 0) return map;
  // 列表数量小，逐条按主键查询（复用现有仓储，避免跨层直读）
  for (const id of unique) {
    const row = await iGM_FindMessageById(id);
    if (row) map.set(id, iGM_ToMessageDto(row));
  }
  return map;
}

/**
 * 打开与指定用户的会话：黑名单与接收方隐私拦截；
 * 不存在则创建；同时将会话内对方消息标记已读。
 */
export async function iGM_OpenConversationService(
  user: iGM_UserRow,
  peerId: string,
): Promise<iGM_ConversationDetailDto> {
  if (user.iGM_Id === peerId) {
    throw new iGM_MessageError("social.errors.cannotSelf", 422);
  }
  const peer = await iGM_FindUserById(peerId);
  if (!peer || peer.iGM_Status !== "active") {
    throw new iGM_MessageError("social.errors.userNotFound", 404);
  }
  await iGM_RejectBlocked(user, peerId);

  const now = new Date().toISOString();
  const conversation = await iGM_GetOrCreateConversation(user.iGM_Id, peerId, now);
  await iGM_MarkConversationReadBy(conversation.iGM_Id, user.iGM_Id);
  return await iGM_BuildConversationDetail(user, conversation.iGM_Id);
}

/** 会话详情：仅参与方可见；已删除时按不存在处理 */
export async function iGM_GetConversationDetailService(
  user: iGM_UserRow,
  conversationId: string,
): Promise<iGM_ConversationDetailDto> {
  return await iGM_BuildConversationDetail(user, conversationId);
}

/** 组装会话详情 DTO（权限、删除标记、未读数统一处理） */
async function iGM_BuildConversationDetail(
  user: iGM_UserRow,
  conversationId: string,
): Promise<iGM_ConversationDetailDto> {
  const conversation = await iGM_FindConversationById(conversationId);
  if (!conversation) throw new iGM_MessageError("message.errors.notFound", 404);
  const peer = await iGM_ResolvePeer(conversation, user);
  if (iGM_IsConversationHiddenFor(conversation, user.iGM_Id)) {
    throw new iGM_MessageError("message.errors.notFound", 404);
  }
  const messages = (await iGM_ListMessages(conversationId)).map(iGM_ToMessageDto);
  return {
    id: conversation.iGM_Id,
    peer: await iGM_ToAuthorDto(peer),
    messages,
    unreadCount: await iGM_CountConversationUnread(conversationId, user.iGM_Id),
    updatedAt: conversation.iGM_UpdatedAt,
  };
}

/* ---------- 发送消息 ---------- */

/**
 * 发送私信：可通过 peerId（打开会话场景）或 conversationId 定位。
 * 写入消息、更新会话最后消息与对端删除标记；
 * 实时推送给对端；对端离线时写站内/邮件通知（按其通知偏好）。
 */
export async function iGM_SendMessageService(
  user: iGM_UserRow,
  target: { peerId?: string; conversationId?: string },
  rawContent: unknown,
  locale?: string,
): Promise<iGM_MessageDto> {
  const content = iGM_ValidateMessageContent(rawContent);

  let conversationId: string | null = null;
  let recipientId: string;
  if (target.peerId) {
    if (user.iGM_Id === target.peerId) {
      throw new iGM_MessageError("social.errors.cannotSelf", 422);
    }
    recipientId = target.peerId;
  } else if (target.conversationId) {
    const conversation = await iGM_FindConversationById(target.conversationId);
    if (!conversation) throw new iGM_MessageError("message.errors.notFound", 404);
    const peer = await iGM_ResolvePeer(conversation, user);
    recipientId = peer.iGM_Id;
    conversationId = conversation.iGM_Id;
  } else {
    throw new iGM_MessageError("message.errors.targetRequired", 422);
  }

  const recipient = await iGM_FindUserById(recipientId);
  if (!recipient || recipient.iGM_Status !== "active") {
    throw new iGM_MessageError("social.errors.userNotFound", 404);
  }
  await iGM_RejectBlocked(user, recipientId);
  await iGM_EnforceRecipientPrivacy(user, recipient);

  const now = new Date().toISOString();
  if (!conversationId) {
    const conversation = await iGM_GetOrCreateConversation(user.iGM_Id, recipientId, now);
    conversationId = conversation.iGM_Id;
  }
  const conversation = await iGM_FindConversationById(conversationId);
  if (!conversation) throw new iGM_MessageError("message.errors.notFound", 404);

  const messageRow = await iGM_CreateMessage(conversationId, user.iGM_Id, content, now);
  await iGM_TouchConversationWithMessage(conversation, messageRow.iGM_Id, user.iGM_Id, now);
  const dto = iGM_ToMessageDto(messageRow);

  // 实时推送：对端在线走 WebSocket；离线写通知（站内/邮件按通知偏好）
  iGM_PushMessageEventToUser(recipientId, {
    type: "message",
    conversationId,
    message: dto,
  });
  if (!iGM_IsUserOnline(recipientId)) {
    await iGM_Notify({
      userId: recipientId,
      actorId: user.iGM_Id,
      actorName: user.iGM_DisplayName ?? user.iGM_Username,
      type: "message",
      title: user.iGM_DisplayName ?? user.iGM_Username,
      link: `/G_MessageDetail?conversationId=${conversationId}`,
      locale,
    });
  }

  return dto;
}

/* ---------- 已读 ---------- */

/** 标记会话已读，并实时通知发送方更新已读状态 */
export async function iGM_MarkReadService(
  user: iGM_UserRow,
  conversationId: string,
): Promise<{ unreadCount: number }> {
  const conversation = await iGM_FindConversationById(conversationId);
  if (!conversation) throw new iGM_MessageError("message.errors.notFound", 404);
  await iGM_ResolvePeer(conversation, user);
  await iGM_MarkConversationReadBy(conversationId, user.iGM_Id);
  iGM_PushMessageEventToUser(
    conversation.iGM_UserAId === user.iGM_Id
      ? conversation.iGM_UserBId
      : conversation.iGM_UserAId,
    { type: "messageRead", conversationId, readerId: user.iGM_Id },
  );
  return {
    unreadCount: await iGM_CountConversationUnread(conversationId, user.iGM_Id),
  };
}

/* ---------- 撤回 ---------- */

/**
 * 撤回消息：仅发送方本人、消息未撤回且在 2 分钟时限内；
 * 撤回后实时通知对端，内容不再下发。
 */
export async function iGM_RecallMessageService(
  user: iGM_UserRow,
  messageId: string,
): Promise<void> {
  const message = await iGM_FindMessageById(messageId);
  if (!message) throw new iGM_MessageError("message.errors.messageNotFound", 404);
  if (message.iGM_SenderId !== user.iGM_Id) {
    throw new iGM_MessageError("auth.errors.forbidden", 403);
  }
  if (message.iGM_IsRecalled === 1) {
    throw new iGM_MessageError("message.errors.alreadyRecalled", 422);
  }
  const sentAt = Date.parse(message.iGM_CreatedAt);
  if (!Number.isFinite(sentAt) || Date.now() - sentAt > iGM_RecallWindowMs) {
    throw new iGM_MessageError("message.errors.recallExpired", 422);
  }
  await iGM_RecallMessage(messageId);

  const conversation = await iGM_FindConversationById(message.iGM_ConversationId);
  const peerId =
    conversation && conversation.iGM_UserAId === user.iGM_Id
      ? conversation.iGM_UserBId
      : conversation?.iGM_UserAId;
  if (peerId) {
    iGM_PushMessageEventToUser(peerId, {
      type: "messageRecall",
      conversationId: message.iGM_ConversationId,
      messageId,
    });
  }
}

/* ---------- 删除会话 ---------- */

/** 删除会话：仅对本人隐藏，不影响对方；有新消息时自动恢复可见 */
export async function iGM_DeleteConversationService(
  user: iGM_UserRow,
  conversationId: string,
): Promise<void> {
  const conversation = await iGM_FindConversationById(conversationId);
  if (!conversation) return;
  await iGM_ResolvePeer(conversation, user);
  await iGM_MarkConversationDeleted(conversationId, user.iGM_Id);
}

/* ---------- 隐私设置 ---------- */

/** 读取私信隐私设置（默认 everyone） */
export async function iGM_GetSettingsService(userId: string): Promise<iGM_MessageSettingsDto> {
  const row = await iGM_GetMessageSettings(userId);
  return {
    allowFrom: row?.iGM_AllowFrom ?? "everyone",
    updatedAt: row?.iGM_UpdatedAt ?? null,
  };
}

/** 更新私信隐私设置 */
export async function iGM_UpdateSettingsService(
  user: iGM_UserRow,
  rawAllowFrom: unknown,
): Promise<iGM_MessageSettingsDto> {
  if (!iGM_IsMessageAllowFrom(rawAllowFrom)) {
    throw new iGM_MessageError("message.errors.allowFromInvalid", 422);
  }
  await iGM_UpsertMessageSettings(user.iGM_Id, rawAllowFrom, new Date().toISOString());
  return await iGM_GetSettingsService(user.iGM_Id);
}

/** 全部未读数（导航角标使用） */
export async function iGM_GetUnreadCountService(userId: string): Promise<number> {
  return await iGM_CountAllUnread(userId);
}

// 导出 //
export default {
  iGM_ListConversationsService,
  iGM_OpenConversationService,
  iGM_GetConversationDetailService,
  iGM_SendMessageService,
  iGM_MarkReadService,
  iGM_RecallMessageService,
  iGM_DeleteConversationService,
  iGM_GetSettingsService,
  iGM_UpdateSettingsService,
  iGM_GetUnreadCountService,
};
