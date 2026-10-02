-- 文件路径：iGM_Server/src/iGM_Migrations/iGM_025_Module25.sql
-- 所属层：后端 / 数据库迁移层
-- 路由：G_OAuth、G_Auth、G_Admin
-- 模块：iGM_Migrations / 模块二十五
-- 作用：OAuth 申请合规字段与一次性密钥发放、用户注册/登录 IP、开发者调用量统计
-- 内容：
--   1) iGM_OAuthClients 扩展应用主页 / 隐私政策 / 服务条款 / 数据使用说明四列；
--   2) iGM_OAuthClients 扩展 iGM_PendingSecret：审核通过时暂存一次性明文密钥，
--      开发者在「我的应用」领取后立即置空，库中仅保留 SHA-256 哈希长期有效；
--   3) iGM_Users 扩展 iGM_RegisterIp / iGM_LastLoginIp，供用户管理异常 IP 排查；
--   4) 新建 iGM_DeveloperCallStats 开发者调用量表（api / sdk / app 三通道，
--      iGM_Channel 取值可扩展，后续新增开发者项目自动纳入统计）。
-- 说明：
--   - 表名与列名统一 iGM_ 前缀；迁移仅执行一次，幂等可重复执行；
--   - client_secret 明文只在 iGM_PendingSecret 中暂存至开发者首次领取，
--     领取 / 重置后立即清空，iGM_ClientSecretHash 始终为 SHA-256 哈希。

-- ===== OAuth 应用表：申请合规字段（存量行回填空串） =====
ALTER TABLE iGM_OAuthClients ADD COLUMN IF NOT EXISTS iGM_HomepageUrl TEXT NOT NULL DEFAULT '';
ALTER TABLE iGM_OAuthClients ADD COLUMN IF NOT EXISTS iGM_PrivacyPolicyUrl TEXT NOT NULL DEFAULT '';
ALTER TABLE iGM_OAuthClients ADD COLUMN IF NOT EXISTS iGM_TermsOfServiceUrl TEXT NOT NULL DEFAULT '';
ALTER TABLE iGM_OAuthClients ADD COLUMN IF NOT EXISTS iGM_DataUsage TEXT NOT NULL DEFAULT '';

-- ===== OAuth 应用表：审核通过后待开发者领取的一次性明文密钥 =====
-- 为 NULL 表示尚未发放或已被领取；领取后立即置空，不可再次查看
ALTER TABLE iGM_OAuthClients ADD COLUMN IF NOT EXISTS iGM_PendingSecret TEXT;

-- ===== 用户表：注册 IP 与最后登录 IP（管理端异常 IP 排查） =====
ALTER TABLE iGM_Users ADD COLUMN IF NOT EXISTS iGM_RegisterIp TEXT;
ALTER TABLE iGM_Users ADD COLUMN IF NOT EXISTS iGM_LastLoginIp TEXT;

-- ===== 开发者调用量统计表：一行一次调用事件 =====
-- iGM_Channel：api（平台开放 API）/ sdk（下载 SDK 调用）/ app（OAuth 应用事件），
--              取值可扩展，后续新增开发者项目按新通道写入即自动在监测面板展示
CREATE TABLE IF NOT EXISTS iGM_DeveloperCallStats (
  iGM_Id             TEXT PRIMARY KEY,
  iGM_Channel        TEXT NOT NULL,
  iGM_Action         TEXT NOT NULL,
  iGM_ClientId       TEXT,
  iGM_DeveloperUid   TEXT,
  iGM_Ip             TEXT,
  iGM_CreatedAt      TEXT NOT NULL
);

-- 管理端按时间范围聚合（全通道 + 分通道）
CREATE INDEX IF NOT EXISTS iGM_Idx_DevCallStats_CreatedAt
  ON iGM_DeveloperCallStats (iGM_CreatedAt);
CREATE INDEX IF NOT EXISTS iGM_Idx_DevCallStats_Channel
  ON iGM_DeveloperCallStats (iGM_Channel, iGM_CreatedAt);
