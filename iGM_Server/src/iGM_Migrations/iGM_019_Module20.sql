-- 文件路径：iGM_Server/src/iGM_Migrations/iGM_019_Module20.sql
-- 所属层：后端 / 数据库迁移层
-- 路由：G_ThirdParty
-- 模块：iGM_Migrations / 模块二十
-- 作用：模块二十——Fabric 资源下载（Modrinth 接入 + 下载进度同步）建表
-- 内容：
--   1) iGM_ThirdPartyResources 第三方资源元数据表（本模块 source 固定 modrinth）；
--   2) iGM_ThirdPartyVersions 第三方资源版本表；
--   3) iGM_DownloadTasks 下载任务表（网站下载中心与启动器共用同一 taskId）
-- 说明：
--   - 表名与列名统一 iGM_ 前缀；迁移仅执行一次；
--   - 本站数据库只存元数据与第三方下载 URL，不存储任何资源文件本身；
--   - resourceType 取值：mod 模组 / shader 光影 / resourcepack 材质包 /
--     map 地图 / datapack 数据包（本模块仅 Fabric 加载器）；
--   - 状态取值：pending 排队中 / downloading 下载中 / paused 已暂停 /
--     completed 已完成 / failed 失败 / canceled 已取消

-- ===== 第三方资源元数据表：一行对应一个第三方平台资源 =====
CREATE TABLE IF NOT EXISTS iGM_ThirdPartyResources (
  iGM_Id          TEXT PRIMARY KEY,
  iGM_Source      TEXT NOT NULL DEFAULT 'modrinth',
  iGM_SourceId    TEXT NOT NULL,
  iGM_Slug        TEXT,
  iGM_Name        TEXT NOT NULL,
  iGM_Type        TEXT NOT NULL,
  iGM_Description TEXT,
  iGM_Author      TEXT,
  iGM_CoverUrl    TEXT,
  iGM_Downloads   INTEGER,
  iGM_CreatedAt   TEXT NOT NULL,
  iGM_UpdatedAt   TEXT NOT NULL,
  UNIQUE (iGM_Source, iGM_SourceId)
);

-- 资源列表按类型筛选并按更新时间倒序
CREATE INDEX IF NOT EXISTS iGM_Idx_ThirdPartyResources_Type
  ON iGM_ThirdPartyResources (iGM_Type, iGM_UpdatedAt DESC);
-- 按平台来源与别名定位缓存条目
CREATE INDEX IF NOT EXISTS iGM_Idx_ThirdPartyResources_Slug
  ON iGM_ThirdPartyResources (iGM_Source, iGM_Slug);

-- ===== 第三方资源版本表：一行对应资源下的一个可下载版本 =====
-- gameVersions / loaders 为 JSON 数组字符串（如 ["1.20.1"]、["fabric"]）
CREATE TABLE IF NOT EXISTS iGM_ThirdPartyVersions (
  iGM_Id          TEXT PRIMARY KEY,
  iGM_ResourceId  TEXT NOT NULL,
  iGM_SourceId    TEXT NOT NULL,
  iGM_Version     TEXT NOT NULL,
  iGM_GameVersions TEXT,
  iGM_Loaders     TEXT,
  iGM_DownloadUrl TEXT NOT NULL,
  iGM_Filename    TEXT NOT NULL,
  iGM_Size        INTEGER NOT NULL DEFAULT 0,
  iGM_Sha1        TEXT,
  iGM_PublishedAt TEXT,
  iGM_CreatedAt   TEXT NOT NULL,
  UNIQUE (iGM_ResourceId, iGM_SourceId),
  FOREIGN KEY (iGM_ResourceId) REFERENCES iGM_ThirdPartyResources (iGM_Id) ON DELETE CASCADE
);

-- 资源详情页按发布时间倒序列出全部版本
CREATE INDEX IF NOT EXISTS iGM_Idx_ThirdPartyVersions_Resource
  ON iGM_ThirdPartyVersions (iGM_ResourceId, iGM_PublishedAt DESC);

-- ===== 下载任务表：一行对应一次第三方资源下载任务 =====
-- 网站下载中心与启动器通过同一 iGM_TaskId 查询与订阅进度
CREATE TABLE IF NOT EXISTS iGM_DownloadTasks (
  iGM_Id          TEXT PRIMARY KEY,
  iGM_TaskId      TEXT NOT NULL,
  iGM_UserId      TEXT NOT NULL,
  iGM_ResourceId  TEXT NOT NULL,
  iGM_VersionId   TEXT NOT NULL,
  iGM_Source      TEXT NOT NULL DEFAULT 'modrinth',
  iGM_DownloadUrl TEXT NOT NULL,
  iGM_Filename    TEXT NOT NULL,
  iGM_Size        INTEGER NOT NULL DEFAULT 0,
  iGM_Sha1        TEXT,
  iGM_Status      TEXT NOT NULL DEFAULT 'pending',
  iGM_Downloaded  INTEGER NOT NULL DEFAULT 0,
  iGM_Progress    DOUBLE PRECISION NOT NULL DEFAULT 0,
  iGM_Speed       DOUBLE PRECISION NOT NULL DEFAULT 0,
  iGM_Eta         INTEGER,
  iGM_Error       TEXT,
  iGM_TargetDir   TEXT NOT NULL,
  iGM_FilePath    TEXT,
  iGM_CreatedAt   TEXT NOT NULL,
  iGM_UpdatedAt   TEXT NOT NULL,
  UNIQUE (iGM_TaskId),
  FOREIGN KEY (iGM_UserId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE,
  FOREIGN KEY (iGM_ResourceId) REFERENCES iGM_ThirdPartyResources (iGM_Id) ON DELETE CASCADE,
  FOREIGN KEY (iGM_VersionId) REFERENCES iGM_ThirdPartyVersions (iGM_Id) ON DELETE CASCADE
);

-- 用户维度按创建时间倒序列出自己的下载任务（下载中心与启动器共用）
CREATE INDEX IF NOT EXISTS iGM_Idx_DownloadTasks_User
  ON iGM_DownloadTasks (iGM_UserId, iGM_CreatedAt DESC);
-- 按状态筛选进行中 / 已完成任务
CREATE INDEX IF NOT EXISTS iGM_Idx_DownloadTasks_Status
  ON iGM_DownloadTasks (iGM_UserId, iGM_Status);