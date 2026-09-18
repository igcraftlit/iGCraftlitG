/**
 * 文件路径：iGM_Server/src/iGM_Services/iGM_AuthService.ts
 * 所属层：后端 / 业务逻辑层
 * 路由：G_Auth
 * 模块：iGM_AuthService
 * 作用：用户认证与账户体系的核心业务逻辑
 * 内容：注册、登录、登出、会话解析、邮箱验证码签发与校验、
 *       密码重置令牌签发与消费、修改密码、输入校验
 * 安全：bcrypt 密码哈希、随机一次性令牌、时效控制、登录限流、
 *       重置密码后使全部旧会话失效
 */

// 导入依赖 //
import { iGM_Config } from "../iGM_Config/iGM_Config";
import {
  iGM_CreateUser,
  iGM_FindUserByEmail,
  iGM_FindUserById,
  iGM_FindUserByUsername,
  iGM_MarkEmailVerified,
  iGM_UpdatePassword,
} from "../iGM_Repositories/iGM_UserRepository";
import {
  iGM_CreateSession,
  iGM_DeleteExpiredSessions,
  iGM_DeleteSession,
  iGM_DeleteSessionsByUser,
  iGM_FindSession,
} from "../iGM_Repositories/iGM_SessionRepository";
import {
  iGM_ConsumeToken,
  iGM_CreateToken,
  iGM_DeleteExpiredTokens,
  iGM_FindActiveTokenBySecret,
  iGM_FindLatestToken,
  iGM_IncrementTokenAttempts,
  iGM_RevokeActiveTokens,
} from "../iGM_Repositories/iGM_TokenRepository";
import {
  iGM_GenerateResetToken,
  iGM_GenerateSessionId,
  iGM_GenerateVerifyCode,
  iGM_HashPassword,
  iGM_RandomUuid,
  iGM_Sha256,
  iGM_VerifyPassword,
} from "./iGM_SecurityService";
import {
  iGM_SendResetPasswordMail,
  iGM_SendVerificationMail,
} from "./iGM_MailService";
import { iGM_ResetRateLimit } from "./iGM_RateLimitService";
import {
  iGM_ToUserDto,
  type iGM_UserDto,
  type iGM_UserRow,
} from "../iGM_Types/iGM_Auth";

// 类型定义 //
/** 业务错误：message 为前端 i18n 文案键，status 为 HTTP 状态码 */
export class iGM_AuthError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "iGM_AuthError";
  }
}

/** 请求方环境信息 */
export interface iGM_RequestContext {
  userAgent: string | null;
  ip: string | null;
  /** 前端语言，用于邮件语言选择 */
  locale: string;
}

export interface iGM_AuthResult {
  user: iGM_UserDto;
  /** 原始会话 ID，由路由写入 HttpOnly Cookie；服务调用方不得记录日志 */
  sessionId: string;
}

// 核心逻辑 //
/** 用户名：中英文、数字、下划线，3-20 位 */
const iGM_UsernamePattern = /^[\w\u4e00-\u9fa5]{3,20}$/;
/** 邮箱基础格式校验 */
const iGM_EmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** 密码长度区间 */
const iGM_PasswordMinLength = 8;
const iGM_PasswordMaxLength = 128;

/** 定期清理过期会话与令牌（每 10 分钟） */
function iGM_ScheduleCleanup(): void {
  setInterval(() => {
    const now = new Date().toISOString();
    try {
      iGM_DeleteExpiredSessions(now);
      iGM_DeleteExpiredTokens(now);
    } catch (error) {
      console.warn("[iGM_AuthService] 过期数据清理失败", error);
    }
  }, 10 * 60 * 1000);
}
iGM_ScheduleCleanup();

/** 校验注册/重置输入，不合法时抛出带 i18n 键的业务错误 */
function iGM_ValidateCredentials(input: {
  username?: string;
  email?: string;
  password?: string;
}): void {
  const { username, email, password } = input;

  if (username !== undefined && !iGM_UsernamePattern.test(username.trim())) {
    throw new iGM_AuthError("auth.errors.usernameInvalid", 422);
  }
  if (email !== undefined && !iGM_EmailPattern.test(email.trim())) {
    throw new iGM_AuthError("auth.errors.emailInvalid", 422);
  }
  if (
    password !== undefined &&
    (password.length < iGM_PasswordMinLength ||
      password.length > iGM_PasswordMaxLength)
  ) {
    throw new iGM_AuthError("auth.errors.passwordInvalid", 422);
  }
}

/** 创建会话并返回 DTO + 原始会话 ID */
function iGM_IssueSession(user: iGM_UserRow, context: iGM_RequestContext): iGM_AuthResult {
  const sessionId = iGM_GenerateSessionId();
  const now = Date.now();
  iGM_CreateSession({
    idHash: iGM_Sha256(sessionId),
    userId: user.iGM_Id,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + iGM_Config.auth.sessionTtlMs).toISOString(),
    userAgent: context.userAgent,
    ip: context.ip,
  });
  return { user: iGM_ToUserDto(user), sessionId };
}

/** 为用户签发新的邮箱验证码（旧码自动作废）并发送邮件 */
async function iGM_IssueVerifyCode(
  user: iGM_UserRow,
  locale: string,
): Promise<void> {
  const now = Date.now();
  const code = iGM_GenerateVerifyCode();
  iGM_RevokeActiveTokens(user.iGM_Id, "email_verify", new Date(now).toISOString());
  iGM_CreateToken({
    id: iGM_RandomUuid(),
    userId: user.iGM_Id,
    purpose: "email_verify",
    secretHash: await iGM_HashPassword(code),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + iGM_Config.auth.verifyCodeTtlMs).toISOString(),
  });

  await iGM_SendVerificationMail({
    to: user.iGM_Email,
    username: user.iGM_Username,
    code,
    ttlMinutes: Math.round(iGM_Config.auth.verifyCodeTtlMs / 60000),
    locale,
  });
}

/**
 * 注册：校验输入、查重、写入用户（默认 user 角色）、
 *       自动登录、发送邮箱验证码
 * @returns 会话信息，路由负责写 Cookie
 */
export async function iGM_Register(
  input: { username: string; email: string; password: string },
  context: iGM_RequestContext,
): Promise<iGM_AuthResult & { mailSent: boolean }> {
  const username = input.username.trim();
  const email = input.email.trim().toLowerCase();
  iGM_ValidateCredentials({ username, email, password: input.password });

  if (iGM_FindUserByEmail(email)) {
    throw new iGM_AuthError("auth.errors.emailTaken", 409);
  }
  if (iGM_FindUserByUsername(username)) {
    throw new iGM_AuthError("auth.errors.usernameTaken", 409);
  }

  const now = new Date().toISOString();
  const passwordHash = await iGM_HashPassword(input.password);
  const user = iGM_CreateUser({
    id: iGM_RandomUuid(),
    username,
    email,
    passwordHash,
    role: "user",
    now,
  });

  // 邮件发送失败不阻断注册：用户可稍后在账户设置页重新发送
  let mailSent = true;
  try {
    await iGM_IssueVerifyCode(user, context.locale);
  } catch (error) {
    mailSent = false;
    console.warn("[iGM_AuthService] 验证码邮件发送失败", error);
  }

  const result = iGM_IssueSession(user, context);
  return { ...result, mailSent };
}

/**
 * 登录：支持邮箱或用户名 + 密码
 * 限流标识包含 IP 与登录账号，防止跨账号撞库与单账号暴力破解
 */
export async function iGM_Login(
  input: { account: string; password: string },
  context: iGM_RequestContext,
  rateLimitKey: string,
): Promise<iGM_AuthResult> {
  const account = input.account.trim();
  if (!account || !input.password) {
    throw new iGM_AuthError("auth.errors.credentialsRequired", 422);
  }

  const user = iGM_EmailPattern.test(account)
    ? iGM_FindUserByEmail(account.toLowerCase())
    : iGM_FindUserByUsername(account);
  // 统一模糊提示，避免泄露账号是否存在
  if (!user) {
    throw new iGM_AuthError("auth.errors.loginFailed", 401);
  }

  const matched = await iGM_VerifyPassword(input.password, user.iGM_PasswordHash);
  if (!matched) {
    throw new iGM_AuthError("auth.errors.loginFailed", 401);
  }

  if (user.iGM_Status !== "active") {
    throw new iGM_AuthError("auth.errors.accountSuspended", 403);
  }

  iGM_ResetRateLimit("login", rateLimitKey);
  return iGM_IssueSession(user, context);
}

/** 登出：删除当前会话 */
export function iGM_Logout(rawSessionId: string | null): void {
  if (!rawSessionId) return;
  iGM_DeleteSession(iGM_Sha256(rawSessionId));
}

/** 按原始会话 ID 解析当前登录用户（过期会话返回 null） */
export function iGM_ResolveSession(
  rawSessionId: string | null,
): iGM_UserRow | null {
  if (!rawSessionId) return null;
  const session = iGM_FindSession(iGM_Sha256(rawSessionId), new Date().toISOString());
  if (!session) return null;
  const user = iGM_FindUserById(session.iGM_UserId);
  if (!user || user.iGM_Status !== "active") return null;
  return user;
}

/** 重新发送邮箱验证码（需登录） */
export async function iGM_SendVerification(
  user: iGM_UserRow,
  locale: string,
): Promise<void> {
  if (user.iGM_EmailVerified === 1) {
    throw new iGM_AuthError("auth.errors.alreadyVerified", 400);
  }
  await iGM_IssueVerifyCode(user, locale);
}

/** 校验邮箱验证码（需登录），成功后更新 emailVerified */
export async function iGM_VerifyEmail(
  user: iGM_UserRow,
  code: string,
): Promise<iGM_UserDto> {
  if (!/^\d{6}$/.test(code.trim())) {
    throw new iGM_AuthError("auth.errors.codeInvalid", 422);
  }
  if (user.iGM_EmailVerified === 1) {
    throw new iGM_AuthError("auth.errors.alreadyVerified", 400);
  }

  const nowIso = new Date().toISOString();
  const token = iGM_FindLatestToken(user.iGM_Id, "email_verify", nowIso);
  if (!token) {
    throw new iGM_AuthError("auth.errors.codeExpired", 400);
  }
  if (token.iGM_Attempts >= iGM_Config.auth.maxVerifyAttempts) {
    throw new iGM_AuthError("auth.errors.codeLocked", 429);
  }

  const matched = await iGM_VerifyPassword(code.trim(), token.iGM_SecretHash);
  if (!matched) {
    iGM_IncrementTokenAttempts(token.iGM_Id);
    throw new iGM_AuthError("auth.errors.codeMismatch", 400);
  }

  iGM_ConsumeToken(token.iGM_Id, nowIso);
  iGM_MarkEmailVerified(user.iGM_Id, nowIso);
  const refreshed = iGM_FindUserById(user.iGM_Id);
  if (!refreshed) throw new iGM_AuthError("auth.errors.generic", 500);
  return iGM_ToUserDto(refreshed);
}

/**
 * 忘记密码：按邮箱签发一次性重置令牌并发信
 * 无论邮箱是否存在都返回成功，避免账号枚举
 */
export async function iGM_ForgotPassword(
  email: string,
  locale: string,
  webBaseUrl?: string,
): Promise<void> {
  if (!iGM_EmailPattern.test(email.trim())) {
    throw new iGM_AuthError("auth.errors.emailInvalid", 422);
  }
  const user = iGM_FindUserByEmail(email.trim().toLowerCase());
  if (!user) return;

  const now = Date.now();
  const rawToken = iGM_GenerateResetToken();
  iGM_RevokeActiveTokens(user.iGM_Id, "password_reset", new Date(now).toISOString());
  iGM_CreateToken({
    id: iGM_RandomUuid(),
    userId: user.iGM_Id,
    purpose: "password_reset",
    secretHash: iGM_Sha256(rawToken),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + iGM_Config.auth.resetTokenTtlMs).toISOString(),
  });

  await iGM_SendResetPasswordMail({
    to: user.iGM_Email,
    username: user.iGM_Username,
    token: rawToken,
    ttlMinutes: Math.round(iGM_Config.auth.resetTokenTtlMs / 60000),
    locale,
    webBaseUrl,
  });
}

/** 供重置页在提交前检查令牌是否有效 */
export function iGM_CheckResetToken(rawToken: string): boolean {
  if (!rawToken || rawToken.length < 32) return false;
  const token = iGM_FindActiveTokenBySecret(
    "password_reset",
    iGM_Sha256(rawToken),
    new Date().toISOString(),
  );
  return token !== null;
}

/** 重置密码：消费一次性令牌、更新密码、作废该用户全部旧会话 */
export async function iGM_ResetPassword(
  rawToken: string,
  newPassword: string,
): Promise<void> {
  iGM_ValidateCredentials({ password: newPassword });
  if (!rawToken || rawToken.length < 32) {
    throw new iGM_AuthError("auth.errors.resetTokenInvalid", 400);
  }

  const nowIso = new Date().toISOString();
  const token = iGM_FindActiveTokenBySecret(
    "password_reset",
    iGM_Sha256(rawToken),
    nowIso,
  );
  if (!token) {
    throw new iGM_AuthError("auth.errors.resetTokenInvalid", 400);
  }
  if (token.iGM_Attempts >= iGM_Config.auth.maxVerifyAttempts) {
    throw new iGM_AuthError("auth.errors.resetTokenInvalid", 400);
  }

  // 一次性消费：消费失败说明已被使用
  if (!iGM_ConsumeToken(token.iGM_Id, nowIso)) {
    throw new iGM_AuthError("auth.errors.resetTokenInvalid", 400);
  }

  const passwordHash = await iGM_HashPassword(newPassword);
  iGM_UpdatePassword(token.iGM_UserId, passwordHash, nowIso);
  // 安全要求：重置成功后旧会话全部失效，用户需用新密码重新登录
  iGM_DeleteSessionsByUser(token.iGM_UserId);
}

/** 修改密码：校验旧密码，更新后保留当前会话、作废其他会话 */
export async function iGM_ChangePassword(
  user: iGM_UserRow,
  oldPassword: string,
  newPassword: string,
  currentSessionIdHash: string | null,
): Promise<void> {
  iGM_ValidateCredentials({ password: newPassword });
  if (!oldPassword) {
    throw new iGM_AuthError("auth.errors.credentialsRequired", 422);
  }
  const matched = await iGM_VerifyPassword(oldPassword, user.iGM_PasswordHash);
  if (!matched) {
    throw new iGM_AuthError("auth.errors.oldPasswordMismatch", 400);
  }
  if (oldPassword === newPassword) {
    throw new iGM_AuthError("auth.errors.passwordSame", 400);
  }

  const nowIso = new Date().toISOString();
  const passwordHash = await iGM_HashPassword(newPassword);
  iGM_UpdatePassword(user.iGM_Id, passwordHash, nowIso);
  iGM_DeleteSessionsByUser(user.iGM_Id, currentSessionIdHash ?? undefined);
}

// 导出 //
export default {
  iGM_Register,
  iGM_Login,
  iGM_Logout,
  iGM_ResolveSession,
  iGM_SendVerification,
  iGM_VerifyEmail,
  iGM_ForgotPassword,
  iGM_CheckResetToken,
  iGM_ResetPassword,
  iGM_ChangePassword,
};
