-- 文件路径：iGM_Server/src/iGM_Migrations/iGM_026_Module26.sql
-- 所属层：后端 / 数据库迁移层
-- 路由：G_LauncherRelease、G_Resource
-- 模块：iGM_Migrations / 模块二十六（启动器 26.3.2）
-- 作用：启动器发布历史与资源关系图两张表
-- 内容：
--   1) iGM_LauncherReleases 启动器历史版本表：版本号、发布日期、更新类型、
--      是否最新版、安装包文件名/大小/校验值、下载地址、发布页地址、
--      多语言更新说明（JSONB，结构 { "zh-CN": { added[], improved[], fixed[] }, "en": {...} }），
--      官网下载页据此渲染「最新版置顶 + 历史版本倒序」的完整版本列表；
--   2) iGM_ResourceRelations 资源关系表：资源中心树状关系图的边，
--      由规则自动推导（auto）落库，iGM_RelationType 取 compatible/dependency/derived。
-- 说明：
--   - 表名与列名统一 iGM_ 前缀；迁移仅执行一次，幂等可重复执行；
--   - 发布历史的唯一事实来源为数据库，官网静态 JSON 由
--     scripts/iGM_ExportLauncherReleases.ts 导出，禁止两处手改。

-- ===== 启动器历史版本表 =====
-- iGM_UpdateType：major 大版本 / minor 小版本 / patch 修复
-- iGM_IsLatest：仅一条为 1，官网据此置顶展示
CREATE TABLE IF NOT EXISTS iGM_LauncherReleases (
  iGM_Id             TEXT PRIMARY KEY,
  iGM_Version        TEXT NOT NULL,
  iGM_ReleasedAt     TEXT NOT NULL,
  iGM_UpdateType     TEXT NOT NULL DEFAULT 'patch',
  iGM_IsLatest       INTEGER NOT NULL DEFAULT 0,
  iGM_Channel        TEXT NOT NULL DEFAULT 'stable',
  iGM_Platform       TEXT NOT NULL DEFAULT 'Windows x64',
  iGM_FileName       TEXT NOT NULL DEFAULT '',
  iGM_FileSize       INTEGER NOT NULL DEFAULT 0,
  iGM_FileSizeLabel  TEXT NOT NULL DEFAULT '',
  iGM_Sha256         TEXT NOT NULL DEFAULT '',
  iGM_DownloadUrl    TEXT NOT NULL DEFAULT '',
  iGM_ReleasePageUrl TEXT NOT NULL DEFAULT '',
  iGM_Notes          JSONB,
  iGM_CreatedAt      TEXT NOT NULL,
  iGM_UpdatedAt      TEXT NOT NULL
);

-- 版本号全局唯一（导出脚本与 upsert 依据）
CREATE UNIQUE INDEX IF NOT EXISTS iGM_Idx_LauncherReleases_Version
  ON iGM_LauncherReleases (iGM_Version);
-- 官网按发布日期倒序读取
CREATE INDEX IF NOT EXISTS iGM_Idx_LauncherReleases_ReleasedAt
  ON iGM_LauncherReleases (iGM_ReleasedAt DESC);

-- ===== 资源关系表（资源中心树状关系图） =====
-- iGM_FromResourceId / iGM_ToResourceId：节点标识（Minecraft 版本行 id 或资源行 id）
-- iGM_RelationType：compatible 兼容 / dependency 依赖 / derived 衍生
-- iGM_Source：auto 规则推导 / manual 人工维护（本模块仅 auto）
CREATE TABLE IF NOT EXISTS iGM_ResourceRelations (
  iGM_Id             TEXT PRIMARY KEY,
  iGM_FromResourceId TEXT NOT NULL,
  iGM_ToResourceId   TEXT NOT NULL,
  iGM_RelationType   TEXT NOT NULL,
  iGM_Source         TEXT NOT NULL DEFAULT 'auto',
  iGM_CreatedAt      TEXT NOT NULL
);

-- 同一条关系只保留一行（重算时按此冲突键覆盖）
CREATE UNIQUE INDEX IF NOT EXISTS iGM_Idx_ResourceRelations_Unique
  ON iGM_ResourceRelations (iGM_FromResourceId, iGM_ToResourceId, iGM_RelationType);
CREATE INDEX IF NOT EXISTS iGM_Idx_ResourceRelations_From
  ON iGM_ResourceRelations (iGM_FromResourceId);
CREATE INDEX IF NOT EXISTS iGM_Idx_ResourceRelations_To
  ON iGM_ResourceRelations (iGM_ToResourceId);