/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_MessageRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_Message
 * 模块：iGM_MessageRepository
 * 作用：私信会话（iGM_Conversations）、消息（iGM_Messages）、
 *       隐私设置（iGM_MessageSettings）三张表的唯一数据访问出口
 * 内容：会话按归一参与者查找/创建/列表、双方独立删除标记复位、
 *       消息写入/读取/撤回、未读统计、已读标记、隐私设置读写
 * 说明：所有查询仅按会话参与方过滤；权限校验由服务层保证
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import { iGM_RandomUuid } from "../iGM_Services/iGM_SecurityService";
import type {
  iGM_ConversationRow,
  iGM_MessageAllowFrom,
  iGM_MessageRow,
  iGM_MessageSettingsRow,
} from "../iGM_Types/iGM_Message";

// 类型定义 //
/** 归一后的用户对：按字典序排列，保证同一会话唯一 */
export type iGM_OrderedPair = readonly [string, string];

// 核心逻辑 //
/** 两个用户 ID 归一排序 */
export function iGM_OrderPair(userA: string, userB: string): iGM_OrderedPair {
  return userA < userB ? [userA, userB] : [userB, userA];
}

/* ---------- 会话 ---------- */

/** 按归一参与者查找会话 */
export function iGM_FindConversation(
  userA: string,
  userB: string,
): iGM_ConversationRow | null {
  const [first, second] = iGM_OrderPair(userA, userB);
  return (
    (iGM_Db
      .query(
        `SELECT * FROM iGM_Conversations
          WHERE iGM_UserAId = ? AND iGM_UserBId = ?`,
      )
      .get(first, second) as iGM_ConversationRow | undefined) ?? null
  );
}

/** 按主键查询会话 */
export function iGM_FindConversationById(
  id: string,
): iGM_ConversationRow | null {
  return (
    (iGM_Db
      .query(`SELECT * FROM iGM_Conversations WHERE iGM_Id = ?`)
      .get(id) as iGM_ConversationRow | undefined) ?? null
  );
}

/** 创建会话（双方初始未删除） */
export function iGM_CreateConversation(
  userA: string,
  userB: string,
  now: string,
): iGM_ConversationRow {
  const [first, second] = iGM_OrderPair(userA, userB);
  const row: iGM_ConversationRow = {
    iGM_Id: iGM_RandomUuid(),
    iGM_UserAId: first,
    iGM_UserBId: second,
    iGM_LastMessageId: null,
    iGM_DeletedByA: 0,
    iGM_DeletedByB: 0,
    iGM_CreatedAt: now,
    iGM_UpdatedAt: now,
  };
  iGM_Db.run(
    `INSERT INTO iGM_Conversations
       (iGM_Id, iGM_UserAId, iGM_UserBId, iGM_LastMessageId,
        iGM_DeletedByA, iGM_DeletedByB, iGM_CreatedAt, iGM_UpdatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.iGM_Id,
      row.iGM_UserAId,
      row.iGM_UserBId,
      row.iGM_LastMessageId,
      row.iGM_DeletedByA,
      row.iGM_DeletedByB,
      row.iGM_CreatedAt,
      row.iGM_UpdatedAt,
    ],
  );
  return row;
}

/** 查找或创建会话 */
export function iGM_GetOrCreateConversation(
  userA: string,
  userB: string,
  now: string,
): iGM_ConversationRow {
  return iGM_FindConversation(userA, userB) ?? iGM_CreateConversation(userA, userB, now);
}

/**
 * 会话列表：按参与方过滤，并排除该方已删除的会话；
 * 对端用户必须存在且 active。按更新时间倒序。
 */
export function iGM_ListConversations(userId: string): iGM_ConversationRow[] {
  return iGM_Db
    .query(
      `SELECT c.* FROM iGM_Conversations c
         JOIN iGM_Users u ON u.iGM_Id =
              CASE WHEN c.iGM_UserAId = ? THEN c.iGM_UserBId ELSE c.iGM_UserAId END
        WHERE (c.iGM_UserAId = ? OR c.iGM_UserBId = ?)
          AND (CASE WHEN c.iGM_UserAId = ? THEN c.iGM_DeletedByA
                    ELSE c.iGM_DeletedByB END) = 0
          AND u.iGM_Status = 'active'
        ORDER BY c.iGM_UpdatedAt DESC, c.iGM_Id DESC`,
    )
    .all(userId, userId, userId, userId) as iGM_ConversationRow[];
}

/**
 * 新消息到达时更新会话：最后消息、更新时间，
 * 并复位接收方（非发送方）的删除标记，保证对方能重新看到会话。
 */
export function iGM_TouchConversationWithMessage(
  conversation: iGM_ConversationRow,
  messageId: string,
  senderId: string,
  now: string,
): void {
  const senderIsA = conversation.iGM_UserAId === senderId;
  iGM_Db.run(
    `UPDATE iGM_Conversations SET
       iGM_LastMessageId = ?, iGM_UpdatedAt = ?,
       iGM_DeletedByA = ?, iGM_DeletedByB = ?
     WHERE iGM_Id = ?`,
    [
      messageId,
      now,
      senderIsA ? conversation.iGM_DeletedByA : 0,
      senderIsA ? 0 : conversation.iGM_DeletedByB,
      conversation.iGM_Id,
    ],
  );
}

/** 标记某一方已删除会话（仅对该方隐藏） */
export function iGM_MarkConversationDeleted(
  conversationId: string,
  userId: string,
): boolean {
  const conversation = iGM_FindConversationById(conversationId);
  if (!conversation) return false;
  if (conversation.iGM_UserAId === userId) {
    iGM_Db.run(
      `UPDATE iGM_Conversations SET iGM_DeletedByA = 1 WHERE iGM_Id = ?`,
      [conversationId],
    );
  } else if (conversation.iGM_UserBId === userId) {
    iGM_Db.run(
      `UPDATE iGM_Conversations SET iGM_DeletedByB = 1 WHERE iGM_Id = ?`,
      [conversationId],
    );
  } else {
    return false;
  }
  return true;
}

/** 查询会话对某一方是否已删除（非参与方返回 true 视为不可见） */
export function iGM_IsConversationHiddenFor(
  conversation: iGM_ConversationRow,
  userId: string,
): boolean {
  if (conversation.iGM_UserAId === userId) return conversation.iGM_DeletedByA === 1;
  if (conversation.iGM_UserBId === userId) return conversation.iGM_DeletedByB === 1;
  return true;
}

/* ---------- 消息 ---------- */

/** 写入消息（默认未读、未撤回） */
export function iGM_CreateMessage(
  conversationId: string,
  senderId: string,
  content: string,
  now: string,
): iGM_MessageRow {
  const row: iGM_MessageRow = {
    iGM_Id: iGM_RandomUuid(),
    iGM_ConversationId: conversationId,
    iGM_SenderId: senderId,
    iGM_Content: content,
    iGM_Type: "text",
    iGM_IsRead: 0,
    iGM_IsRecalled: 0,
    iGM_CreatedAt: now,
  };
  iGM_Db.run(
    `INSERT INTO iGM_Messages
       (iGM_Id, iGM_ConversationId, iGM_SenderId, iGM_Content, iGM_Type,
        iGM_IsRead, iGM_IsRecalled, iGM_CreatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.iGM_Id,
      row.iGM_ConversationId,
      row.iGM_SenderId,
      row.iGM_Content,
      row.iGM_Type,
      row.iGM_IsRead,
      row.iGM_IsRecalled,
      row.iGM_CreatedAt,
    ],
  );
  return row;
}

/** 按主键查询消息 */
export function iGM_FindMessageById(id: string): iGM_MessageRow | null {
  return (
    (iGM_Db
      .query(`SELECT * FROM iGM_Messages WHERE iGM_Id = ?`)
      .get(id) as iGM_MessageRow | undefined) ?? null
  );
}

/** 会话全部消息（按时间正序） */
export function iGM_ListMessages(conversationId: string): iGM_MessageRow[] {
  return iGM_Db
    .query(
      `SELECT * FROM iGM_Messages
        WHERE iGM_ConversationId = ?
        ORDER BY iGM_CreatedAt ASC, iGM_Id ASC`,
    )
    .all(conversationId) as iGM_MessageRow[];
}

/**
 * 标记会话中对方发来的消息为已读（读者自己发的不动）。
 * 返回受影响行数。
 */
export function iGM_MarkConversationReadBy(
  conversationId: string,
  readerId: string,
): number {
  const result = iGM_Db.run(
    `UPDATE iGM_Messages SET iGM_IsRead = 1
      WHERE iGM_ConversationId = ? AND iGM_SenderId != ? AND iGM_IsRead = 0`,
    [conversationId, readerId],
  );
  return result.changes;
}

/** 会话内某读者的未读数（对方发送且未读） */
export function iGM_CountConversationUnread(
  conversationId: string,
  readerId: string,
): number {
  return (
    iGM_Db
      .query(
        `SELECT COUNT(*) AS iGM_Count FROM iGM_Messages
          WHERE iGM_ConversationId = ? AND iGM_SenderId != ?
            AND iGM_IsRead = 0 AND iGM_IsRecalled = 0`,
      )
      .get(conversationId, readerId) as { iGM_Count: number }
  ).iGM_Count;
}

/** 用户全部未读消息数（跨会话，且会话对用户未删除） */
export function iGM_CountAllUnread(userId: string): number {
  return (
    iGM_Db
      .query(
        `SELECT COUNT(*) AS iGM_Count FROM iGM_Messages m
           JOIN iGM_Conversations c ON c.iGM_Id = m.iGM_ConversationId
          WHERE m.iGM_SenderId != ? AND m.iGM_IsRead = 0 AND m.iGM_IsRecalled = 0
            AND (c.iGM_UserAId = ? OR c.iGM_UserBId = ?)
            AND (CASE WHEN c.iGM_UserAId = ? THEN c.iGM_DeletedByA
                      ELSE c.iGM_DeletedByB END) = 0`,
      )
      .get(userId, userId, userId, userId) as { iGM_Count: number }
  ).iGM_Count;
}

/** 撤回消息：仅设置撤回标记，行保留以维持会话记录；返回是否有行更新 */
export function iGM_RecallMessage(id: string): boolean {
  const result = iGM_Db.run(
    `UPDATE iGM_Messages SET iGM_IsRecalled = 1, iGM_Content = ''
      WHERE iGM_Id = ? AND iGM_IsRecalled = 0`,
    [id],
  );
  return result.changes > 0;
}

/* ---------- 隐私设置 ---------- */

/** 读取用户私信设置；未设置时返回 null（服务层按默认 everyone） */
export function iGM_GetMessageSettings(
  userId: string,
): iGM_MessageSettingsRow | null {
  return (
    (iGM_Db
      .query(`SELECT * FROM iGM_MessageSettings WHERE iGM_UserId = ?`)
      .get(userId) as iGM_MessageSettingsRow | undefined) ?? null
  );
}

/** 更新或创建私信隐私设置（幂等 upsert） */
export function iGM_UpsertMessageSettings(
  userId: string,
  allowFrom: iGM_MessageAllowFrom,
  now: string,
): iGM_MessageSettingsRow {
  const existing = iGM_GetMessageSettings(userId);
  if (existing) {
    iGM_Db.run(
      `UPDATE iGM_MessageSettings SET iGM_AllowFrom = ?, iGM_UpdatedAt = ?
        WHERE iGM_Id = ?`,
      [allowFrom, now, existing.iGM_Id],
    );
    return { ...existing, iGM_AllowFrom: allowFrom, iGM_UpdatedAt: now };
  }
  const row: iGM_MessageSettingsRow = {
    iGM_Id: iGM_RandomUuid(),
    iGM_UserId: userId,
    iGM_AllowFrom: allowFrom,
    iGM_UpdatedAt: now,
  };
  iGM_Db.run(
    `INSERT INTO iGM_MessageSettings
       (iGM_Id, iGM_UserId, iGM_AllowFrom, iGM_UpdatedAt)
     VALUES (?, ?, ?, ?)`,
    [row.iGM_Id, row.iGM_UserId, row.iGM_AllowFrom, row.iGM_UpdatedAt],
  );
  return row;
}

// 导出 //
export default {
  iGM_OrderPair,
  iGM_FindConversation,
  iGM_FindConversationById,
  iGM_CreateConversation,
  iGM_GetOrCreateConversation,
  iGM_ListConversations,
  iGM_TouchConversationWithMessage,
  iGM_MarkConversationDeleted,
  iGM_IsConversationHiddenFor,
  iGM_CreateMessage,
  iGM_FindMessageById,
  iGM_ListMessages,
  iGM_MarkConversationReadBy,
  iGM_CountConversationUnread,
  iGM_CountAllUnread,
  iGM_RecallMessage,
  iGM_GetMessageSettings,
  iGM_UpsertMessageSettings,
};
