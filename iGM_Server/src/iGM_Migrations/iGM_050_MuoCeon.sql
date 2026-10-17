-- 文件路径：iGM_Server/src/iGM_Migrations/iGM_050_MuoCeon.sql
-- 所属层：后端 / 数据库迁移层
-- 路由：G_MuoCeon
-- 模块：iGM_Migrations / MuoCeon 账号接入
-- 作用：主站作为 OAuth 客户端接入 MuoCeon 账号体系所需的绑定表建表
-- 内容：iGM_MuoCeonBindings —— MuoCeon 用户标识（sub）与本地 iGM_Users 的一对一绑定
-- 说明：
--   - 表名与列名统一 iGM_ 前缀（经方言层自动加双引号保留大小写）；
--   - iGM_UserId 与 iGM_Sub 均唯一：一个本地账号只绑定一个 MuoCeon 身份，
--     一个 MuoCeon 身份也只对应一个本地账号；
--   - 迁移仅执行一次。

-- ===== MuoCeon 身份绑定表：一行对应一条「本地账号 ↔ MuoCeon 身份」绑定 =====
CREATE TABLE IF NOT EXISTS iGM_MuoCeonBindings (
  iGM_Id        TEXT PRIMARY KEY,
  iGM_UserId    TEXT NOT NULL UNIQUE,
  iGM_Sub       TEXT NOT NULL UNIQUE,
  iGM_CreatedAt TEXT NOT NULL,
  iGM_UpdatedAt TEXT NOT NULL,
  FOREIGN KEY (iGM_UserId) REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE
);

-- 回调时按 MuoCeon sub 直查绑定
CREATE INDEX IF NOT EXISTS iGM_Idx_MuoCeonBindings_Sub
  ON iGM_MuoCeonBindings (iGM_Sub);
