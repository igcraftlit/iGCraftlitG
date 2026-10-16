-- 文件路径：iGM_Server/src/iGM_Migrations/iGM_049_RemoveAIModule.sql
-- 所属层：后端 / 数据库迁移层
-- 路由：全局
-- 模块：iGM_Migrations / 全面移除 AI 功能模块
-- 作用：删除 AI 助手会话与选题相关表，并移除题库中仅服务于 AI 逻辑的字段
-- 内容：
--   1) 删除表：iGM_AIQuestionSelections、iGM_AIMessages、iGM_AIConversations
--   2) 删除 iGM_QuestionBank 中 AI 相关列：
--      iGM_QualityScore / iGM_AiSelected / iGM_AiReason / iGM_ModelUsed /
--      iGM_SourceExamId / iGM_AiTextbookCode / iGM_AiSource / iGM_AdjustedByUser
-- 说明：
--   - 全部语句幂等（IF EXISTS），可重复执行；
--   - 保留 iGM_TextbookCode / iGM_TextbookName / iGM_DifficultyCoefficient 等
--     由命题创作者手工填写、非 AI 专用的字段；
--   - 保留 UQ / Coin 双币种余额与流水（非 AI 功能仍在使用的账户余额展示）。

-- ===== 1. 删除 AI 相关表 =====
DROP TABLE IF EXISTS iGM_AIQuestionSelections;
DROP TABLE IF EXISTS iGM_AIMessages;
DROP TABLE IF EXISTS iGM_AIConversations;

-- ===== 2. 移除题库中的 AI 专用字段 =====
ALTER TABLE iGM_QuestionBank DROP COLUMN IF EXISTS iGM_QualityScore;
ALTER TABLE iGM_QuestionBank DROP COLUMN IF EXISTS iGM_AiSelected;
ALTER TABLE iGM_QuestionBank DROP COLUMN IF EXISTS iGM_AiReason;
ALTER TABLE iGM_QuestionBank DROP COLUMN IF EXISTS iGM_ModelUsed;
ALTER TABLE iGM_QuestionBank DROP COLUMN IF EXISTS iGM_SourceExamId;
ALTER TABLE iGM_QuestionBank DROP COLUMN IF EXISTS iGM_AiTextbookCode;
ALTER TABLE iGM_QuestionBank DROP COLUMN IF EXISTS iGM_AiSource;
ALTER TABLE iGM_QuestionBank DROP COLUMN IF EXISTS iGM_AdjustedByUser;
ALTER TABLE iGM_QuestionBank DROP COLUMN IF EXISTS iGM_ReviewStatus;
