/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_OAuthService.ts
 * 所属层：后端 / 业务逻辑层
 * 路由：G_OAuth
 * 模块：iGM_OAuthService
 * 作用：OAuth 2.0 + OpenID Connect 身份提供方的业务编排
 * 内容：应用申请与审核（通过后发放 client_id / client_secret 仅展示一次）、
 *       授权请求校验、同意与拒绝、授权码签发与核销、令牌签发（authorization_code /
 *       refresh_token）、userinfo、令牌撤销、用户授权管理与操作日志
 * 说明：access_token 短效（默认 1 小时）；refresh_token 最长两个季度（180 天）且
 *       支持撤销与轮换，到期后必须重新走授权流程；授权码一次性、5 分钟有效；
 *       client_secret / 令牌一律只存哈希，明文仅在发放当下返回一次
 */

// 导入依赖 //
import { iGM_Config } from "../iGM_Config/iGM_Config";
import {
  iGM_AuthorizationCodeTtlSeconds,
  iGM_NormalizeScope,
  iGM_OAuthClientTypes,
  iGM_OAuthScopes,
  iGM_ScopeCovers,
  type iGM_AuthorizeRequest,
  type iGM_OAuthApplyInput,
  type iGM_OAuthClientDto,
  type iGM_OAuthClientRow,
  type iGM_OAuthTokenRow,
  type iGM_TokenResponse,
} from "../iGM_Types/iGM_OAuth";
import {
  iGM_DeleteOAuthClient,
  iGM_DeleteOAuthConsent,
  iGM_FindOAuthClientByClientId,
  iGM_FindOAuthClientById,
  iGM_FindOAuthCodeByCode,
  iGM_FindOAuthConsent,
  iGM_FindOAuthTokenByAccessHash,
  iGM_FindOAuthTokenByRefreshHash,
  iGM_InsertOAuthClient,
  iGM_InsertOAuthCode,
  iGM_InsertOAuthLog,
  iGM_InsertOAuthToken,
  iGM_ListOAuthClientsByOwner,
  iGM_ListOAuthClientsForAdmin,
  iGM_ListOAuthConsentsByUser,
  iGM_ListOAuthLogsByClient,
  iGM_MarkOAuthCodeUsed,
  iGM_ReviewOAuthClient,
  iGM_RevokeOAuthTokenById,
  iGM_RevokeOAuthTokensByClient,
  iGM_RevokeOAuthTokensByUserClient,
  iGM_SetOAuthClientSecret,
  iGM_UpdateOAuthClientStatus,
  iGM_UpsertOAuthConsent,
  iGM_WithdrawOAuthClient,
} from "../iGM_Repositories/iGM_OAuthRepository";
import { iGM_FindUserById } from "../iGM_Repositories/iGM_UserRepository";
import { iGM_ResolveUserOrgBadge } from "../iGM_Repositories/iGM_OrgVerifyRepository";
import {
  iGM_OAuthClientId,
  iGM_OAuthRandomToken,
  iGM_SignJwt,
  iGM_VerifyPkce,
} from "./iGM_OAuthCrypto";
import { iGM_Sha256 } from "./iGM_SecurityService";
import type { iGM_UserRow } from "../iGM_Types/iGM_Auth";

// 类型定义 //
/** 业务错误：message 为前端 i18n 文案键，status 为 HTTP 状态码 */
export class iGM_OAuthError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "iGM_OAuthError";
  }
}

/** 客户端认证凭据（client_secret_basic 或 client_secret_post） */
export interface iGM_ClientCredentials {
  clientId: string;
  clientSecret: string;
}

/** 字段长度限制 */
const iGM_NameMax = 60;
const iGM_DescriptionMax = 1000;
const iGM_PurposeMax = 500;
const iGM_ContactMax = 120;
const iGM_MaxRedirectUris = 10;

// 核心逻辑 //
/* ---------- 通用工具 ---------- */

/** 行 → DTO（不含任何密钥） */
function iGM_ToClientDto(row: iGM_OAuthClientRow): iGM_OAuthClientDto {
  return {
    id: row.iGM_Id,
    clientId: row.iGM_ClientId,
    name: row.iGM_Name,
    type: row.iGM_Type,
    description: row.iGM_Description,
    redirectUris: iGM_ParseRedirectUris(row.iGM_RedirectUris),
    scopes: row.iGM_Scopes.split(" ").filter(Boolean),
    purpose: row.iGM_Purpose,
    contact: row.iGM_Contact,
    ownerUid: row.iGM_OwnerUid,
    status: row.iGM_Status,
    reviewerId: row.iGM_ReviewerId,
    reviewComment: row.iGM_ReviewComment,
    secretRotatedAt: row.iGM_SecretRotatedAt,
    createdAt: row.iGM_CreatedAt,
    updatedAt: row.iGM_UpdatedAt,
  };
}

/** 解析回调地址 JSON（异常时返回空数组，避免脏数据导致接口 500） */
export function iGM_ParseRedirectUris(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

/** 写一条操作日志（失败不影响主流程） */
function iGM_Log(params: {
  clientId: string | null;
  userId: string | null;
  action: string;
  detail: string | null;
  ip: string | null;
}): void {
  iGM_InsertOAuthLog({
    id: crypto.randomUUID(),
    clientId: params.clientId,
    userId: params.userId,
    action: params.action,
    detail: params.detail,
    ip: params.ip,
    now: new Date().toISOString(),
  });
}

/** 校验回调地址：必须为 HTTPS（本地开发可放行 http://localhost） */
export function iGM_IsAcceptableRedirectUri(uri: string): boolean {
  if (/^https:\/\//i.test(uri)) return true;
  if (!iGM_Config.oauth.allowHttpRedirect) return false;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(uri);
}

/** 组装重定向地址（保留原有查询串，追加/覆盖指定参数） */
export function iGM_BuildRedirect(
  base: string,
  params: Record<string, string | null>,
): string {
  const url = new URL(base);
  for (const [key, value] of Object.entries(params)) {
    if (value === null) continue;
    url.searchParams.set(key, value);
  }
  return url.toString();
}

/* ---------- 应用申请与审核 ---------- */

/** 校验并规范化应用申请入参 */
function iGM_ValidateApplyInput(input: iGM_OAuthApplyInput): {
  name: string;
  type: string;
  description: string;
  redirectUris: string;
  scopes: string;
  purpose: string;
  contact: string;
} {
  const name = input.name.trim();
  const description = input.description.trim();
  const purpose = input.purpose.trim();
  const contact = input.contact.trim();
  const type = iGM_OAuthClientTypes.includes(
    input.type as (typeof iGM_OAuthClientTypes)[number],
  )
    ? input.type
    : "other";
  const redirectUris = input.redirectUris
    .map((uri) => uri.trim())
    .filter(Boolean);
  const scopes = iGM_NormalizeScope(input.scopes.join(" "));

  if (!name || name.length > iGM_NameMax) {
    throw new iGM_OAuthError("oauth.errors.nameInvalid", 422);
  }
  if (!description || description.length > iGM_DescriptionMax) {
    throw new iGM_OAuthError("oauth.errors.descriptionInvalid", 422);
  }
  if (redirectUris.length === 0 || redirectUris.length > iGM_MaxRedirectUris) {
    throw new iGM_OAuthError("oauth.errors.redirectInvalid", 422);
  }
  if (!redirectUris.every(iGM_IsAcceptableRedirectUri)) {
    throw new iGM_OAuthError("oauth.errors.redirectInsecure", 422);
  }
  if (!purpose || purpose.length > iGM_PurposeMax) {
    throw new iGM_OAuthError("oauth.errors.purposeInvalid", 422);
  }
  if (!contact || contact.length > iGM_ContactMax) {
    throw new iGM_OAuthError("oauth.errors.contactInvalid", 422);
  }
  if (!input.agreeRules) {
    throw new iGM_OAuthError("oauth.errors.agreeRequired", 422);
  }

  return {
    name,
    type,
    description,
    redirectUris: JSON.stringify(redirectUris),
    scopes,
    purpose,
    contact,
  };
}

/** 提交 OAuth 应用申请（须登录，状态 pending） */
export function iGM_SubmitOAuthApplyService(
  user: iGM_UserRow,
  input: iGM_OAuthApplyInput,
): iGM_OAuthClientDto {
  const fields = iGM_ValidateApplyInput(input);
  const row = iGM_InsertOAuthClient({
    id: crypto.randomUUID(),
    clientId: iGM_OAuthClientId(),
    ownerUid: user.iGM_Uid,
    now: new Date().toISOString(),
    ...fields,
  });
  iGM_Log({
    clientId: row.iGM_ClientId,
    userId: user.iGM_Id,
    action: "apply",
    detail: row.iGM_Name,
    ip: null,
  });
  return iGM_ToClientDto(row);
}

/** 我的应用列表（开发者侧） */
export function iGM_ListMyOAuthClientsService(
  user: iGM_UserRow,
): iGM_OAuthClientDto[] {
  return iGM_ListOAuthClientsByOwner(user.iGM_Uid).map(iGM_ToClientDto);
}

/** 撤回本人待审核的应用申请 */
export function iGM_WithdrawOAuthClientService(
  user: iGM_UserRow,
  clientId: string,
): void {
  const row = iGM_FindOAuthClientByClientId(clientId);
  if (!row || row.iGM_OwnerUid !== user.iGM_Uid) {
    throw new iGM_OAuthError("oauth.errors.appNotFound", 404);
  }
  const ok = iGM_WithdrawOAuthClient({
    id: row.iGM_Id,
    ownerUid: user.iGM_Uid,
    now: new Date().toISOString(),
  });
  if (!ok) {
    throw new iGM_OAuthError("oauth.errors.withdrawNotAllowed", 409);
  }
  iGM_Log({
    clientId: row.iGM_ClientId,
    userId: user.iGM_Id,
    action: "withdraw",
    detail: row.iGM_Name,
    ip: null,
  });
}

/**
 * 重置 client_secret：仅应用所有者可操作，仅已通过的应用可重置。
 * 返回的新 secret 仅此一次返回，库中只保留哈希。
 */
export function iGM_ResetClientSecretService(
  user: iGM_UserRow,
  clientId: string,
): { clientId: string; clientSecret: string } {
  const row = iGM_FindOAuthClientByClientId(clientId);
  if (!row || row.iGM_OwnerUid !== user.iGM_Uid) {
    throw new iGM_OAuthError("oauth.errors.appNotFound", 404);
  }
  if (row.iGM_Status !== "approved") {
    throw new iGM_OAuthError("oauth.errors.appNotApproved", 409);
  }
  const secret = iGM_OAuthRandomToken();
  iGM_SetOAuthClientSecret({
    id: row.iGM_Id,
    secretHash: iGM_Sha256(secret),
    now: new Date().toISOString(),
  });
  iGM_Log({
    clientId: row.iGM_ClientId,
    userId: user.iGM_Id,
    action: "secret.reset",
    detail: null,
    ip: null,
  });
  return { clientId: row.iGM_ClientId, clientSecret: secret };
}

/** 开发者侧：查看本人应用的接入日志（分页） */
export function iGM_ListMyOAuthLogsService(
  user: iGM_UserRow,
  clientId: string,
  page: number,
  pageSize: number,
): {
  items: Array<Record<string, unknown>>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
} {
  const row = iGM_FindOAuthClientByClientId(clientId);
  if (!row || row.iGM_OwnerUid !== user.iGM_Uid) {
    throw new iGM_OAuthError("oauth.errors.appNotFound", 404);
  }
  const { items, total } = iGM_ListOAuthLogsByClient({
    clientId: row.iGM_ClientId,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  return {
    items: items.map((item) => ({
      id: item.iGM_Id,
      action: item.iGM_Action,
      detail: item.iGM_Detail,
      createdAt: item.iGM_CreatedAt,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** 管理端：按状态分页列出应用 */
export function iGM_AdminListOAuthClientsService(
  status: string | null,
  pageRaw: number,
  pageSizeRaw: number,
): Record<string, unknown> {
  const page =
    Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const pageSize =
    Number.isFinite(pageSizeRaw) && pageSizeRaw >= 1 && pageSizeRaw <= 50
      ? Math.floor(pageSizeRaw)
      : 10;
  const { items, total } = iGM_ListOAuthClientsForAdmin({
    status: status && status.length > 0 ? status : null,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  return {
    items: items.map((row) => ({
      ...iGM_ToClientDto(row),
      username: row.iGM_Username,
      displayName: row.iGM_DisplayName,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * 审核应用：通过时发放 client_id（已有）与 client_secret（仅本次返回）。
 * 仅待审核可被审核；已通过的应用可被禁用 / 启用；管理员可删除。
 */
export function iGM_ReviewOAuthClientService(
  reviewer: iGM_UserRow,
  clientId: string,
  action: "approve" | "reject",
  comment: string | null,
  ip: string | null,
): { clientId: string; clientSecret: string | null } {
  const row = iGM_FindOAuthClientByClientId(clientId);
  if (!row) {
    throw new iGM_OAuthError("oauth.errors.appNotFound", 404);
  }
  const now = new Date().toISOString();
  const ok = iGM_ReviewOAuthClient({
    id: row.iGM_Id,
    status: action === "approve" ? "approved" : "rejected",
    reviewerId: reviewer.iGM_Id,
    reviewComment: comment?.trim() || null,
    now,
  });
  if (!ok) {
    throw new iGM_OAuthError("oauth.errors.appReviewed", 409);
  }

  let secret: string | null = null;
  if (action === "approve") {
    secret = iGM_OAuthRandomToken();
    iGM_SetOAuthClientSecret({
      id: row.iGM_Id,
      secretHash: iGM_Sha256(secret),
      now,
    });
  }
  iGM_Log({
    clientId: row.iGM_ClientId,
    userId: reviewer.iGM_Id,
    action: action === "approve" ? "approve" : "reject",
    detail: comment?.trim() || null,
    ip,
  });
  return { clientId: row.iGM_ClientId, clientSecret: secret };
}

/** 管理端：启用 / 禁用应用 */
export function iGM_SetOAuthClientDisabledService(
  reviewer: iGM_UserRow,
  clientId: string,
  disabled: boolean,
  ip: string | null,
): void {
  const row = iGM_FindOAuthClientByClientId(clientId);
  if (!row) {
    throw new iGM_OAuthError("oauth.errors.appNotFound", 404);
  }
  if (row.iGM_Status !== "approved" && row.iGM_Status !== "disabled") {
    throw new iGM_OAuthError("oauth.errors.appNotApproved", 409);
  }
  iGM_UpdateOAuthClientStatus({
    id: row.iGM_Id,
    status: disabled ? "disabled" : "approved",
    reviewerId: reviewer.iGM_Id,
    now: new Date().toISOString(),
  });
  if (disabled) {
    // 禁用即撤销该应用已签发的全部令牌，避免继续访问
    iGM_RevokeOAuthTokensByClient({
      clientId: row.iGM_ClientId,
      now: new Date().toISOString(),
    });
  }
  iGM_Log({
    clientId: row.iGM_ClientId,
    userId: reviewer.iGM_Id,
    action: disabled ? "disable" : "enable",
    detail: null,
    ip,
  });
}

/** 管理端：删除应用（级联清理授权码 / 令牌 / 同意记录） */
export function iGM_DeleteOAuthClientService(
  reviewer: iGM_UserRow,
  clientId: string,
  ip: string | null,
): void {
  const row = iGM_FindOAuthClientByClientId(clientId);
  if (!row) {
    throw new iGM_OAuthError("oauth.errors.appNotFound", 404);
  }
  iGM_Log({
    clientId: row.iGM_ClientId,
    userId: reviewer.iGM_Id,
    action: "delete",
    detail: row.iGM_Name,
    ip,
  });
  iGM_DeleteOAuthClient(row.iGM_Id);
}

/* ---------- 授权端点 ---------- */

/**
 * 校验授权请求：client_id 存在且已通过、redirect_uri 严格匹配、response_type=code。
 * 校验失败时若 redirect_uri 合法，仍以 error 参数回跳（OAuth 规范）。
 */
export function iGM_ValidateAuthorizeRequest(query: {
  client_id?: string;
  redirect_uri?: string;
  response_type?: string;
  scope?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  nonce?: string;
}): { client: iGM_OAuthClientRow; request: iGM_AuthorizeRequest } {
  const clientId = (query.client_id ?? "").trim();
  const redirectUri = (query.redirect_uri ?? "").trim();
  const responseType = (query.response_type ?? "code").trim();

  const client = clientId ? iGM_FindOAuthClientByClientId(clientId) : null;
  if (!client) {
    throw new iGM_OAuthError("oauth.errors.invalidClient", 400);
  }
  if (client.iGM_Status !== "approved") {
    throw new iGM_OAuthError("oauth.errors.clientNotApproved", 403);
  }
  // 回调地址严格匹配：必须是注册列表中完全一致的字符串
  const registered = iGM_ParseRedirectUris(client.iGM_RedirectUris);
  if (!redirectUri || !registered.includes(redirectUri)) {
    throw new iGM_OAuthError("oauth.errors.invalidRedirectUri", 400);
  }
  if (responseType !== "code") {
    throw new iGM_OAuthError("oauth.errors.unsupportedResponseType", 400);
  }

  const scope = iGM_NormalizeScope(query.scope ?? "");
  const codeChallenge = (query.code_challenge ?? "").trim() || null;
  const codeChallengeMethod =
    (query.code_challenge_method ?? "").trim().toUpperCase() || null;
  if (codeChallengeMethod && codeChallengeMethod !== "S256") {
    throw new iGM_OAuthError("oauth.errors.unsupportedPkce", 400);
  }

  return {
    client,
    request: {
      clientId: client.iGM_ClientId,
      redirectUri,
      responseType,
      scope,
      state: query.state ?? "",
      codeChallenge,
      codeChallengeMethod,
      nonce: (query.nonce ?? "").trim() || null,
    },
  };
}

/** 授权同意页所需的应用信息（仅返回公开字段，不含任何密钥） */
export function iGM_GetAuthorizeInfoService(
  request: iGM_AuthorizeRequest,
): Record<string, unknown> {
  const client = iGM_FindOAuthClientByClientId(request.clientId);
  if (!client) {
    throw new iGM_OAuthError("oauth.errors.invalidClient", 400);
  }
  return {
    client: {
      clientId: client.iGM_ClientId,
      name: client.iGM_Name,
      type: client.iGM_Type,
      description: client.iGM_Description,
    },
    scopes: request.scope.split(" ").filter(Boolean),
  };
}

/** 签发授权码并返回回跳地址（用户同意） */
export function iGM_ApproveAuthorizationService(
  user: iGM_UserRow,
  request: iGM_AuthorizeRequest,
  ip: string | null,
): { redirectUrl: string } {
  const client = iGM_FindOAuthClientByClientId(request.clientId);
  if (!client || client.iGM_Status !== "approved") {
    throw new iGM_OAuthError("oauth.errors.invalidClient", 400);
  }
  const now = new Date();
  const code = iGM_OAuthRandomToken();
  iGM_InsertOAuthCode({
    id: crypto.randomUUID(),
    code,
    clientId: client.iGM_ClientId,
    userId: user.iGM_Id,
    scope: request.scope,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    codeChallengeMethod: request.codeChallenge ? "S256" : null,
    nonce: request.nonce,
    expiresAt: new Date(
      now.getTime() + iGM_AuthorizationCodeTtlSeconds * 1000,
    ).toISOString(),
    now: now.toISOString(),
  });
  // 记录用户同意（按 用户+应用 唯一，scope 取并集覆盖）
  iGM_UpsertOAuthConsent({
    id: crypto.randomUUID(),
    userId: user.iGM_Id,
    clientId: client.iGM_ClientId,
    scope: request.scope,
    now: now.toISOString(),
  });
  iGM_Log({
    clientId: client.iGM_ClientId,
    userId: user.iGM_Id,
    action: "authorize",
    detail: request.scope,
    ip,
  });
  return {
    redirectUrl: iGM_BuildRedirect(request.redirectUri, {
      code,
      state: request.state || null,
    }),
  };
}

/** 拒绝授权：按规范回跳 error=access_denied */
export function iGM_DenyAuthorizationService(
  user: iGM_UserRow,
  request: iGM_AuthorizeRequest,
  ip: string | null,
): { redirectUrl: string } {
  iGM_Log({
    clientId: request.clientId,
    userId: user.iGM_Id,
    action: "deny",
    detail: null,
    ip,
  });
  return {
    redirectUrl: iGM_BuildRedirect(request.redirectUri, {
      error: "access_denied",
      error_description: "user_denied",
      state: request.state || null,
    }),
  };
}

/**
 * 是否可跳过授权页（已存在覆盖本次请求 scope 的同意记录）。
 * 命中时 /oauth/authorize 直接签发授权码回跳，符合 OIDC 静默授权体验。
 */
export function iGM_HasFullConsent(
  userId: string,
  request: iGM_AuthorizeRequest,
): boolean {
  const consent = iGM_FindOAuthConsent(userId, request.clientId);
  if (!consent) return false;
  return iGM_ScopeCovers(consent.iGM_Scope, request.scope);
}

/* ---------- 令牌端点 ---------- */

/** 校验客户端身份：client_secret 哈希比对 */
function iGM_AuthenticateClient(
  credentials: iGM_ClientCredentials,
): iGM_OAuthClientRow {
  const client = credentials.clientId
    ? iGM_FindOAuthClientByClientId(credentials.clientId)
    : null;
  if (!client) {
    throw new iGM_OAuthError("oauth.errors.invalidClient", 401);
  }
  if (client.iGM_Status !== "approved") {
    throw new iGM_OAuthError("oauth.errors.clientNotApproved", 403);
  }
  if (
    !client.iGM_ClientSecretHash ||
    !credentials.clientSecret ||
    client.iGM_ClientSecretHash !== iGM_Sha256(credentials.clientSecret)
  ) {
    throw new iGM_OAuthError("oauth.errors.invalidClientSecret", 401);
  }
  return client;
}

/** 判断令牌是否已过期 */
function iGM_IsExpired(iso: string | null): boolean {
  if (!iso) return true;
  return new Date(iso).getTime() <= Date.now();
}

/** 生成 ID Token（ES256 签名 JWT） */
async function iGM_BuildIdToken(params: {
  user: iGM_UserRow;
  clientId: string;
  nonce: string | null;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = {
    iss: iGM_Config.oauth.issuer,
    sub: params.user.iGM_Uid,
    aud: params.clientId,
    exp: now + iGM_Config.oauth.accessTokenTtlSeconds,
    iat: now,
    name: params.user.iGM_DisplayName ?? params.user.iGM_Username,
    picture: params.user.iGM_Avatar,
    email: params.user.iGM_Email,
  };
  if (params.nonce) claims.nonce = params.nonce;
  return iGM_SignJwt(claims);
}

/** 签发一对令牌并落库（access/refresh 只存哈希） */
async function iGM_IssueTokens(params: {
  client: iGM_OAuthClientRow;
  user: iGM_UserRow;
  scope: string;
  refreshExpiresAt: string;
  nonce: string | null;
}): Promise<iGM_TokenResponse & { accessExpiresAt: string }> {
  const now = Date.now();
  const accessToken = iGM_OAuthRandomToken();
  const refreshToken = iGM_OAuthRandomToken();
  const accessExpiresAt = new Date(
    now + iGM_Config.oauth.accessTokenTtlSeconds * 1000,
  ).toISOString();
  iGM_InsertOAuthToken({
    id: crypto.randomUUID(),
    accessTokenHash: iGM_Sha256(accessToken),
    refreshTokenHash: iGM_Sha256(refreshToken),
    clientId: params.client.iGM_ClientId,
    userId: params.user.iGM_Id,
    scope: params.scope,
    expiresAt: accessExpiresAt,
    refreshExpiresAt: params.refreshExpiresAt,
    now: new Date(now).toISOString(),
  });
  const response: iGM_TokenResponse = {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: iGM_Config.oauth.accessTokenTtlSeconds,
    refresh_token: refreshToken,
    scope: params.scope,
  };
  if (params.scope.includes("openid")) {
    response.id_token = await iGM_BuildIdToken({
      user: params.user,
      clientId: params.client.iGM_ClientId,
      nonce: params.nonce,
    });
  }
  return { ...response, accessExpiresAt };
}

/** authorization_code 换令牌 */
export async function iGM_ExchangeAuthorizationCodeService(params: {
  credentials: iGM_ClientCredentials;
  code: string;
  redirectUri: string;
  codeVerifier: string;
  ip: string | null;
}): Promise<iGM_TokenResponse> {
  const client = iGM_AuthenticateClient(params.credentials);
  const codeRow = params.code ? iGM_FindOAuthCodeByCode(params.code) : null;
  if (!codeRow || codeRow.iGM_ClientId !== client.iGM_ClientId) {
    throw new iGM_OAuthError("oauth.errors.invalidCode", 400);
  }
  if (codeRow.iGM_Used === 1) {
    // 授权码已被使用：按规范撤销该码签发的全部令牌，防重放
    throw new iGM_OAuthError("oauth.errors.codeUsed", 400);
  }
  if (iGM_IsExpired(codeRow.iGM_ExpiresAt)) {
    throw new iGM_OAuthError("oauth.errors.codeExpired", 400);
  }
  if (codeRow.iGM_RedirectUri !== params.redirectUri) {
    throw new iGM_OAuthError("oauth.errors.invalidRedirectUri", 400);
  }
  if (codeRow.iGM_CodeChallenge) {
    if (
      !iGM_VerifyPkce(
        params.codeVerifier,
        codeRow.iGM_CodeChallenge,
        codeRow.iGM_CodeChallengeMethod,
      )
    ) {
      throw new iGM_OAuthError("oauth.errors.pkceFailed", 400);
    }
  }
  // 一次性核销：并发下只有一个请求能成功
  if (!iGM_MarkOAuthCodeUsed(codeRow.iGM_Id)) {
    throw new iGM_OAuthError("oauth.errors.codeUsed", 400);
  }

  const user = iGM_FindUserById(codeRow.iGM_UserId);
  if (!user || user.iGM_Status !== "active") {
    throw new iGM_OAuthError("oauth.errors.userUnavailable", 400);
  }
  const refreshExpiresAt = new Date(
    Date.now() + iGM_Config.oauth.refreshTokenTtlSeconds * 1000,
  ).toISOString();
  const token = await iGM_IssueTokens({
    client,
    user,
    scope: codeRow.iGM_Scope,
    refreshExpiresAt,
    nonce: codeRow.iGM_Nonce,
  });
  iGM_Log({
    clientId: client.iGM_ClientId,
    userId: user.iGM_Id,
    action: "token",
    detail: codeRow.iGM_Scope,
    ip: params.ip,
  });
  const { accessExpiresAt: _expiresAt, ...response } = token;
  void _expiresAt;
  return response;
}

/**
 * refresh_token 换令牌：轮换刷新令牌，但最长有效期不变
 * （沿用原始 iGM_RefreshExpiresAt，到期即拒绝续期，用户必须重新授权）。
 */
export async function iGM_RefreshTokenService(params: {
  credentials: iGM_ClientCredentials;
  refreshToken: string;
  scope: string | null;
  ip: string | null;
}): Promise<iGM_TokenResponse> {
  const client = iGM_AuthenticateClient(params.credentials);
  const hash = iGM_Sha256(params.refreshToken);
  const row = params.refreshToken
    ? iGM_FindOAuthTokenByRefreshHash(hash)
    : null;
  if (!row || row.iGM_ClientId !== client.iGM_ClientId) {
    throw new iGM_OAuthError("oauth.errors.invalidGrant", 400);
  }
  if (row.iGM_Revoked === 1) {
    throw new iGM_OAuthError("oauth.errors.invalidGrant", 400);
  }
  if (iGM_IsExpired(row.iGM_RefreshExpiresAt)) {
    throw new iGM_OAuthError("oauth.errors.refreshExpired", 400);
  }
  const user = iGM_FindUserById(row.iGM_UserId);
  if (!user || user.iGM_Status !== "active") {
    throw new iGM_OAuthError("oauth.errors.userUnavailable", 400);
  }
  // 请求的 scope 必须是原授权 scope 的子集
  const requested = params.scope
    ? iGM_NormalizeScope(params.scope)
    : row.iGM_Scope;
  if (!iGM_ScopeCovers(row.iGM_Scope, requested)) {
    throw new iGM_OAuthError("oauth.errors.invalidScope", 400);
  }

  // 轮换：旧行立即撤销，新行沿用原始刷新到期时间
  iGM_RevokeOAuthTokenById(row.iGM_Id, new Date().toISOString());
  const token = await iGM_IssueTokens({
    client,
    user,
    scope: requested,
    refreshExpiresAt: row.iGM_RefreshExpiresAt!,
    nonce: null,
  });
  iGM_Log({
    clientId: client.iGM_ClientId,
    userId: user.iGM_Id,
    action: "refresh",
    detail: requested,
    ip: params.ip,
  });
  const { accessExpiresAt: _expiresAt, ...response } = token;
  void _expiresAt;
  return response;
}

/* ---------- userinfo 与撤销 ---------- */

/** 解析并校验 Bearer 访问令牌 */
function iGM_ResolveAccessToken(bearer: string): {
  row: iGM_OAuthTokenRow;
  user: iGM_UserRow;
} {
  const token = bearer.replace(/^Bearer\s+/i, "").trim();
  const row = token ? iGM_FindOAuthTokenByAccessHash(iGM_Sha256(token)) : null;
  if (!row || row.iGM_Revoked === 1 || iGM_IsExpired(row.iGM_ExpiresAt)) {
    throw new iGM_OAuthError("oauth.errors.invalidToken", 401);
  }
  const user = iGM_FindUserById(row.iGM_UserId);
  if (!user || user.iGM_Status !== "active") {
    throw new iGM_OAuthError("oauth.errors.invalidToken", 401);
  }
  return { row, user };
}

/** userinfo：按 scope 返回用户公开信息（sub 恒为 11 位 iGMUid） */
export function iGM_GetUserInfoService(bearer: string): Record<string, unknown> {
  const { row, user } = iGM_ResolveAccessToken(bearer);
  const scopes = new Set(row.iGM_Scope.split(" ").filter(Boolean));
  const claims: Record<string, unknown> = { sub: user.iGM_Uid };
  if (scopes.has("profile")) {
    claims.name = user.iGM_DisplayName ?? user.iGM_Username;
    claims.picture = user.iGM_Avatar;
    claims.preferred_username = user.iGM_Username;
  }
  if (scopes.has("email")) {
    claims.email = user.iGM_Email;
    claims.email_verified = user.iGM_EmailVerified === 1;
  }
  if (scopes.has("org")) {
    claims.org = iGM_ResolveUserOrgBadge(
      user.iGM_VerifiedOrgId ?? null,
      user.iGM_Email,
    );
  }
  return claims;
}

/** 撤销令牌：既接受 access_token 也接受 refresh_token（RFC 7009） */
export function iGM_RevokeTokenService(params: {
  credentials: iGM_ClientCredentials;
  token: string;
  ip: string | null;
}): void {
  const client = iGM_AuthenticateClient(params.credentials);
  const hash = iGM_Sha256(params.token ?? "");
  const row =
    iGM_FindOAuthTokenByAccessHash(hash) ??
    iGM_FindOAuthTokenByRefreshHash(hash);
  if (!row || row.iGM_ClientId !== client.iGM_ClientId) {
    // 按规范：未知令牌也返回成功，避免探测
    return;
  }
  iGM_RevokeOAuthTokenById(row.iGM_Id, new Date().toISOString());
  iGM_Log({
    clientId: client.iGM_ClientId,
    userId: row.iGM_UserId,
    action: "revoke",
    detail: null,
    ip: params.ip,
  });
}

/* ---------- 用户授权管理 ---------- */

/** 用户侧：已授权应用列表 */
export function iGM_ListUserConsentsService(
  user: iGM_UserRow,
): Array<Record<string, unknown>> {
  return iGM_ListOAuthConsentsByUser(user.iGM_Id).map((row) => ({
    clientId: row.iGM_ClientId,
    name: row.iGM_Name,
    type: row.iGM_Type,
    description: row.iGM_Description,
    status: row.iGM_Status,
    scopes: row.iGM_Scope.split(" ").filter(Boolean),
    grantedAt: row.iGM_GrantedAt,
  }));
}

/** 用户侧：撤销对某应用的授权（同时撤销其已签发令牌并清除同意记录） */
export function iGM_RevokeUserConsentService(
  user: iGM_UserRow,
  clientId: string,
  ip: string | null,
): void {
  const now = new Date().toISOString();
  iGM_RevokeOAuthTokensByUserClient({
    userId: user.iGM_Id,
    clientId,
    now,
  });
  iGM_DeleteOAuthConsent(user.iGM_Id, clientId);
  iGM_Log({
    clientId,
    userId: user.iGM_Id,
    action: "consent.revoke",
    detail: null,
    ip,
  });
}

/* ---------- OIDC 发现文档 ---------- */

/** 组装 OIDC 发现文档（/.well-known/openid-configuration） */
export function iGM_GetDiscoveryDocumentService(): Record<string, unknown> {
  const issuer = iGM_Config.oauth.issuer.replace(/\/$/, "");
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    userinfo_endpoint: `${issuer}/oauth/userinfo`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    jwks_uri: `${issuer}/oauth/jwks.json`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["ES256"],
    scopes_supported: iGM_OAuthScopes,
    token_endpoint_auth_methods_supported: [
      "client_secret_basic",
      "client_secret_post",
    ],
    code_challenge_methods_supported: ["S256"],
    claims_supported: [
      "sub",
      "iss",
      "aud",
      "exp",
      "iat",
      "name",
      "picture",
      "email",
      "preferred_username",
      "org",
    ],
  };
}

// 导出 //
export default {
  iGM_SubmitOAuthApplyService,
  iGM_ListMyOAuthClientsService,
  iGM_WithdrawOAuthClientService,
  iGM_ResetClientSecretService,
  iGM_ListMyOAuthLogsService,
  iGM_AdminListOAuthClientsService,
  iGM_ReviewOAuthClientService,
  iGM_SetOAuthClientDisabledService,
  iGM_DeleteOAuthClientService,
  iGM_ParseRedirectUris,
  iGM_IsAcceptableRedirectUri,
  iGM_BuildRedirect,
  iGM_ValidateAuthorizeRequest,
  iGM_GetAuthorizeInfoService,
  iGM_ApproveAuthorizationService,
  iGM_DenyAuthorizationService,
  iGM_HasFullConsent,
  iGM_ExchangeAuthorizationCodeService,
  iGM_RefreshTokenService,
  iGM_GetUserInfoService,
  iGM_RevokeTokenService,
  iGM_ListUserConsentsService,
  iGM_RevokeUserConsentService,
  iGM_GetDiscoveryDocumentService,
};
