/**
 * 文件路径：apps/web/src/iGM_Services/iGM_AuthClient.ts
 * 所属层：前端 / 基础服务层
 * 路由：调用后端 /G_Auth/*
 * 模块：iGM_AuthClient
 * 作用：认证相关后端接口的唯一前端调用出口
 * 内容：用户类型定义、注册、登录、登出、当前用户、邮箱验证、修改密码验证码、
 *       忘记密码、重置令牌预检、重置密码、修改密码、
 *       模块七第三轮：自助注销账号（发送验证码 + 验证码确认删除）
 * 约束：只经 iGM_Request 发请求；前端不保存明文密码以外的任何敏感凭据，
 *       会话由后端 HttpOnly Cookie 承载
 */

// 导入依赖 //
import { iGM_Get, iGM_Post, type iGM_ApiResponse } from "./iGM_Request";
import type { iGM_OrgBadge } from "./iGM_OrgVerifyClient";

// 类型定义 //
/** 用户角色，与后端 iGM_Types/iGM_Auth.ts 保持一致 */
export type iGM_UserRole = "user" | "moderator" | "admin";

/** 对外用户信息（绝不含密码哈希） */
export interface iGM_User {
  id: string;
  /** 模块七增强：11 位全局唯一 iGMUid（注册时分配，不可修改） */
  uid: string;
  username: string;
  email: string;
  role: iGM_UserRole;
  status: "active" | "suspended";
  emailVerified: boolean;
  // 模块三扩展的公开资料字段
  displayName: string | null;
  avatar: string | null;
  bio: string | null;
  website: string | null;
  // 模块七：认证组织徽标（未认证为 null）
  verifiedOrg: iGM_OrgBadge | null;
  createdAt: string;
  updatedAt: string;
}

/** 登录/注册接口返回数据 */
export interface iGM_AuthData {
  user: iGM_User;
}

/** 注册接口返回数据（附带验证码邮件是否发出） */
export interface iGM_RegisterData extends iGM_AuthData {
  mailSent: boolean;
}

/** 模块十五：《用户管理规定》同意状态 */
export interface iGM_AgreementStatus {
  /** 已同意的版本号（未同意为 null） */
  version: string | null;
  acceptedAt: string | null;
  /** 当前要求的最新版本号 */
  currentVersion: string;
  /** 是否需重新阅读并同意 */
  needsReaccept: boolean;
}

/**
 * 模块二十五：「管理人员」身份判定（仅体验层显示控制，后端 iGM_AuthGuard 强制）。
 * 管理员，或受信任组织负责人（verifiedOrg.isOwner 金标账号）。
 */
export function iGM_IsStaffUser(user: iGM_User | null | undefined): boolean {
  if (!user) return false;
  return user.role === "admin" || user.verifiedOrg?.isOwner === true;
}

// 核心逻辑 //
/** 注册：成功后后端同时下发会话 Cookie；agreementVersion 为已同意的规定版本号 */
export function iGM_ApiRegister(input: {
  username: string;
  email: string;
  password: string;
  agreementVersion?: string;
}): Promise<iGM_ApiResponse<iGM_RegisterData>> {
  return iGM_Post("/G_Auth/register", input, 15000);
}

/** 登录：账号支持邮箱或用户名 */
export function iGM_ApiLogin(input: {
  account: string;
  password: string;
}): Promise<iGM_ApiResponse<iGM_AuthData>> {
  return iGM_Post("/G_Auth/login", input);
}

/** 登出：后端清除会话与 Cookie */
export function iGM_ApiLogout(): Promise<iGM_ApiResponse<null>> {
  return iGM_Post("/G_Auth/logout");
}

/**
 * 获取当前登录用户（刷新页面后恢复会话）
 * 说明：未登录时后端本来就返回 401，属预期的会话探测，故跳过 401 过期提示
 */
export function iGM_ApiMe(): Promise<iGM_ApiResponse<iGM_AuthData>> {
  return iGM_Get("/G_Auth/me", { skipAuthNotice: true });
}

/** 重新发送邮箱验证码 */
export function iGM_ApiSendVerification(): Promise<
  iGM_ApiResponse<{ sent: boolean }>
> {
  return iGM_Post("/G_Auth/send-verification", undefined, 15000);
}

/** 校验邮箱验证码 */
export function iGM_ApiVerifyEmail(
  code: string,
): Promise<iGM_ApiResponse<iGM_AuthData>> {
  return iGM_Post("/G_Auth/verify-email", { code });
}

/** 忘记密码：提交邮箱，后端发送一次性重置链接 */
export function iGM_ApiForgotPassword(
  email: string,
): Promise<iGM_ApiResponse<{ delivered: boolean }>> {
  return iGM_Post("/G_Auth/forgot-password", { email }, 15000);
}

/** 重置页提交前预检令牌是否有效 */
export function iGM_ApiCheckResetToken(
  token: string,
): Promise<iGM_ApiResponse<{ valid: boolean }>> {
  return iGM_Get(`/G_Auth/reset-token?token=${encodeURIComponent(token)}`);
}

/** 使用一次性令牌重置密码 */
export function iGM_ApiResetPassword(input: {
  token: string;
  newPassword: string;
}): Promise<iGM_ApiResponse<null>> {
  return iGM_Post("/G_Auth/reset-password", input);
}

/** 发送修改密码验证码（需登录，发送至本人邮箱） */
export function iGM_ApiSendPasswordChangeCode(): Promise<
  iGM_ApiResponse<{ sent: boolean }>
> {
  return iGM_Post("/G_Auth/send-password-change-code", undefined, 15000);
}

/**
 * 修改密码（登录态），成功后其他会话失效。
 * 当前密码为可选项：不填时必须携带发送至本人邮箱的修改密码验证码
 */
export function iGM_ApiChangePassword(input: {
  oldPassword?: string;
  newPassword: string;
  emailCode?: string;
}): Promise<iGM_ApiResponse<null>> {
  return iGM_Post("/G_Auth/change-password", input);
}

/** 模块七第三轮：发送注销账号邮箱验证码（需登录，发送至本人邮箱） */
export function iGM_ApiSendDeleteCode(): Promise<
  iGM_ApiResponse<{ sent: boolean }>
> {
  return iGM_Post("/G_Auth/send-delete-code", undefined, 15000);
}

/** 模块七第三轮：凭邮箱验证码永久注销当前账号（成功后会话失效） */
export function iGM_ApiDeleteAccount(
  code: string,
): Promise<iGM_ApiResponse<{ deleted: boolean }>> {
  return iGM_Post("/G_Auth/delete-account", { code }, 15000);
}

/** 模块十五：查询我的《用户管理规定》同意状态（登录）；未登录返回 401 */
export function iGM_ApiGetAgreementStatus(): Promise<
  iGM_ApiResponse<iGM_AgreementStatus>
> {
  return iGM_Get("/G_Auth/agreement");
}

// 导出 //
export default {
  iGM_ApiRegister,
  iGM_ApiLogin,
  iGM_ApiLogout,
  iGM_ApiMe,
  iGM_ApiSendVerification,
  iGM_ApiSendPasswordChangeCode,
  iGM_ApiVerifyEmail,
  iGM_ApiForgotPassword,
  iGM_ApiCheckResetToken,
  iGM_ApiResetPassword,
  iGM_ApiChangePassword,
  iGM_ApiSendDeleteCode,
  iGM_ApiDeleteAccount,
  iGM_ApiGetAgreementStatus,
};
