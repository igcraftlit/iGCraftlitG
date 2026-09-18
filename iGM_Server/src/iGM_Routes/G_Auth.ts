/**
 * 文件路径：iGM_Server/src/iGM_Routes/G_Auth.ts
 * 所属层：后端 / 路由层
 * 路由：/G_Auth/*
 * 模块：G_Auth
 * 作用：用户认证与账户体系接口集合
 * 内容：注册、登录、登出、当前用户、邮箱验证码发送与校验、
 *       忘记密码、重置令牌校验、重置密码、修改密码、管理员用户列表
 * 约束：统一响应 { success, code, message, data }；
 *       登录态由 HttpOnly Cookie（iGM_SID）承载；角色接口做基础权限校验
 */

// 导入依赖 //
import { Elysia } from "elysia";
import { iGM_Config } from "../iGM_Config/iGM_Config";
import { iGM_Ok } from "../iGM_Types/iGM_Response";
import { iGM_ToUserDto, type iGM_UserDto } from "../iGM_Types/iGM_Auth";
import {
  iGM_AuthError,
  iGM_ChangePassword,
  iGM_CheckResetToken,
  iGM_ForgotPassword,
  iGM_Login,
  iGM_Logout,
  iGM_Register,
  iGM_ResolveSession,
  iGM_SendVerification,
  iGM_VerifyEmail,
  iGM_ResetPassword,
  type iGM_RequestContext,
} from "../iGM_Services/iGM_AuthService";
import { iGM_CheckRateLimit } from "../iGM_Services/iGM_RateLimitService";
import {
  iGM_BuildSessionCookie,
  iGM_ClearSessionCookie,
  iGM_ReadCookie,
  iGM_Sha256,
} from "../iGM_Services/iGM_SecurityService";
import {
  iGM_CountUsers,
  iGM_ListUsers,
} from "../iGM_Repositories/iGM_UserRepository";
import {
  iGM_GetClientIp,
  iGM_RequireRole,
  iGM_RequireUser,
  type iGM_NetworkServer,
} from "../iGM_Middleware/iGM_AuthGuard";

// 类型定义 //
/** 路由处理器上下文：只声明实际使用到的 Elysia 上下文字段 */
interface iGM_RouteContext {
  body: unknown;
  query: Record<string, string | undefined>;
  request: Request;
  set: {
    status: number;
    headers: Record<string, string>;
  };
  server: iGM_NetworkServer | null;
}

// 核心逻辑 //
/** 从请求体读取字符串字段（非字符串一律视为空串） */
function iGM_Field(body: unknown, key: string): string {
  const source = (body ?? {}) as Record<string, unknown>;
  return typeof source[key] === "string" ? (source[key] as string) : "";
}

/** 读取会话原始 ID */
function iGM_GetSessionId(request: Request): string | null {
  return iGM_ReadCookie(request, iGM_Config.auth.cookieName);
}

/** 组装请求上下文（UA / IP / 前端语言） */
function iGM_BuildContext(ctx: iGM_RouteContext): iGM_RequestContext {
  return {
    userAgent: ctx.request.headers.get("user-agent"),
    ip: iGM_GetClientIp(ctx.request, ctx.server),
    locale: ctx.request.headers.get("x-igm-locale") ?? "zh-CN",
  };
}

/**
 * 解析前端站点地址：请求来自 CORS 白名单内的页面时（如线上经隧道调用），
 * 以 Origin 为准，保证邮件链接指向用户实际使用的站点；否则用配置默认值
 */
function iGM_ResolveWebBaseUrl(request: Request): string {
  const origin = request.headers.get("origin");
  if (origin && iGM_Config.corsOrigins.includes(origin)) return origin;
  return iGM_Config.auth.webBaseUrl;
}

/** 限流守卫：超限直接抛出 429 业务错误 */
function iGM_EnforceRateLimit(
  ctx: iGM_RouteContext,
  action: keyof typeof iGM_Config.rateLimits,
  identifier: string,
): void {
  const rule = iGM_Config.rateLimits[action];
  const result = iGM_CheckRateLimit(action, identifier, rule.windowMs, rule.max);
  if (!result.allowed) {
    ctx.set.headers["Retry-After"] = String(result.retryAfterSeconds);
    throw new iGM_AuthError("auth.errors.tooManyRequests", 429);
  }
}

/* ---------- 注册 ---------- */
async function iGM_HandleRegister(ctx: iGM_RouteContext) {
  const ip = iGM_GetClientIp(ctx.request, ctx.server);
  iGM_EnforceRateLimit(ctx, "register", ip);

  const result = await iGM_Register(
    {
      username: iGM_Field(ctx.body, "username"),
      email: iGM_Field(ctx.body, "email"),
      password: iGM_Field(ctx.body, "password"),
    },
    iGM_BuildContext(ctx),
  );

  ctx.set.status = 201;
  ctx.set.headers["Set-Cookie"] = iGM_BuildSessionCookie(
    iGM_Config,
    result.sessionId,
  );
  return iGM_Ok(
    { user: result.user, mailSent: result.mailSent },
    "auth.messages.registered",
  );
}

/* ---------- 登录 ---------- */
async function iGM_HandleLogin(ctx: iGM_RouteContext) {
  const ip = iGM_GetClientIp(ctx.request, ctx.server);
  const account = iGM_Field(ctx.body, "account");
  // 限流维度：IP + 登录账号，同时防止单账号暴破与单 IP 撞库
  iGM_EnforceRateLimit(ctx, "login", `${ip}:${account.trim().toLowerCase()}`);

  const result = await iGM_Login(
    { account, password: iGM_Field(ctx.body, "password") },
    iGM_BuildContext(ctx),
    `${ip}:${account.trim().toLowerCase()}`,
  );

  ctx.set.headers["Set-Cookie"] = iGM_BuildSessionCookie(
    iGM_Config,
    result.sessionId,
  );
  return iGM_Ok({ user: result.user }, "auth.messages.loggedIn");
}

/* ---------- 登出 ---------- */
function iGM_HandleLogout(ctx: iGM_RouteContext) {
  iGM_Logout(iGM_GetSessionId(ctx.request));
  ctx.set.headers["Set-Cookie"] = iGM_ClearSessionCookie(iGM_Config);
  return iGM_Ok(null, "auth.messages.loggedOut");
}

/* ---------- 当前用户（会话恢复） ---------- */
function iGM_HandleMe(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_ResolveSession(iGM_GetSessionId(ctx.request)));
  return iGM_Ok({ user: iGM_ToUserDto(user) });
}

/* ---------- 发送邮箱验证码 ---------- */
async function iGM_HandleSendVerification(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_ResolveSession(iGM_GetSessionId(ctx.request)));
  iGM_EnforceRateLimit(ctx, "sendVerification", `user:${user.iGM_Id}`);

  await iGM_SendVerification(
    user,
    ctx.request.headers.get("x-igm-locale") ?? "zh-CN",
  );
  return iGM_Ok({ sent: true }, "auth.messages.verificationSent");
}

/* ---------- 校验邮箱验证码 ---------- */
async function iGM_HandleVerifyEmail(ctx: iGM_RouteContext) {
  const user = iGM_RequireUser(iGM_ResolveSession(iGM_GetSessionId(ctx.request)));
  iGM_EnforceRateLimit(ctx, "verify", `user:${user.iGM_Id}`);

  const updated = await iGM_VerifyEmail(
    user,
    iGM_Field(ctx.body, "code"),
  );
  return iGM_Ok({ user: updated }, "auth.messages.emailVerified");
}

/* ---------- 忘记密码（发送重置邮件） ---------- */
async function iGM_HandleForgotPassword(ctx: iGM_RouteContext) {
  const ip = iGM_GetClientIp(ctx.request, ctx.server);
  const email = iGM_Field(ctx.body, "email").trim().toLowerCase();
  iGM_EnforceRateLimit(ctx, "forgotPassword", `${ip}:${email}`);

  await iGM_ForgotPassword(
    email,
    ctx.request.headers.get("x-igm-locale") ?? "zh-CN",
    iGM_ResolveWebBaseUrl(ctx.request),
  );
  // 无论邮箱是否存在统一回复，避免账号枚举
  return iGM_Ok({ delivered: true }, "auth.messages.resetMailSent");
}

/* ---------- 重置令牌有效性预检 ---------- */
function iGM_HandleCheckResetToken(ctx: iGM_RouteContext) {
  const token = ctx.query.token ?? "";
  return iGM_Ok({ valid: iGM_CheckResetToken(token) });
}

/* ---------- 重置密码 ---------- */
async function iGM_HandleResetPassword(ctx: iGM_RouteContext) {
  const ip = iGM_GetClientIp(ctx.request, ctx.server);
  iGM_EnforceRateLimit(ctx, "verify", ip);

  await iGM_ResetPassword(
    iGM_Field(ctx.body, "token"),
    iGM_Field(ctx.body, "newPassword"),
  );
  return iGM_Ok(null, "auth.messages.passwordReset");
}

/* ---------- 修改密码（登录态） ---------- */
async function iGM_HandleChangePassword(ctx: iGM_RouteContext) {
  const rawSessionId = iGM_GetSessionId(ctx.request);
  const user = iGM_RequireUser(iGM_ResolveSession(rawSessionId));
  iGM_EnforceRateLimit(ctx, "verify", `user:${user.iGM_Id}`);

  await iGM_ChangePassword(
    user,
    iGM_Field(ctx.body, "oldPassword"),
    iGM_Field(ctx.body, "newPassword"),
    rawSessionId ? iGM_Sha256(rawSessionId) : null,
  );
  return iGM_Ok(null, "auth.messages.passwordChanged");
}

/* ---------- 管理员：用户列表（角色权限示例） ---------- */
function iGM_HandleAdminUsers(ctx: iGM_RouteContext) {
  const user = iGM_RequireRole(
    iGM_ResolveSession(iGM_GetSessionId(ctx.request)),
    "admin",
  );
  // 管理员接口同样需要有效登录
  void user;

  const rawLimit = Number(ctx.query.limit ?? "20");
  const rawOffset = Number(ctx.query.offset ?? "0");
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 20, 1), 100);
  const offset = Math.max(Number.isFinite(rawOffset) ? rawOffset : 0, 0);

  const users: iGM_UserDto[] = iGM_ListUsers(limit, offset).map(iGM_ToUserDto);
  return iGM_Ok({ items: users, total: iGM_CountUsers() });
}

/**
 * G_Auth 认证路由集合
 * 说明：业务错误统一抛 iGM_AuthError，由 iGM_ServerMain 全局错误处理器
 *       格式化为统一响应体（Elysia 插件局部 onError 作用域不稳定，故集中处理）
 */
export const G_Auth = new Elysia({ name: "G_Auth" })
  .post("/G_Auth/register", iGM_HandleRegister as never)
  .post("/G_Auth/login", iGM_HandleLogin as never)
  .post("/G_Auth/logout", iGM_HandleLogout as never)
  .get("/G_Auth/me", iGM_HandleMe as never)
  .post("/G_Auth/send-verification", iGM_HandleSendVerification as never)
  .post("/G_Auth/verify-email", iGM_HandleVerifyEmail as never)
  .post("/G_Auth/forgot-password", iGM_HandleForgotPassword as never)
  .get("/G_Auth/reset-token", iGM_HandleCheckResetToken as never)
  .post("/G_Auth/reset-password", iGM_HandleResetPassword as never)
  .post("/G_Auth/change-password", iGM_HandleChangePassword as never)
  .get("/G_Auth/users", iGM_HandleAdminUsers as never);

// 导出 //
export default G_Auth;
