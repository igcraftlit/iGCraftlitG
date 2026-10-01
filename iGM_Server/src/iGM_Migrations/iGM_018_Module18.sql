-- 文件路径：iGM_Server/src/iGM_Migrations/iGM_018_Module18.sql
-- 所属层：后端 / 数据库迁移层
-- 路由：G_Game、G_Minecraft
-- 模块：iGM_Migrations / 模块十八
-- 作用：模块十八——原版游戏 + Fabric 加载器 + 版本资料库 + 多版本隔离
-- 内容：
--   1) iGM_MinecraftVersions 增加 iGM_TotalSize（完整大小，字节）；
--   2) iGM_GameInstalls 增加 iGM_Loader / iGM_LoaderVersion（模组加载器与版本）；
--   3) 新建 iGM_ModLoaders 加载器字典表，并预置 Vanilla / Fabric / Forge / NeoForge
-- 说明：
--   - 表名与列名统一 iGM_ 前缀；迁移仅执行一次，ALTER 不会重复加列；
--   - installDir 语义调整为「版本独立目录」（<用户所选根目录>/<版本目录名>），
--     不再是全局 .minecraft，故多版本可互不干扰地共存
--   - Forge / NeoForge 以 iGM_IsSupported = 0 预置，仅作前端置灰占位

-- ===== 版本元数据：完整大小（客户端 JAR + 全部依赖库 + natives + assets） =====
ALTER TABLE iGM_MinecraftVersions ADD COLUMN iGM_TotalSize INTEGER;

-- ===== 安装任务：模组加载器与加载器版本 =====
-- loader 取值：none 原版 / fabric Fabric；loaderVersion 为 Fabric Loader 版本号
ALTER TABLE iGM_GameInstalls ADD COLUMN iGM_Loader TEXT NOT NULL DEFAULT 'none';
ALTER TABLE iGM_GameInstalls ADD COLUMN iGM_LoaderVersion TEXT;

-- ===== 模组加载器字典表 =====
-- isSupported 为 0 时前端置灰并标注「敬请期待」，后端拒绝以其创建安装任务
CREATE TABLE IF NOT EXISTS iGM_ModLoaders (
  iGM_Id          TEXT PRIMARY KEY,
  iGM_Name        TEXT NOT NULL,
  iGM_Slug        TEXT NOT NULL,
  iGM_Description TEXT,
  iGM_IsSupported INTEGER NOT NULL DEFAULT 0,
  iGM_SortOrder   INTEGER NOT NULL DEFAULT 0,
  iGM_CreatedAt   TEXT NOT NULL,
  UNIQUE (iGM_Slug)
);

CREATE INDEX IF NOT EXISTS iGM_Idx_ModLoaders_Order
  ON iGM_ModLoaders (iGM_SortOrder);

-- 预置：原版与 Fabric 受支持；Forge / NeoForge 置灰占位
INSERT OR IGNORE INTO iGM_ModLoaders
  (iGM_Id, iGM_Name, iGM_Slug, iGM_Description, iGM_IsSupported, iGM_SortOrder, iGM_CreatedAt)
VALUES
  ('iGM_ModLoader_Vanilla', 'Vanilla', 'none', 'game.loader.noneDescription', 1, 1, '2026-01-01T00:00:00.000Z'),
  ('iGM_ModLoader_Fabric', 'Fabric', 'fabric', 'game.loader.fabricDescription', 1, 2, '2026-01-01T00:00:00.000Z'),
  ('iGM_ModLoader_Forge', 'Forge', 'forge', 'game.loader.forgeDescription', 0, 3, '2026-01-01T00:00:00.000Z'),
  ('iGM_ModLoader_NeoForge', 'NeoForge', 'neoforge', 'game.loader.neoforgeDescription', 0, 4, '2026-01-01T00:00:00.000Z');