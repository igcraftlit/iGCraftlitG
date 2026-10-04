/**
 * 文件路径：iGM_Server/src/iGM_Types/iGM_Quota.ts
 * 所属层：后端 / 类型定义层
 * 路由：G_AI、G_Admin、G_Auth
 * 模块：iGM_Quota
 * 作用：UPR（通用额度）/ SPR（付费额度）双额度体系的类型定义（AI 赋能系统模块三 / 模块四）
 * 内容：流水类型联合、额度通道、流水表行、余额与模型信息结果、流水分页查询结果、
 *       管理后台双通道统计结果、流水类型判定工具
 * 说明：UPR 调用本地 Qwen 模型（免费）、SPR 调用 DeepSeek Flash（付费）；
 *       金额精度与 NUMERIC(14,4) 一致
 */

// 导入依赖 //
// （本文件仅包含类型定义，无运行时依赖）

// 类型定义 //
/** 额度流水类型：注册赠送 / 提问扣费 / 回答按 token 扣费 / 充值 / 奖励（预留） */
export type iGM_QuotaTransactionType =
  | "register"
  | "chat_question"
  | "chat_answer"
  | "recharge"
  | "reward";

/** 额度通道：upr 通用（本地 Qwen）/ spr 付费（DeepSeek Flash） */
export type iGM_QuotaChannel = "upr" | "spr";

/**
 * 回答扣费原因：normal 正常产出 / timeout 流式超时中断 / truncated 超字数截断 /
 * stopped 用户手动停止（按已生成内容扣费）。
 * 用于流水备注，保证超时、截断与手动停止的扣费记录可追溯
 */
export type iGM_AIChargeReason = "normal" | "timeout" | "truncated" | "stopped";

/** iGM_UPRTransactions / iGM_SPRTransactions 表行（两表同构） */
export interface iGM_QuotaTransactionRow {
  iGM_Id: string;
  iGM_UserId: string;
  iGM_Type: string;
  /** numeric 列由驱动返回字符串，使用前需转为数字 */
  iGM_Amount: string | number;
  iGM_BalanceAfter: string | number;
  iGM_Detail: string;
  iGM_CreatedAt: string;
}

/** 余额与模型信息查询结果（GET /G_AI/balance） */
export interface iGM_AIInfoResult {
  /** UPR 余额（可为负数：回答扣费允许扣成负数，下次提问被拦截） */
  uprBalance: number;
  /** SPR 余额（可为负数） */
  sprBalance: number;
  /** Free 通道当前模型名（界面「模型信息」按钮展示） */
  freeModel: string;
  /** Premium 通道当前模型名 */
  premiumModel: string;
}

/** 流水条目（对前端；numeric 列已归一为数字，iGM_Type 已收敛为联合类型） */
export interface iGM_QuotaTransactionDto {
  id: string;
  type: iGM_QuotaTransactionType;
  /** 变动值：正数为增加、负数为消耗 */
  amount: number;
  /** 变动后余额 */
  balanceAfter: number;
  detail: string;
  createdAt: string;
}

/** 流水分页查询结果（GET /G_AI/upr-transactions，时间倒序） */
export interface iGM_QuotaTransactionPageResult {
  items: iGM_QuotaTransactionDto[];
  /** 该通道流水总条数（前端判断是否还有下一页） */
  total: number;
  /** 当前页码（从 1 开始） */
  page: number;
  /** 每页条数（已按服务端上限收敛） */
  pageSize: number;
}

/** 管理后台 AI 调用统计时间范围：日 / 周 / 月 */
export type iGM_AICallStatsRange = "day" | "week" | "month";

/** Top 用户消耗排行行（聚合自对应额度流水表） */
export interface iGM_AICallStatsUserRow {
  iGM_UserId: string;
  iGM_Username: string;
  iGM_DisplayName: string | null;
  /** 消耗额度总额（numeric 列由驱动返回字符串） */
  iGM_Consumed: string | number;
  iGM_Calls: number;
}

/** UPR 通道统计 */
export interface iGM_AICallStatsUprChannel {
  /** 调用次数（所选范围内提问条数） */
  totalCalls: number;
  /** 所选范围内总消耗 UPR */
  totalConsumed: number;
  /** 当日消耗 UPR（固定为今天，不随筛选范围变化） */
  todayConsumed: number;
}

/** SPR 通道统计（较 UPR 多收入口径：消耗按 1 SPR = 1 元折算） */
export interface iGM_AICallStatsSprChannel extends iGM_AICallStatsUprChannel {
  /** 所选范围内总收入（元） */
  totalRevenue: number;
}

/** 排行条目（对前端） */
export interface iGM_AICallStatsUser {
  userId: string;
  username: string;
  displayName: string | null;
  consumed: number;
  calls: number;
}

/** 管理后台双通道统计结果 */
export interface iGM_AICallStatsResult {
  range: iGM_AICallStatsRange;
  upr: iGM_AICallStatsUprChannel;
  spr: iGM_AICallStatsSprChannel;
  /** UPR 消耗排行 Top 10 */
  topUprUsers: iGM_AICallStatsUser[];
  /** SPR 消耗排行 Top 10 */
  topSprUsers: iGM_AICallStatsUser[];
}

// 核心逻辑 //
/** 判断未知值是否为合法流水类型（数据库返回字符串，出参前收敛） */
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

// 导出 //
export default { iGM_IsQuotaTransactionType };