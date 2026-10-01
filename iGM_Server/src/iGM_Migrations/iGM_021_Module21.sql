-- 文件路径：iGM_Server/src/iGM_Migrations/iGM_021_Module21.sql
-- 所属层：后端 / 数据库迁移层
-- 路由：G_OAuth
-- 模块：iGM_Migrations / 模块二十一
-- 作用：模块二十一——OAuth 2.0 + OpenID Connect 身份提供方建表
-- 内容：
--   1) iGM_OAuthClients  第三方 OAuth 应用（即开发者应用的申请与审核载体）；
--   2) iGM_OAuthCodes    授权码（一次性，5 分钟有效）；
--   3) iGM_OAuthTokens   访问令牌 / 刷新令牌（库中仅存 SHA-256 哈希）；
--   4) iGM_OAuthConsents 用户授权同意记录（按 用户+应用 唯一）；
--   5) iGM_OAuthLogs     授权全链路操作日志；
--   6) iGM_OAuthKeys     OIDC 签名密钥（ES256 P-256）与 Cookie 签名密钥
-- 说明：
--   - 表名与列名统一 iGM_ 前缀；迁移仅执行一次；
--   - iGM_OAuthClients.iGM_OwnerUid 存 11 位 iGMUid（与 iGM_Users.iGM_Uid 关联）；
--   - 状态取值：pending 待审核 / approved 已通过 / rejected 已拒绝 /
--     disabled 已禁用 / withdrawn 已撤回；
--   - client_secret 仅明文展示一次，库中仅存哈希，永不回传。

-- ===== OAuth 应用表：一行对应一个第三方接入应用 =====
CREATE TABLE IF NOT EXISTS iGM_OAuthClients (
  iGM_Id               TEXT PRIMARY KEY,
  iGM_ClientId         TEXT NOT NULL UNIQUE,
  -- 审核通过前为 NULL；仅展示一次，库中仅存 SHA-256 哈希
  iGM_ClientSecretHash TEXT,
  iGM_Name             TEXT NOT NULL,
  -- web 网页 / desktop 桌面 / mobile 移动 / service 服务端 / other 其他
  iGM_Type             TEXT NOT NULL DEFAULT 'web',
  iGM_Description      TEXT NOT NULL,
  -- 回调地址：JSON 数组字符串，如 ["https://example.com/callback"]
  iGM_RedirectUris     TEXT NOT NULL,
  -- 申请 scope：空格分隔，如 "openid profile email"
  iGM_Scopes           TEXT NOT NULL,
  iGM_Purpose          TEXT NOT NULL,
  iGM_Contact          TEXT NOT NULL,
  -- 申请人 11 位 iGMUid
  iGM_OwnerUid         TEXT NOT NULL,
  iGM_Status           TEXT NOT NULL DEFAULT 'pending',
  iGM_ReviewerId       TEXT,
  iGM_ReviewComment    TEXT,
  iGM_SecretRotatedAt  TEXT,
  iGM_CreatedAt        TEXT NOT NULL,
  iGM_UpdatedAt        TEXT NOT NULL,
  FOREIGN KEY (iGM_OwnerUid) REFERENCES iGM_Users (iGM_Uid) ON DELETE CASCADE
);

-- 审核后台按状态 + 创建时间倒序检索
CREATE INDEX IF NOT EXISTS iGM_Idx_OAuthClients_Status
  ON iGM_OAuthClients (iGM_Status, iGM_CreatedAt DESC);
-- 开发者侧按本人 UID 列出应用
CREATE INDEX IF NOT EXISTS iGM_Idx_OAuthClients_Owner
  ON iGM_OAuthClients (iGM_OwnerUid, iGM_CreatedAt DESC);

-- ===== 授权码表：一次性、5 分钟有效 =====
CREATE TABLE IF NOT EXISTS iGM_OAuthCodes (
  iGM_Id             TEXT PRIMARY KEY,
  iGM_Code           TEXT NOT NULL UNIQUE,
  iGM_ClientId       TEXT NOT NULL,
  iGM_UserId         TEXT NOT NULL,
  iGM_Scope          TEXT NOT NULL,
  iGM_RedirectUri    TEXT NOT NULL,
  -- PKCE：S256 挑战值与算法
  iGM_CodeChallenge  TEXT,
  iGM_CodeChallengeMethod TEXT,
  iGM_Nonce          TEXT,
  iGM_ExpiresAt      TEXT NOT NULL,
  iGM_Used           INTEGER NOT NULL DEFAULT 0,
  iGM_CreatedAt      TEXT NOT NULL,
  FOREIGN KEY (iGM_ClientId) REFERENCES iGM_OAuthClients (iGM_ClientId) ON DELETE CASCADE,
  FOREIGN KEY (iGM_UserId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE
);

-- ===== 令牌表：access_token 与 refresh_token 均存 SHA-256 哈希 =====
CREATE TABLE IF NOT EXISTS iGM_OAuthTokens (
  iGM_Id               TEXT PRIMARY KEY,
  iGM_AccessToken      TEXT NOT NULL UNIQUE,
  iGM_RefreshToken     TEXT UNIQUE,
  iGM_ClientId         TEXT NOT NULL,
  iGM_UserId           TEXT NOT NULL,
  iGM_Scope            TEXT NOT NULL,
  iGM_ExpiresAt        TEXT NOT NULL,
  -- 刷新令牌最长有效期（不超过两个季度，约 180 天）
  iGM_RefreshExpiresAt TEXT,
  iGM_Revoked          INTEGER NOT NULL DEFAULT 0,
  iGM_CreatedAt        TEXT NOT NULL,
  iGM_UpdatedAt        TEXT NOT NULL,
  FOREIGN KEY (iGM_ClientId) REFERENCES iGM_OAuthClients (iGM_ClientId) ON DELETE CASCADE,
  FOREIGN KEY (iGM_UserId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE
);

-- 用户按应用批量撤销授权时扫描
CREATE INDEX IF NOT EXISTS iGM_Idx_OAuthTokens_UserClient
  ON iGM_OAuthTokens (iGM_UserId, iGM_ClientId, iGM_Revoked);

-- ===== 用户授权同意表：按 用户 + 应用 唯一 =====
CREATE TABLE IF NOT EXISTS iGM_OAuthConsents (
  iGM_Id        TEXT PRIMARY KEY,
  iGM_UserId    TEXT NOT NULL,
  iGM_ClientId  TEXT NOT NULL,
  iGM_Scope     TEXT NOT NULL,
  iGM_GrantedAt TEXT NOT NULL,
  iGM_UpdatedAt TEXT NOT NULL,
  UNIQUE (iGM_UserId, iGM_ClientId),
  FOREIGN KEY (iGM_ClientId) REFERENCES iGM_OAuthClients (iGM_ClientId) ON DELETE CASCADE,
  FOREIGN KEY (iGM_UserId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE
);

-- ===== 操作日志表：授权、发令牌、撤销、审核等全链路留痕 =====
-- 不设外键：应用被删除后日志仍需保留留痕
CREATE TABLE IF NOT EXISTS iGM_OAuthLogs (
  iGM_Id        TEXT PRIMARY KEY,
  iGM_ClientId  TEXT,
  iGM_UserId    TEXT,
  iGM_Action    TEXT NOT NULL,
  iGM_Detail    TEXT,
  iGM_Ip        TEXT,
  iGM_CreatedAt TEXT NOT NULL
);

-- 开发者按自己的应用检索日志、管理端按时间检索
CREATE INDEX IF NOT EXISTS iGM_Idx_OAuthLogs_Client
  ON iGM_OAuthLogs (iGM_ClientId, iGM_CreatedAt DESC);

-- ===== 密钥表：OIDC 签名密钥（ES256 P-256）与 Cookie 签名密钥 =====
-- iGM_Kind 取值：oidc（ID Token 签名密钥）/ cookie（会话 Cookie HMAC 密钥）
CREATE TABLE IF NOT EXISTS iGM_OAuthKeys (
  iGM_Id         TEXT PRIMARY KEY,
  iGM_Kind       TEXT NOT NULL DEFAULT 'oidc',
  iGM_Kid        TEXT NOT NULL UNIQUE,
  iGM_Alg        TEXT NOT NULL DEFAULT 'ES256',
  iGM_PublicJwk  TEXT NOT NULL,
  iGM_PrivateJwk TEXT NOT NULL,
  iGM_Active     INTEGER NOT NULL DEFAULT 1,
  iGM_CreatedAt  TEXT NOT NULL
);
