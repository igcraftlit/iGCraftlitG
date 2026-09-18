/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_SessionRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_Auth
 * 模块：iGM_SessionRepository
 * 作用：iGM_Sessions 表的唯一数据访问出口
 * 内容：会话创建、按哈希查询、删除单条会话、删除用户全部会话、清理过期会话
 * 说明：数据库只存会话 ID 的 SHA-256 哈希，原始 ID 仅保存在用户 Cookie 中
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import type { iGM_SessionRow } from "../iGM_Types/iGM_Auth";

// 类型定义 //
/** 创建会话所需字段 */
export interface iGM_CreateSessionParams {
  /** 会话 ID 的 SHA-256 哈希 */
  idHash: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
  userAgent: string | null;
  ip: string | null;
}

// 核心逻辑 //
/** 创建会话 */
export function iGM_CreateSession(params: iGM_CreateSessionParams): void {
  iGM_Db.run(
    `INSERT INTO iGM_Sessions
       (iGM_Id, iGM_UserId, iGM_ExpiresAt, iGM_CreatedAt, iGM_UserAgent, iGM_Ip)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      params.idHash,
      params.userId,
      params.expiresAt,
      params.createdAt,
      params.userAgent,
      params.ip,
    ],
  );
}

/** 按会话 ID 哈希查询未过期会话 */
export function iGM_FindSession(idHash: string, now: string): iGM_SessionRow | null {
  return (
    (iGM_Db
      .query(
        `SELECT * FROM iGM_Sessions
         WHERE iGM_Id = ? AND iGM_ExpiresAt > ?`,
      )
      .get(idHash, now) as iGM_SessionRow | undefined) ?? null
  );
}

/** 删除单条会话（登出） */
export function iGM_DeleteSession(idHash: string): boolean {
  const result = iGM_Db.run(`DELETE FROM iGM_Sessions WHERE iGM_Id = ?`, [
    idHash,
  ]);
  return result.changes > 0;
}

/** 删除某用户的全部会话（密码重置后强制重新登录） */
export function iGM_DeleteSessionsByUser(
  userId: string,
  exceptIdHash?: string,
): number {
  if (exceptIdHash) {
    const result = iGM_Db.run(
      `DELETE FROM iGM_Sessions WHERE iGM_UserId = ? AND iGM_Id != ?`,
      [userId, exceptIdHash],
    );
    return result.changes;
  }
  const result = iGM_Db.run(
    `DELETE FROM iGM_Sessions WHERE iGM_UserId = ?`,
    [userId],
  );
  return result.changes;
}

/** 清理全部已过期会话 */
export function iGM_DeleteExpiredSessions(now: string): number {
  const result = iGM_Db.run(
    `DELETE FROM iGM_Sessions WHERE iGM_ExpiresAt <= ?`,
    [now],
  );
  return result.changes;
}

// 导出 //
export default {
  iGM_CreateSession,
  iGM_FindSession,
  iGM_DeleteSession,
  iGM_DeleteSessionsByUser,
  iGM_DeleteExpiredSessions,
};
