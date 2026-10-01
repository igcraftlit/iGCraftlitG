-- 文件路径：iGM_Server/src/iGM_Migrations/iGM_023_Module22.sql
-- 所属层：后端 / 数据库迁移层
-- 路由：G_OAuth
-- 模块：iGM_Migrations / 模块二十二
-- 作用：模块二十二——OAuth 应用本地测试回调标记与应用软删除
-- 内容：
--   1) iGM_OAuthClients 扩展本地测试标记 iGM_IsLocalTest；
--   2) iGM_OAuthClients 扩展软删除时间 iGM_DeletedAt；
-- 说明：
--   - 表名与列名统一 iGM_ 前缀；布尔列以 INTEGER 0/1 存储；迁移幂等；
--   - 应用删除为软删除：保留行以占用 client_id，保证已删除的 client_id 不可再次使用。

-- ===== OAuth 应用表：本地测试回调标记与软删除时间 =====
-- iGM_IsLocalTest = 1 表示注册时勾选「本地测试用途」，回调可为 http://localhost 等
ALTER TABLE iGM_OAuthClients ADD COLUMN IF NOT EXISTS iGM_IsLocalTest INTEGER NOT NULL DEFAULT 0;
-- 非 NULL 表示该应用已被删除（软删除，行保留以占用 client_id）
ALTER TABLE iGM_OAuthClients ADD COLUMN IF NOT EXISTS iGM_DeletedAt TEXT;
