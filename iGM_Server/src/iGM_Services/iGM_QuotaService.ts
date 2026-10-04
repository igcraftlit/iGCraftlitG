/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_QuotaService.ts
 * 所属层：后端 / 业务服务层
 * 路由：G_AI、G_Auth、G_Admin
 * 模块：iGM_QuotaService
 * 作用：UPR / SPR 双额度体系业务——双余额查询、注册赠送、通用授予、提问 / 回答扣费、
 *       SPR 充值入账、UPR 流水分页查询、管理后台双通道调用统计
 *       （AI 赋能系统模块三 / 模块四）
 * 内容：业务错误类型、金额精度归一、余额变动（行级锁 + 事务）、流水记录、
 *       UPR 流水分页查询、双通道统计聚合（调用次数 / 消耗 / 当日消耗 / 收入 / Top 10 用户）
 * 说明：
 *   - 扣费统一在事务内按「行级锁读取余额 → 更新余额 → 写流水」执行，避免并发竞态；
 *   - UPR：提问固定扣 0.02（余额不足 402），回答按 completion_tokens 计费
 *     （允许扣成负数，下次提问被拦截）；
 *   - SPR：Premium 通道提问前要求余额为正（不足 402），流结束后按实测 token
 *     消耗计费（输入 / 输出分别计价并加 15% 利润），允许扣成负数；
 *   - 金额一律四舍五入到 4 位小数（与 NUMERIC(14,4) 精度一致）。
 */

// 导入依赖 //
import { iGM_Config } from "../iGM_Config/iGM_Config";
import { iGM_Db } from "../iGM_Database/iGM_Database";
import {
  iGM_CountQuotaCallsSince,
  iGM_CountQuotaTransactions,
  iGM_GetUserQuotaBalances,
  iGM_InsertQuotaTransaction,
  iGM_ListQuotaTransactionsPage,
  iGM_ListTopQuotaUsers,
  iGM_LockUserQuotaBalances,
  iGM_SumQuotaConsumedSince,
  iGM_UpdateUserQuotaBalance,
} from "../iGM_Repositories/iGM_QuotaRepository";
import {
  iGM_IsQuotaTransactionType,
  type iGM_AIChargeReason,
  type iGM_AICallStatsRange,
  type iGM_AICallStatsResult,
  type iGM_AICallStatsUser,
  type iGM_AICallStatsUserRow,
  type iGM_AIInfoResult,
  type iGM_QuotaChannel,
  type iGM_QuotaTransactionDto,
  type iGM_QuotaTransactionPageResult,
  type iGM_QuotaTransactionRow,
  type iGM_QuotaTransactionType,
} from "../iGM_Types/iGM_Quota";

// 类型定义 //
/** 业务错误：message 为前端 i18n 文案键，status 为 HTTP 状态码 */
export class iGM_QuotaError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "iGM_QuotaError";
  }
}

/** 单次余额变动入参 */
interface iGM_ApplyQuotaChangeParams {
  userId: string;
  /** 变动通道：upr 更新 UPR 余额 / spr 更新 SPR 余额 */
  channel: iGM_QuotaChannel;
  type: iGM_QuotaTransactionType;
  /** 变动值：正数为增加、负数为消耗 */
  amount: number;
  detail: string;
  createdAt: string;
  /** 变动后余额下限：低于该值直接拒绝（不传表示允许扣成负数） */
  minBalanceAfter?: number;
  /** 余额不足时抛出的文案键（UPR / SPR 各有专属提示） */
  insufficientKey: string;
}

// 核心逻辑 //
/** 金额精度归一（NUMERIC(14,4)） */
function iGM_RoundQuota(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** 回答扣费流水前缀：正常 / 回答超时 / 超字数截断 / 用户手动停止（保证异常扣费可追溯） */
function iGM_ChargeReasonPrefix(reason: iGM_AIChargeReason): string {
  if (reason === "timeout") return "回答超时扣费";
  if (reason === "truncated") return "超字数截断扣费";
  if (reason === "stopped") return "用户手动停止，按已生成内容扣费";
  return "AI 回答扣费";
}

/** numeric / 字符串统一转数字（无效值按 0 兜底，流水出参用） */
function iGM_ToQuotaNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * 应用一次额度余额变动（必须在外层事务内调用）：
 * 行级锁读取双余额 → 计算目标通道新余额（可校验下限）→ 写余额 → 写流水 → 返回新余额
 */
async function iGM_ApplyQuotaChange(
  params: iGM_ApplyQuotaChangeParams,
): Promise<number> {
  const balances = await iGM_LockUserQuotaBalances(params.userId);
  if (balances === null) {
    throw new iGM_QuotaError("ai.errors.quotaUserNotFound", 404);
  }
  const current = params.channel === "upr" ? balances.upr : balances.spr;
  const balance = iGM_RoundQuota(current + params.amount);
  if (params.minBalanceAfter !== undefined && balance < params.minBalanceAfter) {
    throw new iGM_QuotaError(params.insufficientKey, 402);
  }
  await iGM_UpdateUserQuotaBalance(
    params.channel,
    params.userId,
    balance,
    params.createdAt,
  );
  await iGM_InsertQuotaTransaction(params.channel, {
    userId: params.userId,
    type: params.type,
    amount: iGM_RoundQuota(params.amount),
    balanceAfter: balance,
    detail: params.detail,
    createdAt: params.createdAt,
  });
  return balance;
}

/**
 * 双余额与模型信息查询（对外展示）：
 * freeModel / premiumModel 供界面「模型信息」按钮按通道展示
 */
export async function iGM_GetAIInfoService(
  userId: string,
): Promise<iGM_AIInfoResult> {
  const balances = await iGM_GetUserQuotaBalances(userId);
  return {
    uprBalance: iGM_RoundQuota(balances?.upr ?? 0),
    sprBalance: iGM_RoundQuota(balances?.spr ?? 0),
    freeModel: iGM_Config.ai.free.model,
    premiumModel: iGM_Config.ai.premium.model,
  };
}

/**
 * UPR 注册赠送（独立事务）：写入 register 流水。
 * 说明：赠送额度由 iGM_Users.iGM_UprBalance 列默认值直接携带（默认 10 UPR），
 *       本函数在注册流程中补记流水，保证「所有额度变动可追溯」
 */
export async function iGM_GrantRegisterUPRService(
  userId: string,
  createdAt?: string,
): Promise<number> {
  const now = createdAt ?? new Date().toISOString();
  const gift = iGM_RoundQuota(iGM_Config.ai.uprRegisterGift);
  const grant = iGM_Db.transaction(async (): Promise<number> => {
    const balances = await iGM_LockUserQuotaBalances(userId);
    if (balances === null) {
      throw new iGM_QuotaError("ai.errors.quotaUserNotFound", 404);
    }
    await iGM_InsertQuotaTransaction("upr", {
      userId,
      type: "register",
      amount: gift,
      balanceAfter: iGM_RoundQuota(balances.upr),
      detail: `新用户注册免费赠送 ${gift} UPR`,
      createdAt: now,
    });
    return iGM_RoundQuota(balances.upr);
  });
  return await grant();
}

/**
 * UPR 通用授予（独立事务）：供官方账号额度补充 / 活动奖励等场景，
 * 写入 reward 流水，保证所有额度变动可追溯（AI 赋能系统模块四）
 */
export async function iGM_GrantUPRService(
  userId: string,
  amount: number,
  detail: string,
  createdAt?: string,
): Promise<number> {
  const value = iGM_RoundQuota(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw new iGM_QuotaError("ai.errors.generic", 400);
  }
  const now = createdAt ?? new Date().toISOString();
  const grant = iGM_Db.transaction(async (): Promise<number> =>
    iGM_ApplyQuotaChange({
      userId,
      channel: "upr",
      type: "reward",
      amount: value,
      detail: detail.trim().length > 0 ? detail : `UPR 奖励 ${value}`,
      createdAt: now,
      insufficientKey: "ai.errors.uprInsufficient",
    }),
  );
  return await grant();
}

/**
 * UPR 提问扣费（独立事务）：固定扣除 uprQuestionCost。
 * 余额不足（扣后为负）直接拒绝，前端提示「UPR 余额不足，可通过签到或活动获取。」
 */
export async function iGM_ChargeQuestionUPRService(
  userId: string,
  createdAt?: string,
): Promise<number> {
  const cost = iGM_RoundQuota(iGM_Config.ai.uprQuestionCost);
  const now = createdAt ?? new Date().toISOString();
  const charge = iGM_Db.transaction(async (): Promise<number> =>
    iGM_ApplyQuotaChange({
      userId,
      channel: "upr",
      type: "chat_question",
      amount: -cost,
      detail: `AI 提问扣费 ${cost} UPR`,
      createdAt: now,
      minBalanceAfter: 0,
      insufficientKey: "ai.errors.uprInsufficient",
    }),
  );
  return await charge();
}

/**
 * UPR 回答扣费：按 completion_tokens 计费（0.003 UPR / token）。
 * 必须由调用方放在事务内调用（与消息落库同一事务），允许扣成负数；
 * reason 用于流水备注，超时 / 截断扣费须明确标注
 */
export async function iGM_ChargeAnswerUPRService(
  userId: string,
  completionTokens: number,
  reason: iGM_AIChargeReason = "normal",
  createdAt?: string,
): Promise<number> {
  const cost = iGM_RoundQuota(completionTokens * iGM_Config.ai.uprTokenCost);
  const now = createdAt ?? new Date().toISOString();
  return await iGM_ApplyQuotaChange({
    userId,
    channel: "upr",
    type: "chat_answer",
    amount: -cost,
    detail: `${iGM_ChargeReasonPrefix(reason)}（${completionTokens} tokens × ${iGM_Config.ai.uprTokenCost} UPR）`,
    createdAt: now,
    insufficientKey: "ai.errors.uprInsufficient",
  });
}

/**
 * Premium 通道提问前校验（独立读取，不加锁）：
 * SPR 余额不足（≤ 0）直接拒绝，前端提示「SPR 余额不足，请前往充值。」
 */
export async function iGM_CheckSPRTalkAllowedService(
  userId: string,
): Promise<number> {
  const balances = await iGM_GetUserQuotaBalances(userId);
  if (balances === null) {
    throw new iGM_QuotaError("ai.errors.quotaUserNotFound", 404);
  }
  if (balances.spr <= 0) {
    throw new iGM_QuotaError("ai.errors.sprInsufficient", 402);
  }
  return iGM_RoundQuota(balances.spr);
}

/**
 * SPR 回答扣费：按 DeepSeek 实测 token 消耗计价并加 15% 利润
 * （输入 X 元/百万 + 输出 Y 元/百万；1 SPR = 1 元）。
 * 必须由调用方放在事务内调用（与消息落库同一事务），允许扣成负数
 */
export async function iGM_ChargeAnswerSPRService(
  userId: string,
  promptTokens: number,
  completionTokens: number,
  reason: iGM_AIChargeReason = "normal",
  createdAt?: string,
): Promise<number> {
  const { sprInputCostPerMillion, sprOutputCostPerMillion, sprMarginRate } =
    iGM_Config.ai;
  const cost = iGM_RoundQuota(
    ((promptTokens / 1_000_000) * sprInputCostPerMillion +
      (completionTokens / 1_000_000) * sprOutputCostPerMillion) *
      (1 + sprMarginRate),
  );
  const now = createdAt ?? new Date().toISOString();
  return await iGM_ApplyQuotaChange({
    userId,
    channel: "spr",
    type: "chat_answer",
    amount: -cost,
    detail: `${iGM_ChargeReasonPrefix(reason)}（${promptTokens} 输入 + ${completionTokens} 输出 tokens × ${sprMarginRate * 100}% 利润）`,
    createdAt: now,
    insufficientKey: "ai.errors.sprInsufficient",
  });
}

/**
 * SPR 充值入账（独立事务）：写入 recharge 流水。
 * 说明：充值页面（G_Account_Recharge）当前为占位页，本函数先落服务能力，
 *       供后续支付接入与管理端手工入账使用
 */
export async function iGM_RechargeSPRService(
  userId: string,
  amount: number,
  detail: string,
  createdAt?: string,
): Promise<number> {
  const value = iGM_RoundQuota(amount);
  if (!Number.isFinite(value) || value <= 0) {
    throw new iGM_QuotaError("ai.errors.generic", 400);
  }
  const now = createdAt ?? new Date().toISOString();
  const recharge = iGM_Db.transaction(async (): Promise<number> =>
    iGM_ApplyQuotaChange({
      userId,
      channel: "spr",
      type: "recharge",
      amount: value,
      detail: detail.trim().length > 0 ? detail : `SPR 充值 ${value}`,
      createdAt: now,
      insufficientKey: "ai.errors.sprInsufficient",
    }),
  );
  return await recharge();
}

/** 解析并校验统计时间范围（缺省为日） */
function iGM_ResolveStatsRange(raw: string): iGM_AICallStatsRange {
  return raw === "week" || raw === "month" ? raw : "day";
}

/** 流水分页默认条数与服务端上限（防一次性拉取过大） */
const iGM_QUOTA_TRANSACTION_PAGE_SIZE = 20;
const iGM_QUOTA_TRANSACTION_MAX_PAGE_SIZE = 50;

/** 解析并收敛页码（非法值回退第 1 页） */
function iGM_ResolveTransactionPage(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
}

/** 解析并收敛每页条数（非法值回退默认，超过上限按上限截取） */
function iGM_ResolveTransactionPageSize(raw: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return iGM_QUOTA_TRANSACTION_PAGE_SIZE;
  }
  return Math.min(parsed, iGM_QUOTA_TRANSACTION_MAX_PAGE_SIZE);
}

/** 流水行转 DTO：numeric 归一为数字，未知类型按 reward 兜底（金额与备注原样保留） */
function iGM_ToQuotaTransactionDto(
  row: iGM_QuotaTransactionRow,
): iGM_QuotaTransactionDto {
  return {
    id: row.iGM_Id,
    type: iGM_IsQuotaTransactionType(row.iGM_Type) ? row.iGM_Type : "reward",
    amount: iGM_RoundQuota(iGM_ToQuotaNumber(row.iGM_Amount)),
    balanceAfter: iGM_RoundQuota(iGM_ToQuotaNumber(row.iGM_BalanceAfter)),
    detail: row.iGM_Detail,
    createdAt: row.iGM_CreatedAt,
  };
}

/**
 * UPR 流水分页查询（时间倒序）：
 * 供弹窗中点击 UPR 余额后查看消耗详情（时间 / 类型 / 变动数额 / 变动后余额 / 备注），
 * 默认每页 20 条，向前端返回总数以便滚动加载更多
 */
export async function iGM_GetUPRTransactionsService(
  userId: string,
  pageRaw: string,
  pageSizeRaw: string,
): Promise<iGM_QuotaTransactionPageResult> {
  const page = iGM_ResolveTransactionPage(pageRaw);
  const pageSize = iGM_ResolveTransactionPageSize(pageSizeRaw);
  const [rows, total] = await Promise.all([
    iGM_ListQuotaTransactionsPage(
      "upr",
      userId,
      pageSize,
      (page - 1) * pageSize,
    ),
    iGM_CountQuotaTransactions("upr", userId),
  ]);
  return { items: rows.map(iGM_ToQuotaTransactionDto), total, page, pageSize };
}

/** 某时间范围起点（UTC 零点）：日 = 今天、周 = 近 7 天、月 = 近 30 天 */
function iGM_StatsSince(range: iGM_AICallStatsRange): string {
  const days = range === "day" ? 1 : range === "week" ? 7 : 30;
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));
  return since.toISOString();
}

/** 今日零点（UTC） */
function iGM_TodayStart(): string {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return today.toISOString();
}

/** 排行行转前端条目（金额精度归一） */
function iGM_ToStatsUser(row: iGM_AICallStatsUserRow): iGM_AICallStatsUser {
  return {
    userId: row.iGM_UserId,
    username: row.iGM_Username,
    displayName: row.iGM_DisplayName,
    consumed: iGM_RoundQuota(Number(row.iGM_Consumed)),
    calls: row.iGM_Calls,
  };
}

/**
 * 管理后台双通道调用统计：分别聚合 iGM_UPRTransactions 与 iGM_SPRTransactions
 * （UPR：调用次数 / 总消耗 / 当日消耗；SPR：另加总收入，按 1 SPR = 1 元折算；
 *   各自输出 Top 10 用户消耗排行）
 */
export async function iGM_GetAICallStatsService(
  rangeRaw: string,
): Promise<iGM_AICallStatsResult> {
  const range = iGM_ResolveStatsRange(rangeRaw);
  const sinceIso = iGM_StatsSince(range);
  const todayIso = iGM_TodayStart();

  const [
    uprCalls,
    uprTotal,
    uprToday,
    uprTop,
    sprCalls,
    sprTotal,
    sprToday,
    sprTop,
  ] = await Promise.all([
    iGM_CountQuotaCallsSince("upr", sinceIso),
    iGM_SumQuotaConsumedSince("upr", sinceIso),
    iGM_SumQuotaConsumedSince("upr", todayIso),
    iGM_ListTopQuotaUsers("upr", sinceIso, 10),
    iGM_CountQuotaCallsSince("spr", sinceIso),
    iGM_SumQuotaConsumedSince("spr", sinceIso),
    iGM_SumQuotaConsumedSince("spr", todayIso),
    iGM_ListTopQuotaUsers("spr", sinceIso, 10),
  ]);

  const sprTotalRounded = iGM_RoundQuota(sprTotal);
  return {
    range,
    upr: {
      totalCalls: uprCalls,
      totalConsumed: iGM_RoundQuota(uprTotal),
      todayConsumed: iGM_RoundQuota(uprToday),
    },
    spr: {
      totalCalls: sprCalls,
      totalConsumed: sprTotalRounded,
      todayConsumed: iGM_RoundQuota(sprToday),
      // 收入口径与消耗一致：1 SPR = 1 元
      totalRevenue: sprTotalRounded,
    },
    topUprUsers: uprTop.map(iGM_ToStatsUser),
    topSprUsers: sprTop.map(iGM_ToStatsUser),
  };
}

// 导出 //
export default {
  iGM_QuotaError,
  iGM_GetAIInfoService,
  iGM_GrantRegisterUPRService,
  iGM_GrantUPRService,
  iGM_ChargeQuestionUPRService,
  iGM_ChargeAnswerUPRService,
  iGM_CheckSPRTalkAllowedService,
  iGM_ChargeAnswerSPRService,
  iGM_RechargeSPRService,
  iGM_GetUPRTransactionsService,
  iGM_GetAICallStatsService,
};