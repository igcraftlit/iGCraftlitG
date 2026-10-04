-- 文件路径：iGM_Server/src/iGM_Migrations/iGM_031_AIModule4.sql
-- 所属层：后端 / 数据库迁移层
-- 路由：G_AI
-- 模块：iGM_Migrations / AI 赋能系统模块四（会话列表与 UPR 消耗详情）
-- 作用：iGM_AIConversations 补充「用户 + 创建时间」索引，支撑会话列表、
--       会话数量上限判定（最多保留 3 个）与最早会话查找（超限自动删除）
-- 内容：
--   1) iGM_Idx_AIConversations_UserCreated：按用户 + 创建时间正序，
--      用于 COUNT 会话数、取最早创建的一条、以及按创建时间倒序列出会话；
-- 说明：
--   - 既有 iGM_Idx_AIConversations_User（用户 + 更新时间倒序）保持不变，
--     本索引为模块四新增查询路径（按创建时间）服务，避免全表扫描；
--   - 迁移仅执行一次，幂等可重复执行；表结构不变，历史数据无需迁移。

-- ===== 会话列表 / 上限判定：按用户 + 创建时间 =====
CREATE INDEX IF NOT EXISTS iGM_Idx_AIConversations_UserCreated
  ON iGM_AIConversations (iGM_UserId, iGM_CreatedAt);