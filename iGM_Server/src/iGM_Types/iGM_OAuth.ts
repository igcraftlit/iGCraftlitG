/**
 * 文件路径：iGM_Server/src/iGM_Types/iGM_OAuth.ts
 * 所属层：后端 / 类型定义层
 * 路由：G_OAuth
 * 模块：iGM_OAuth
 * 作用：定义 OAuth 2.0 + OpenID Connect 身份提供方领域共享类型
 * 内容：应用状态与类型、五个数据表行类型、对外 DTO、scope 常量与校验、
 *       令牌有效期常量、授权请求参数与令牌响应结构
 * 说明：scope 固定为 openid / profile / email / org；
 *       令牌有效期遵循「access_token 短效、refresh_token 最长两个季度」规则
 */

// 导入依赖 //
// （本文件仅包含类型与常量，无运行时依赖）

// 类型定义 //
/** 应用状态：pending 待审核 / approved 已通过 / rejected 已拒绝 / disabled 已禁用 / withdrawn 已撤回 / deleted 已删除 */
export type iGM_OAuthClientStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "disabled"
  | "withdrawn"
  | "deleted";

/** 应用类型：web 网页 / desktop 桌面 / mobile 移动 / service 服务端 / other 其他 */
export type iGM_OAuthClientType =
  | "web"
  | "desktop"
  | "mobile"
  | "service"
  | "other";

/** OIDC scope */
export type iGM_OAuthScope = "openid" | "profile" | "email" | "org";

/** iGM_OAuthClients 表数据行 */
export interface iGM_OAuthClientRow {
  iGM_Id: string;
  iGM_ClientId: string;
  /** SHA-256 哈希；审核通过前为 null */
  iGM_ClientSecretHash: string | null;
  iGM_Name: string;
  iGM_Type: string;
  iGM_Description: string;
  /** 回调地址 JSON 数组字符串 */
  iGM_RedirectUris: string;
  /** 空格分隔的 scope 串 */
  iGM_Scopes: string;
  iGM_Purpose: string;
  iGM_Contact: string;
  /** 模块二十五：应用主页 */
  iGM_HomepageUrl: string;
  /** 模块二十五：隐私政策链接 */
  iGM_PrivacyPolicyUrl: string;
  /** 模块二十五：服务条款链接 */
  iGM_TermsOfServiceUrl: string;
  /** 模块二十五：数据使用说明 */
  iGM_DataUsage: string;
  /** 申请人 11 位 iGMUid */
  iGM_OwnerUid: string;
  iGM_Status: string;
  iGM_ReviewerId: string | null;
  iGM_ReviewComment: string | null;
  iGM_SecretRotatedAt: string | null;
  /** 模块二十五：审核通过后待开发者领取的一次性明文密钥；领取后立即置空 */
  iGM_PendingSecret: string | null;
  /** 模块二十二：是否为本地测试用途（1 时允许 http://localhost 等回调） */
  iGM_IsLocalTest: number;
  /** 模块二十二：软删除时间（非 NULL 表示已删除，行保留以占用 client_id） */
  iGM_DeletedAt: string | null;
  iGM_CreatedAt: string;
  iGM_UpdatedAt: string;
}

/** 开发者侧 / 用户侧应用 DTO（永不包含 client_secret 明文） */
export interface iGM_OAuthClientDto {
  id: string;
  clientId: string;
  name: string;
  type: string;
  description: string;
  redirectUris: string[];
  scopes: string[];
  purpose: string;
  contact: string;
  /** 模块二十五：应用主页 */
  homepageUrl: string;
  /** 模块二十五：隐私政策链接 */
  privacyPolicyUrl: string;
  /** 模块二十五：服务条款链接 */
  termsOfServiceUrl: string;
  /** 模块二十五：数据使用说明 */
  dataUsage: string;
  ownerUid: string;
  status: string;
  reviewerId: string | null;
  reviewComment: string | null;
  secretRotatedAt: string | null;
  /** 模块二十五：一次性密钥是否仍待开发者领取（true 时进入应用页应立即展示） */
  secretRevealable: boolean;
  /** 模块二十二：是否为本地测试用途（前端展示「仅开发调试使用」标签） */
  isLocalTest: boolean;
  /** 模块二十二：软删除时间（未删除为 null） */
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** iGM_OAuthCodes 表数据行 */
export interface iGM_OAuthCodeRow {
  iGM_Id: string;
  iGM_Code: string;
  iGM_ClientId: string;
  iGM_UserId: string;
  iGM_Scope: string;
  iGM_RedirectUri: string;
  iGM_CodeChallenge: string | null;
  iGM_CodeChallengeMethod: string | null;
  iGM_Nonce: string | null;
  iGM_ExpiresAt: string;
  iGM_Used: number;
  iGM_CreatedAt: string;
}

/** iGM_OAuthTokens 表数据行（access/refresh 均为 SHA-256 哈希） */
export interface iGM_OAuthTokenRow {
  iGM_Id: string;
  iGM_AccessToken: string;
  iGM_RefreshToken: string | null;
  iGM_ClientId: string;
  iGM_UserId: string;
  iGM_Scope: string;
  iGM_ExpiresAt: string;
  iGM_RefreshExpiresAt: string | null;
  iGM_Revoked: number;
  iGM_CreatedAt: string;
  iGM_UpdatedAt: string;
}

/** iGM_OAuthConsents 表数据行 */
export interface iGM_OAuthConsentRow {
  iGM_Id: string;
  iGM_UserId: string;
  iGM_ClientId: string;
  iGM_Scope: string;
  iGM_GrantedAt: string;
  iGM_UpdatedAt: string;
}

/** iGM_OAuthLogs 表数据行 */
export interface iGM_OAuthLogRow {
  iGM_Id: string;
  iGM_ClientId: string | null;
  iGM_UserId: string | null;
  iGM_Action: string;
  iGM_Detail: string | null;
  iGM_Ip: string | null;
  iGM_CreatedAt: string;
}

/** iGM_OAuthKeys 表数据行 */
export interface iGM_OAuthKeyRow {
  iGM_Id: string;
  iGM_Kind: string;
  iGM_Kid: string;
  iGM_Alg: string;
  iGM_PublicJwk: string;
  iGM_PrivateJwk: string;
  iGM_Active: number;
  iGM_CreatedAt: string;
}

/** 授权请求参数（来自 /oauth/authorize 查询串） */
export interface iGM_AuthorizeRequest {
  clientId: string;
  redirectUri: string;
  responseType: string;
  scope: string;
  state: string;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
  nonce: string | null;
}

/** 令牌响应（/oauth/token 成功返回体） */
export interface iGM_TokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope: string;
}

/** 应用申请入参（来自前端提交表单） */
export interface iGM_OAuthApplyInput {
  name: string;
  type: string;
  description: string;
  redirectUris: string[];
  scopes: string[];
  purpose: string;
  contact: string;
  /** 模块二十五：应用主页（必填，HTTPS） */
  homepageUrl: string;
  /** 模块二十五：隐私政策链接（必填，HTTPS） */
  privacyPolicyUrl: string;
  /** 模块二十五：服务条款链接（选填，填写时须为 HTTPS） */
  termsOfServiceUrl: string;
  /** 模块二十五：数据使用说明（必填） */
  dataUsage: string;
  agreeRules: boolean;
  /** 模块二十二：是否为本地测试用途（勾选后允许 http://localhost 等回调） */
  localTest: boolean;
}

// 核心逻辑 //
/** 允许的 scope 全集（顺序即展示顺序） */
export const iGM_OAuthScopes: iGM_OAuthScope[] = [
  "openid",
  "profile",
  "email",
  "org",
];

/** 允许的应用类型 */
export const iGM_OAuthClientTypes: iGM_OAuthClientType[] = [
  "web",
  "desktop",
  "mobile",
  "service",
  "other",
];

/** 令牌有效期（秒）——access_token 默认 1 小时 */
export const iGM_AccessTokenTtlSeconds = 60 * 60;

/**
 * 刷新令牌最长有效期（秒）——最多两个季度，约 180 天。
 * 到期后第三方必须重新引导用户走完整授权流程，拒绝续期。
 */
export const iGM_RefreshTokenTtlSeconds = 180 * 24 * 60 * 60;

/** 授权码有效期（秒）——一次性，5 分钟 */
export const iGM_AuthorizationCodeTtlSeconds = 5 * 60;

/** 判断字符串是否为合法 scope */
export function iGM_IsOAuthScope(value: string): value is iGM_OAuthScope {
  return iGM_OAuthScopes.includes(value as iGM_OAuthScope);
}

/**
 * 规范化 scope 串：去重、按固定顺序、丢弃非法项；
 * 默认始终包含 openid（OIDC 基础 scope）。
 */
export function iGM_NormalizeScope(raw: string): string {
  const requested = raw
    .split(/[\s,+]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const set = new Set(requested.filter(iGM_IsOAuthScope));
  set.add("openid");
  return iGM_OAuthScopes.filter((scope) => set.has(scope)).join(" ");
}

/** 判断 scope 串是否完整覆盖目标 scope 串（用于跳过重复授权页） */
export function iGM_ScopeCovers(granted: string, requested: string): boolean {
  const grantedSet = new Set(granted.split(" ").filter(Boolean));
  return requested
    .split(" ")
    .filter(Boolean)
    .every((scope) => grantedSet.has(scope));
}

// 导出 //
export default iGM_OAuthScopes;
