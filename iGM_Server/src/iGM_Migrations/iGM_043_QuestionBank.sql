-- =====================================================================
-- iGM_043_QuestionBank.sql  —  题库与题目编辑器
-- =====================================================================
-- 模块：iGC&M 教育考试系统 · 题库
-- 影响：新增 iGM_QuestionBank（题目）表
-- 说明：
--   - 题目归属 iGM_CreatorId（创建者登录用户 ID）
--   - iGM_TextbookCode / iGM_TextbookName 由服务端按固定教材目录派生，禁止前端覆盖
--   - iGM_Options 为 JSON 文本（[{"key":"A","text":"..."}]），选择题有值，其余可为空
--   - iGM_Type：single_choice / multiple_choice / true_false / fill_blank / short_answer
--   - iGM_DifficultyLevel：easy / medium / hard
--   - iGM_AiSource：ollama / keyword / keyword-default
--   - iGM_Status：draft（草稿）/ published（已发布，进入静态题库）
-- =====================================================================

BEGIN;

-- ===== 1. 题库表 =====
CREATE TABLE IF NOT EXISTS iGM_QuestionBank (
  iGM_Id                  TEXT PRIMARY KEY,
  iGM_CreatorId           TEXT NOT NULL,
  iGM_Stem                TEXT,
  iGM_Type                TEXT,
  iGM_Options             TEXT,
  iGM_Answer              TEXT,
  iGM_Analysis            TEXT,
  iGM_TextbookCode        TEXT NOT NULL,
  iGM_TextbookName        TEXT NOT NULL,
  iGM_DifficultyCoefficient REAL,
  iGM_DifficultyLevel     TEXT,
  iGM_Tags                TEXT,
  iGM_AiTextbookCode      TEXT,
  iGM_AiSource            TEXT,
  iGM_AdjustedByUser      BOOLEAN NOT NULL DEFAULT FALSE,
  iGM_Status              TEXT NOT NULL DEFAULT 'draft',
  iGM_CreatedAt           TEXT NOT NULL,
  iGM_UpdatedAt           TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS iGM_Idx_QuestionBank_Creator
  ON iGM_QuestionBank (iGM_CreatorId, iGM_CreatedAt DESC);

CREATE INDEX IF NOT EXISTS iGM_Idx_QuestionBank_Status
  ON iGM_QuestionBank (iGM_Status, iGM_TextbookCode, iGM_CreatedAt DESC);

COMMIT;
