-- 文件路径：iGM_Server/src/iGM_Migrations/iGM_004_Module4.sql
-- 所属层：后端 / 数据库迁移层
-- 路由：无
-- 模块：iGM_Migrations / G_Notification / G_File / G_Activity / G_Resource
-- 作用：模块四通知系统、文件与媒体管理、活动与资源库建表
-- 内容：通知、通知偏好、文件、活动、活动报名、资源、资源分类、
--       资源标签、资源标签关联共 9 张表及常用查询索引与资源分类种子
-- 说明：所有表名与列名统一 iGM_ 前缀；布尔列以 INTEGER 0/1 存储，
--       由业务层 DTO 转换为 boolean；删除用户时相关数据外键级联清理

-- ===== 通知表：站内通知，type 区分业务来源 =====
-- type 取值：comment 帖子被评论 / reply 评论被回复 /
--            activity 活动报名成功 / resource 资源被下载 / system 系统消息
CREATE TABLE IF NOT EXISTS iGM_Notifications (
  iGM_Id        TEXT PRIMARY KEY,
  iGM_UserId    TEXT NOT NULL,
  iGM_Type      TEXT NOT NULL DEFAULT 'system',
  iGM_Title     TEXT NOT NULL,
  iGM_Content   TEXT NOT NULL DEFAULT '',
  iGM_Link      TEXT,
  iGM_IsRead    INTEGER NOT NULL DEFAULT 0,
  iGM_CreatedAt TEXT NOT NULL,
  FOREIGN KEY (iGM_UserId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE
);

-- 通知列表按用户 + 时间倒序；未读数按用户 + 未读过滤
CREATE INDEX IF NOT EXISTS iGM_Idx_Notifications_User_Created
  ON iGM_Notifications (iGM_UserId, iGM_CreatedAt);
CREATE INDEX IF NOT EXISTS iGM_Idx_Notifications_User_Read
  ON iGM_Notifications (iGM_UserId, iGM_IsRead);

-- ===== 通知偏好表：每个用户一行，缺失时按默认全开处理 =====
CREATE TABLE IF NOT EXISTS iGM_NotificationPreferences (
  iGM_Id           TEXT PRIMARY KEY,
  iGM_UserId       TEXT NOT NULL UNIQUE,
  iGM_SiteEnabled  INTEGER NOT NULL DEFAULT 1,
  iGM_EmailEnabled INTEGER NOT NULL DEFAULT 0,
  iGM_UpdatedAt    TEXT NOT NULL,
  FOREIGN KEY (iGM_UserId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE
);

-- ===== 文件表：仅记录元数据，磁盘路径禁止暴露给前端 =====
CREATE TABLE IF NOT EXISTS iGM_Files (
  iGM_Id           TEXT PRIMARY KEY,
  iGM_UploaderId   TEXT NOT NULL,
  iGM_FileName     TEXT NOT NULL,
  iGM_OriginalName TEXT NOT NULL,
  iGM_MimeType     TEXT NOT NULL,
  iGM_Size         INTEGER NOT NULL,
  iGM_Path         TEXT NOT NULL,
  iGM_Hash         TEXT NOT NULL,
  iGM_CreatedAt    TEXT NOT NULL,
  FOREIGN KEY (iGM_UploaderId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS iGM_Idx_Files_Uploader_Created
  ON iGM_Files (iGM_UploaderId, iGM_CreatedAt);
CREATE INDEX IF NOT EXISTS iGM_Idx_Files_Hash ON iGM_Files (iGM_Hash);

-- ===== 活动表：status 取值 draft 草稿 / open 报名中 / closed 已结束 =====
CREATE TABLE IF NOT EXISTS iGM_Activities (
  iGM_Id              TEXT PRIMARY KEY,
  iGM_CreatorId       TEXT NOT NULL,
  iGM_Title           TEXT NOT NULL,
  iGM_Description     TEXT NOT NULL DEFAULT '',
  iGM_CoverFileId     TEXT,
  iGM_Location        TEXT,
  iGM_StartTime       TEXT,
  iGM_EndTime         TEXT,
  iGM_Status          TEXT NOT NULL DEFAULT 'open',
  iGM_MaxParticipants INTEGER,
  iGM_CreatedAt       TEXT NOT NULL,
  iGM_UpdatedAt       TEXT NOT NULL,
  FOREIGN KEY (iGM_CreatorId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE,
  FOREIGN KEY (iGM_CoverFileId) REFERENCES iGM_Files (iGM_Id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS iGM_Idx_Activities_Status_Start
  ON iGM_Activities (iGM_Status, iGM_StartTime);
CREATE INDEX IF NOT EXISTS iGM_Idx_Activities_Creator
  ON iGM_Activities (iGM_CreatorId, iGM_CreatedAt);

-- ===== 活动报名表：同一用户对同一活动唯一 =====
-- status 取值：registered 已报名 / cancelled 已取消
CREATE TABLE IF NOT EXISTS iGM_ActivityRegistrations (
  iGM_Id         TEXT PRIMARY KEY,
  iGM_ActivityId TEXT NOT NULL,
  iGM_UserId     TEXT NOT NULL,
  iGM_Status     TEXT NOT NULL DEFAULT 'registered',
  iGM_CreatedAt  TEXT NOT NULL,
  UNIQUE (iGM_ActivityId, iGM_UserId),
  FOREIGN KEY (iGM_ActivityId) REFERENCES iGM_Activities (iGM_Id) ON DELETE CASCADE,
  FOREIGN KEY (iGM_UserId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS iGM_Idx_Registrations_Activity_Status
  ON iGM_ActivityRegistrations (iGM_ActivityId, iGM_Status);
CREATE INDEX IF NOT EXISTS iGM_Idx_Registrations_User
  ON iGM_ActivityRegistrations (iGM_UserId, iGM_CreatedAt);

-- ===== 资源分类表：固定少量官方分类，slug 为前端 i18n 映射键 =====
CREATE TABLE IF NOT EXISTS iGM_ResourceCategories (
  iGM_Id        TEXT PRIMARY KEY,
  iGM_Name      TEXT NOT NULL,
  iGM_Slug      TEXT NOT NULL UNIQUE,
  iGM_SortOrder INTEGER NOT NULL DEFAULT 0
);

-- ===== 资源标签表：名称大小写不敏感唯一 =====
CREATE TABLE IF NOT EXISTS iGM_ResourceTags (
  iGM_Id   TEXT PRIMARY KEY,
  iGM_Name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  iGM_Slug TEXT NOT NULL UNIQUE
);

-- ===== 资源表：status 取值 published 已发布 / hidden 已下架 =====
CREATE TABLE IF NOT EXISTS iGM_Resources (
  iGM_Id            TEXT PRIMARY KEY,
  iGM_UploaderId    TEXT NOT NULL,
  iGM_Title         TEXT NOT NULL,
  iGM_Description   TEXT NOT NULL DEFAULT '',
  iGM_CategoryId    TEXT,
  iGM_FileId        TEXT NOT NULL,
  iGM_CoverFileId   TEXT,
  iGM_DownloadCount INTEGER NOT NULL DEFAULT 0,
  iGM_Status        TEXT NOT NULL DEFAULT 'published',
  iGM_CreatedAt     TEXT NOT NULL,
  iGM_UpdatedAt     TEXT NOT NULL,
  FOREIGN KEY (iGM_UploaderId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE,
  FOREIGN KEY (iGM_CategoryId) REFERENCES iGM_ResourceCategories (iGM_Id) ON DELETE SET NULL,
  FOREIGN KEY (iGM_FileId) REFERENCES iGM_Files (iGM_Id) ON DELETE CASCADE,
  FOREIGN KEY (iGM_CoverFileId) REFERENCES iGM_Files (iGM_Id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS iGM_Idx_Resources_Status_Created
  ON iGM_Resources (iGM_Status, iGM_CreatedAt);
CREATE INDEX IF NOT EXISTS iGM_Idx_Resources_Uploader
  ON iGM_Resources (iGM_UploaderId, iGM_CreatedAt);
CREATE INDEX IF NOT EXISTS iGM_Idx_Resources_Category
  ON iGM_Resources (iGM_CategoryId, iGM_Status);

-- ===== 资源-标签多对多关联表 =====
CREATE TABLE IF NOT EXISTS iGM_ResourceTagsMap (
  iGM_ResourceId TEXT NOT NULL,
  iGM_TagId      TEXT NOT NULL,
  PRIMARY KEY (iGM_ResourceId, iGM_TagId),
  FOREIGN KEY (iGM_ResourceId) REFERENCES iGM_Resources (iGM_Id) ON DELETE CASCADE,
  FOREIGN KEY (iGM_TagId) REFERENCES iGM_ResourceTags (iGM_Id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS iGM_Idx_ResourceTagsMap_Tag
  ON iGM_ResourceTagsMap (iGM_TagId);

-- ===== 官方资源分类种子（固定 ID，迁移幂等） =====
-- 前端按 slug 优先匹配语言包 resource.categories.<slug>，匹配不到时显示 iGM_Name
INSERT OR IGNORE INTO iGM_ResourceCategories (iGM_Id, iGM_Name, iGM_Slug, iGM_SortOrder) VALUES
  ('rcat-mod',      '模组插件', 'mod',      0),
  ('rcat-texture',  '材质光影', 'texture',  1),
  ('rcat-map',      '地图存档', 'map',      2),
  ('rcat-tool',     '工具软件', 'tool',     3),
  ('rcat-doc',      '文档教程', 'doc',      4),
  ('rcat-other',    '其他资源', 'other',    5);
