/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_ExamOAuthClientService.ts
 * 所属层：后端 / 业务逻辑层
 * 路由：G_ExamOAuth（考试站 OAuth Client 对接主站 IdP）
 * 模块：iGM_ExamOAuthClientService
 * 作用：考试站作为 OAuth Client 接入主站 IdP 的全部业务编排
 * 内容：PKCE（S256）参数生成、state/code_verifier 临时缓存、
 *       主站 authorize 跳转、callback code 换 token、userinfo 拉取、
 *       本地用户绑定（sub=iGM_Uid 直查 iGM_Users）、
 *       本地会话签发（iGM_Sessions 表，Domain=.igcraftlit.com cookie）、
 *       登出（本地会话清除 + 主站 /oauth/revoke）
 * 约束：client_secret 仅从 Config（.env）读取，严禁落入日志或前端响应
 *       临时缓存仅存在进程内 Map（服务重启自然清空），不走数据库
 *       PKCE 强制 S256（与主站 IdP 一致）
 */

// 导入依赖 //
import { iGM_Config } from "../iGM_Config/iGM_Config";
import {
  iGM_CreateSession,
  iGM_DeleteSession,
  iGM_FindSession,
} from "../iGM_Repositories/iGM_SessionRepository";
import { iGM_FindUserByUid } from "../iGM_Repositories/iGM_UserRepository";
import {
  iGM_GenerateSessionId,
  iGM_RandomHex,
  iGM_Sha256,
} from "./iGM_SecurityService";
import type { iGM_UserRow } from "../iGM_Types/iGM_Auth";

// 类型定义 //
/** OAuth 主站 /oauth/token 端点返回的令牌响应 */
export interface iGM_OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  id_token?: string;
}

/** 主站 /oauth/userinfo 返回的用户公开信息 */
export interface iGM_OAuthUserinfo {
  /** 主站用户的 iGM_Uid */
  sub: string;
  name?: string;
  picture?: string;
  preferred_username?: string;
  email?: string;
}

/** 授权码换令牌流程的最终产物（本地会话 + 主站访问令牌） */
export interface iGM_ExamOAuthLoginResult {
  user: iGM_UserRow;
  /** 原始会话 ID（用于设置 cookie，不入库） */
  sessionId: string;
  /** 主站 IdP 返回的 access_token（用于 revoke 端点） */
  upstreamAccessToken: string;
}

/** state → 临时流数据（有效期 5 分钟） */
interface iGM_ExamOAuthFlow {
  codeVerifier: string;
  createdAt: number;
}

// 核心逻辑 //

/* ---------- 进程内临时缓存：state + code_verifier ---------- */
/** 用于防止并发 key 冲突的 Map（key=state），进程内，5 分钟后自动清理 */
const iGM_FlowCache = new Map<string, iGM_ExamOAuthFlow>();
const iGM_FlowTtlMs = 5 * 60 * 1000;

/** 定期清理过期流（每秒跑一次，超时的 state 自动清除） */
function iGM_SweepExpiredFlows(): void {
  const now = Date.now();
  for (const [state, flow] of iGM_FlowCache) {
    if (now - flow.createdAt > iGM_FlowTtlMs) iGM_FlowCache.delete(state);
  }
}
setInterval(iGM_SweepExpiredFlows, 60 * 1000).unref?.();

/* ---------- PKCE 工具（强制 S256） ---------- */

/** 生成 43-128 字符 code_verifier（Base64URL 安全字符集，随机 32 字节） */
export function iGM_GenerateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/** code_challenge = BASE64URL(SHA-256(code_verifier)) */
export async function iGM_GenerateCodeChallenge(
  verifier: string,
): Promise<string> {
  const buf = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/** 生成随机 state（16 字节十六进制 = 32 字符） */
export function iGM_GenerateState(): string {
  return iGM_RandomHex(16);
}

/* ---------- authorize 跳转 ---------- */

/**
 * 解析本次应使用的 callback URL：
 * - 本地开发环境（localhost 主机名或端口 3001）走 localCallbackUrl
 * - 生产走 callbackUrl
 * 同时记录是否为 http（用于 cookie Secure 标记）
 */
export function iGM_ResolveCallbackUrl(
  host: string | undefined,
): { callbackUrl: string; isHttp: boolean } {
  const lower = (host ?? "").toLowerCase().split(":")[0];
  const isLocal =
    lower === "localhost" || lower === "127.0.0.1" || lower === "::1";
  const cb = isLocal
    ? iGM_Config.examOAuth.localCallbackUrl
    : iGM_Config.examOAuth.callbackUrl;
  return { callbackUrl: cb, isHttp: cb.startsWith("http://") };
}

/**
 * 生成主站 /oauth/authorize 的完整跳转 URL，
 * 同时把 state + code_verifier 存入进程内缓存（5min TTL）。
 */
export async function iGM_BuildAuthorizeRedirect(
  host: string | undefined,
): Promise<{ authorizeUrl: string; state: string; callbackUrl: string }> {
  const cfg = iGM_Config.examOAuth;
  const { callbackUrl } = iGM_ResolveCallbackUrl(host);
  const state = iGM_GenerateState();
  const codeVerifier = iGM_GenerateCodeVerifier();
  const codeChallenge = await iGM_GenerateCodeChallenge(codeVerifier);

  iGM_FlowCache.set(state, { codeVerifier, createdAt: Date.now() });

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: callbackUrl,
    response_type: "code",
    scope: cfg.scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  const authorizeUrl = `${cfg.authorizeUrl}?${params.toString()}`;
  return { authorizeUrl, state, callbackUrl };
}

/* ---------- callback：校验 state + 换令牌 + 拉 userinfo ---------- */

/** 从临时缓存中取出并删除 state 对应的 code_verifier；state 不存在/过期则 null */
function iGM_TakeCodeVerifier(state: string): string | null {
  const flow = iGM_FlowCache.get(state);
  if (!flow) return null;
  iGM_FlowCache.delete(state);
  return flow.codeVerifier;
}

/** 主站 /oauth/token：authorization_code 换 access_token + refresh_token */
async function iGM_ExchangeToken(params: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<iGM_OAuthTokenResponse> {
  const cfg = iGM_Config.examOAuth;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code_verifier: params.codeVerifier,
  });
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `主站 /oauth/token 失败 (HTTP ${res.status}): ${errText.slice(0, 200)}`,
    );
  }
  return (await res.json()) as iGM_OAuthTokenResponse;
}

/** 主站 /oauth/userinfo：Bearer access_token 拉用户公开信息 */
async function iGM_FetchUserinfo(
  accessToken: string,
): Promise<iGM_OAuthUserinfo> {
  const cfg = iGM_Config.examOAuth;
  const res = await fetch(cfg.userinfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `主站 /oauth/userinfo 失败 (HTTP ${res.status}): ${errText.slice(0, 200)}`,
    );
  }
  const info = (await res.json()) as iGM_OAuthUserinfo;
  if (!info.sub) throw new Error("主站 userinfo 未返回 sub");
  return info;
}

/**
 * 用 sub(=iGM_Uid) 查本地 iGM_Users 表。
 * 主站与考试站共用同一个 PostgreSQL 实例，所有用户记录都已存在；
 * OAuth 流程只是"已存在用户通过主站授权"，不做自动注册。
 */
async function iGM_FindExamUserBySub(sub: string): Promise<iGM_UserRow | null> {
  // iGM_Users 表的 iGM_Uid 即主站 userinfo.sub
  return await iGM_FindUserByUid(sub);
}

/* ---------- 本地会话签发 ---------- */

/** 在 iGM_Sessions 表签发新会话，返回 sessionId（原始值仅用于 set-cookie，不入日志） */
async function iGM_IssueExamSession(params: {
  user: iGM_UserRow;
  userAgent: string | null;
  ip: string | null;
}): Promise<string> {
  const sessionId = iGM_GenerateSessionId();
  const now = Date.now();
  await iGM_CreateSession({
    idHash: iGM_Sha256(sessionId),
    userId: params.user.iGM_Id,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + iGM_Config.auth.sessionTtlMs).toISOString(),
    userAgent: params.userAgent,
    ip: params.ip,
  });
  return sessionId;
}

/* ---------- 组合入口：auth code 回调处理 ---------- */

/**
 * 处理主站 /oauth/authorize 回跳：
 * 1) 校验 state 防 CSRF
 * 2) 取 code_verifier
 * 3) 换主站令牌
 * 4) 拉主站 userinfo，找到 iGM_Uid
 * 5) 查本地用户
 * 6) 签发本地会话
 */
export async function iGM_HandleOAuthCallback(params: {
  host: string | undefined;
  code: string;
  state: string;
  userAgent: string | null;
  ip: string | null;
}): Promise<iGM_ExamOAuthLoginResult> {
  const { callbackUrl } = iGM_ResolveCallbackUrl(params.host);

  const codeVerifier = iGM_TakeCodeVerifier(params.state);
  if (!codeVerifier) {
    throw new Error("state 无效或已过期，请重新发起登录");
  }

  const tokens = await iGM_ExchangeToken({
    code: params.code,
    redirectUri: callbackUrl,
    codeVerifier,
  });
  const userinfo = await iGM_FetchUserinfo(tokens.access_token);

  const user = await iGM_FindExamUserBySub(userinfo.sub);
  if (!user) {
    throw new Error(
      `主站用户 ${userinfo.sub} 在本地 iGM_Users 表不存在，无法建立登录态`,
    );
  }

  const sessionId = await iGM_IssueExamSession({
    user,
    userAgent: params.userAgent,
    ip: params.ip,
  });

  console.log(
    `[iGM_ExamOAuth] 登录成功 user=${user.iGM_Uid}(${user.iGM_DisplayName ?? user.iGM_Username})`,
  );

  return {
    user,
    sessionId,
    upstreamAccessToken: tokens.access_token,
  };
}

/* ---------- 登出 ---------- */

/** 撤销主站 IdP 上的令牌（本地会话清除在 route 里做） */
export async function iGM_RevokeUpstreamToken(
  accessToken: string,
): Promise<void> {
  const cfg = iGM_Config.examOAuth;
  const body = new URLSearchParams({
    token: accessToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });
  try {
    await fetch(cfg.revokeUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    // RFC 7009：无论成功失败都按"已撤销"返回，避免令牌探测
  } catch (err) {
    console.warn("[iGM_ExamOAuth] 主站 revoke 请求失败", err);
  }
}

/** 清除本地会话：按 sessionId 哈希删除 */
export async function iGM_RevokeLocalSession(
  rawSessionId: string | null,
): Promise<void> {
  if (!rawSessionId) return;
  await iGM_DeleteSession(iGM_Sha256(rawSessionId));
}

// 导出 //
export default {
  iGM_GenerateCodeVerifier,
  iGM_GenerateCodeChallenge,
  iGM_GenerateState,
  iGM_ResolveCallbackUrl,
  iGM_BuildAuthorizeRedirect,
  iGM_HandleOAuthCallback,
  iGM_RevokeUpstreamToken,
  iGM_RevokeLocalSession,
};
