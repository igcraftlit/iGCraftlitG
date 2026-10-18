/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_MuoCeonService.ts
 * 所属层：后端 / 业务逻辑层
 * 路由：G_MuoCeon
 * 模块：iGM_MuoCeonService
 * 作用：主站作为 OAuth 客户端（PKCE）接入 MuoCeon 账号体系的全部业务编排
 * 内容：PKCE（S256）参数生成与 state/code_verifier 进程内缓存、
 *       MuoCeon authorize 跳转 URL 拼装、回调 code 换 token、
 *       MuoCeon userinfo 拉取、iGM_Users 绑定命中或自动建号并绑定、
 *       主站本地会话签发（iGM_Sessions 表，与账号密码登录同一 Cookie）、
 *       授权结束回跳站点源解析（白名单）与原页面回跳路径归一化
 * 约束：client_secret 仅从 Config（.env）读取，严禁落入日志或前端响应；
 *       临时缓存仅存在进程内 Map（服务重启自然清空），不走数据库；
 *       PKCE 强制 S256；令牌端点请求体为 application/x-www-form-urlencoded
 */

// 导入依赖 //
import { iGM_Config } from "../iGM_Config/iGM_Config";
import {
  iGM_CreateSession,
} from "../iGM_Repositories/iGM_SessionRepository";
import {
  iGM_CreateMuoCeonBinding,
  iGM_FindMuoCeonBindingBySub,
} from "../iGM_Repositories/iGM_MuoCeonRepository";
import {
  iGM_CreateUser,
  iGM_FindUserByEmail,
  iGM_FindUserById,
  iGM_FindUserByUsername,
  iGM_GenerateUniqueUid,
  iGM_MarkEmailVerified,
  iGM_UpdateProfile,
} from "../iGM_Repositories/iGM_UserRepository";
import {
  iGM_GenerateCodeChallenge,
  iGM_GenerateCodeVerifier,
  iGM_GenerateState,
} from "./iGM_ExamOAuthClientService";
import {
  iGM_GenerateSessionId,
  iGM_HashPassword,
  iGM_RandomHex,
  iGM_RandomUuid,
  iGM_Sha256,
} from "./iGM_SecurityService";
import type { iGM_UserRow } from "../iGM_Types/iGM_Auth";

// 类型定义 //
/** MuoCeon 令牌端点返回的令牌响应 */
export interface iGM_MuoCeonTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
}

/** MuoCeon 用户信息端点返回的公开信息 */
export interface iGM_MuoCeonUserinfo {
  /** MuoCeon 侧唯一用户标识 */
  sub: string;
  name?: string;
  picture?: string;
  preferred_username?: string;
  email?: string;
}

/** state → 临时授权流数据 */
interface iGM_MuoCeonFlow {
  codeVerifier: string;
  /** 本次授权使用的 redirect_uri（换令牌时必须与授权时完全一致） */
  redirectUri: string;
  /** 发起授权时前端所在语言，用于失败回跳定位页面 */
  locale: string;
  /**
   * 发起授权时前端的站点源（已按白名单校验）。
   * 说明：后端为同一本机进程同时服务本地开发与隧道生产，
   *       静态配置无法同时表示两者，故站点源必须随请求动态上报。
   */
  siteOrigin: string;
  /** 登录成功后要回到的站内路径（已归一化为 /G_ 或 /G_Home） */
  returnTo: string;
  createdAt: number;
}

/** 回调处理产物 */
export interface iGM_MuoCeonLoginResult {
  user: iGM_UserRow;
  /** 原始会话 ID（仅用于写 Cookie，不入库） */
  sessionId: string;
  /** 发起授权时的前端语言 */
  locale: string;
  /** 发起授权时前端的站点源，用于授权结束回跳 */
  siteOrigin: string;
  /** 登录成功后要回到的站内路径 */
  returnTo: string;
}

/** MuoCeon 接入错误：路由层据此决定失败回跳与错误码 */
export class iGM_MuoCeonError extends Error {
  status: number;
  /** 机器可读错误码，随失败回跳携带，供前端区分提示文案 */
  code: string;

  constructor(message: string, status = 400, code = "server_error") {
    super(message);
    this.name = "iGM_MuoCeonError";
    this.status = status;
    this.code = code;
  }
}

// 核心逻辑 //

/* ---------- 启动自检：确认 MuoCeon 客户端配置已从环境变量加载 ---------- */
// 仅输出 client_id（公开信息，本就会出现在授权 URL 中）与 client_secret 是否已配置，
// 绝不打印密钥明文；用于排查「环境变量未加载导致的发起授权失败」
console.log(
  `[iGM_MuoCeon] 配置自检：client_id=${iGM_Config.muoceon.clientId || "(未配置)"}` +
    `，client_secret=${iGM_Config.muoceon.clientSecret ? "已配置" : "(未配置)"}` +
    `，authorize=${iGM_Config.muoceon.authorizeUrl}` +
    `，redirect_uri=${iGM_ResolveRedirectUri()}`,
);

/* ---------- 进程内临时缓存：state + code_verifier ---------- */
const iGM_FlowCache = new Map<string, iGM_MuoCeonFlow>();

/** 定期清理过期授权流（授权 5 分钟未回跳即失效） */
function iGM_SweepExpiredFlows(): void {
  const now = Date.now();
  const ttl = iGM_Config.muoceon.flowTtlMs;
  for (const [state, flow] of iGM_FlowCache) {
    if (now - flow.createdAt > ttl) iGM_FlowCache.delete(state);
  }
}
setInterval(iGM_SweepExpiredFlows, 60 * 1000).unref?.();

/* ---------- 语言与地址工具 ---------- */

/** 前端支持的语言清单（新增语言需同步维护） */
const iGM_MuoCeonLocales = ["zh-CN", "zh-TW", "en", "ja", "ru"];

/** 归一化语言标识：非法或缺省一律回退 zh-CN */
function iGM_NormalizeLocale(locale: string | undefined): string {
  return locale && iGM_MuoCeonLocales.includes(locale) ? locale : "zh-CN";
}

/** 主站站点地址（去掉末尾斜杠，便于拼接路径） */
function iGM_ResolveHomeUrl(): string {
  return iGM_Config.muoceon.homeUrl.replace(/\/+$/, "");
}

/**
 * 解析授权结束后的回跳站点源：
 * 仅接受前端显式上报（或请求 Origin 头）且位于 CORS 白名单内的源，
 * 否则回退配置中的主站地址。
 * 说明：本机后端同时服务 localhost 开发与 api 隧道生产，
 *       若固定使用配置值会把线上用户送回 localhost（ERR_CONNECTION_REFUSED）。
 */
export function iGM_ResolveSiteOrigin(explicit: string | undefined): string {
  const candidate = (explicit ?? "").trim().replace(/\/+$/, "");
  if (candidate && iGM_Config.corsOrigins.includes(candidate)) return candidate;
  return iGM_ResolveHomeUrl();
}

/** 剥离站内路径开头的语言前缀；无前缀时原样返回 */
function iGM_StripLocale(path: string): string {
  const match = path.match(
    new RegExp(`^/(?:${iGM_MuoCeonLocales.join("|")})(?=/|$)`),
  );
  return match ? path.slice(match[0].length) || "/" : path;
}

/**
 * 归一化登录成功后的回跳路径：
 * 仅允许站内控制台路径（剥离语言前缀后须以 /G_ 开头），
 * 非法值与缺省一律回退 /G_Home，杜绝开放重定向
 */
export function iGM_NormalizeReturnTo(raw: string | undefined): string {
  const stripped = iGM_StripLocale((raw ?? "").trim());
  if (!stripped.startsWith("/G_") || stripped.startsWith("//")) return "/G_Home";
  return stripped;
}

/** 授权成功后回跳：优先回到用户发起授权前所在页面，缺省回控制台首页 */
export function iGM_BuildMuoCeonSuccessRedirect(params: {
  siteOrigin: string;
  locale: string;
  returnTo: string;
}): string {
  // 二次归一化（幂等）：防止调用方传入带语言前缀的原值拼出 /{locale}/{locale}/...
  const returnTo = iGM_NormalizeReturnTo(params.returnTo);
  return `${params.siteOrigin}/${iGM_NormalizeLocale(params.locale)}${returnTo}`;
}

/** 授权失败回跳：独立授权页携带具体错误码，便于用户重试与定位原因 */
export function iGM_BuildMuoCeonFailureRedirect(params: {
  siteOrigin: string;
  locale?: string;
  errorCode?: string;
}): string {
  const code = params.errorCode ?? "server_error";
  return (
    `${params.siteOrigin}/${iGM_NormalizeLocale(params.locale)}` +
    `/auth/muoceon?error=${encodeURIComponent(code)}`
  );
}

/** 本次授权实际使用的 redirect_uri：本地联调可切换为 localhost 回调 */
function iGM_ResolveRedirectUri(): string {
  const cfg = iGM_Config.muoceon;
  return cfg.useLocalRedirect ? cfg.localRedirectUri : cfg.redirectUri;
}

/* ---------- 发起授权：拼装 MuoCeon authorize 跳转地址 ---------- */

/**
 * 生成 MuoCeon authorize 跳转 URL，
 * 同时把 state + code_verifier + redirect_uri（+ 语言 + 站点源 + 回跳路径）
 * 存入进程内缓存，供回调阶段回跳使用。
 */
export async function iGM_BuildAuthorizeRedirect(params: {
  locale?: string;
  siteOrigin?: string;
  returnTo?: string;
}): Promise<string> {
  const cfg = iGM_Config.muoceon;
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new iGM_MuoCeonError(
      "MuoCeon 客户端凭证未配置",
      500,
      "config_missing",
    );
  }

  const redirectUri = iGM_ResolveRedirectUri();
  const state = iGM_GenerateState();
  const codeVerifier = iGM_GenerateCodeVerifier();
  const codeChallenge = await iGM_GenerateCodeChallenge(codeVerifier);

  iGM_FlowCache.set(state, {
    codeVerifier,
    redirectUri,
    locale: iGM_NormalizeLocale(params.locale),
    siteOrigin: iGM_ResolveSiteOrigin(params.siteOrigin),
    returnTo: iGM_NormalizeReturnTo(params.returnTo),
    createdAt: Date.now(),
  });

  const search = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: cfg.scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return `${cfg.authorizeUrl}?${search.toString()}`;
}

/* ---------- 回调：校验 state + 换令牌 + 拉 userinfo ---------- */

/** 取出并删除 state 对应的授权流；不存在或已过期则 null */
function iGM_TakeFlow(state: string): iGM_MuoCeonFlow | null {
  const flow = iGM_FlowCache.get(state);
  if (!flow) return null;
  iGM_FlowCache.delete(state);
  if (Date.now() - flow.createdAt > iGM_Config.muoceon.flowTtlMs) return null;
  return flow;
}

/** MuoCeon 令牌端点：authorization_code 换 access_token（form-urlencoded） */
async function iGM_ExchangeToken(params: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<iGM_MuoCeonTokenResponse> {
  const cfg = iGM_Config.muoceon;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code: params.code,
    code_verifier: params.codeVerifier,
    redirect_uri: params.redirectUri,
  });
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(
      `[iGM_MuoCeon] 换令牌失败：HTTP ${res.status}，响应 ${errText.slice(0, 500) || "(空)"}`,
    );
    throw new iGM_MuoCeonError(
      `MuoCeon 令牌端点失败 (HTTP ${res.status}): ${errText.slice(0, 500)}`,
      502,
      "token_failed",
    );
  }
  const tokens = (await res.json()) as iGM_MuoCeonTokenResponse;
  if (!tokens.access_token) {
    throw new iGM_MuoCeonError(
      "MuoCeon 令牌响应缺少 access_token",
      502,
      "token_failed",
    );
  }
  return tokens;
}

/** MuoCeon 用户信息端点：Bearer access_token 拉公开信息 */
async function iGM_FetchUserinfo(
  accessToken: string,
): Promise<iGM_MuoCeonUserinfo> {
  const res = await fetch(iGM_Config.muoceon.userinfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error(
      `[iGM_MuoCeon] 拉取用户信息失败：HTTP ${res.status}，响应 ${errText.slice(0, 500) || "(空)"}`,
    );
    throw new iGM_MuoCeonError(
      `MuoCeon 用户信息端点失败 (HTTP ${res.status}): ${errText.slice(0, 500)}`,
      502,
      "userinfo_failed",
    );
  }
  const info = (await res.json()) as iGM_MuoCeonUserinfo;
  if (!info.sub) {
    throw new iGM_MuoCeonError(
      "MuoCeon 用户信息缺少 sub",
      502,
      "userinfo_failed",
    );
  }
  return info;
}

/* ---------- 本地账号：绑定命中或自动建号 ---------- */

/** 生成未被占用的本地用户名：muoceon_ + 随机串 */
async function iGM_GenerateMuoCeonUsername(): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = `muoceon_${iGM_RandomHex(3)}`;
    if (!(await iGM_FindUserByUsername(candidate))) return candidate;
  }
  return `muoceon_${iGM_RandomHex(6)}`;
}

/**
 * 解析自动建号使用的本地邮箱：
 * 优先使用 MuoCeon 返回且未被占用的邮箱，否则生成站内占位邮箱
 */
async function iGM_ResolveMuoCeonEmail(
  sub: string,
  upstreamEmail: string | undefined,
): Promise<string> {
  const provided = upstreamEmail?.trim().toLowerCase();
  if (provided && !(await iGM_FindUserByEmail(provided))) return provided;

  const safeSub = sub.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24) || "user";
  let candidate = `muoceon_${safeSub}@muoceon.local`;
  if (await iGM_FindUserByEmail(candidate)) {
    candidate = `muoceon_${safeSub}_${iGM_RandomHex(4)}@muoceon.local`;
  }
  return candidate;
}

/**
 * 未绑定 → 自动创建本地账号并写入绑定。
 * 密码列写入不可用随机串哈希：该账号仅可通过 MuoCeon 授权登录；
 * sub 已被并发绑定（唯一约束冲突）时退回读取既有绑定。
 */
async function iGM_CreateAndBindUser(params: {
  sub: string;
  name: string | undefined;
  picture: string | undefined;
  email: string | undefined;
  ip: string | null;
}): Promise<iGM_UserRow> {
  const now = new Date().toISOString();
  const uid = await iGM_GenerateUniqueUid("user");
  const username = await iGM_GenerateMuoCeonUsername();
  const email = await iGM_ResolveMuoCeonEmail(params.sub, params.email);
  const passwordHash = await iGM_HashPassword(iGM_RandomHex(32));

  const created = await iGM_CreateUser({
    id: iGM_RandomUuid(),
    uid,
    username,
    email,
    passwordHash,
    role: "user",
    registerIp: params.ip,
    now,
  });
  // 身份已由 MuoCeon 完成认证，直接标记邮箱已验证
  await iGM_MarkEmailVerified(created.iGM_Id, now);

  try {
    await iGM_CreateMuoCeonBinding({
      id: iGM_RandomUuid(),
      userId: created.iGM_Id,
      sub: params.sub,
      now,
    });
  } catch {
    const existing = await iGM_FindMuoCeonBindingBySub(params.sub);
    if (!existing) throw new iGM_MuoCeonError("MuoCeon 身份绑定失败", 500);
    const bound = await iGM_FindUserById(existing.iGM_UserId);
    if (!bound) throw new iGM_MuoCeonError("MuoCeon 绑定账号不存在", 500);
    console.warn(
      `[iGM_MuoCeon] sub=${params.sub} 并发绑定冲突，复用既有账号 ${bound.iGM_Uid}`,
    );
    return bound;
  }

  // 同步 MuoCeon 侧昵称与头像（未提供则保持默认空值）
  if (params.name || params.picture) {
    await iGM_UpdateProfile(created.iGM_Id, {
      displayName: params.name ?? null,
      avatar: params.picture ?? null,
      bio: null,
      website: null,
      now,
    });
    const refreshed = await iGM_FindUserById(created.iGM_Id);
    if (refreshed) return refreshed;
  }
  return created;
}

/** 按 sub 解析本地账号：已绑定则直取，未绑定则自动建号并绑定 */
async function iGM_ResolveLocalUser(params: {
  userinfo: iGM_MuoCeonUserinfo;
  ip: string | null;
}): Promise<iGM_UserRow> {
  const binding = await iGM_FindMuoCeonBindingBySub(params.userinfo.sub);
  if (binding) {
    const user = await iGM_FindUserById(binding.iGM_UserId);
    if (!user) throw new iGM_MuoCeonError("MuoCeon 绑定账号不存在", 500);
    return user;
  }
  return iGM_CreateAndBindUser({
    sub: params.userinfo.sub,
    name: params.userinfo.name,
    picture: params.userinfo.picture,
    email: params.userinfo.email,
    ip: params.ip,
  });
}

/* ---------- 本地会话签发 ---------- */

/** 在 iGM_Sessions 表签发主站会话（与账号密码登录同一 Cookie 体系） */
async function iGM_IssueSession(params: {
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

/* ---------- 组合入口：回调处理 ---------- */

/**
 * 处理 MuoCeon 授权回跳：
 * 1) 校验 state 防 CSRF 并取回 code_verifier 与本次 redirect_uri
 * 2) 换 MuoCeon 令牌
 * 3) 拉 MuoCeon userinfo
 * 4) 按 sub 命中绑定或自动建号并绑定
 * 5) 签发主站本地会话
 */
export async function iGM_HandleMuoCeonCallback(params: {
  code: string;
  state: string;
  userAgent: string | null;
  ip: string | null;
}): Promise<iGM_MuoCeonLoginResult> {
  const flow = iGM_TakeFlow(params.state);
  if (!flow) {
    // state 为一次性消费：重复回调、超过有效期或后端重启（进程内缓存丢失）都会落此
    console.warn(
      "[iGM_MuoCeon] state 未命中：可能重复回调、已超过 5 分钟有效期，或后端重启导致进程内授权流缓存丢失",
    );
    throw new iGM_MuoCeonError(
      "state 无效或已过期，请重新发起授权",
      400,
      "state_invalid",
    );
  }

  const tokens = await iGM_ExchangeToken({
    code: params.code,
    redirectUri: flow.redirectUri,
    codeVerifier: flow.codeVerifier,
  });
  const userinfo = await iGM_FetchUserinfo(tokens.access_token);
  const user = await iGM_ResolveLocalUser({ userinfo, ip: params.ip });

  if (user.iGM_Status !== "active") {
    throw new iGM_MuoCeonError("账号已被禁用，无法登录", 403, "account_disabled");
  }

  const sessionId = await iGM_IssueSession({
    user,
    userAgent: params.userAgent,
    ip: params.ip,
  });

  console.log(
    `[iGM_MuoCeon] 登录成功 user=${user.iGM_Uid}(${user.iGM_DisplayName ?? user.iGM_Username}) sub=${userinfo.sub}`,
  );

  return {
    user,
    sessionId,
    locale: flow.locale,
    siteOrigin: flow.siteOrigin,
    returnTo: flow.returnTo,
  };
}

// 导出 //
export default {
  iGM_MuoCeonError,
  iGM_BuildAuthorizeRedirect,
  iGM_HandleMuoCeonCallback,
  iGM_BuildMuoCeonSuccessRedirect,
  iGM_BuildMuoCeonFailureRedirect,
  iGM_ResolveSiteOrigin,
  iGM_NormalizeReturnTo,
};
