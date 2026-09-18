/**
 * 文件路径：iGM_Server/src/iGM_Types/iGM_Auth.ts
 * 所属层：后端 / 类型定义层
 * 路由：G_Auth
 * 模块：iGM_Auth
 * 作用：定义认证领域共享类型
 * 内容：用户角色、账户状态、用户数据行、对外用户 DTO、令牌用途
 */

// 导入依赖 //
// （本文件仅包含类型定义与常量，无运行时依赖）

// 类型定义 //
/** 用户角色：普通用户 / 协管员 / 管理员 */
export type iGM_UserRole = "user" | "moderator" | "admin";

/** 账户状态：active 正常 / suspended 停用 */
export type iGM_UserStatus = "active" | "suspended";

/** 令牌用途 */
export type iGM_TokenPurpose = "email_verify" | "password_reset";

/** iGM_Users 表数据行（包含密码哈希，禁止对外返回） */
export interface iGM_UserRow {
  iGM_Id: string;
  iGM_Username: string;
  iGM_Email: string;
  iGM_PasswordHash: string;
  iGM_Role: iGM_UserRole;
  iGM_Status: iGM_UserStatus;
  iGM_EmailVerified: number;
  // 模块三扩展的公开资料字段
  iGM_DisplayName: string | null;
  iGM_Avatar: string | null;
  iGM_Bio: string | null;
  iGM_Website: string | null;
  iGM_CreatedAt: string;
  iGM_UpdatedAt: string;
}

/** 对外用户信息 DTO：绝不包含密码哈希；资料字段仅本人接口返回 */
export interface iGM_UserDto {
  id: string;
  username: string;
  email: string;
  role: iGM_UserRole;
  status: iGM_UserStatus;
  emailVerified: boolean;
  displayName: string | null;
  avatar: string | null;
  bio: string | null;
  website: string | null;
  createdAt: string;
  updatedAt: string;
}

/** iGM_Sessions 表数据行 */
export interface iGM_SessionRow {
  iGM_Id: string;
  iGM_UserId: string;
  iGM_ExpiresAt: string;
  iGM_CreatedAt: string;
  iGM_UserAgent: string | null;
  iGM_Ip: string | null;
}

/** iGM_Tokens 表数据行 */
export interface iGM_TokenRow {
  iGM_Id: string;
  iGM_UserId: string;
  iGM_Purpose: iGM_TokenPurpose;
  iGM_SecretHash: string;
  iGM_ExpiresAt: string;
  iGM_UsedAt: string | null;
  iGM_Attempts: number;
  iGM_CreatedAt: string;
}

// 核心逻辑 //
/** 全部角色常量，按权限从低到高排列 */
export const iGM_Roles: iGM_UserRole[] = ["user", "moderator", "admin"];

/** 判断未知字符串是否为合法角色 */
export function iGM_IsRole(value: unknown): value is iGM_UserRole {
  return (
    typeof value === "string" && iGM_Roles.includes(value as iGM_UserRole)
  );
}

/**
 * 将数据库用户行转换为对外 DTO
 * 统一出口，保证 passwordHash 永远不会泄露到响应体
 */
export function iGM_ToUserDto(row: iGM_UserRow): iGM_UserDto {
  return {
    id: row.iGM_Id,
    username: row.iGM_Username,
    email: row.iGM_Email,
    role: row.iGM_Role,
    status: row.iGM_Status,
    emailVerified: row.iGM_EmailVerified === 1,
    displayName: row.iGM_DisplayName,
    avatar: row.iGM_Avatar,
    bio: row.iGM_Bio,
    website: row.iGM_Website,
    createdAt: row.iGM_CreatedAt,
    updatedAt: row.iGM_UpdatedAt,
  };
}

// 导出 //
export default iGM_Roles;
