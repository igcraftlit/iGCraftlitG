/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_TokenRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_Auth
 * 模块：iGM_TokenRepository
 * 作用：iGM_Tokens 表的唯一数据访问出口
 * 内容：验证码/重置令牌创建、查询最新有效令牌、增加尝试次数、
 *       标记已使用（一次性）、作废用户某用途全部旧令牌、清理过期令牌
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import type {
  iGM_TokenPurpose,
  iGM_TokenRow,
} from "../iGM_Types/iGM_Auth";

// 类型定义 //
/** 创建令牌所需字段 */
export interface iGM_CreateTokenParams {
  id: string;
  userId: string;
  purpose: iGM_TokenPurpose;
  /** 验证码或重置令牌秘密的哈希 */
  secretHash: string;
  expiresAt: string;
  createdAt: string;
}

// 核心逻辑 //
/** 创建验证码/重置令牌记录 */
export function iGM_CreateToken(params: iGM_CreateTokenParams): iGM_TokenRow {
  iGM_Db.run(
    `INSERT INTO iGM_Tokens
       (iGM_Id, iGM_UserId, iGM_Purpose, iGM_SecretHash,
        iGM_ExpiresAt, iGM_UsedAt, iGM_Attempts, iGM_CreatedAt)
     VALUES (?, ?, ?, ?, ?, NULL, 0, ?)`,
    [
      params.id,
      params.userId,
      params.purpose,
      params.secretHash,
      params.expiresAt,
      params.createdAt,
    ],
  );
  return iGM_Db
    .query(`SELECT * FROM iGM_Tokens WHERE iGM_Id = ?`)
    .get(params.id) as iGM_TokenRow;
}

/** 查询某用户某用途下最新一条未使用、未过期的令牌 */
export function iGM_FindLatestToken(
  userId: string,
  purpose: iGM_TokenPurpose,
  now: string,
): iGM_TokenRow | null {
  return (
    (iGM_Db
      .query(
        `SELECT * FROM iGM_Tokens
         WHERE iGM_UserId = ?
           AND iGM_Purpose = ?
           AND iGM_UsedAt IS NULL
           AND iGM_ExpiresAt > ?
         ORDER BY iGM_CreatedAt DESC
         LIMIT 1`,
      )
      .get(userId, purpose, now) as iGM_TokenRow | undefined) ?? null
  );
}

/** 按密文哈希查询某用途下未使用、未过期的令牌（重置链接校验用） */
export function iGM_FindActiveTokenBySecret(
  purpose: iGM_TokenPurpose,
  secretHash: string,
  now: string,
): iGM_TokenRow | null {
  return (
    (iGM_Db
      .query(
        `SELECT * FROM iGM_Tokens
         WHERE iGM_Purpose = ?
           AND iGM_SecretHash = ?
           AND iGM_UsedAt IS NULL
           AND iGM_ExpiresAt > ?
         LIMIT 1`,
      )
      .get(purpose, secretHash, now) as iGM_TokenRow | undefined) ?? null
  );
}

/** 按主键查询令牌 */
export function iGM_FindTokenById(id: string): iGM_TokenRow | null {
  return (
    (iGM_Db
      .query(`SELECT * FROM iGM_Tokens WHERE iGM_Id = ?`)
      .get(id) as iGM_TokenRow | undefined) ?? null
  );
}

/** 增加校验失败尝试次数，返回更新后的行 */
export function iGM_IncrementTokenAttempts(id: string): iGM_TokenRow | null {
  iGM_Db.run(
    `UPDATE iGM_Tokens SET iGM_Attempts = iGM_Attempts + 1 WHERE iGM_Id = ?`,
    [id],
  );
  return iGM_FindTokenById(id);
}

/** 标记令牌已使用（一次性令牌消费） */
export function iGM_ConsumeToken(id: string, usedAt: string): boolean {
  const result = iGM_Db.run(
    `UPDATE iGM_Tokens SET iGM_UsedAt = ? WHERE iGM_Id = ? AND iGM_UsedAt IS NULL`,
    [usedAt, id],
  );
  return result.changes > 0;
}

/** 作废某用户某用途下全部未使用令牌（重发验证码/重置邮件时使旧码失效） */
export function iGM_RevokeActiveTokens(
  userId: string,
  purpose: iGM_TokenPurpose,
  usedAt: string,
): number {
  const result = iGM_Db.run(
    `UPDATE iGM_Tokens
       SET iGM_UsedAt = ?
     WHERE iGM_UserId = ? AND iGM_Purpose = ? AND iGM_UsedAt IS NULL`,
    [usedAt, userId, purpose],
  );
  return result.changes;
}

/** 清理全部已过期令牌 */
export function iGM_DeleteExpiredTokens(now: string): number {
  const result = iGM_Db.run(
    `DELETE FROM iGM_Tokens WHERE iGM_ExpiresAt <= ?`,
    [now],
  );
  return result.changes;
}

// 导出 //
export default {
  iGM_CreateToken,
  iGM_FindLatestToken,
  iGM_FindActiveTokenBySecret,
  iGM_FindTokenById,
  iGM_IncrementTokenAttempts,
  iGM_ConsumeToken,
  iGM_RevokeActiveTokens,
  iGM_DeleteExpiredTokens,
};
