/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_AIRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_AI
 * 模块：iGM_AIRepository
 * 作用：AI 会话表（iGM_AIConversations）与消息表（iGM_AIMessages）的唯一数据访问出口
 * 内容：新建/查询会话、按用户列出与统计会话、取最早会话、删除会话及其消息、
 *       读取最近上下文消息、读取全量历史消息、写入消息、刷新会话时间
 * 说明：消息按 iGM_CreatedAt 正序返回；同一会话内提问与回复的时间戳
 *       在业务层保证先后（回复落库时刻晚于提问时刻），排序结果稳定；
 *       会话列表按 iGM_CreatedAt 倒序（最新创建在前），上限判定与最早会话
 *       查询由模块四索引 iGM_Idx_AIConversations_UserCreated 支撑；
 *       账号级严格隔离：会话与消息的查询 / 删除 / 刷新均强制携带 userId，
 *       即使传入他人会话 id 也因 WHERE iGM_UserId = ? 而查不到、删不掉
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import { iGM_RandomUuid } from "../iGM_Services/iGM_SecurityService";
import type {
  iGM_AIConversationRow,
  iGM_AIMessageRow,
  iGM_AIRole,
} from "../iGM_Types/iGM_AI";

// 类型定义 //
// （本文件无额外类型，行类型见 iGM_Types/iGM_AI.ts）

// 核心逻辑 //
/** 新建会话并落库，返回落库行 */
export async function iGM_CreateAIConversation(
  userId: string,
  title: string,
): Promise<iGM_AIConversationRow> {
  const now = new Date().toISOString();
  const row: iGM_AIConversationRow = {
    iGM_Id: iGM_RandomUuid(),
    iGM_UserId: userId,
    iGM_Title: title,
    iGM_CreatedAt: now,
    iGM_UpdatedAt: now,
  };
  await iGM_Db.run(
    `INSERT INTO iGM_AIConversations
       (iGM_Id, iGM_UserId, iGM_Title, iGM_CreatedAt, iGM_UpdatedAt)
     VALUES (?, ?, ?, ?, ?)`,
    [row.iGM_Id, row.iGM_UserId, row.iGM_Title, row.iGM_CreatedAt, row.iGM_UpdatedAt],
  );
  return row;
}

/** 按主键 + 归属用户查询会话（账号级隔离：他人会话一律查不到） */
export async function iGM_FindAIConversationById(
  conversationId: string,
  userId: string,
): Promise<iGM_AIConversationRow | null> {
  return (
    ((await iGM_Db
      .query(
        `SELECT * FROM iGM_AIConversations
          WHERE iGM_Id = ? AND iGM_UserId = ?`,
      )
      .get(conversationId, userId)) as iGM_AIConversationRow | undefined) ??
    null
  );
}

/** 列出某用户最近 N 个会话（按 iGM_CreatedAt 倒序，最新创建在前，供会话列表展示） */
export async function iGM_ListAIConversations(
  userId: string,
  limit: number,
): Promise<iGM_AIConversationRow[]> {
  return (await iGM_Db
    .query(
      `SELECT * FROM iGM_AIConversations
        WHERE iGM_UserId = ?
        ORDER BY iGM_CreatedAt DESC
        LIMIT ?`,
    )
    .all(userId, limit)) as iGM_AIConversationRow[];
}

/** 统计某用户会话数量（会话上限判定用） */
export async function iGM_CountAIConversations(userId: string): Promise<number> {
  const row = (await iGM_Db
    .query(
      `SELECT COUNT(*) AS iGM_Total FROM iGM_AIConversations WHERE iGM_UserId = ?`,
    )
    .get(userId)) as { iGM_Total: number };
  return row.iGM_Total;
}

/** 取某用户最早创建的会话（超过上限时删除用；无会话返回 null） */
export async function iGM_FindEarliestAIConversation(
  userId: string,
): Promise<iGM_AIConversationRow | null> {
  return (
    ((await iGM_Db
      .query(
        `SELECT * FROM iGM_AIConversations
          WHERE iGM_UserId = ?
          ORDER BY iGM_CreatedAt ASC
          LIMIT 1`,
      )
      .get(userId)) as iGM_AIConversationRow | undefined) ?? null
  );
}

/**
 * 删除会话及其全部消息（先删消息再删会话，须由业务层放在事务内调用）。
 * 账号级隔离：仅删除属于该用户的会话与其消息，传入他人会话 id 时不产生任何删除
 */
export async function iGM_DeleteAIConversation(
  conversationId: string,
  userId: string,
): Promise<void> {
  await iGM_Db.run(
    `DELETE FROM iGM_AIMessages
      WHERE iGM_ConversationId = ?
        AND iGM_ConversationId IN (
          SELECT iGM_Id FROM iGM_AIConversations WHERE iGM_UserId = ?
        )`,
    [conversationId, userId],
  );
  await iGM_Db.run(
    `DELETE FROM iGM_AIConversations WHERE iGM_Id = ? AND iGM_UserId = ?`,
    [conversationId, userId],
  );
}

/**
 * 读取会话最近 N 条消息（时间正序）。
 * 账号级隔离：仅返回属于该用户会话的消息；
 * 先用子查询按时间倒序取最近 N 条，再在外层翻转为正序，保证拿到的是「最新」而非「最早」
 */
export async function iGM_ListRecentAIMessages(
  conversationId: string,
  userId: string,
  limit: number,
): Promise<iGM_AIMessageRow[]> {
  return (await iGM_Db
    .query(
      `SELECT * FROM (
         SELECT iGM_M.*
           FROM iGM_AIMessages iGM_M
           JOIN iGM_AIConversations iGM_C
             ON iGM_C.iGM_Id = iGM_M.iGM_ConversationId
          WHERE iGM_M.iGM_ConversationId = ?
            AND iGM_C.iGM_UserId = ?
          ORDER BY iGM_M.iGM_CreatedAt DESC
          LIMIT ?
       ) iGM_Recent
       ORDER BY iGM_CreatedAt ASC`,
    )
    .all(conversationId, userId, limit)) as iGM_AIMessageRow[];
}

/** 写入一条消息（createdAt 缺省取当前时刻） */
export async function iGM_InsertAIMessage(
  conversationId: string,
  role: iGM_AIRole,
  content: string,
  createdAt?: string,
): Promise<void> {
  await iGM_Db.run(
    `INSERT INTO iGM_AIMessages
       (iGM_Id, iGM_ConversationId, iGM_Role, iGM_Content, iGM_CreatedAt)
     VALUES (?, ?, ?, ?, ?)`,
    [
      iGM_RandomUuid(),
      conversationId,
      role,
      content,
      createdAt ?? new Date().toISOString(),
    ],
  );
}

/** 刷新会话更新时间（有新消息时调用；账号级隔离，仅本人会话可更新） */
export async function iGM_TouchAIConversation(
  conversationId: string,
  userId: string,
  updatedAt?: string,
): Promise<void> {
  await iGM_Db.run(
    `UPDATE iGM_AIConversations SET iGM_UpdatedAt = ?
      WHERE iGM_Id = ? AND iGM_UserId = ?`,
    [updatedAt ?? new Date().toISOString(), conversationId, userId],
  );
}

// 导出 //
export default {
  iGM_CreateAIConversation,
  iGM_FindAIConversationById,
  iGM_ListAIConversations,
  iGM_CountAIConversations,
  iGM_FindEarliestAIConversation,
  iGM_DeleteAIConversation,
  iGM_ListRecentAIMessages,
  iGM_InsertAIMessage,
  iGM_TouchAIConversation,
};