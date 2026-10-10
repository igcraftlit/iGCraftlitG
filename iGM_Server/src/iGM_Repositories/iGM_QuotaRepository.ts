/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_QuotaRepository.ts
 * 模块：iGM_QuotaRepository
 * 作用：UQ / Coin 双币种流水表与用户双余额列的唯一数据访问出口
 * 说明：两张流水表同构，通过内部常量参数化复用同一组 SQL；
 *       余额变动必须由业务层放在事务内调用（锁读 → 更新 → 写流水）
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import { iGM_RandomUuid } from "../iGM_Services/iGM_SecurityService";
import type {
  iGM_AICallStatsUserRow,
  iGM_QuotaChannel,
  iGM_QuotaTransactionRow,
} from "../iGM_Types/iGM_Quota";

// 类型定义 //
export interface iGM_InsertQuotaTransactionParams {
  userId: string;
  type: string;
  amount: number;
  balanceAfter: number;
  detail: string;
  createdAt: string;
}

export interface iGM_UserQuotaBalances {
  uq: number;
  coin: number;
}

// 核心逻辑 //
/** 币种 → 流水表名（内部常量，仅用于 SQL 拼接） */
const iGM_QuotaTableNames: Record<iGM_QuotaChannel, string> = {
  uq: "iGM_UQTransactions",
  coin: "iGM_CoinTransactions",
};

/** 币种 → 用户余额列名 */
const iGM_QuotaColumnNames: Record<iGM_QuotaChannel, string> = {
  uq: "iGM_UqBalance",
  coin: "iGM_CoinBalance",
};

/** numeric / 字符串统一转数字 */
function iGM_ToNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** 读取用户双余额（用户不存在返回 null） */
export async function iGM_GetUserQuotaBalances(
  userId: string,
): Promise<iGM_UserQuotaBalances | null> {
  const row = (await iGM_Db
    .query(
      `SELECT iGM_UqBalance, iGM_CoinBalance FROM iGM_Users WHERE iGM_Id = ?`,
    )
    .get(userId)) as
    | { iGM_UqBalance: string | number; iGM_CoinBalance: string | number }
    | undefined;
  return row
    ? {
        uq: iGM_ToNumber(row.iGM_UqBalance),
        coin: iGM_ToNumber(row.iGM_CoinBalance),
      }
    : null;
}

/** 行级锁读取（必须在事务内调用） */
export async function iGM_LockUserQuotaBalances(
  userId: string,
): Promise<iGM_UserQuotaBalances | null> {
  const row = (await iGM_Db
    .query(
      `SELECT iGM_UqBalance, iGM_CoinBalance FROM iGM_Users WHERE iGM_Id = ? FOR UPDATE`,
    )
    .get(userId)) as
    | { iGM_UqBalance: string | number; iGM_CoinBalance: string | number }
    | undefined;
  return row
    ? {
        uq: iGM_ToNumber(row.iGM_UqBalance),
        coin: iGM_ToNumber(row.iGM_CoinBalance),
      }
    : null;
}

/** 更新指定币种余额 */
export async function iGM_UpdateUserQuotaBalance(
  channel: iGM_QuotaChannel,
  userId: string,
  balance: number,
  updatedAt?: string,
): Promise<void> {
  await iGM_Db.run(
    `UPDATE iGM_Users SET ${iGM_QuotaColumnNames[channel]} = ?, iGM_UpdatedAt = ? WHERE iGM_Id = ?`,
    [balance, updatedAt ?? new Date().toISOString(), userId],
  );
}

/** 写入一条流水 */
export async function iGM_InsertQuotaTransaction(
  channel: iGM_QuotaChannel,
  p: iGM_InsertQuotaTransactionParams,
): Promise<void> {
  await iGM_Db.run(
    `INSERT INTO ${iGM_QuotaTableNames[channel]}
       (iGM_Id, iGM_UserId, iGM_Type, iGM_Amount, iGM_BalanceAfter, iGM_Detail, iGM_CreatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      iGM_RandomUuid(),
      p.userId,
      p.type,
      p.amount,
      p.balanceAfter,
      p.detail,
      p.createdAt,
    ],
  );
}

/** 时间范围内调用次数（提问条数） */
export async function iGM_CountQuotaCallsSince(
  channel: iGM_QuotaChannel,
  sinceIso: string,
): Promise<number> {
  const row = (await iGM_Db
    .query(
      `SELECT COUNT(*) AS iGM_Total
         FROM ${iGM_QuotaTableNames[channel]}
        WHERE iGM_Type = 'chat_question'
          AND iGM_CreatedAt >= ?`,
    )
    .get(sinceIso)) as { iGM_Total: number };
  return row.iGM_Total;
}

/** 时间范围内消耗总额 */
export async function iGM_SumQuotaConsumedSince(
  channel: iGM_QuotaChannel,
  sinceIso: string,
): Promise<number> {
  const row = (await iGM_Db
    .query(
      `SELECT COALESCE(SUM(-iGM_Amount), 0) AS iGM_Total
         FROM ${iGM_QuotaTableNames[channel]}
        WHERE iGM_Type IN ('chat_question', 'chat_answer')
          AND iGM_CreatedAt >= ?`,
    )
    .get(sinceIso)) as { iGM_Total: string | number };
  return iGM_ToNumber(row.iGM_Total);
}

/** 时间范围内 Top N 消耗用户 */
export async function iGM_ListTopQuotaUsers(
  channel: iGM_QuotaChannel,
  sinceIso: string,
  limit: number,
): Promise<iGM_AICallStatsUserRow[]> {
  return (await iGM_Db
    .query(
      `SELECT t.iGM_UserId,
              u.iGM_Username,
              u.iGM_DisplayName,
              SUM(-t.iGM_Amount) AS iGM_Consumed,
              COUNT(*) FILTER (WHERE t.iGM_Type = 'chat_question') AS iGM_Calls
         FROM ${iGM_QuotaTableNames[channel]} t
         JOIN iGM_Users u ON u.iGM_Id = t.iGM_UserId
        WHERE t.iGM_Type IN ('chat_question', 'chat_answer')
          AND t.iGM_CreatedAt >= ?
        GROUP BY t.iGM_UserId, u.iGM_Username, u.iGM_DisplayName
        ORDER BY iGM_Consumed DESC
        LIMIT ?`,
    )
    .all(sinceIso, limit)) as iGM_AICallStatsUserRow[];
}

/** 统计某用户流水总条数 */
export async function iGM_CountQuotaTransactions(
  channel: iGM_QuotaChannel,
  userId: string,
): Promise<number> {
  const row = (await iGM_Db
    .query(
      `SELECT COUNT(*) AS iGM_Total
         FROM ${iGM_QuotaTableNames[channel]}
        WHERE iGM_UserId = ?`,
    )
    .get(userId)) as { iGM_Total: number };
  return row.iGM_Total;
}

/** 分页查询用户流水（时间倒序） */
export async function iGM_ListQuotaTransactionsPage(
  channel: iGM_QuotaChannel,
  userId: string,
  limit: number,
  offset: number,
): Promise<iGM_QuotaTransactionRow[]> {
  return (await iGM_Db
    .query(
      `SELECT * FROM ${iGM_QuotaTableNames[channel]}
        WHERE iGM_UserId = ?
        ORDER BY iGM_CreatedAt DESC, iGM_Id DESC
        LIMIT ? OFFSET ?`,
    )
    .all(userId, limit, offset)) as iGM_QuotaTransactionRow[];
}

// 导出 //
export default {
  iGM_GetUserQuotaBalances,
  iGM_LockUserQuotaBalances,
  iGM_UpdateUserQuotaBalance,
  iGM_InsertQuotaTransaction,
  iGM_CountQuotaCallsSince,
  iGM_SumQuotaConsumedSince,
  iGM_ListTopQuotaUsers,
  iGM_CountQuotaTransactions,
  iGM_ListQuotaTransactionsPage,
};
