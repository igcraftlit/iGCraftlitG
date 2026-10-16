/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_QuotaService.ts
 * 模块：iGM_QuotaService
 * 作用：UQ / Coin 双币种账户服务
 * 说明：AI 功能模块已整体移除，此处仅保留新用户注册赠送流水的写入
 */

// 导入依赖 //
import { iGM_Config } from "../iGM_Config/iGM_Config";
import {
  iGM_InsertQuotaTransaction,
  iGM_GetUserQuotaBalances,
} from "../iGM_Repositories/iGM_QuotaRepository";
import { iGM_Round3 } from "../iGM_Types/iGM_Quota";
import type { iGM_QuotaChannel } from "../iGM_Types/iGM_Quota";

// 类型定义 //
// （本服务无对外类型，统一响应类型见 iGM_Types/iGM_Response.ts）

// 核心逻辑 //
/** 为新用户写入注册赠送流水（10 UQ + 5 Coin） */
export async function iGM_GrantRegisterGifts(
  userId: string,
  nowIso: string,
): Promise<void> {
  // 直接用默认值（列 DEFAULT 已生效），读出来写流水即可
  const bal = await iGM_GetUserQuotaBalances(userId);
  if (!bal) return;
  const gifts: Array<{ channel: iGM_QuotaChannel; amount: number; label: string }> = [
    { channel: "uq", amount: iGM_Config.quota.uqRegisterGift, label: "UQ 常规额度" },
    { channel: "coin", amount: iGM_Config.quota.coinRegisterGift, label: "Coin 社区币" },
  ];
  for (const g of gifts) {
    const balAfter =
      g.channel === "uq"
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

// 导出 //
export default { iGM_GrantRegisterGifts };
