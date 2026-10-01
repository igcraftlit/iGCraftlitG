-- 文件路径：iGM_Server/src/iGM_Migrations/iGM_022_UserPreferences.sql
-- 所属层：后端 / 数据库迁移层
-- 路由：G_User / G_Settings
-- 模块：iGM_Migrations / 个性化设置
-- 作用：补齐用户个性化设置表 iGM_UserPreferences
-- 内容：主题色、布局密度、字号、侧边栏顺序、首页模块开关共 5 项偏好
-- 说明：该表在旧 SQLite 库中已存在并含有效数据，但未纳入迁移文件管理；
--       迁移到 PostgreSQL 时补齐建表语句，保证基线可复现、数据不丢失；
--       布尔与 JSON 均以 TEXT 存储，由业务层序列化；迁移幂等

-- ===== 用户个性化设置表：每用户一行，随资料页保存 =====
CREATE TABLE IF NOT EXISTS iGM_UserPreferences (
  iGM_Id            TEXT PRIMARY KEY,
  iGM_UserId        TEXT NOT NULL UNIQUE,
  iGM_ThemeColor    TEXT NOT NULL DEFAULT 'default',
  iGM_LayoutDensity TEXT NOT NULL DEFAULT 'cozy',
  iGM_FontSize      TEXT NOT NULL DEFAULT 'medium',
  iGM_SidebarOrder  TEXT NOT NULL DEFAULT '{"groups":[],"items":{}}',
  iGM_HomeModules   TEXT NOT NULL DEFAULT '{}',
  iGM_UpdatedAt     TEXT NOT NULL,
  FOREIGN KEY (iGM_UserId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE
);
