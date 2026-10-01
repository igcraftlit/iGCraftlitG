/**
 * 文件路径：iGM_Server/src/iGM_Types/iGM_Agreement.ts
 * 所属层：后端 / 类型定义层
 * 路由：G_Auth
 * 模块：iGM_Agreement
 * 作用：定义《iGCraftLit 用户管理规定》同意记录共享类型
 * 内容：iGM_UserAgreements 表数据行与对外 DTO
 * 说明：同意记录含版本号；版本变更时需提示用户重新阅读并同意
 */

// 导入依赖 //
// （本文件仅包含类型定义，无运行时依赖）

// 类型定义 //
/** 当前生效的《用户管理规定》版本号（与前端 docs/iGM_UserAgreement.md 一致） */
export const iGM_UserAgreementVersion = "1.0.0";

/** iGM_UserAgreements 表数据行 */
export interface iGM_UserAgreementRow {
  iGM_Id: string;
  iGM_UserId: string;
  iGM_Version: string;
  iGM_AcceptedIp: string | null;
  iGM_AcceptedAt: string;
}

/** 同意记录 DTO（供前端判断是否需要重新阅读） */
export interface iGM_UserAgreementDto {
  /** 已同意的版本号（未同意为 null） */
  version: string | null;
  acceptedAt: string | null;
  /** 当前要求的最新版本号 */
  currentVersion: string;
  /** 是否需要重新阅读并同意（版本落后或从未同意） */
  needsReaccept: boolean;
}

// 导出 //
export default iGM_UserAgreementVersion;