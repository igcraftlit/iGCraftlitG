/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_OnlineUserRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_Realtime
 * 模块：iGM_OnlineUserRepository
 * 作用：在线用户连接表（iGM_OnlineUsers）的唯一数据访问出口
 * 内容：连接登记、心跳更新、按连接删除、超时连接清理、在线用户联表查询
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import { iGM_RandomUuid } from "../iGM_Services/iGM_SecurityService";

// 类型定义 //
/** iGM_OnlineUsers 表数据行 */
export interface iGM_OnlineUserRow {
  iGM_Id: string;
  iGM_UserId: string;
  iGM_ConnectionId: string;
  iGM_ConnectedAt: string;
  iGM_LastHeartbeat: string;
  iGM_IpAddress: string | null;
  iGM_UserAgent: string | null;
}

/** 在线用户联表（iGM_Users）后的公开信息行 */
export interface iGM_OnlineUserJoinedRow {
  iGM_UserId: string;
  iGM_Username: string;
  iGM_DisplayName: string | null;
  iGM_Avatar: string | null;
  iGM_VerifiedOrgId: string | null;
  iGM_Email: string;
  iGM_ConnectedAt: string;
}

// 核心逻辑 //
/** 登记一条新的在线连接 */
export async function iGM_InsertOnlineUser(input: {
  userId: string;
  connectionId: string;
  now: string;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<iGM_OnlineUserRow> {
  const row: iGM_OnlineUserRow = {
    iGM_Id: iGM_RandomUuid(),
    iGM_UserId: input.userId,
    iGM_ConnectionId: input.connectionId,
    iGM_ConnectedAt: input.now,
    iGM_LastHeartbeat: input.now,
    iGM_IpAddress: input.ipAddress,
    iGM_UserAgent: input.userAgent,
  };
  await iGM_Db.run(
    `INSERT INTO iGM_OnlineUsers
       (iGM_Id, iGM_UserId, iGM_ConnectionId, iGM_ConnectedAt, iGM_LastHeartbeat, iGM_IpAddress, iGM_UserAgent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      row.iGM_Id,
      row.iGM_UserId,
      row.iGM_ConnectionId,
      row.iGM_ConnectedAt,
      row.iGM_LastHeartbeat,
      row.iGM_IpAddress,
      row.iGM_UserAgent,
    ],
  );
  return row;
}

/** 更新某连接的心跳时间 */
export async function iGM_TouchOnlineUser(connectionId: string, now: string): Promise<void> {
  await iGM_Db.run(
    `UPDATE iGM_OnlineUsers SET iGM_LastHeartbeat = ? WHERE iGM_ConnectionId = ?`,
    [now, connectionId],
  );
}

/** 按连接 ID 删除在线记录（断开连接时调用），返回是否删除成功 */
export async function iGM_DeleteOnlineUserByConnection(connectionId: string): Promise<boolean> {
  const result = await iGM_Db.run(
    `DELETE FROM iGM_OnlineUsers WHERE iGM_ConnectionId = ?`,
    [connectionId],
  );
  return result.changes > 0;
}

/** 清理心跳超时（早于 cutoff）的连接记录，返回被清理的连接 ID 列表 */
export async function iGM_DeleteStaleOnlineUsers(cutoffIso: string): Promise<string[]> {
  const stale = (await iGM_Db
    .query(
      `SELECT iGM_ConnectionId FROM iGM_OnlineUsers WHERE iGM_LastHeartbeat < ?`,
    )
    .all(cutoffIso)) as { iGM_ConnectionId: string }[];
  if (stale.length === 0) return [];
  const placeholders = stale.map(() => "?").join(", ");
  await iGM_Db.run(
    `DELETE FROM iGM_OnlineUsers WHERE iGM_ConnectionId IN (${placeholders})`,
    stale.map((row) => row.iGM_ConnectionId),
  );
  return stale.map((row) => row.iGM_ConnectionId);
}

/**
 * 查询当前在线用户的公开信息（按用户去重，取最早连接时间）
 * 仅返回头像、用户名、昵称与认证组织 ID，绝不返回敏感字段
 */
export async function iGM_ListOnlineUsers(): Promise<iGM_OnlineUserJoinedRow[]> {
  return (await iGM_Db
    .query(
      // 说明：PostgreSQL 要求聚合查询中被选取的非聚合列出现在 GROUP BY 中，
      //       且不允许仅凭 JOIN 相等条件推断函数依赖（SQLite 允许任意取行），
      //       故按 iGM_Users 主键分组——分组口径与按 o.iGM_UserId 等价
      `SELECT u.iGM_Id AS iGM_UserId,
              u.iGM_Username,
              u.iGM_DisplayName,
              u.iGM_Avatar,
              u.iGM_VerifiedOrgId,
              u.iGM_Email,
              MIN(o.iGM_ConnectedAt) AS iGM_ConnectedAt
         FROM iGM_OnlineUsers o
         JOIN iGM_Users u ON u.iGM_Id = o.iGM_UserId
        WHERE u.iGM_Status = 'active'
        GROUP BY u.iGM_Id
        ORDER BY iGM_ConnectedAt ASC`,
    )
    .all()) as iGM_OnlineUserJoinedRow[];
}

/** 统计当前在线连接总数 */
export async function iGM_CountOnlineConnections(): Promise<number> {
  const row = (await iGM_Db
    .query(`SELECT COUNT(*) AS total FROM iGM_OnlineUsers`)
    .get()) as { total: number };
  return row.total;
}

// 导出 //
export default {
  iGM_InsertOnlineUser,
  iGM_TouchOnlineUser,
  iGM_DeleteOnlineUserByConnection,
  iGM_DeleteStaleOnlineUsers,
  iGM_ListOnlineUsers,
  iGM_CountOnlineConnections,
};
