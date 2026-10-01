-- 文件路径：iGM_Server/src/iGM_Migrations/iGM_017_Module17.sql
-- 所属层：后端 / 数据库迁移层
-- 路由：G_Game、G_Minecraft，扩展 G_Minecraft 分区
-- 模块：iGM_Migrations / 模块十七
-- 作用：Minecraft 游戏本体一键下载——版本元数据表、安装任务表、安装文件表建表
-- 内容：iGM_MinecraftVersions / iGM_GameInstalls / iGM_GameFiles 三张新表与常用索引
-- 说明：资源类型扩展 minecraft_version 属应用层常量（iGM_Resources.iGM_ResourceType
--       为无约束 TEXT 列），无需 DDL 变更，故本迁移仅包含建表与索引；
--       表名与列名统一 iGM_ 前缀；迁移仅执行一次

-- ===== Minecraft 版本元数据表：一行对应一个可下载的游戏版本 =====
-- type 取值：release 正式版 / snapshot 快照 / old_beta 远古 Beta / old_alpha 远古 Alpha
-- client/server 的 Size 为字节数，Sha1 为官方清单给出的校验值
CREATE TABLE IF NOT EXISTS iGM_MinecraftVersions (
  iGM_Id          TEXT PRIMARY KEY,
  iGM_Version     TEXT NOT NULL,
  iGM_Type        TEXT NOT NULL,
  iGM_ReleaseTime TEXT,
  iGM_ClientUrl   TEXT,
  iGM_ServerUrl   TEXT,
  iGM_ClientSize  INTEGER,
  iGM_ServerSize  INTEGER,
  iGM_ClientSha1  TEXT,
  iGM_ServerSha1  TEXT,
  iGM_Notes       TEXT,
  iGM_CreatedAt   TEXT NOT NULL,
  iGM_UpdatedAt   TEXT NOT NULL,
  UNIQUE (iGM_Version)
);

-- 版本列表按类型 + 发布时间倒序筛选
CREATE INDEX IF NOT EXISTS iGM_Idx_MinecraftVersions_Type_Time
  ON iGM_MinecraftVersions (iGM_Type, iGM_ReleaseTime DESC);

-- ===== 游戏安装任务表：一行对应一次下载安装任务 =====
-- status 取值：pending 排队中 / running 下载中 / completed 已完成 /
--              failed 失败 / canceled 已取消；progress 为总进度百分比（0-100）
CREATE TABLE IF NOT EXISTS iGM_GameInstalls (
  iGM_Id              TEXT PRIMARY KEY,
  iGM_UserId          TEXT NOT NULL,
  iGM_Version         TEXT NOT NULL,
  iGM_InstallDir      TEXT NOT NULL,
  iGM_Status          TEXT NOT NULL DEFAULT 'pending',
  iGM_Progress        REAL NOT NULL DEFAULT 0,
  iGM_TotalFiles      INTEGER NOT NULL DEFAULT 0,
  iGM_DownloadedFiles INTEGER NOT NULL DEFAULT 0,
  iGM_Error           TEXT,
  iGM_CreatedAt       TEXT NOT NULL,
  iGM_UpdatedAt       TEXT NOT NULL,
  FOREIGN KEY (iGM_UserId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE
);

-- 用户维度按创建时间倒序列出自己的安装任务
CREATE INDEX IF NOT EXISTS iGM_Idx_GameInstalls_User
  ON iGM_GameInstalls (iGM_UserId, iGM_CreatedAt DESC);
-- 按版本定位“是否已安装”
CREATE INDEX IF NOT EXISTS iGM_Idx_GameInstalls_Version
  ON iGM_GameInstalls (iGM_UserId, iGM_Version, iGM_Status);

-- ===== 安装文件明细表：一行对应安装目录中一个待下载/已下载文件 =====
-- status 取值：pending 待下载 / done 已完成 / failed 失败 / skipped 已存在跳过
CREATE TABLE IF NOT EXISTS iGM_GameFiles (
  iGM_Id           TEXT PRIMARY KEY,
  iGM_InstallId    TEXT NOT NULL,
  iGM_Path         TEXT NOT NULL,
  iGM_Url          TEXT,
  iGM_Sha1         TEXT,
  iGM_Size         INTEGER NOT NULL DEFAULT 0,
  iGM_Status       TEXT NOT NULL DEFAULT 'pending',
  iGM_DownloadedAt TEXT,
  FOREIGN KEY (iGM_InstallId) REFERENCES iGM_GameInstalls (iGM_Id) ON DELETE CASCADE
);

-- 按任务聚合文件状态（进度统计、失败重试、断点续传查询）
CREATE INDEX IF NOT EXISTS iGM_Idx_GameFiles_Install
  ON iGM_GameFiles (iGM_InstallId, iGM_Status);