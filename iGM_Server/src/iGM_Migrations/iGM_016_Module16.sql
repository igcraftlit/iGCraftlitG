-- 文件路径：iGM_Server/src/iGM_Migrations/iGM_016_Module16.sql
-- 所属层：后端 / 数据库迁移层
-- 路由：无
-- 模块：iGM_Migrations / G_Auth / G_Developer
-- 作用：模块十六 UID 顺序号系统与开发者申请独立入口
-- 内容：新建 iGM_UIDSequence（按区分位记录当前最大顺序号）、
--       iGM_DeveloperApplications（开发者资格申请，含项目类型/链接/理由等字段）；
--       废弃模块十五的 iGM_Developers 占位表（0 行数据）；
--       预置网站最高管理者与两个组织所有者的 UID，并按注册顺序重排既有普通用户
-- 说明：UID 共 11 位——第 1 位为区分位（0 管理员/官方人员、1-8 普通用户、9 测试账号），
--       后 10 位为全局顺序号（从 1 开始、按注册顺序递增、全局唯一、不使用 0）；
--       顺序号一经分配不可更改；迁移幂等；布尔列以 INTEGER 0/1 存储

-- ===== UID 顺序号表：按区分位分别记录当前已分配的最大顺序号 =====
CREATE TABLE IF NOT EXISTS iGM_UIDSequence (
  iGM_Id           TEXT PRIMARY KEY,
  iGM_Scope        TEXT NOT NULL UNIQUE,
  iGM_LastSequence INTEGER NOT NULL DEFAULT 0,
  iGM_UpdatedAt    TEXT NOT NULL
);

-- 预置三个区分位的计数：
--   scope 1（普通用户）：序列号 1、2 预留给两位组织所有者，普通用户从 3 开始
--   scope 9（测试账号）：序列号 1 预留给网站最高管理者，其他测试账号从 2 开始
--   scope 0（管理员 / 官方人员）：暂无预置占用
INSERT OR IGNORE INTO iGM_UIDSequence (iGM_Id, iGM_Scope, iGM_LastSequence, iGM_UpdatedAt) VALUES
  ('uid-scope-0', '0', 0, '2026-01-01T00:00:00.000Z'),
  ('uid-scope-1', '1', 2, '2026-01-01T00:00:00.000Z'),
  ('uid-scope-9', '9', 1, '2026-01-01T00:00:00.000Z');

-- ===== 预置账号 UID：最高管理者、iGCraftLit 所有者、MuoCeon 所有者 =====
UPDATE iGM_Users SET iGM_Uid = '90000000001' WHERE iGM_Username = 'iGM_Admin';
UPDATE iGM_Users SET iGM_Uid = '10000000001' WHERE iGM_Email = 'igcraftlit@outlook.com';
UPDATE iGM_Users SET iGM_Uid = '10000000002' WHERE iGM_Email = 'cayihuo@outlook.com';

-- ===== 既有普通用户按注册顺序重排：序列号 3 起依次分配 =====
UPDATE iGM_Users SET iGM_Uid = '10000000003' WHERE iGM_Email = 'igcraftlitminecraft@outlook.com';
UPDATE iGM_Users SET iGM_Uid = '10000000004' WHERE iGM_Email = 'aa89592204@163.com';
UPDATE iGM_Users SET iGM_Uid = '10000000005' WHERE iGM_Email = '81333809@qq.com';
UPDATE iGM_Users SET iGM_Uid = '10000000006' WHERE iGM_Email = 'aa89592202@163.com';

-- 顺序号计数同步到既有最大占用值（仅在当前值更小时提升，保证幂等且不回退）
UPDATE iGM_UIDSequence SET iGM_LastSequence = 6, iGM_UpdatedAt = '2026-01-01T00:00:00.000Z'
  WHERE iGM_Scope = '1' AND iGM_LastSequence < 6;

-- ===== 开发者资格申请表：独立入口提交，审核通过后发放 API Key =====
-- status 取值：pending 待审核 / approved 已通过 / rejected 已拒绝 / withdrawn 已撤回
CREATE TABLE IF NOT EXISTS iGM_DeveloperApplications (
  iGM_Id             TEXT PRIMARY KEY,
  iGM_UserId         TEXT NOT NULL,
  iGM_ProjectName    TEXT NOT NULL,
  iGM_ProjectType    TEXT NOT NULL,
  iGM_ProjectDesc    TEXT NOT NULL,
  iGM_ProjectUrl     TEXT,
  iGM_Contact        TEXT NOT NULL,
  iGM_ExpectedQuota  TEXT,
  iGM_Reason         TEXT NOT NULL,
  iGM_Status         TEXT NOT NULL DEFAULT 'pending',
  iGM_ReviewerId     TEXT,
  iGM_ReviewComment  TEXT,
  iGM_ApiKey         TEXT,
  iGM_CreatedAt      TEXT NOT NULL,
  iGM_UpdatedAt      TEXT NOT NULL,
  FOREIGN KEY (iGM_UserId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE,
  FOREIGN KEY (iGM_ReviewerId) REFERENCES iGM_Users (iGM_Id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS iGM_Idx_DeveloperApplications_User
  ON iGM_DeveloperApplications (iGM_UserId, iGM_CreatedAt);
CREATE INDEX IF NOT EXISTS iGM_Idx_DeveloperApplications_Status
  ON iGM_DeveloperApplications (iGM_Status, iGM_CreatedAt);

-- ===== 废弃模块十五的 iGM_Developers 占位表（未上线、0 行数据，由新表取代） =====
DROP TABLE IF EXISTS iGM_Developers;