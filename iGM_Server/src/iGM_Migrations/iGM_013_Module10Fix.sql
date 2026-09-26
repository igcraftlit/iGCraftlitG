-- 文件路径：iGM_Server/src/iGM_Migrations/iGM_013_Module10Fix.sql
-- 所属层：后端 / 数据库迁移层
-- 路由：G_Message
-- 模块：iGM_Migrations / 模块十修复
-- 作用：补齐 iGM_Conversations 会话表的双方删除标记列
-- 内容：iGM_DeletedByA / iGM_DeletedByB（删除会话仅对操作方隐藏，新消息复位）
-- 说明：模块十开发期间 012 迁移的早期版本已建表（无这两列），
--       迁移记录已存在无法重跑，故以新迁移幂等补齐；迁移仅执行一次

ALTER TABLE iGM_Conversations ADD COLUMN iGM_DeletedByA INTEGER NOT NULL DEFAULT 0;
ALTER TABLE iGM_Conversations ADD COLUMN iGM_DeletedByB INTEGER NOT NULL DEFAULT 0;
