-- 文件路径：iGM_Server/src/iGM_Migrations/iGM_012_Module10.sql
-- 所属层：后端 / 数据库迁移层
-- 路由：G_Social、G_Message、G_Minecraft，扩展 G_Post、G_Resource
-- 模块：iGM_Migrations / 模块十
-- 作用：社交关系与私信系统、帖子配图、Minecraft 资源分区建表与字段扩展
-- 内容：关注/好友/黑名单/会话/消息/帖子配图/私信设置共 7 张新表，
--       iGM_Resources 扩展 8 个 Minecraft 字段，Minecraft 分类种子，常用查询索引
-- 说明：所有表名与列名统一 iGM_ 前缀；多值字段（版本/加载器/平台）
--       以 JSON 数组字符串存储，由业务层序列化；迁移仅执行一次

-- ===== 关注关系表：一行对应一次关注（follower 关注 following） =====
CREATE TABLE IF NOT EXISTS iGM_Follows (
  iGM_Id          TEXT PRIMARY KEY,
  iGM_FollowerId  TEXT NOT NULL,
  iGM_FollowingId TEXT NOT NULL,
  iGM_CreatedAt   TEXT NOT NULL,
  UNIQUE (iGM_FollowerId, iGM_FollowingId),
  FOREIGN KEY (iGM_FollowerId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE,
  FOREIGN KEY (iGM_FollowingId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE
);

-- 关注列表按粉丝聚合；粉丝列表按被关注者聚合
CREATE INDEX IF NOT EXISTS iGM_Idx_Follows_Follower
  ON iGM_Follows (iGM_FollowerId, iGM_CreatedAt);
CREATE INDEX IF NOT EXISTS iGM_Idx_Follows_Following
  ON iGM_Follows (iGM_FollowingId, iGM_CreatedAt);

-- ===== 好友关系表：一行对应一次好友申请（userId 向 friendId 发起） =====
-- status 取值：pending 待处理 / accepted 已通过 / rejected 已拒绝
-- 申请通过后该行即代表好友关系；查询好友时双向匹配 accepted
CREATE TABLE IF NOT EXISTS iGM_Friends (
  iGM_Id        TEXT PRIMARY KEY,
  iGM_UserId    TEXT NOT NULL,
  iGM_FriendId  TEXT NOT NULL,
  iGM_Status    TEXT NOT NULL DEFAULT 'pending',
  iGM_CreatedAt TEXT NOT NULL,
  iGM_UpdatedAt TEXT NOT NULL,
  UNIQUE (iGM_UserId, iGM_FriendId),
  FOREIGN KEY (iGM_UserId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE,
  FOREIGN KEY (iGM_FriendId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE
);

-- 待处理申请按接收者聚合；好友列表按双方与状态聚合
CREATE INDEX IF NOT EXISTS iGM_Friends_User_Status
  ON iGM_Friends (iGM_UserId, iGM_Status);
CREATE INDEX IF NOT EXISTS iGM_Friends_Friend_Status
  ON iGM_Friends (iGM_FriendId, iGM_Status);

-- ===== 黑名单表：一行对应一次拉黑（userId 拉黑 blockedUserId） =====
CREATE TABLE IF NOT EXISTS iGM_Blocks (
  iGM_Id              TEXT PRIMARY KEY,
  iGM_UserId          TEXT NOT NULL,
  iGM_BlockedUserId   TEXT NOT NULL,
  iGM_CreatedAt       TEXT NOT NULL,
  UNIQUE (iGM_UserId, iGM_BlockedUserId),
  FOREIGN KEY (iGM_UserId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE,
  FOREIGN KEY (iGM_BlockedUserId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS iGM_Idx_Blocks_User
  ON iGM_Blocks (iGM_UserId, iGM_CreatedAt);

-- ===== 私信会话表：一条记录对应两个用户间唯一会话 =====
-- userA/userB 由业务层按用户 ID 字典序归一写入，保证同一对只有一个会话
CREATE TABLE IF NOT EXISTS iGM_Conversations (
  iGM_Id             TEXT PRIMARY KEY,
  iGM_UserAId        TEXT NOT NULL,
  iGM_UserBId        TEXT NOT NULL,
  iGM_LastMessageId  TEXT,
  -- 删除会话仅对操作方隐藏：1 表示该方已删除；有新消息时由业务层复位
  iGM_DeletedByA     INTEGER NOT NULL DEFAULT 0,
  iGM_DeletedByB     INTEGER NOT NULL DEFAULT 0,
  iGM_CreatedAt      TEXT NOT NULL,
  iGM_UpdatedAt      TEXT NOT NULL,
  UNIQUE (iGM_UserAId, iGM_UserBId),
  FOREIGN KEY (iGM_UserAId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE,
  FOREIGN KEY (iGM_UserBId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE
);

-- 会话列表按参与用户聚合并按更新时间倒序
CREATE INDEX IF NOT EXISTS iGM_Idx_Conversations_UserA
  ON iGM_Conversations (iGM_UserAId, iGM_UpdatedAt);
CREATE INDEX IF NOT EXISTS iGM_Idx_Conversations_UserB
  ON iGM_Conversations (iGM_UserBId, iGM_UpdatedAt);

-- ===== 私信消息表：一行对应一条消息 =====
-- type 取值：text 文本；isRead 表示接收方是否已读；
-- isRecalled 表示发送方限时撤回，撤回后内容不下发
CREATE TABLE IF NOT EXISTS iGM_Messages (
  iGM_Id             TEXT PRIMARY KEY,
  iGM_ConversationId TEXT NOT NULL,
  iGM_SenderId       TEXT NOT NULL,
  iGM_Content        TEXT NOT NULL DEFAULT '',
  iGM_Type           TEXT NOT NULL DEFAULT 'text',
  iGM_IsRead         INTEGER NOT NULL DEFAULT 0,
  iGM_IsRecalled     INTEGER NOT NULL DEFAULT 0,
  iGM_CreatedAt      TEXT NOT NULL,
  FOREIGN KEY (iGM_ConversationId) REFERENCES iGM_Conversations (iGM_Id) ON DELETE CASCADE,
  FOREIGN KEY (iGM_SenderId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE
);

-- 会话消息按时间正序；未读数按会话与接收者聚合
CREATE INDEX IF NOT EXISTS iGM_Idx_Messages_Conversation_Created
  ON iGM_Messages (iGM_ConversationId, iGM_CreatedAt);
CREATE INDEX IF NOT EXISTS iGM_Idx_Messages_Conversation_Read
  ON iGM_Messages (iGM_ConversationId, iGM_IsRead);

-- ===== 帖子配图关联表：一行对应帖子的一张图片，sortOrder 决定展示顺序 =====
CREATE TABLE IF NOT EXISTS iGM_PostImages (
  iGM_Id        TEXT PRIMARY KEY,
  iGM_PostId    TEXT NOT NULL,
  iGM_FileId    TEXT NOT NULL,
  iGM_SortOrder INTEGER NOT NULL DEFAULT 0,
  iGM_CreatedAt TEXT NOT NULL,
  UNIQUE (iGM_PostId, iGM_FileId),
  FOREIGN KEY (iGM_PostId) REFERENCES iGM_Posts (iGM_Id) ON DELETE CASCADE,
  FOREIGN KEY (iGM_FileId) REFERENCES iGM_Files (iGM_Id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS iGM_Idx_PostImages_Post_Order
  ON iGM_PostImages (iGM_PostId, iGM_SortOrder);

-- ===== 私信隐私设置表：每个用户一行，缺失时按默认所有人可发起 =====
-- iGM_AllowFrom 取值：everyone 所有人 / friends 仅好友 / none 关闭私信
CREATE TABLE IF NOT EXISTS iGM_MessageSettings (
  iGM_Id        TEXT PRIMARY KEY,
  iGM_UserId    TEXT NOT NULL UNIQUE,
  iGM_AllowFrom TEXT NOT NULL DEFAULT 'everyone',
  iGM_UpdatedAt TEXT NOT NULL,
  FOREIGN KEY (iGM_UserId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE
);

-- ===== iGM_Resources 扩展 Minecraft 字段（可空，历史资源默认 NULL） =====
-- iGM_ResourceType：mod/texture_pack/map/skin/plugin/modpack/datapack/other
ALTER TABLE iGM_Resources ADD COLUMN iGM_ResourceType TEXT;
-- 适用版本/加载器/平台：JSON 数组字符串，如 ["1.20.1","1.20.4"]
ALTER TABLE iGM_Resources ADD COLUMN iGM_McVersions TEXT;
ALTER TABLE iGM_Resources ADD COLUMN iGM_Loaders TEXT;
ALTER TABLE iGM_Resources ADD COLUMN iGM_Platforms TEXT;
-- 许可协议、原作者、原帖链接、更新日志
ALTER TABLE iGM_Resources ADD COLUMN iGM_License TEXT;
ALTER TABLE iGM_Resources ADD COLUMN iGM_OriginalAuthor TEXT;
ALTER TABLE iGM_Resources ADD COLUMN iGM_OriginalUrl TEXT;
ALTER TABLE iGM_Resources ADD COLUMN iGM_Changelog TEXT;

-- Minecraft 分区按资源类型筛选；版本/加载器过滤在业务层对 JSON 做匹配
CREATE INDEX IF NOT EXISTS iGM_Idx_Resources_ResourceType
  ON iGM_Resources (iGM_ResourceType);

-- ===== Minecraft 分区分类种子：1 个父分类 + 8 个子分类（固定 ID，幂等） =====
INSERT OR IGNORE INTO iGM_ResourceCategories (iGM_Id, iGM_Name, iGM_Slug, iGM_SortOrder) VALUES
  ('rcat-minecraft',         'Minecraft', 'minecraft',         10),
  ('rcat-mc-mod',            '模组',       'minecraft-mod',     11),
  ('rcat-mc-texturepack',    '材质包',     'minecraft-texture', 12),
  ('rcat-mc-map',            '地图',       'minecraft-map',     13),
  ('rcat-mc-skin',           '皮肤',       'minecraft-skin',    14),
  ('rcat-mc-plugin',         '插件',       'minecraft-plugin',  15),
  ('rcat-mc-modpack',        '整合包',     'minecraft-modpack', 16),
  ('rcat-mc-datapack',       '数据包',     'minecraft-data',    17),
  ('rcat-mc-other',          '其他',       'minecraft-other',   18);
