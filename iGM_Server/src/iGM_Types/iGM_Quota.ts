/**
 * 文件路径：iGM_Server/src/iGM_Types/iGM_Quota.ts
 * 所属层：后端 / 类型定义层
 * 模块：iGM_Quota
 * 作用：UQ（常规额度）/ Coin（社区币）双币种体系类型定义
 * 说明：
 *   - UQ：默认赠送 10，免费消耗，优先扣除
 *   - Coin：默认赠送 5，付费消耗（1 元 = 1 Coin），UQ 不足时自动扣
 *   - 所有余额、消耗、流水统一保留 3 位小数（NUMERIC(14,3)）
 */

// 类型定义 //
/** 额度流水类型：注册赠送 / 提问扣费 / 回答按 token 扣费 / 充值 / 奖励 */
export type iGM_QuotaTransactionType =
  | "register"
  | "chat_question"
  | "chat_answer"
  | "recharge"
  | "reward";

/** 币种通道：uq 常规额度 / coin 社区币 */
export type iGM_QuotaChannel = "uq" | "coin";

/**
 * AI 计费时段
 *  - nonpeak 非高峰：周六、法定节假日、每天 22:00 至次日 08:00
 *  - peak 高峰：工作日 08:00 至 22:00（Coin 按非高峰 1.5 倍结算）
 */
export type iGM_AIChargePeriod = "peak" | "nonpeak";

/**
 * 回答扣费原因：
 *  - normal    正常产出
 *  - timeout   流式超时中断
 *  - truncated 超字数截断
 *  - stopped   用户手动停止（按已生成内容扣费）
 */
export type iGM_AIChargeReason = "normal" | "timeout" | "truncated" | "stopped";

/** 流水表行（两表同构） */
export interface iGM_QuotaTransactionRow {
  iGM_Id: string;
  iGM_UserId: string;
  iGM_Type: string;
  iGM_Amount: string | number;
  iGM_BalanceAfter: string | number;
  iGM_Detail: string;
  iGM_CreatedAt: string;
}

/** 余额查询结果（GET /G_AI/balance） */
export interface iGM_AIInfoResult {
  /** UQ 余额 */
  uqBalance: number;
  /** Coin 余额 */
  coinBalance: number;
  /** 当前对外模型名（Chat iGM Nove V0.1） */
  modelName: string;
}

/** 流水 DTO（numeric 列已转数字，保留 3 位小数） */
export interface iGM_QuotaTransactionDto {
  id: string;
  type: iGM_QuotaTransactionType;
  amount: number;
  balanceAfter: number;
  detail: string;
  createdAt: string;
}

/** 流水分页结果（时间倒序） */
export interface iGM_QuotaTransactionPageResult {
  items: iGM_QuotaTransactionDto[];
  total: number;
  page: number;
  pageSize: number;
}

/** 管理后台统计时间范围 */
export type iGM_AICallStatsRange = "day" | "week" | "month";

/** Top 用户消耗排行行 */
export interface iGM_AICallStatsUserRow {
  iGM_UserId: string;
  iGM_Username: string;
  iGM_DisplayName: string | null;
  iGM_Consumed: string | number;
  iGM_Calls: number;
}

/** 单币种通道统计 */
export interface iGM_AICallStatsChannel {
  totalCalls: number;
  totalConsumed: number;
  todayConsumed: number;
}

/** 排行条目 */
export interface iGM_AICallStatsUser {
  userId: string;
  username: string;
  displayName: string | null;
  consumed: number;
  calls: number;
}

/** 管理后台双币种统计结果 */
export interface iGM_AICallStatsResult {
  range: iGM_AICallStatsRange;
  uq: iGM_AICallStatsChannel;
  coin: iGM_AICallStatsChannel;
  topUqUsers: iGM_AICallStatsUser[];
  topCoinUsers: iGM_AICallStatsUser[];
}

// 核心逻辑 //
export function iGM_IsQuotaTransactionType(
  value: unknown,
): value is iGM_QuotaTransactionType {
  return (
    value === "register" ||
    value === "chat_question" ||
    value === "chat_answer" ||
    value === "recharge" ||
    value === "reward"
  );
}

/**
 * 判定计费时段（Asia/Shanghai 本地时间）：
 *   - 周六（6）/周日（0） → nonpeak
 *   - 工作日 22:00-08:00 → nonpeak
 *   - 工作日 08:00-22:00 → peak
 * 法定节假日暂按工作日处理（如需精确可后续接入节假日 API）
 */
export function iGM_DetermineChargePeriod(now?: Date): iGM_AIChargePeriod {
  const d = now ?? new Date();
  const day = d.getDay();
  const hour = d.getHours();
  if (day === 0 || day === 6) return "nonpeak";
  if (hour < 8 || hour >= 22) return "nonpeak";
  return "peak";
}

/**
 * 按 3 位小数四舍五入（避免 NUMERIC 和 JS 浮点精度差）
 */
export function iGM_Round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Coin 计费（按百万 token × 时段倍率）：
 *   非高峰：输入 3 Coin / 百万 token、输出 8 Coin / 百万 token
 *   高峰：  输入 4.5 Coin / 百万 token、输出 12 Coin / 百万 token
 */
export const iGM_CoinRate = {
  nonpeak: { inputPerMillion: 3, outputPerMillion: 8 },
  peak: { inputPerMillion: 4.5, outputPerMillion: 12 },
};

// 导出 //
export default { iGM_IsQuotaTransactionType, iGM_DetermineChargePeriod, iGM_Round3 };
