/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_QuotaRepository.ts
 * 模块：iGM_QuotaRepository
 * 作用：UQ / Coin 双币种余额列与流水表的唯一数据访问出口
 * 说明：AI 功能模块已整体移除，此处仅保留账户余额读取与流水写入
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import { iGM_RandomUuid } from "../iGM_Services/iGM_SecurityService";
import type { iGM_QuotaChannel } from "../iGM_Types/iGM_Quota";

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

// 导出 //
export default {
  iGM_GetUserQuotaBalances,
  iGM_InsertQuotaTransaction,
};
