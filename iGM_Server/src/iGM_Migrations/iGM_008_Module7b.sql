-- 文件路径：iGM_Server/src/iGM_Migrations/iGM_008_Module7b.sql
-- 所属层：后端 / 数据库迁移层
-- 路由：无
-- 模块：iGM_Migrations / G_OrgVerify / G_Admin
-- 作用：模块七增强——组织负责人、关于组织内容、用户 iGMUid
-- 内容：iGM_Organizations 增加 iGM_AboutContent / iGM_OwnerEmail 并回填负责人；
--       iGM_Users 增加 iGM_Uid（11 位全局唯一）并回填历史用户、建唯一索引；
--       两个负责人邮箱账号回填为 admin 且自动获得对应组织认证
-- 说明：迁移按文件名记录执行历史，仅会执行一次；
--       SQLite 追加列默认 NULL/默认值，历史行安全；
--       历史用户 UID 以 rowid 线性生成（10000000000 + rowid * 7919），
--       rowid 唯一故 UID 唯一，且在现有数据规模下恒为 11 位数字；
--       新注册用户由仓库层随机生成并做唯一冲突重试

-- ===== 组织表扩展：关于组织内容（负责人可编辑）与负责人邮箱 =====
ALTER TABLE iGM_Organizations
  ADD COLUMN iGM_AboutContent TEXT NOT NULL DEFAULT '';

ALTER TABLE iGM_Organizations
  ADD COLUMN iGM_OwnerEmail TEXT;

-- 回填两个受信任组织的负责人（固定 ID，幂等）
UPDATE iGM_Organizations
   SET iGM_OwnerEmail = 'igcraftlit@outlook.com'
 WHERE iGM_Id = 'org-igcraftlit';

UPDATE iGM_Organizations
   SET iGM_OwnerEmail = 'cayihuo@outlook.com'
 WHERE iGM_Id = 'org-muoceon';

-- ===== 用户表扩展：11 位 iGMUid（认证值，不可修改） =====
ALTER TABLE iGM_Users
  ADD COLUMN iGM_Uid TEXT;

-- 回填历史用户：rowid 唯一，乘常数映射在当前数据量下保持 11 位且不碰撞
UPDATE iGM_Users
   SET iGM_Uid = printf('%d', 10000000000 + rowid * 7919)
 WHERE iGM_Uid IS NULL;

-- 全局唯一索引：新用户注册时仓库层先查重再插入
CREATE UNIQUE INDEX IF NOT EXISTS iGM_Idx_Users_Uid
  ON iGM_Users (iGM_Uid);

-- ===== 特殊用户：负责人邮箱账号自动获得最高权限与对应组织认证（账号已存在时回填） =====
UPDATE iGM_Users
   SET iGM_Role = 'admin',
       iGM_VerifiedOrgId = 'org-igcraftlit'
 WHERE iGM_Email = 'igcraftlit@outlook.com';

UPDATE iGM_Users
   SET iGM_Role = 'admin',
       iGM_VerifiedOrgId = 'org-muoceon'
 WHERE iGM_Email = 'cayihuo@outlook.com';
