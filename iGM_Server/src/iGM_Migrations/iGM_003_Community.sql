-- 文件路径：iGM_Server/src/iGM_Migrations/iGM_003_Community.sql
-- 所属层：后端 / 数据库迁移层
-- 路由：无
-- 模块：iGM_Migrations / G_Community / G_Post
-- 作用：模块三社区帖子与评论系统建表
-- 内容：扩展 iGM_Users 资料字段；分类、标签、帖子、评论、点赞、收藏、帖子标签关联表
-- 说明：所有表名与列名统一 iGM_ 前缀；多态点赞用 iGM_TargetType 区分帖子与评论，
--       无法直接使用外键约束的部分（点赞目标）由业务层在事务内清理

-- ===== 扩展用户表：公开资料字段 =====
-- SQLite 支持 ALTER TABLE ADD COLUMN；新列允许为空，历史用户自动取 NULL
ALTER TABLE iGM_Users ADD COLUMN iGM_DisplayName TEXT;
ALTER TABLE iGM_Users ADD COLUMN iGM_Avatar TEXT;
ALTER TABLE iGM_Users ADD COLUMN iGM_Bio TEXT;
ALTER TABLE iGM_Users ADD COLUMN iGM_Website TEXT;

-- ===== 分类表：固定少量官方分类，slug 为前端 i18n 映射键 =====
CREATE TABLE IF NOT EXISTS iGM_Categories (
  iGM_Id        TEXT PRIMARY KEY,
  iGM_Name      TEXT NOT NULL,
  iGM_Slug      TEXT NOT NULL UNIQUE,
  iGM_SortOrder INTEGER NOT NULL DEFAULT 0
);

-- ===== 标签表：名称大小写不敏感唯一，slug 用于 URL 筛选 =====
CREATE TABLE IF NOT EXISTS iGM_Tags (
  iGM_Id   TEXT PRIMARY KEY,
  iGM_Name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  iGM_Slug TEXT NOT NULL UNIQUE
);

-- ===== 帖子表：标题、正文、分类、状态（published 正常 / hidden 隐藏） =====
CREATE TABLE IF NOT EXISTS iGM_Posts (
  iGM_Id         TEXT PRIMARY KEY,
  iGM_AuthorId   TEXT NOT NULL,
  iGM_Title      TEXT NOT NULL,
  iGM_Content    TEXT NOT NULL,
  iGM_CategoryId TEXT,
  iGM_Status     TEXT NOT NULL DEFAULT 'published',
  iGM_CreatedAt  TEXT NOT NULL,
  iGM_UpdatedAt  TEXT NOT NULL,
  FOREIGN KEY (iGM_AuthorId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE,
  FOREIGN KEY (iGM_CategoryId) REFERENCES iGM_Categories (iGM_Id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS iGM_Idx_Posts_Author        ON iGM_Posts (iGM_AuthorId);
CREATE INDEX IF NOT EXISTS iGM_Idx_Posts_Status_Created ON iGM_Posts (iGM_Status, iGM_CreatedAt);
CREATE INDEX IF NOT EXISTS iGM_Idx_Posts_Category      ON iGM_Posts (iGM_CategoryId);

-- ===== 评论表：支持一层 parentId 回复（前端可继续递归成楼中楼） =====
CREATE TABLE IF NOT EXISTS iGM_Comments (
  iGM_Id        TEXT PRIMARY KEY,
  iGM_PostId    TEXT NOT NULL,
  iGM_AuthorId  TEXT NOT NULL,
  iGM_ParentId  TEXT,
  iGM_Content   TEXT NOT NULL,
  iGM_Status    TEXT NOT NULL DEFAULT 'visible',
  iGM_CreatedAt TEXT NOT NULL,
  iGM_UpdatedAt TEXT NOT NULL,
  FOREIGN KEY (iGM_PostId) REFERENCES iGM_Posts (iGM_Id) ON DELETE CASCADE,
  FOREIGN KEY (iGM_AuthorId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE,
  FOREIGN KEY (iGM_ParentId) REFERENCES iGM_Comments (iGM_Id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS iGM_Idx_Comments_Post_Status_Created
  ON iGM_Comments (iGM_PostId, iGM_Status, iGM_CreatedAt);
CREATE INDEX IF NOT EXISTS iGM_Idx_Comments_Author_Created
  ON iGM_Comments (iGM_AuthorId, iGM_CreatedAt);
CREATE INDEX IF NOT EXISTS iGM_Idx_Comments_Parent ON iGM_Comments (iGM_ParentId);

-- ===== 点赞表：多态目标，targetType=post 帖子 / comment 评论 =====
CREATE TABLE IF NOT EXISTS iGM_Likes (
  iGM_Id         TEXT PRIMARY KEY,
  iGM_TargetType TEXT NOT NULL,
  iGM_TargetId   TEXT NOT NULL,
  iGM_UserId     TEXT NOT NULL,
  iGM_CreatedAt  TEXT NOT NULL,
  UNIQUE (iGM_TargetType, iGM_TargetId, iGM_UserId),
  FOREIGN KEY (iGM_UserId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS iGM_Idx_Likes_Target
  ON iGM_Likes (iGM_TargetType, iGM_TargetId);
CREATE INDEX IF NOT EXISTS iGM_Idx_Likes_User
  ON iGM_Likes (iGM_UserId, iGM_TargetType);

-- ===== 收藏表：仅帖子可收藏，同一用户对同一帖子唯一 =====
CREATE TABLE IF NOT EXISTS iGM_Favorites (
  iGM_Id        TEXT PRIMARY KEY,
  iGM_PostId    TEXT NOT NULL,
  iGM_UserId    TEXT NOT NULL,
  iGM_CreatedAt TEXT NOT NULL,
  UNIQUE (iGM_PostId, iGM_UserId),
  FOREIGN KEY (iGM_PostId) REFERENCES iGM_Posts (iGM_Id) ON DELETE CASCADE,
  FOREIGN KEY (iGM_UserId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS iGM_Idx_Favorites_User_Created
  ON iGM_Favorites (iGM_UserId, iGM_CreatedAt);

-- ===== 帖子-标签多对多关联表 =====
CREATE TABLE IF NOT EXISTS iGM_PostTags (
  iGM_PostId TEXT NOT NULL,
  iGM_TagId  TEXT NOT NULL,
  PRIMARY KEY (iGM_PostId, iGM_TagId),
  FOREIGN KEY (iGM_PostId) REFERENCES iGM_Posts (iGM_Id) ON DELETE CASCADE,
  FOREIGN KEY (iGM_TagId) REFERENCES iGM_Tags (iGM_Id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS iGM_Idx_PostTags_Tag ON iGM_PostTags (iGM_TagId);

-- ===== 官方分类种子（固定 ID，迁移幂等） =====
-- 前端按 slug 优先匹配语言包 community.categories.<slug>，匹配不到时显示 iGM_Name
INSERT OR IGNORE INTO iGM_Categories (iGM_Id, iGM_Name, iGM_Slug, iGM_SortOrder) VALUES
  ('cat-general',   '综合讨论', 'general',   0),
  ('cat-guide',     '教程攻略', 'guide',     1),
  ('cat-showcase',  '作品展示', 'showcase',  2),
  ('cat-qa',        '问答求助', 'qa',        3),
  ('cat-news',      '资讯公告', 'news',      4);
