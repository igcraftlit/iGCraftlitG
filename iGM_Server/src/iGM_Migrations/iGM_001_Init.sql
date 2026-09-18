-- 文件路径：iGM_Server/src/iGM_Migrations/iGM_001_Init.sql
-- 所属层：后端 / 数据库迁移层
-- 路由：无
-- 模块：iGM_Migrations
-- 作用：模块一初始化迁移，仅建立迁移记录表与最小占位结构
-- 内容：iGM_SchemaMigrations 迁移记录表
-- 说明：业务表（iGM_Users、iGM_Posts 等）由后续模块迁移文件引入

-- 迁移记录表：记录已执行的迁移文件，保证启动时只执行一次
CREATE TABLE IF NOT EXISTS iGM_SchemaMigrations (
  iGM_Name TEXT PRIMARY KEY,
  iGM_ExecutedAt TEXT NOT NULL
);
