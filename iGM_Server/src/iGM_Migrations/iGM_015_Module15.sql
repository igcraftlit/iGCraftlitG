-- 文件路径：iGM_Server/src/iGM_Migrations/iGM_015_Module15.sql
-- 所属层：后端 / 数据库迁移层
-- 路由：无
-- 模块：iGM_Migrations / G_Points / G_Developer / G_Auth
-- 作用：模块十五 UID 区分位、等级考核、周/季任务、勋章稀有度、用户协议与开发者申请
-- 内容：iGM_Levels 新增 iGM_IsExamRequired 并重写为十级；iGM_Badges 新增 iGM_Rarity；
--       iGM_Tasks 新增 iGM_SeasonId 并改为每周/每季任务；iGM_UserTasks 新增
--       iGM_IsClaimed 与 iGM_CycleKey；新建 iGM_UserAgreements、iGM_Developers、
--       iGM_LevelExams 三张表
-- 说明：迁移幂等；布尔列以 INTEGER 0/1 存储；表名与列名统一 iGM_ 前缀

-- ===== 等级表：新增是否需考核标记（第 8、9、10 级需通过考核方可升级） =====
ALTER TABLE iGM_Levels ADD COLUMN iGM_IsExamRequired INTEGER NOT NULL DEFAULT 0;

-- ===== 等级重写为十级（累计积分 / 名称 / 图标 / 排序 / 考核） =====
UPDATE iGM_Levels SET iGM_Name = '初识者', iGM_MinPoints = 100,   iGM_MaxPoints = 299,   iGM_Icon = 'star',      iGM_SortOrder = 1,  iGM_IsExamRequired = 0 WHERE iGM_Id = 'lv1';
UPDATE iGM_Levels SET iGM_Name = '探路者', iGM_MinPoints = 300,   iGM_MaxPoints = 599,   iGM_Icon = 'compass',   iGM_SortOrder = 2,  iGM_IsExamRequired = 0 WHERE iGM_Id = 'lv2';
UPDATE iGM_Levels SET iGM_Name = '筑梦者', iGM_MinPoints = 600,   iGM_MaxPoints = 999,   iGM_Icon = 'hammer',    iGM_SortOrder = 3,  iGM_IsExamRequired = 0 WHERE iGM_Id = 'lv3';
UPDATE iGM_Levels SET iGM_Name = '创想者', iGM_MinPoints = 1000,  iGM_MaxPoints = 1499,  iGM_Icon = 'lightbulb', iGM_SortOrder = 4,  iGM_IsExamRequired = 0 WHERE iGM_Id = 'lv4';
UPDATE iGM_Levels SET iGM_Name = '拓荒者', iGM_MinPoints = 1500,  iGM_MaxPoints = 2499,  iGM_Icon = 'map',       iGM_SortOrder = 5,  iGM_IsExamRequired = 0 WHERE iGM_Id = 'lv5';
UPDATE iGM_Levels SET iGM_Name = '求真者', iGM_MinPoints = 2500,  iGM_MaxPoints = 4499,  iGM_Icon = 'search',    iGM_SortOrder = 6,  iGM_IsExamRequired = 0 WHERE iGM_Id = 'lv6';
UPDATE iGM_Levels SET iGM_Name = '远航者', iGM_MinPoints = 4500,  iGM_MaxPoints = 9499,  iGM_Icon = 'sailboat',  iGM_SortOrder = 7,  iGM_IsExamRequired = 0 WHERE iGM_Id = 'lv7';
UPDATE iGM_Levels SET iGM_Name = '星图师', iGM_MinPoints = 9500,  iGM_MaxPoints = 19499, iGM_Icon = 'orbit',     iGM_SortOrder = 8,  iGM_IsExamRequired = 1 WHERE iGM_Id = 'lv8';

INSERT OR IGNORE INTO iGM_Levels
  (iGM_Id, iGM_Name, iGM_MinPoints, iGM_MaxPoints, iGM_Icon, iGM_SortOrder, iGM_IsExamRequired) VALUES
  ('lv9',  '领航者', 19500, 99998, 'crown',  9,  1),
  ('lv10', '探星者', 99999, NULL,  'trophy', 10, 1);

-- ===== 勋章表：新增稀有度（common 普通 / rare 稀有 / legendary 传说） =====
ALTER TABLE iGM_Badges ADD COLUMN iGM_Rarity TEXT NOT NULL DEFAULT 'common';

-- 既有勋章归入普通 / 稀有
UPDATE iGM_Badges SET iGM_Rarity = 'common' WHERE iGM_Id IN ('badge-first-post', 'badge-first-comment', 'badge-first-resource', 'badge-checkin-7', 'badge-likes-10');
UPDATE iGM_Badges SET iGM_Rarity = 'rare'   WHERE iGM_Id IN ('badge-post-10', 'badge-comment-50', 'badge-checkin-30', 'badge-points-1000');

-- 新增勋章：考核通过（稀有）、季度任务（稀有）、官方授予（传说，仅管理员人工发放）
INSERT OR IGNORE INTO iGM_Badges
  (iGM_Id, iGM_Name, iGM_Description, iGM_Icon, iGM_ConditionType, iGM_ConditionValue, iGM_Rarity) VALUES
  ('badge-exam-pass',    '求真问道', '通过一次等级考核',           'graduation-cap', 'exams_passed',   1, 'rare'),
  ('badge-season-glow',  '季度之光', '完成一项每季任务',           'sparkles',       'seasonal_tasks', 1, 'rare'),
  ('badge-legend-official', '传说之证', '由官方人工授予的重大成就勋章', 'gem',       'manual',         1, 'legendary');

-- ===== 任务表：新增赛季标记，并取消一次性任务、改为每周 / 每季任务 =====
ALTER TABLE iGM_Tasks ADD COLUMN iGM_SeasonId TEXT;

DELETE FROM iGM_Tasks;

INSERT OR IGNORE INTO iGM_Tasks
  (iGM_Id, iGM_Name, iGM_Description, iGM_Action, iGM_TargetCount, iGM_RewardPoints, iGM_TaskType, iGM_SortOrder, iGM_SeasonId) VALUES
  ('task-week-checkin',  '每周签到',   '本周累计签到 5 天',         'checkin',         5,  30,  'weekly',   1, NULL),
  ('task-week-post',     '每周创作',   '本周发布 3 篇内容',         'post_create',     3,  20,  'weekly',   2, NULL),
  ('task-week-comment',  '每周互动',   '本周发表 10 条评论',        'comment_create',  10, 20,  'weekly',   3, NULL),
  ('task-week-resource', '每周分享',   '本周上传 1 个合规资源',     'resource_upload', 1,  40,  'weekly',   4, NULL),
  ('task-season-post',     '季度创作', '本季发布 30 篇优质内容',    'post_create',     30, 300, 'seasonal', 5, '*'),
  ('task-season-resource', '季度分享', '本季上传 10 个合规资源',    'resource_upload', 10, 500, 'seasonal', 6, '*'),
  ('task-season-checkin',  '季度坚持', '本季累计签到 60 天',        'checkin',         60, 400, 'seasonal', 7, '*'),
  ('task-season-exam',     '季度考核', '本季通过一次等级考核',      'exam_pass',       1,  800, 'seasonal', 8, '*');

-- ===== 用户任务表：新增领取标记与周期键（周/季重置依据） =====
ALTER TABLE iGM_UserTasks ADD COLUMN iGM_IsClaimed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE iGM_UserTasks ADD COLUMN iGM_CycleKey TEXT;

-- ===== 用户协议同意记录表：注册与规定查看的同意留痕（含版本与时间） =====
CREATE TABLE IF NOT EXISTS iGM_UserAgreements (
  iGM_Id         TEXT PRIMARY KEY,
  iGM_UserId     TEXT NOT NULL,
  iGM_Version    TEXT NOT NULL,
  iGM_AcceptedIp TEXT,
  iGM_AcceptedAt TEXT NOT NULL,
  FOREIGN KEY (iGM_UserId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS iGM_Idx_UserAgreements_User
  ON iGM_UserAgreements (iGM_UserId, iGM_AcceptedAt);

-- ===== 开发者申请表：申请制开放开发者资格，通过后发放 API Key 并绑定 iGMUid =====
-- status 取值：pending 待审核 / approved 已通过 / rejected 已拒绝
CREATE TABLE IF NOT EXISTS iGM_Developers (
  iGM_Id            TEXT PRIMARY KEY,
  iGM_UserId        TEXT NOT NULL,
  iGM_ProjectName   TEXT NOT NULL,
  iGM_Purpose       TEXT NOT NULL,
  iGM_Contact       TEXT NOT NULL,
  iGM_ExpectedQuota TEXT,
  iGM_Status        TEXT NOT NULL DEFAULT 'pending',
  iGM_ApiKey        TEXT,
  iGM_ReviewerId    TEXT,
  iGM_CreatedAt     TEXT NOT NULL,
  iGM_UpdatedAt     TEXT NOT NULL,
  FOREIGN KEY (iGM_UserId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE,
  FOREIGN KEY (iGM_ReviewerId) REFERENCES iGM_Users (iGM_Id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS iGM_Idx_Developers_User
  ON iGM_Developers (iGM_UserId, iGM_CreatedAt);
CREATE INDEX IF NOT EXISTS iGM_Idx_Developers_Status
  ON iGM_Developers (iGM_Status, iGM_CreatedAt);

-- ===== 等级考核申请表：第 8、9、10 级升级前提交考核，管理员或系统出题并审核 =====
-- status 取值：pending 待审核 / approved 已通过 / rejected 未通过
CREATE TABLE IF NOT EXISTS iGM_LevelExams (
  iGM_Id         TEXT PRIMARY KEY,
  iGM_UserId     TEXT NOT NULL,
  iGM_LevelId    TEXT NOT NULL,
  iGM_Content    TEXT,
  iGM_Status     TEXT NOT NULL DEFAULT 'pending',
  iGM_ReviewerId TEXT,
  iGM_ReviewNote TEXT,
  iGM_CreatedAt  TEXT NOT NULL,
  iGM_UpdatedAt  TEXT NOT NULL,
  FOREIGN KEY (iGM_UserId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE,
  FOREIGN KEY (iGM_LevelId) REFERENCES iGM_Levels (iGM_Id) ON DELETE CASCADE,
  FOREIGN KEY (iGM_ReviewerId) REFERENCES iGM_Users (iGM_Id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS iGM_Idx_LevelExams_User
  ON iGM_LevelExams (iGM_UserId, iGM_CreatedAt);
CREATE INDEX IF NOT EXISTS iGM_Idx_LevelExams_Status
  ON iGM_LevelExams (iGM_Status, iGM_CreatedAt);