/**
 * 文件路径：iGM_Server/src/iGM_Repositories/iGM_QuotaRepository.ts
 * 所属层：后端 / 数据访问层
 * 路由：G_AI、G_Admin
 * 模块：iGM_QuotaRepository
 * 作用：UPR / SPR 流水表与用户双余额列的唯一数据访问出口（AI 赋能系统模块三 / 模块四）
 * 内容：双余额读取（普通 / 行级锁）、双余额更新、流水写入、流水数量统计、
 *       流水按时间倒序分页查询、双通道统计聚合
 * 说明：两张流水表同构，通过内部表名 / 列名常量参数化复用同一组 SQL
 *       （常量仅为内部字面量，不含外部输入，无注入风险）；
 *       numeric 列由 PostgreSQL 驱动返回字符串，统一经 iGM_ToNumber 转为数字；
 *       余额变动必须由业务层放在事务内调用（锁读 → 更新 → 写流水）
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import { iGM_RandomUuid } from "../iGM_Services/iGM_SecurityService";
import type {
  iGM_AICallStatsUserRow,
  iGM_QuotaChannel,
  iGM_QuotaTransactionRow,
  iGM_QuotaTransactionType,
} from "../iGM_Types/iGM_Quota";

// 类型定义 //
/** 写入一条额度流水的入参 */
export interface iGM_InsertQuotaTransactionParams {
  userId: string;
  type: iGM_QuotaTransactionType;
  /** 变动值：正数为增加、负数为消耗 */
  amount: number;
  /** 变动后余额 */
  balanceAfter: number;
  detail: string;
  createdAt: string;
}

/** 用户双余额 */
export interface iGM_UserQuotaBalances {
  upr: number;
  spr: number;
}

// 核心逻辑 //
/** 额度通道 → 流水表名（内部常量，仅用于 SQL 拼接） */
const iGM_QuotaTableNames: Record<iGM_QuotaChannel, string> = {
  upr: "iGM_UPRTransactions",
  spr: "iGM_SPRTransactions",
};

/** 额度通道 → 用户余额列名（内部常量，仅用于 SQL 拼接） */
const iGM_QuotaColumnNames: Record<iGM_QuotaChannel, string> = {
  upr: "iGM_UprBalance",
  spr: "iGM_SprBalance",
};

/** 额度通道 → 调用次数口径的流水类型（UPR 按提问、SPR 按回答） */
const iGM_QuotaCallTypes: Record<iGM_QuotaChannel, string> = {
  upr: "chat_question",
  spr: "chat_answer",
};

/** numeric / 字符串统一转数字（无效值按 0 兜底） */
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
      `SELECT iGM_UprBalance, iGM_SprBalance FROM iGM_Users WHERE iGM_Id = ?`,
    )
    .get(userId)) as
    | { iGM_UprBalance: string | number; iGM_SprBalance: string | number }
    | undefined;
  return row
    ? {
        upr: iGM_ToNumber(row.iGM_UprBalance),
        spr: iGM_ToNumber(row.iGM_SprBalance),
      }
    : null;
}

/**
 * 行级锁读取用户双余额（防并发竞态）。
 * 必须在事务内调用，锁持有至事务提交
 */
export async function iGM_LockUserQuotaBalances(
  userId: string,
): Promise<iGM_UserQuotaBalances | null> {
  const row = (await iGM_Db
    .query(
      `SELECT iGM_UprBalance, iGM_SprBalance FROM iGM_Users WHERE iGM_Id = ? FOR UPDATE`,
    )
    .get(userId)) as
    | { iGM_UprBalance: string | number; iGM_SprBalance: string | number }
    | undefined;
  return row
    ? {
        upr: iGM_ToNumber(row.iGM_UprBalance),
        spr: iGM_ToNumber(row.iGM_SprBalance),
      }
    : null;
}

/** 更新用户指定通道余额（同时刷新用户更新时间） */
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

/** 写入一条额度变动流水 */
export async function iGM_InsertQuotaTransaction(
  channel: iGM_QuotaChannel,
  params: iGM_InsertQuotaTransactionParams,
): Promise<void> {
  await iGM_Db.run(
    `INSERT INTO ${iGM_QuotaTableNames[channel]}
       (iGM_Id, iGM_UserId, iGM_Type, iGM_Amount, iGM_BalanceAfter, iGM_Detail, iGM_CreatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      iGM_RandomUuid(),
      params.userId,
      params.type,
      params.amount,
      params.balanceAfter,
      params.detail,
      params.createdAt,
    ],
  );
}

/** 时间范围内调用次数（UPR 按提问条数 / SPR 按回答条数） */
export async function iGM_CountQuotaCallsSince(
  channel: iGM_QuotaChannel,
  sinceIso: string,
): Promise<number> {
  const row = (await iGM_Db
    .query(
      `SELECT COUNT(*) AS iGM_Total
         FROM ${iGM_QuotaTableNames[channel]}
        WHERE iGM_Type = '${iGM_QuotaCallTypes[channel]}'
          AND iGM_CreatedAt >= ?`,
    )
    .get(sinceIso)) as { iGM_Total: number };
  return row.iGM_Total;
}

/** 时间范围内消耗额度总额（提问 + 回答扣费绝对值之和） */
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

/** 时间范围内消耗 Top N 用户（附用户名 / 昵称与调用次数） */
export async function iGM_ListTopQuotaUsers(
  channel: iGM_QuotaChannel,
  sinceIso: string,
  limit: number,
): Promise<iGM_AICallStatsUserRow[]> {
  return (await iGM_Db
    .query(
      `SELECT t.iGM_UserId   AS iGM_UserId,
              u.iGM_Username AS iGM_Username,
              u.iGM_DisplayName AS iGM_DisplayName,
              SUM(-t.iGM_Amount) AS iGM_Consumed,
              COUNT(*) FILTER (WHERE t.iGM_Type = '${iGM_QuotaCallTypes[channel]}') AS iGM_Calls
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

/** 统计某用户某通道流水总条数（分页元数据） */
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

/**
 * 分页查询某用户某通道流水（时间倒序）。
 * 同一毫秒内多笔流水按主键倒序兜底，保证分页翻页结果稳定
 */
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