/**
 * 文件路径：iGM_Server/src/iGM_Types/iGM_Quota.ts
 * 所属层：后端 / 类型定义层
 * 模块：iGM_Quota
 * 作用：UQ（常规额度）/ Coin（社区币）双币种账户类型定义
 * 说明：AI 功能模块已整体移除，此处仅保留账户余额与注册赠送所需的最小类型
 */

// 类型定义 //
/** 币种通道：uq 常规额度 / coin 社区币 */
export type iGM_QuotaChannel = "uq" | "coin";

/** 额度流水类型（AI 计费已移除，当前仅保留注册赠送） */
export type iGM_QuotaTransactionType = "register";

// 核心逻辑 //
/** 按 3 位小数四舍五入（避免 NUMERIC 和 JS 浮点精度差） */
export function iGM_Round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// 导出 //
export default { iGM_Round3 };
