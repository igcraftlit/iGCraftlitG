-- 文件路径：iGM_Server/src/iGM_Migrations/iGM_028_AIModule1.sql
-- 所属层：后端 / 数据库迁移层
-- 路由：G_AI
-- 模块：iGM_Migrations / AI 赋能系统模块一（基础通信链路）
-- 作用：AI 助手对话历史两张表（会话 + 消息）
-- 内容：
--   1) iGM_AIConversations：会话表，归属用户、标题（取首条提问摘要）、创建/更新时间；
--   2) iGM_AIMessages：消息表，role 取 user / assistant，content 为消息正文；
-- 说明：
--   - 表名与列名统一 iGM_ 前缀；迁移仅执行一次，幂等可重复执行；
--   - 本模块不引入向量数据库与 RAG，仅记录原始对话用于上下文拼接。

-- ===== AI 会话表 =====
CREATE TABLE IF NOT EXISTS iGM_AIConversations (
  iGM_Id        TEXT PRIMARY KEY,
  iGM_UserId    TEXT NOT NULL,
  iGM_Title     TEXT NOT NULL DEFAULT '',
  iGM_CreatedAt TEXT NOT NULL,
  iGM_UpdatedAt TEXT NOT NULL
);

-- 按用户列出会话：最近更新优先
CREATE INDEX IF NOT EXISTS iGM_Idx_AIConversations_User
  ON iGM_AIConversations (iGM_UserId, iGM_UpdatedAt DESC);

-- ===== AI 消息表 =====
-- iGM_Role：user 用户提问 / assistant AI 回复
CREATE TABLE IF NOT EXISTS iGM_AIMessages (
  iGM_Id             TEXT PRIMARY KEY,
  iGM_ConversationId TEXT NOT NULL,
  iGM_Role           TEXT NOT NULL,
  iGM_Content        TEXT NOT NULL,
  iGM_CreatedAt      TEXT NOT NULL
);

-- 按会话读取消息：时间正序（同一毫秒内按插入顺序由主键兜底不保证，业务层按此排序展示）
CREATE INDEX IF NOT EXISTS iGM_Idx_AIMessages_Conversation
  ON iGM_AIMessages (iGM_ConversationId, iGM_CreatedAt);