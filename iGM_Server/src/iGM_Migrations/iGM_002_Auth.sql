-- 文件路径：iGM_Server/src/iGM_Migrations/iGM_002_Auth.sql
-- 所属层：后端 / 数据库迁移层
-- 路由：无
-- 模块：iGM_Migrations / G_Auth
-- 作用：模块二用户认证与账户体系建表
-- 内容：iGM_Users 用户表、iGM_Sessions 会话表、iGM_Tokens 验证码/重置令牌表
-- 说明：所有表名统一 iGM_ 前缀；密码仅存 passwordHash，禁止明文

-- 用户表：账户、角色、状态与邮箱验证标记
CREATE TABLE IF NOT EXISTS iGM_Users (
  iGM_Id           TEXT PRIMARY KEY,
  iGM_Username     TEXT NOT NULL UNIQUE COLLATE NOCASE,
  iGM_Email        TEXT NOT NULL UNIQUE COLLATE NOCASE,
  iGM_PasswordHash TEXT NOT NULL,
  iGM_Role         TEXT NOT NULL DEFAULT 'user',
  iGM_Status       TEXT NOT NULL DEFAULT 'active',
  iGM_EmailVerified INTEGER NOT NULL DEFAULT 0,
  iGM_CreatedAt    TEXT NOT NULL,
  iGM_UpdatedAt    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS iGM_Idx_Users_Email ON iGM_Users (iGM_Email);
CREATE INDEX IF NOT EXISTS iGM_Idx_Users_Role  ON iGM_Users (iGM_Role);

-- 会话表：服务端会话，登录时写入、登出/失效时删除
-- Cookie 中仅保存随机会话 ID，数据库保存其 SHA-256 哈希
CREATE TABLE IF NOT EXISTS iGM_Sessions (
  iGM_Id        TEXT PRIMARY KEY,
  iGM_UserId    TEXT NOT NULL,
  iGM_ExpiresAt TEXT NOT NULL,
  iGM_CreatedAt TEXT NOT NULL,
  iGM_UserAgent TEXT,
  iGM_Ip        TEXT,
  FOREIGN KEY (iGM_UserId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS iGM_Idx_Sessions_UserId ON iGM_Sessions (iGM_UserId);

-- 令牌表：邮箱验证码与一次性密码重置令牌统一存储
-- iGM_Purpose：email_verify 邮箱验证码 / password_reset 密码重置令牌
-- 邮箱验证码存 6 位数字的哈希；重置令牌存随机十六进制串的 SHA-256 哈希
CREATE TABLE IF NOT EXISTS iGM_Tokens (
  iGM_Id         TEXT PRIMARY KEY,
  iGM_UserId     TEXT NOT NULL,
  iGM_Purpose    TEXT NOT NULL,
  iGM_SecretHash TEXT NOT NULL,
  iGM_ExpiresAt  TEXT NOT NULL,
  iGM_UsedAt     TEXT,
  iGM_Attempts   INTEGER NOT NULL DEFAULT 0,
  iGM_CreatedAt  TEXT NOT NULL,
  FOREIGN KEY (iGM_UserId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS iGM_Idx_Tokens_User_Purpose
  ON iGM_Tokens (iGM_UserId, iGM_Purpose);
