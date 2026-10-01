-- 文件路径：iGM_Server/src/iGM_Migrations/iGM_024_Module22KeyCleanup.sql
-- 所属层：后端 / 数据库迁移层
-- 路由：G_Developer
-- 模块：iGM_Migrations / 模块二十二
-- 作用：模块二十二调整——开发者平台改为「开发者申请通过后凭站点登录会话直接进入」，取消开发者密钥
-- 内容：清理开发者密钥遗留列与开发者平台会话表（幂等）
-- 说明：开发者平台不再需要密钥与会话表；已应用过早期 iGM_023 的库由此迁移收敛

-- ===== 清除 iGM_Users 的开发者密钥字段 =====
ALTER TABLE iGM_Users DROP COLUMN IF EXISTS iGM_DeveloperKeyHash;
ALTER TABLE iGM_Users DROP COLUMN IF EXISTS iGM_DeveloperKeyEncrypted;
ALTER TABLE iGM_Users DROP COLUMN IF EXISTS iGM_DeveloperKeyCreatedAt;
ALTER TABLE iGM_Users DROP COLUMN IF EXISTS iGM_DeveloperKeyExpiresAt;

-- ===== 删除开发者平台会话表 =====
DROP TABLE IF EXISTS iGM_DeveloperSessions;
