/**
 * 文件路径：apps/web/src/iGM_Pages/G_RootAuth/iGM_RegisterDraft.ts
 * 所属层：前端 / 页面层（注册向导持久化助手）
 * 路由：/G_Auth/register ↔ /G_UserRules?from=register
 * 模块：G_RootAuth / G_UserRules
 * 作用：注册第四框跳转独立规定页前后的临时数据传递
 * 内容：向导草稿（用户名/邮箱/密码，仅 sessionStorage 短期暂存）、
 *       规定同意凭证（同意时间与检测到的 IP）
 * 安全：sessionStorage 不跨标签页、关闭即失效；
 *       草稿 30 分钟过期，注册请求成功后立即清除，不做长期持久化
 */

// 类型定义 //
/** 注册向导草稿（跳转规定页期间暂存） */
export interface iGM_RegisterDraftData {
  username: string;
  email: string;
  password: string;
  /** 写入时间（ISO），用于过期判定 */
  at: string;
}

/** 规定页阅读同意凭证 */
export interface iGM_RulesAcceptedData {
  /** 点击同意的时间（ISO） */
  at: string;
  /** 规定页检测到的客户端 IP（告知展示用，落库以后端解析为准） */
  ip: string;
  /** 模块十五：已同意的《用户管理规定》版本号 */
  version?: string;
}

// 核心逻辑 //
const iGM_DraftKey = "iGM_RegisterDraft";
const iGM_AcceptedKey = "iGM_RulesAccepted";
/** 草稿有效期 30 分钟 */
const iGM_DraftTtlMs = 30 * 60 * 1000;

/** 暂存注册向导草稿（前往规定独立页前调用） */
export function iGM_SaveRegisterDraft(
  draft: Omit<iGM_RegisterDraftData, "at">,
): void {
  if (typeof window === "undefined") return;
  const data: iGM_RegisterDraftData = { ...draft, at: new Date().toISOString() };
  window.sessionStorage.setItem(iGM_DraftKey, JSON.stringify(data));
}

/** 读取未过期的草稿；缺失或已过期返回 null 并清理 */
export function iGM_LoadRegisterDraft(): iGM_RegisterDraftData | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(iGM_DraftKey);
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw) as iGM_RegisterDraftData;
    if (
      !draft.username ||
      !draft.email ||
      !draft.password ||
      Date.now() - new Date(draft.at).getTime() > iGM_DraftTtlMs
    ) {
      window.sessionStorage.removeItem(iGM_DraftKey);
      return null;
    }
    return draft;
  } catch {
    window.sessionStorage.removeItem(iGM_DraftKey);
    return null;
  }
}

/** 清除注册草稿（注册成功后立即调用） */
export function iGM_ClearRegisterDraft(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(iGM_DraftKey);
}

/** 写入规定同意凭证（规定页点击"同意并返回注册"时调用） */
export function iGM_SaveRulesAccepted(data: iGM_RulesAcceptedData): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(iGM_AcceptedKey, JSON.stringify(data));
}

/**
 * 读取并消费同意凭证（注册页恢复第四框时调用）：
 * 一次性读取后立即移除，避免下次进入注册页被自动视为已同意
 */
export function iGM_ConsumeRulesAccepted(): iGM_RulesAcceptedData | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(iGM_AcceptedKey);
  window.sessionStorage.removeItem(iGM_AcceptedKey);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as iGM_RulesAcceptedData;
    if (!data.at) return null;
    // 凭证有效期与草稿一致
    if (Date.now() - new Date(data.at).getTime() > iGM_DraftTtlMs) return null;
    return data;
  } catch {
    return null;
  }
}
