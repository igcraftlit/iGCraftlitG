-- =====================================================================
-- iGM_045_AIModelUsed.sql  —  AI 回复所用模型记录
-- =====================================================================
-- 模块：AI 助手双模型（标准版 qwen2.5:7b / Pro 版 deepseek-r1:7b）
-- 影响：iGM_AIMessages 新增 iGM_ModelUsed（记录回复实际使用的底层模型 id）
-- 说明：
--   - 提问行与历史遗留行的 iGM_ModelUsed 为 NULL，仅 AI 回复行写入模型 id
--   - 管理后台按该列区分标准版 / Pro 版调用量
--   - IF NOT EXISTS 保证迁移可重复执行
-- =====================================================================

BEGIN;

-- ===== AI 回复所用模型列 =====
ALTER TABLE iGM_AIMessages ADD COLUMN IF NOT EXISTS iGM_ModelUsed TEXT;

COMMIT;
