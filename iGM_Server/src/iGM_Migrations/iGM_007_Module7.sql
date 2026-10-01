-- 文件路径：iGM_Server/src/iGM_Migrations/iGM_007_Module7.sql
-- 所属层：后端 / 数据库迁移层
-- 路由：无
-- 模块：iGM_Migrations / G_OrgVerify / G_Admin
-- 作用：模块七组织认证建表与用户表认证字段扩展
-- 内容：受信任组织表、组织认证申请表、iGM_Users 增加 iGM_VerifiedOrgId、
--       常用查询索引与受信任组织种子（iGCraftLit、MuoCeon）
-- 说明：所有表名与列名统一 iGM_ 前缀；布尔列以 INTEGER 0/1 存储；
--       删除用户时申请记录外键级联清理，审核人删除时置空；
--       SQLite 允许以默认 NULL 追加带外键的列（iGM_VerifiedOrgId）

-- ===== 受信任组织表：申请时仅可选择 iGM_IsTrusted = 1 的组织 =====
CREATE TABLE IF NOT EXISTS iGM_Organizations (
  iGM_Id        TEXT PRIMARY KEY,
  iGM_Name      TEXT NOT NULL,
  iGM_Slug      TEXT NOT NULL UNIQUE,
  iGM_Description TEXT NOT NULL DEFAULT '',
  iGM_Logo      TEXT,
  iGM_IsTrusted INTEGER NOT NULL DEFAULT 1,
  iGM_CreatedAt TEXT NOT NULL
);

-- ===== 组织认证申请表：记录申请、审核全过程 =====
-- status 取值：pending 待审核 / approved 已通过 / rejected 已拒绝 / cancelled 已取消
-- proof 可存文本说明或站内上传文件 ID（G_File 上传体系）
CREATE TABLE IF NOT EXISTS iGM_OrgVerifications (
  iGM_Id         TEXT PRIMARY KEY,
  iGM_UserId     TEXT NOT NULL,
  iGM_OrgId      TEXT NOT NULL,
  iGM_Reason     TEXT NOT NULL,
  iGM_Proof      TEXT,
  iGM_Status     TEXT NOT NULL DEFAULT 'pending',
  iGM_ReviewerId TEXT,
  iGM_ReviewComment TEXT,
  iGM_CreatedAt  TEXT NOT NULL,
  iGM_UpdatedAt  TEXT NOT NULL,
  FOREIGN KEY (iGM_UserId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE,
  FOREIGN KEY (iGM_OrgId) REFERENCES iGM_Organizations (iGM_Id) ON DELETE CASCADE,
  FOREIGN KEY (iGM_ReviewerId) REFERENCES iGM_Users (iGM_Id) ON DELETE SET NULL
);

-- 同一用户待审核申请查询（业务层保证同一用户同一时间最多一条 pending）
CREATE INDEX IF NOT EXISTS iGM_Idx_OrgVerify_User_Status
  ON iGM_OrgVerifications (iGM_UserId, iGM_Status);
-- 管理端按状态筛选 + 时间倒序
CREATE INDEX IF NOT EXISTS iGM_Idx_OrgVerify_Status_Created
  ON iGM_OrgVerifications (iGM_Status, iGM_CreatedAt);
-- 组织维度统计
CREATE INDEX IF NOT EXISTS iGM_Idx_OrgVerify_Org
  ON iGM_OrgVerifications (iGM_OrgId);

-- ===== 用户表扩展：审核通过后记录认证组织 =====
ALTER TABLE iGM_Users
  ADD COLUMN iGM_VerifiedOrgId TEXT REFERENCES iGM_Organizations (iGM_Id);

-- ===== 受信任组织种子（固定 ID，迁移幂等） =====
-- 前端组织描述优先匹配语言包 orgVerify.orgs.<slug>，匹配不到时显示 iGM_Description
INSERT INTO iGM_Organizations
  (iGM_Id, iGM_Name, iGM_Slug, iGM_Description, iGM_Logo, iGM_IsTrusted, iGM_CreatedAt) VALUES
  ('org-igcraftlit', 'iGCraftLit', 'igcraftlit',
   'iGCraftLit 官方组织认证', NULL, 1, '2026-09-25T00:00:00.000Z'),
  ('org-muoceon', 'MuoCeon', 'muoceon',
   'MuoCeon 合作组织认证', NULL, 1, '2026-09-25T00:00:00.000Z')
ON CONFLICT DO NOTHING;
