/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_OAuth.ts
 * 所属层：后端 / 路由层
 * 路由：/oauth/*、/.well-known/openid-configuration、/G_OAuth/*
 * 模块：G_OAuth
 * 作用：模块二十一 OAuth 2.0 + OpenID Connect 身份提供方的全部端点
 * 内容：
 *   标准端点：授权端点 /oauth/authorize（校验后跳转前端同意页或静默签发授权码）、
 *             令牌端点 /oauth/token（authorization_code / refresh_token）、
 *             用户信息 /oauth/userinfo（Bearer）、撤销 /oauth/revoke、
 *             OIDC 发现文档 /.well-known/openid-configuration、JWKS /oauth/jwks.json；
 *   站内端点：授权同意页数据与决策、开发者应用申请/撤回/重置密钥/日志、
 *             管理端审核与启停删除、用户侧已授权应用查询与撤销
 * 约束：标准端点按 OAuth/OIDC 规范返回裸 JSON（不套统一响应壳），
 *       站内端点沿用统一响应 { success, code, message, data }；
 *       令牌端点限流、redirect_uri 严格匹配、授权码一次性、PKCE 仅 S256
 */

// 导入依赖 //
import { Elysia } from "elysia";
import { iGM_Config } from "../iGM_Config/iGM_Config";
import { iGM_Ok } from "../iGM_Types/iGM_Response";
import {
  iGM_RequireRole,
  iGM_RequireUser,
} from "../iGM_Middleware/iGM_AuthGuard";
import {
  iGM_BuildSetCookie,
  iGM_ReadCookie,
} from "../iGM_Services/iGM_SecurityService";
import {
  iGM_BoolField,
  iGM_ClientIp,
  iGM_CurrentUser,
  iGM_EnforceRateLimit,
  iGM_Field,
  iGM_PageQuery,
  iGM_Query,
  type iGM_RouteContext,
} from "./iGM_RouteSupport";
import {
  iGM_GetJwks,
  iGM_SignCookiePayload,
  iGM_VerifyCookiePayload,
} from "../iGM_Services/iGM_OAuthCrypto";
import {
  iGM_AdminListOAuthClientsService,
  iGM_ApproveAuthorizationService,
  iGM_BuildRedirect,
  iGM_DeleteOAuthClientService,
  iGM_DeleteOwnOAuthClientService,
  iGM_DenyAuthorizationService,
  iGM_ExchangeAuthorizationCodeService,
  iGM_GetAuthorizeInfoService,
  iGM_GetDiscoveryDocumentService,
  iGM_GetUserInfoService,
  iGM_HasFullConsent,
  iGM_IsRedirectUriAllowed,
  iGM_ListMyOAuthClientsService,
  iGM_ListMyOAuthLogsService,
  iGM_ListUserConsentsService,
  iGM_OAuthError,
  iGM_ParseRedirectUris,
  iGM_RefreshTokenService,
  iGM_ResetClientSecretService,
  iGM_ReviewOAuthClientService,
  iGM_RevokeTokenService,
  iGM_RevokeUserConsentService,
  iGM_SetOAuthClientDisabledService,
  iGM_SubmitOAuthApplyService,
  iGM_ValidateAuthorizeRequest,
  iGM_WithdrawOAuthClientService,
  type iGM_ClientCredentials,
} from "../iGM_Services/iGM_OAuthService";
import { iGM_FindOAuthClientByClientId } from "../iGM_Repositories/iGM_OAuthRepository";
import type {
  iGM_AuthorizeRequest,
  iGM_OAuthApplyInput,
} from "../iGM_Types/iGM_OAuth";

// 类型定义 //
/** 授权流 Cookie 载荷：授权请求参数 + 过期时间戳（签名后存放于 iGM_OAuthFlow） */
interface iGM_OAuthFlowPayload extends iGM_AuthorizeRequest {
  exp: number;
}

/** 业务错误文案键 → OAuth 规范错误码 */
const iGM_OAuthErrorCodes: Record<string, string> = {
  "oauth.errors.invalidClient": "invalid_client",
  "oauth.errors.invalidClientSecret": "invalid_client",
  "oauth.errors.clientNotApproved": "unauthorized_client",
  "oauth.errors.invalidCode": "invalid_grant",
  "oauth.errors.codeUsed": "invalid_grant",
  "oauth.errors.codeExpired": "invalid_grant",
  "oauth.errors.invalidGrant": "invalid_grant",
  "oauth.errors.refreshExpired": "invalid_grant",
  "oauth.errors.invalidRedirectUri": "invalid_request",
  "oauth.errors.pkceFailed": "invalid_grant",
  "oauth.errors.userUnavailable": "invalid_grant",
  "oauth.errors.invalidScope": "invalid_scope",
  "oauth.errors.invalidToken": "invalid_token",
  "oauth.errors.unsupportedResponseType": "unsupported_response_type",
};

// 核心逻辑 //
/* ---------- 通用工具 ---------- */

/** 返回裸 JSON 响应（标准 OAuth/OIDC 端点不使用统一响应壳） */
function iGM_JsonResponse(
  data: unknown,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

/** 返回 302 重定向响应 */
function iGM_RedirectResponse(
  location: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: location, ...headers },
  });
}

/** 业务错误 → OAuth 规范错误码（未知文案键回退 invalid_request） */
function iGM_OAuthErrorCode(error: iGM_OAuthError): string {
  return iGM_OAuthErrorCodes[error.message] ?? "invalid_request";
}

/** 把业务错误转成标准 OAuth 错误响应 */
function iGM_ProtocolError(error: iGM_OAuthError): Response {
  return iGM_JsonResponse(
    { error: iGM_OAuthErrorCode(error), error_description: error.message },
    error.status,
    { "Cache-Control": "no-store" },
  );
}

/**
 * 读取表单参数：Elysia 已按 Content-Type 解析请求体，
 * application/x-www-form-urlencoded 与 application/json 均落为对象。
 */
function iGM_ReadParams(body: unknown): Record<string, string> {
  const source = (body ?? {}) as Record<string, unknown>;
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string") params[key] = value;
    else if (typeof value === "number") params[key] = String(value);
  }
  return params;
}

/** 读取字符串数组字段（兼容数组与换行/逗号分隔字符串） */
function iGM_StringArrayField(body: unknown, key: string): string[] {
  const source = (body ?? {}) as Record<string, unknown>;
  const value = source[key];
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string") {
    return value
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

/** 读取客户端凭据：优先 client_secret_basic，其次 client_secret_post */
function iGM_ReadClientCredentials(
  request: Request,
  params: Record<string, string>,
): iGM_ClientCredentials {
  const header = (request.headers.get("Authorization") ?? "").trim();
  const basic = /^Basic\s+(.+)$/i.exec(header);
  if (basic) {
    let decoded = "";
    try {
      decoded = atob(basic[1]);
    } catch {
      decoded = "";
    }
    const index = decoded.indexOf(":");
    if (index >= 0) {
      return {
        clientId: decodeURIComponent(decoded.slice(0, index)),
        clientSecret: decodeURIComponent(decoded.slice(index + 1)),
      };
    }
  }
  return {
    clientId: params.client_id ?? "",
    clientSecret: params.client_secret ?? "",
  };
}

/** 读取并校验授权流 Cookie（签名不合法或已过期返回 null） */
async function iGM_ReadFlow(
  ctx: iGM_RouteContext,
): Promise<iGM_AuthorizeRequest | null> {
  return await iGM_VerifyCookiePayload<iGM_OAuthFlowPayload>(
    iGM_ReadCookie(ctx.request, iGM_Config.oauth.flowCookieName),
  );
}

/**
 * 构造前端授权同意页地址（携带完整授权请求参数）。
 * 前端为 URL 前缀式多语言路由，路径必须是 /{locale}/G_OAuthAuthorize，
 * 缺少语言前缀会命中 404（此前的线上问题根因）。
 */
function iGM_BuildConsentUrl(request: iGM_AuthorizeRequest): string {
  const base = iGM_Config.auth.webBaseUrl.replace(/\/$/, "");
  const locale = iGM_Config.oauth.consentLocale.replace(/^\/|\/$/g, "");
  const path = iGM_Config.oauth.consentPath.startsWith("/")
    ? iGM_Config.oauth.consentPath
    : `/${iGM_Config.oauth.consentPath}`;
  const params = new URLSearchParams({
    client_id: request.clientId,
    redirect_uri: request.redirectUri,
    response_type: "code",
    scope: request.scope,
  });
  if (request.state) params.set("state", request.state);
  if (request.nonce) params.set("nonce", request.nonce);
  if (request.codeChallenge) {
    params.set("code_challenge", request.codeChallenge);
    params.set("code_challenge_method", "S256");
  }
  return `${base}/${locale}${path}?${params.toString()}`;
}

/** 构造前端授权同意页的错误展示地址（授权请求校验失败、无法安全回跳第三方时使用） */
function iGM_BuildConsentErrorUrl(error: iGM_OAuthError): string {
  const base = iGM_Config.auth.webBaseUrl.replace(/\/$/, "");
  const locale = iGM_Config.oauth.consentLocale.replace(/^\/|\/$/g, "");
  const path = iGM_Config.oauth.consentPath.startsWith("/")
    ? iGM_Config.oauth.consentPath
    : `/${iGM_Config.oauth.consentPath}`;
  const params = new URLSearchParams({
    error: iGM_OAuthErrorCode(error),
    error_description: error.message,
  });
  return `${base}/${locale}${path}?${params.toString()}`;
}

/**
 * 校验失败时仍可安全回跳的地址：
 * 仅当 client_id 已注册且 redirect_uri 命中注册列表（含附加查询串）时返回，否则 null。
 */
async function iGM_TryErrorRedirectTarget(
  query: Record<string, string | undefined>,
): Promise<string | null> {
  const clientId = (query.client_id ?? "").trim();
  const redirectUri = (query.redirect_uri ?? "").trim();
  if (!clientId || !redirectUri) return null;
  const client = await iGM_FindOAuthClientByClientId(clientId);
  if (!client) return null;
  return iGM_IsRedirectUriAllowed(
    iGM_ParseRedirectUris(client.iGM_RedirectUris),
    redirectUri,
  )
    ? redirectUri
    : null;
}

/** 打印跳转调试日志（重定向前后均可读） */
function iGM_LogRedirect(
  target: string,
  params: Record<string, string | null>,
): void {
  console.log(`[OAuth Debug] 准备重定向至：${target}`);
  const detail = Object.entries(params)
    .filter(([, value]) => value !== null && value !== "")
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
  console.log(`[OAuth Debug] 参数：${detail}`);
}

/* ---------- 标准端点：授权 ---------- */

/**
 * GET /oauth/authorize
 * 1) 校验 client_id / redirect_uri / response_type / PKCE；
 * 2) 已登录且存在覆盖本次 scope 的同意记录 → 直接签发授权码并回跳（静默授权）；
 * 3) 否则下发签名授权流 Cookie 并跳转前端同意页。
 */
async function iGM_HandleAuthorize(ctx: iGM_RouteContext): Promise<Response> {
  iGM_EnforceRateLimit(ctx, "oauthAuthorize", `ip:${iGM_ClientIp(ctx)}`);
  const query = ctx.query;

  let request: iGM_AuthorizeRequest;
  try {
    request = (await iGM_ValidateAuthorizeRequest(query)).request;
  } catch (error) {
    if (error instanceof iGM_OAuthError) {
      // 回调地址合法 → 按 OAuth 规范带 error 回跳第三方；否则跳到本站同意页展示明确错误
      const target = await iGM_TryErrorRedirectTarget(query);
      const errorParams = {
        error: iGM_OAuthErrorCode(error),
        error_description: error.message,
        state: (query.state ?? "").length > 0 ? query.state! : null,
      };
      const location = target
        ? iGM_BuildRedirect(target, errorParams)
        : iGM_BuildConsentErrorUrl(error);
      iGM_LogRedirect(location, errorParams);
      return iGM_RedirectResponse(location);
    }
    throw error;
  }

  const ip = iGM_ClientIp(ctx);
  const user = await iGM_CurrentUser(ctx);
  if (user && (await iGM_HasFullConsent(user.iGM_Id, request))) {
    const { redirectUrl } = await iGM_ApproveAuthorizationService(
      user,
      request,
      ip,
    );
    iGM_LogRedirect(redirectUrl, {
      code: new URL(redirectUrl).searchParams.get("code"),
      state: request.state || null,
    });
    return iGM_RedirectResponse(redirectUrl);
  }

  const flow = await iGM_SignCookiePayload({
    ...request,
    exp: Date.now() + iGM_Config.oauth.flowTtlSeconds * 1000,
  });
  const consentUrl = iGM_BuildConsentUrl(request);
  iGM_LogRedirect(consentUrl, {
    client_id: request.clientId,
    redirect_uri: request.redirectUri,
    state: request.state || null,
  });
  return iGM_RedirectResponse(consentUrl, {
    "Set-Cookie": iGM_BuildSetCookie(
      iGM_Config.oauth.flowCookieName,
      flow,
      iGM_Config.oauth.flowTtlSeconds,
    ),
  });
}

/* ---------- 站内端点：授权同意页 ---------- */

/** GET /G_OAuth/authorize/info：同意页展示所需的应用公开信息 */
async function iGM_HandleAuthorizeInfo(ctx: iGM_RouteContext) {
  const flow = await iGM_ReadFlow(ctx);
  if (!flow) throw new iGM_OAuthError("oauth.errors.flowExpired", 400);
  return iGM_Ok({
    ...(await iGM_GetAuthorizeInfoService(flow)),
    loggedIn: Boolean(await iGM_CurrentUser(ctx)),
  });
}

/** POST /G_OAuth/authorize/decision：用户同意或拒绝，返回第三方回跳地址 */
async function iGM_HandleAuthorizeDecision(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "oauthAuthorize", `user:${user.iGM_Id}`);
  const flow = await iGM_ReadFlow(ctx);
  if (!flow) throw new iGM_OAuthError("oauth.errors.flowExpired", 400);

  const decision = iGM_Field(ctx.body, "decision");
  if (decision !== "approve" && decision !== "deny") {
    throw new iGM_OAuthError("oauth.errors.badRequest", 422);
  }
  const ip = iGM_ClientIp(ctx);
  const result =
    decision === "deny"
      ? await iGM_DenyAuthorizationService(user, flow, ip)
      : await iGM_ApproveAuthorizationService(user, flow, ip);
  // 授权流一次有效：无论同意与否都清除 Cookie
  ctx.set.headers["Set-Cookie"] = iGM_BuildSetCookie(
    iGM_Config.oauth.flowCookieName,
    "",
    0,
  );
  iGM_LogRedirect(result.redirectUrl, {
    code: new URL(result.redirectUrl).searchParams.get("code"),
    state: flow.state || null,
  });
  return iGM_Ok({ redirectUrl: result.redirectUrl });
}

/* ---------- 标准端点：令牌 / 用户信息 / 撤销 ---------- */

/** POST /oauth/token：authorization_code 与 refresh_token 两种授权类型 */
async function iGM_HandleToken(ctx: iGM_RouteContext): Promise<Response> {
  const ip = iGM_ClientIp(ctx);
  iGM_EnforceRateLimit(ctx, "oauthToken", `ip:${ip}`);
  const params = iGM_ReadParams(ctx.body);
  const credentials = iGM_ReadClientCredentials(ctx.request, params);

  try {
    let response;
    if (params.grant_type === "authorization_code") {
      response = await iGM_ExchangeAuthorizationCodeService({
        credentials,
        code: params.code ?? "",
        redirectUri: params.redirect_uri ?? "",
        codeVerifier: params.code_verifier ?? "",
        ip,
      });
    } else if (params.grant_type === "refresh_token") {
      response = await iGM_RefreshTokenService({
        credentials,
        refreshToken: params.refresh_token ?? "",
        scope: params.scope ?? null,
        ip,
      });
    } else {
      return iGM_JsonResponse(
        {
          error: "unsupported_grant_type",
          error_description: "oauth.errors.unsupportedGrantType",
        },
        400,
        { "Cache-Control": "no-store" },
      );
    }
    return iGM_JsonResponse(response, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    if (error instanceof iGM_OAuthError) return iGM_ProtocolError(error);
    throw error;
  }
}

/** GET /oauth/userinfo：按 scope 返回用户公开信息 */
async function iGM_HandleUserInfo(ctx: iGM_RouteContext): Promise<Response> {
  iGM_EnforceRateLimit(ctx, "oauthUserinfo", `ip:${iGM_ClientIp(ctx)}`);
  try {
    const claims = await iGM_GetUserInfoService(
      ctx.request.headers.get("Authorization") ?? "",
    );
    return iGM_JsonResponse(claims, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    if (error instanceof iGM_OAuthError) {
      return iGM_JsonResponse(
        { error: "invalid_token", error_description: error.message },
        error.status,
        {
          "Cache-Control": "no-store",
          "WWW-Authenticate": 'Bearer error="invalid_token"',
        },
      );
    }
    throw error;
  }
}

/** POST /oauth/revoke：撤销 access_token 或 refresh_token（RFC 7009） */
async function iGM_HandleRevoke(ctx: iGM_RouteContext): Promise<Response> {
  const ip = iGM_ClientIp(ctx);
  iGM_EnforceRateLimit(ctx, "oauthUserinfo", `ip:${ip}`);
  const params = iGM_ReadParams(ctx.body);
  try {
    await iGM_RevokeTokenService({
      credentials: iGM_ReadClientCredentials(ctx.request, params),
      token: params.token ?? "",
      ip,
    });
    return new Response(null, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof iGM_OAuthError) return iGM_ProtocolError(error);
    throw error;
  }
}

/* ---------- 标准端点：OIDC 发现与 JWKS ---------- */

/** GET /.well-known/openid-configuration */
async function iGM_HandleDiscovery(): Promise<Response> {
  return iGM_JsonResponse(iGM_GetDiscoveryDocumentService(), 200, {
    "Cache-Control": "public, max-age=3600",
  });
}

/** GET /oauth/jwks.json：暴露 P-256 公钥（含历史启用密钥，便于轮换过渡） */
async function iGM_HandleJwks(): Promise<Response> {
  return iGM_JsonResponse(await iGM_GetJwks(), 200, {
    "Cache-Control": "public, max-age=3600",
  });
}

/* ---------- 站内端点：开发者应用管理 ---------- */

/** POST /G_OAuth/apps：提交 OAuth 应用接入申请（待审核） */
async function iGM_HandleApply(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "oauthAppWrite", `user:${user.iGM_Id}`);
  const input: iGM_OAuthApplyInput = {
    name: iGM_Field(ctx.body, "name"),
    type: iGM_Field(ctx.body, "type"),
    description: iGM_Field(ctx.body, "description"),
    redirectUris: iGM_StringArrayField(ctx.body, "redirectUris"),
    scopes: iGM_StringArrayField(ctx.body, "scopes"),
    purpose: iGM_Field(ctx.body, "purpose"),
    contact: iGM_Field(ctx.body, "contact"),
    agreeRules: iGM_BoolField(ctx.body, "agreeRules"),
    localTest: iGM_BoolField(ctx.body, "localTest"),
  };
  return iGM_Ok(
    await iGM_SubmitOAuthApplyService(user, input),
    "oauth.messages.applied",
  );
}

/** GET /G_OAuth/apps/mine：我提交的 OAuth 应用列表 */
async function iGM_HandleMyApps(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  return iGM_Ok({ items: await iGM_ListMyOAuthClientsService(user) });
}

/** POST /G_OAuth/apps/withdraw：撤回本人待审核的申请 */
async function iGM_HandleWithdraw(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  const clientId = iGM_Field(ctx.body, "clientId").trim();
  if (!clientId) throw new iGM_OAuthError("oauth.errors.badRequest", 422);
  await iGM_WithdrawOAuthClientService(user, clientId);
  return iGM_Ok({ clientId }, "oauth.messages.withdrawn");
}

/** POST /G_OAuth/apps/reset-secret：重置 client_secret（新值仅本次返回） */
async function iGM_HandleResetSecret(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "oauthAppWrite", `user:${user.iGM_Id}`);
  const clientId = iGM_Field(ctx.body, "clientId").trim();
  if (!clientId) throw new iGM_OAuthError("oauth.errors.badRequest", 422);
  return iGM_Ok(
    await iGM_ResetClientSecretService(user, clientId),
    "oauth.messages.secretReset",
  );
}

/** GET /G_OAuth/apps/logs：查看本人应用的接入日志（分页） */
async function iGM_HandleMyLogs(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  const clientId = iGM_Query(ctx.query, "clientId");
  const { page, pageSize } = iGM_PageQuery(ctx);
  return iGM_Ok(
    await iGM_ListMyOAuthLogsService(user, clientId, page, pageSize),
  );
}

/* ---------- 站内端点：管理端审核 ---------- */

/** GET /G_OAuth/admin/apps：按状态分页列出全部应用 */
async function iGM_HandleAdminList(ctx: iGM_RouteContext) {
  iGM_RequireRole(await iGM_CurrentUser(ctx), "admin");
  const { page, pageSize } = iGM_PageQuery(ctx);
  return iGM_Ok(
    await iGM_AdminListOAuthClientsService(
      iGM_Query(ctx.query, "status") || null,
      page,
      pageSize,
    ),
  );
}

/** POST /G_OAuth/admin/review：通过或拒绝应用（通过时发放 client_secret，仅本次返回） */
async function iGM_HandleAdminReview(ctx: iGM_RouteContext) {
  const reviewer = iGM_RequireRole(await iGM_CurrentUser(ctx), "admin");
  iGM_EnforceRateLimit(ctx, "adminWrite", `user:${reviewer.iGM_Id}`);
  const action = iGM_Field(ctx.body, "action");
  if (action !== "approve" && action !== "reject") {
    throw new iGM_OAuthError("oauth.errors.badRequest", 422);
  }
  return iGM_Ok(
    await iGM_ReviewOAuthClientService(
      reviewer,
      iGM_Field(ctx.body, "clientId").trim(),
      action,
      iGM_Field(ctx.body, "comment") || null,
      iGM_ClientIp(ctx),
    ),
    action === "approve" ? "oauth.messages.approved" : "oauth.messages.rejected",
  );
}

/** POST /G_OAuth/admin/status：启用或禁用应用 */
async function iGM_HandleAdminStatus(ctx: iGM_RouteContext) {
  const reviewer = iGM_RequireRole(await iGM_CurrentUser(ctx), "admin");
  iGM_EnforceRateLimit(ctx, "adminWrite", `user:${reviewer.iGM_Id}`);
  const disabled = iGM_BoolField(ctx.body, "disabled");
  await iGM_SetOAuthClientDisabledService(
    reviewer,
    iGM_Field(ctx.body, "clientId").trim(),
    disabled,
    iGM_ClientIp(ctx),
  );
  return iGM_Ok(
    { disabled },
    disabled ? "oauth.messages.disabled" : "oauth.messages.enabled",
  );
}

/** POST /G_OAuth/admin/delete：删除应用及其授权码 / 令牌 / 同意记录 */
async function iGM_HandleAdminDelete(ctx: iGM_RouteContext) {
  const reviewer = iGM_RequireRole(await iGM_CurrentUser(ctx), "admin");
  iGM_EnforceRateLimit(ctx, "adminWrite", `user:${reviewer.iGM_Id}`);
  const clientId = iGM_Field(ctx.body, "clientId").trim();
  if (!clientId) throw new iGM_OAuthError("oauth.errors.badRequest", 422);
  await iGM_DeleteOAuthClientService(reviewer, clientId, iGM_ClientIp(ctx));
  return iGM_Ok({ clientId }, "oauth.messages.deleted");
}

/* ---------- 模块二十二：OAuth 应用删除（软删除） ---------- */

/**
 * DELETE /api/oauth/clients/:id
 * 应用所有者可删除本人应用；管理员可删除任意应用。
 * 软删除：客户端记录标记为 deleted，令牌 / 授权 / 授权码立即失效，
 * 行保留以占用 client_id（已删除的 client_id 不可再次使用）。
 */
async function iGM_HandleDeleteClient(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  const clientId = (ctx.params?.id ?? "").trim();
  if (!clientId) throw new iGM_OAuthError("oauth.errors.badRequest", 422);
  iGM_EnforceRateLimit(ctx, "oauthAppWrite", `user:${user.iGM_Id}`);
  const ip = iGM_ClientIp(ctx);
  if (user.iGM_Role === "admin") {
    await iGM_DeleteOAuthClientService(user, clientId, ip);
  } else {
    await iGM_DeleteOwnOAuthClientService(user, clientId, ip);
  }
  return iGM_Ok({ clientId }, "oauth.messages.deleted");
}

/* ---------- 站内端点：用户授权管理 ---------- */

/** GET /G_OAuth/consents/mine：我授权过的应用列表 */
async function iGM_HandleMyConsents(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  return iGM_Ok({ items: await iGM_ListUserConsentsService(user) });
}

/** POST /G_OAuth/consents/revoke：撤销对某应用的授权（同时撤销其全部令牌） */
async function iGM_HandleRevokeConsent(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(await iGM_CurrentUser(ctx));
  iGM_EnforceRateLimit(ctx, "oauthAppWrite", `user:${user.iGM_Id}`);
  const clientId = iGM_Field(ctx.body, "clientId").trim();
  if (!clientId) throw new iGM_OAuthError("oauth.errors.badRequest", 422);
  await iGM_RevokeUserConsentService(user, clientId, iGM_ClientIp(ctx));
  return iGM_Ok({ clientId }, "oauth.messages.consentRevoked");
}

/** G_OAuth：OAuth 2.0 + OpenID Connect 身份提供方路由集合 */
export const G_OAuth = new Elysia({ name: "G_OAuth" })
  // 标准端点（裸 JSON / 302，遵循 OAuth 与 OIDC 规范）
  .get("/oauth/authorize", iGM_HandleAuthorize as never)
  .post("/oauth/token", iGM_HandleToken as never)
  .get("/oauth/userinfo", iGM_HandleUserInfo as never)
  .post("/oauth/revoke", iGM_HandleRevoke as never)
  .get("/oauth/jwks.json", iGM_HandleJwks as never)
  .get("/.well-known/openid-configuration", iGM_HandleDiscovery as never)
  // 站内端点（统一响应壳）
  .get("/G_OAuth/authorize/info", iGM_HandleAuthorizeInfo as never)
  .post("/G_OAuth/authorize/decision", iGM_HandleAuthorizeDecision as never)
  .post("/G_OAuth/apps", iGM_HandleApply as never)
  .get("/G_OAuth/apps/mine", iGM_HandleMyApps as never)
  .post("/G_OAuth/apps/withdraw", iGM_HandleWithdraw as never)
  .post("/G_OAuth/apps/reset-secret", iGM_HandleResetSecret as never)
  // 模块二十二：应用删除（软删除，所有者或管理员）
  .delete("/api/oauth/clients/:id", iGM_HandleDeleteClient as never)
  .get("/G_OAuth/apps/logs", iGM_HandleMyLogs as never)
  .get("/G_OAuth/admin/apps", iGM_HandleAdminList as never)
  .post("/G_OAuth/admin/review", iGM_HandleAdminReview as never)
  .post("/G_OAuth/admin/status", iGM_HandleAdminStatus as never)
  .post("/G_OAuth/admin/delete", iGM_HandleAdminDelete as never)
  .get("/G_OAuth/consents/mine", iGM_HandleMyConsents as never)
  .post("/G_OAuth/consents/revoke", iGM_HandleRevokeConsent as never);

// 导出 //
export default G_OAuth;
