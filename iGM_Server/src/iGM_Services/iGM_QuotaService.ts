/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_QuotaService.ts
 * 模块：iGM_QuotaService
 * 作用：UQ / Coin 双币种计费核心逻辑
 * 说明：
 *   - 优先扣除 UQ，UQ 余额不足时自动扣除 Coin
 *   - 高峰/非高峰时段 Coin 单价不同（非高峰 × 1.5 = 高峰）
 *   - 所有余额、消耗、流水统一 3 位小数
 *   - 余额变动 + 流水写入必须在同一事务内（防并发竞态）
 */

// 导入依赖 //
import { iGM_Db } from "../iGM_Database/iGM_Database";
import { iGM_Config } from "../iGM_Config/iGM_Config";
import {
  iGM_InsertQuotaTransaction,
  iGM_LockUserQuotaBalances,
  iGM_UpdateUserQuotaBalance,
  iGM_UserQuotaBalances,
  iGM_GetUserQuotaBalances,
  iGM_ListQuotaTransactionsPage,
  iGM_CountQuotaTransactions,
} from "../iGM_Repositories/iGM_QuotaRepository";
import type {
  iGM_AICallStatsRange,
  iGM_AIChargePeriod,
  iGM_AIChargeReason,
  iGM_AICallStatsResult,
  iGM_QuotaChannel,
} from "../iGM_Types/iGM_Quota";
import { iGM_DetermineChargePeriod, iGM_Round3, iGM_CoinRate } from "../iGM_Types/iGM_Quota";
import {
  iGM_CountQuotaCallsSince,
  iGM_ListTopQuotaUsers,
  iGM_SumQuotaConsumedSince,
} from "../iGM_Repositories/iGM_QuotaRepository";

// 类型定义 //
/** 额度业务错误：message 为前端 i18n 文案键，status 为 HTTP 状态码 */
export class iGM_QuotaError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "iGM_QuotaError";
  }
}

/** 扣费入参 */
export interface iGM_ChargeParams {
  userId: string;
  reason: iGM_AIChargeReason;
  /** 当次消耗的 token 数（仅回答时有值） */
  completionTokens?: number;
  /** 调用时间（默认当前） */
  now?: Date;
}

/** 扣费结果 */
export interface iGM_ChargeResult {
  /** 实际扣除的币种（uq / coin） */
  channel: iGM_QuotaChannel;
  /** 扣费金额（正数） */
  amount: number;
  /** 扣费后余额 */
  balanceAfter: number;
  /** 扣费时段 */
  period: iGM_AIChargePeriod;
  /** 计费说明（流水备注） */
  detail: string;
}

// 常量 //
/** 非高峰单价：输入 3 / 百万 token，输出 8 / 百万 token */
const iGM_QuestionCost = 0.02; // 固定：每次提问扣 0.02 UQ / 0.02 Coin（按币种）

// 辅助 //
function iGM_FmtNumber(v: number): string {
  return v.toFixed(3);
}

// ====== 公开 API ======

/**
 * 扣费入口：优先扣 UQ，不足时自动扣 Coin。
 * 返回实际扣费结果（含时段、金额、币种、备注）。
 * 余额都不足时抛 iGM_QuotaError(402)。
 */
export async function iGM_Charge(params: iGM_ChargeParams): Promise<iGM_ChargeResult> {
  const now = params.now ?? new Date();
  const nowIso = now.toISOString();
  const period = iGM_DetermineChargePeriod(now);
  const isQuestion = params.reason === "normal" && !params.completionTokens;
  const isAnswer = !!params.completionTokens;

  // 1. 计算本次应扣金额（按币种）
  let uqCost = 0;
  let coinCost = 0;

  if (isQuestion) {
    // 提问：固定 0.02（UQ 或 Coin 按实际扣款币种折算）
    uqCost = iGM_Round3(iGM_QuestionCost);
    coinCost = iGM_Round3(iGM_QuestionCost);
  } else if (isAnswer) {
    // 回答：按 token × 单价 × 时段倍率
    const tokens = params.completionTokens!;
    const pricePerMillion = period === "peak"
      ? iGM_CoinRate.peak.outputPerMillion
      : iGM_CoinRate.nonpeak.outputPerMillion;
    coinCost = iGM_Round3((tokens / 1_000_000) * pricePerMillion);
    // UQ 免费回答（不额外扣费；如需按 token 计费可在此扩展）
    uqCost = 0;
  } else {
    // timeout / truncated / stopped：按已生成的 completionTokens 扣费
    const tokens = params.completionTokens ?? 0;
    const pricePerMillion = period === "peak"
      ? iGM_CoinRate.peak.outputPerMillion
      : iGM_CoinRate.nonpeak.outputPerMillion;
    coinCost = iGM_Round3((tokens / 1_000_000) * pricePerMillion);
    uqCost = 0;
  }

  // 2. 在事务内扣余额 + 写流水
  const trx = await iGM_Db.transaction();
  const bal = await iGM_LockUserQuotaBalances(params.userId);
  if (!bal) {
    throw new iGM_QuotaError(404, "auth.errors.accountNotFound");
  }

  let result: iGM_ChargeResult;
  const periodLabel = period === "peak" ? "高峰" : "非高峰";
  const reasonLabel: Record<iGM_AIChargeReason, string> = {
    normal: "正常扣费",
    timeout: "超时中断，按已生成内容扣费",
    truncated: "超字数截断，按已生成内容扣费",
    stopped: "用户手动停止，按已生成内容扣费",
  };

  if (bal.uq >= uqCost && uqCost > 0) {
    // 优先扣 UQ
    const newUq = iGM_Round3(bal.uq - uqCost);
    await iGM_UpdateUserQuotaBalance("uq", params.userId, newUq, nowIso);
    await iGM_InsertQuotaTransaction("uq", {
      userId: params.userId,
      type: isQuestion ? "chat_question" : "chat_answer",
      amount: -uqCost,
      balanceAfter: newUq,
      detail: `${reasonLabel[params.reason]}（${periodLabel}）`,
      createdAt: nowIso,
    });
    result = {
      channel: "uq",
      amount: uqCost,
      balanceAfter: newUq,
      period,
      detail: `${reasonLabel[params.reason]}（UQ ${periodLabel}）`,
    };
  } else if (bal.coin >= coinCost) {
    // UQ 不足，扣 Coin
    const newCoin = iGM_Round3(bal.coin - coinCost);
    await iGM_UpdateUserQuotaBalance("coin", params.userId, newCoin, nowIso);
    await iGM_InsertQuotaTransaction("coin", {
      userId: params.userId,
      type: isQuestion ? "chat_question" : "chat_answer",
      amount: -coinCost,
      balanceAfter: newCoin,
      detail: `${reasonLabel[params.reason]}（${periodLabel}）`,
      createdAt: nowIso,
    });
    result = {
      channel: "coin",
      amount: coinCost,
      balanceAfter: newCoin,
      period,
      detail: `${reasonLabel[params.reason]}（Coin ${periodLabel}）`,
    };
  } else {
    await trx.rollback();
    throw new iGM_QuotaError(402, "ai.errors.quotaInsufficient");
  }

  await trx.commit();
  return result;
}

/** 为新用户写入注册赠送流水（10 UQ + 5 Coin） */
export async function iGM_GrantRegisterGifts(userId: string, nowIso: string): Promise<void> {
  // 直接用默认值（列 DEFAULT 已生效），读出来写流水即可
  const bal = await iGM_GetUserQuotaBalances(userId);
  if (!bal) return;
  const gifts: Array<{ channel: iGM_QuotaChannel; amount: number; label: string }> = [
    { channel: "uq", amount: iGM_Config.ai.uqRegisterGift, label: "UQ 常规额度" },
    { channel: "coin", amount: iGM_Config.ai.coinRegisterGift, label: "Coin 社区币" },
  ];
  for (const g of gifts) {
    const balAfter = g.channel === "uq"
      ? iGM_Round3((bal.uq ?? 0) + g.amount)
      : iGM_Round3((bal.coin ?? 0) + g.amount);
    await iGM_InsertQuotaTransaction(g.channel, {
      userId,
      type: "register",
      amount: g.amount,
      balanceAfter: balAfter,
      detail: `新用户注册赠送 ${g.label}`,
      createdAt: nowIso,
    });
  }
}

/**
 * 管理后台双币种统计（按时间范围聚合）
 */
export async function iGM_GetAdminStats(
  range: iGM_AICallStatsRange,
): Promise<iGM_AICallStatsResult> {
  const now = new Date();
  let since: Date;
  switch (range) {
    case "day":   since = new Date(now.getTime() - 24 * 3600 * 1000); break;
    case "week":  since = new Date(now.getTime() - 7 * 24 * 3600 * 1000); break;
    case "month": since = new Date(now.getTime() - 30 * 24 * 3600 * 1000); break;
  }
  const sinceIso = since.toISOString();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  const [uqCalls, uqConsumed, uqToday, coinCalls, coinConsumed, coinToday, topUq, topCoin] = await Promise.all([
    iGM_CountQuotaCallsSince("uq", sinceIso),
    iGM_SumQuotaConsumedSince("uq", sinceIso),
    iGM_SumQuotaConsumedSince("uq", todayStart),
    iGM_CountQuotaCallsSince("coin", sinceIso),
    iGM_SumQuotaConsumedSince("coin", sinceIso),
    iGM_SumQuotaConsumedSince("coin", todayStart),
    iGM_ListTopQuotaUsers("uq", sinceIso, 10),
    iGM_ListTopQuotaUsers("coin", sinceIso, 10),
  ]);

  return {
    range,
    uq: { totalCalls: uqCalls, totalConsumed: iGM_Round3(uqConsumed), todayConsumed: iGM_Round3(uqToday) },
    coin: { totalCalls: coinCalls, totalConsumed: iGM_Round3(coinConsumed), todayConsumed: iGM_Round3(coinToday) },
    topUqUsers: topUq.map(r => ({
      userId: r.iGM_UserId, username: r.iGM_Username, displayName: r.iGM_DisplayName,
      consumed: iGM_Round3(Number(r.iGM_Consumed)), calls: r.iGM_Calls,
    })),
    topCoinUsers: topCoin.map(r => ({
      userId: r.iGM_UserId, username: r.iGM_Username, displayName: r.iGM_DisplayName,
      consumed: iGM_Round3(Number(r.iGM_Consumed)), calls: r.iGM_Calls,
    })),
  };
}

// 导出 //
export default {
  iGM_Charge,
  iGM_GrantRegisterGifts,
  iGM_GetAdminStats,
};

/** 查询某用户指定币种余额（用于 GET /G_AI/balance） */
export async function iGM_GetAIInfoService(
  userId: string,
  channel: iGM_QuotaChannel,
): Promise<number> {
  const bal = await iGM_GetUserQuotaBalances(userId);
  if (!bal) return 0;
  return iGM_Round3(channel === "uq" ? bal.uq : bal.coin);
}

/** 分页查询某用户指定币种流水（用于 GET /G_AI/uq-transactions、/G_AI/coin-transactions） */
export async function iGM_GetQuotaTransactionsService(
  channel: iGM_QuotaChannel,
  userId: string,
  pageStr?: string,
  pageSizeStr?: string,
) {
  const page = Math.max(1, Number(pageStr ?? 1));
  const pageSize = Math.min(50, Math.max(1, Number(pageSizeStr ?? 20)));
  const offset = (page - 1) * pageSize;
  const [rows, total] = await Promise.all([
    iGM_ListQuotaTransactionsPage(channel, userId, pageSize, offset),
    iGM_CountQuotaTransactions(channel, userId),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.iGM_Id,
      type: iGM_IsQuotaTransactionType(r.iGM_Type) ? r.iGM_Type : "reward",
      amount: iGM_Round3(Number(r.iGM_Amount)),
      balanceAfter: iGM_Round3(Number(r.iGM_BalanceAfter)),
      detail: r.iGM_Detail,
      createdAt: r.iGM_CreatedAt,
    })),
    total,
    page,
    pageSize,
  };
}
