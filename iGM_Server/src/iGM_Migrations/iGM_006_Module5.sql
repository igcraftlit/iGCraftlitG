-- 文件路径：iGM_Server/src/iGM_Migrations/iGM_006_Module5.sql
-- 所属层：后端 / 数据库迁移层
-- 路由：无
-- 模块：iGM_Migrations / G_Admin / G_Points
-- 作用：模块五积分、等级、勋章、签到、任务与管理后台建表
-- 内容：积分记录、用户积分、等级、勋章、用户勋章、签到、任务、用户任务、
--       管理操作日志、举报共 10 张表及常用查询索引与等级/勋章/任务种子
-- 说明：所有表名与列名统一 iGM_ 前缀；布尔列以 INTEGER 0/1 存储；
--       删除用户时相关数据外键级联清理

-- ===== 积分记录表：每次积分变动的流水，防刷分按 动作+日 统计 =====
CREATE TABLE IF NOT EXISTS iGM_PointsRecords (
  iGM_Id        TEXT PRIMARY KEY,
  iGM_UserId    TEXT NOT NULL,
  iGM_Points    INTEGER NOT NULL,
  iGM_Action    TEXT NOT NULL,
  iGM_Description TEXT,
  iGM_CreatedAt TEXT NOT NULL,
  FOREIGN KEY (iGM_UserId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS iGM_Idx_PointsRecords_User_Created
  ON iGM_PointsRecords (iGM_UserId, iGM_CreatedAt);
CREATE INDEX IF NOT EXISTS iGM_Idx_PointsRecords_User_Action_Created
  ON iGM_PointsRecords (iGM_UserId, iGM_Action, iGM_CreatedAt);
CREATE INDEX IF NOT EXISTS iGM_Idx_PointsRecords_Created
  ON iGM_PointsRecords (iGM_CreatedAt);

-- ===== 用户积分汇总表：每用户一行，等级随总分自动重算 =====
CREATE TABLE IF NOT EXISTS iGM_UserPoints (
  iGM_Id         TEXT PRIMARY KEY,
  iGM_UserId     TEXT NOT NULL UNIQUE,
  iGM_TotalPoints INTEGER NOT NULL DEFAULT 0,
  iGM_LevelId    TEXT,
  iGM_UpdatedAt  TEXT NOT NULL,
  FOREIGN KEY (iGM_UserId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE,
  FOREIGN KEY (iGM_LevelId) REFERENCES iGM_Levels (iGM_Id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS iGM_Idx_UserPoints_Total
  ON iGM_UserPoints (iGM_TotalPoints DESC);

-- ===== 等级表：minPoints ≤ 总分 ≤ maxPoints（maxPoints 为空表示无上限） =====
CREATE TABLE IF NOT EXISTS iGM_Levels (
  iGM_Id       TEXT PRIMARY KEY,
  iGM_Name     TEXT NOT NULL,
  iGM_MinPoints INTEGER NOT NULL,
  iGM_MaxPoints INTEGER,
  iGM_Icon     TEXT,
  iGM_SortOrder INTEGER NOT NULL DEFAULT 0
);

-- ===== 勋章定义表：conditionType 决定统计口径，conditionValue 为达标数值 =====
-- conditionType 取值：posts_count 发帖数 / comments_count 评论数 /
--                     resources_count 资源数 / checkin_days 累计签到天数 /
--                     likes_received 累计被赞数 / points_total 总积分
CREATE TABLE IF NOT EXISTS iGM_Badges (
  iGM_Id          TEXT PRIMARY KEY,
  iGM_Name        TEXT NOT NULL,
  iGM_Description TEXT NOT NULL DEFAULT '',
  iGM_Icon        TEXT,
  iGM_ConditionType TEXT NOT NULL,
  iGM_ConditionValue INTEGER NOT NULL DEFAULT 1
);

-- ===== 用户勋章表：同一用户同一勋章唯一，防止重复授予 =====
CREATE TABLE IF NOT EXISTS iGM_UserBadges (
  iGM_Id     TEXT PRIMARY KEY,
  iGM_UserId TEXT NOT NULL,
  iGM_BadgeId TEXT NOT NULL,
  iGM_GrantedAt TEXT NOT NULL,
  UNIQUE (iGM_UserId, iGM_BadgeId),
  FOREIGN KEY (iGM_UserId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE,
  FOREIGN KEY (iGM_BadgeId) REFERENCES iGM_Badges (iGM_Id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS iGM_Idx_UserBadges_User ON iGM_UserBadges (iGM_UserId);

-- ===== 签到表：按自然日（Asia/Shanghai）唯一，记录连续天数与当日得分 =====
CREATE TABLE IF NOT EXISTS iGM_Checkins (
  iGM_Id           TEXT PRIMARY KEY,
  iGM_UserId       TEXT NOT NULL,
  iGM_CheckinDate  TEXT NOT NULL,
  iGM_PointsEarned INTEGER NOT NULL,
  iGM_ContinuousDays INTEGER NOT NULL DEFAULT 1,
  iGM_CreatedAt    TEXT NOT NULL,
  UNIQUE (iGM_UserId, iGM_CheckinDate),
  FOREIGN KEY (iGM_UserId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS iGM_Idx_Checkins_User_Date
  ON iGM_Checkins (iGM_UserId, iGM_CheckinDate);

-- ===== 任务定义表：action 对应积分动作，targetCount 达标次数，taskType 一次性 =====
CREATE TABLE IF NOT EXISTS iGM_Tasks (
  iGM_Id        TEXT PRIMARY KEY,
  iGM_Name      TEXT NOT NULL,
  iGM_Description TEXT NOT NULL DEFAULT '',
  iGM_Action    TEXT NOT NULL,
  iGM_TargetCount INTEGER NOT NULL DEFAULT 1,
  iGM_RewardPoints INTEGER NOT NULL DEFAULT 0,
  iGM_TaskType  TEXT NOT NULL DEFAULT 'once',
  iGM_SortOrder INTEGER NOT NULL DEFAULT 0
);

-- ===== 用户任务进度表：同一用户同一任务唯一，奖励只发一次 =====
CREATE TABLE IF NOT EXISTS iGM_UserTasks (
  iGM_Id        TEXT PRIMARY KEY,
  iGM_UserId    TEXT NOT NULL,
  iGM_TaskId    TEXT NOT NULL,
  iGM_Progress  INTEGER NOT NULL DEFAULT 0,
  iGM_IsCompleted INTEGER NOT NULL DEFAULT 0,
  iGM_UpdatedAt TEXT NOT NULL,
  UNIQUE (iGM_UserId, iGM_TaskId),
  FOREIGN KEY (iGM_UserId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE,
  FOREIGN KEY (iGM_TaskId) REFERENCES iGM_Tasks (iGM_Id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS iGM_Idx_UserTasks_User ON iGM_UserTasks (iGM_UserId);

-- ===== 管理操作日志表：后台全部写操作必须落一条 =====
CREATE TABLE IF NOT EXISTS iGM_AdminLogs (
  iGM_Id      TEXT PRIMARY KEY,
  iGM_AdminId TEXT NOT NULL,
  iGM_Action  TEXT NOT NULL,
  iGM_TargetType TEXT,
  iGM_TargetId   TEXT,
  iGM_Detail  TEXT,
  iGM_CreatedAt TEXT NOT NULL,
  FOREIGN KEY (iGM_AdminId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS iGM_Idx_AdminLogs_Admin_Created
  ON iGM_AdminLogs (iGM_AdminId, iGM_CreatedAt);
CREATE INDEX IF NOT EXISTS iGM_Idx_AdminLogs_Target
  ON iGM_AdminLogs (iGM_TargetType, iGM_TargetId);

-- ===== 举报表：targetType 帖子 post / 评论 comment =====
-- status 取值：pending 待处理 / resolved 已处理（违规成立）/ dismissed 已驳回
CREATE TABLE IF NOT EXISTS iGM_Reports (
  iGM_Id        TEXT PRIMARY KEY,
  iGM_ReporterId TEXT NOT NULL,
  iGM_TargetType TEXT NOT NULL,
  iGM_TargetId  TEXT NOT NULL,
  iGM_Reason    TEXT NOT NULL,
  iGM_Status    TEXT NOT NULL DEFAULT 'pending',
  iGM_HandlerId TEXT,
  iGM_CreatedAt TEXT NOT NULL,
  iGM_HandledAt TEXT,
  FOREIGN KEY (iGM_ReporterId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE,
  FOREIGN KEY (iGM_HandlerId) REFERENCES iGM_Users (iGM_Id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS iGM_Idx_Reports_Status_Created
  ON iGM_Reports (iGM_Status, iGM_CreatedAt);
CREATE INDEX IF NOT EXISTS iGM_Idx_Reports_Target
  ON iGM_Reports (iGM_TargetType, iGM_TargetId);

-- ===== 等级种子（固定 ID，迁移幂等） =====
-- 前端按 iGM_Id 优先匹配语言包 points.levels.<id>，匹配不到时显示 iGM_Name
INSERT OR IGNORE INTO iGM_Levels (iGM_Id, iGM_Name, iGM_MinPoints, iGM_MaxPoints, iGM_Icon, iGM_SortOrder) VALUES
  ('lv1', '新星',   0,     99,    'star',        1),
  ('lv2', '见习者', 100,   299,   'compass',     2),
  ('lv3', '创作者', 300,   799,   'pen-tool',    3),
  ('lv4', '建筑师', 800,   1999,  'blocks',      4),
  ('lv5', '探索者', 2000,  4999,  'map',         5),
  ('lv6', '工程师', 5000,  11999, 'cpu',         6),
  ('lv7', '大师',   12000, 29999, 'crown',       7),
  ('lv8', '传奇',   30000, NULL,  'trophy',      8);

-- ===== 勋章种子（固定 ID，迁移幂等） =====
INSERT OR IGNORE INTO iGM_Badges (iGM_Id, iGM_Name, iGM_Description, iGM_Icon, iGM_ConditionType, iGM_ConditionValue) VALUES
  ('badge-first-post',     '初次发帖',   '发布了第一篇帖子',           'notebook-pen',  'posts_count',    1),
  ('badge-post-10',        '笔耕不辍',   '累计发布 10 篇帖子',         'book-open',     'posts_count',    10),
  ('badge-first-comment',  '初来乍到',   '发表了第一条评论',           'message-square','comments_count', 1),
  ('badge-comment-50',     '热心回应',   '累计发表 50 条评论',         'messages-square','comments_count', 50),
  ('badge-first-resource', '共享精神',   '上传了第一个资源',           'package-plus',  'resources_count',1),
  ('badge-checkin-7',      '七日之约',   '累计签到 7 天',              'calendar-check','checkin_days',   7),
  ('badge-checkin-30',     '持之以恒',   '累计签到 30 天',             'calendar-heart','checkin_days',   30),
  ('badge-likes-10',       '广受好评',   '累计获得 10 次点赞',         'thumbs-up',     'likes_received', 10),
  ('badge-points-1000',    '积分达人',   '累计积分达到 1000',          'coins',         'points_total',   1000);

-- ===== 任务种子（固定 ID，迁移幂等，均一次性） =====
INSERT OR IGNORE INTO iGM_Tasks (iGM_Id, iGM_Name, iGM_Description, iGM_Action, iGM_TargetCount, iGM_RewardPoints, iGM_TaskType, iGM_SortOrder) VALUES
  ('task-first-post',      '发布首帖',   '发布你的第一篇帖子',       'post_create',    1, 20, 'once', 1),
  ('task-first-comment',   '首条评论',   '发表你的第一条评论',       'comment_create', 1, 10, 'once', 2),
  ('task-first-resource',  '首次分享',   '上传你的第一个资源',       'resource_upload',1, 30, 'once', 3),
  ('task-first-activity',  '首次报名',   '报名参加一次社区活动',     'activity_join',  1, 15, 'once', 4),
  ('task-first-checkin',   '首次签到',   '完成第一次每日签到',       'checkin',        1, 10, 'once', 5),
  ('task-post-10',         '十帖之约',   '累计发布 10 篇帖子',       'post_create',    10, 50, 'once', 6);
