-- =====================================================================
-- iGM_046_AIQuestionSelection.sql  —  考试站 AI 亮点题目检索与审批
-- =====================================================================
-- 模块：iGC&M 教育考试系统 · AI 亮点题目自动检索 / 命题管理 / 待审核审批
-- 影响：
--   1) 扩展 iGM_QuestionBank，新增 AI 评分与审批相关列（均为可空 / 带默认值，不影响既有语义）
--   2) 新增 iGM_AIQuestionSelections（试卷 AI 亮点候选题暂存表）
-- 说明：
--   - iGM_QuestionBank.iGM_Status 语义保持不变（draft / published）；
--     本次新增 iGM_ReviewStatus（pending_review / approved / rejected）承载审批流，两列相互独立
--   - iGM_AIQuestionSelections.iGM_Options 为 JSON 文本，iGM_Tags 为逗号分隔文本
--   - iGM_AIQuestionSelections.iGM_Status：candidate（候选）/ sent（已送往命题管理）
--   - IF NOT EXISTS 保证迁移可重复执行
-- =====================================================================

BEGIN;

-- ===== 1. iGM_QuestionBank 扩展：AI 评分与审批列 =====
ALTER TABLE iGM_QuestionBank ADD COLUMN IF NOT EXISTS iGM_QualityScore REAL;
ALTER TABLE iGM_QuestionBank ADD COLUMN IF NOT EXISTS iGM_AiSelected BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE iGM_QuestionBank ADD COLUMN IF NOT EXISTS iGM_ReviewStatus TEXT;
ALTER TABLE iGM_QuestionBank ADD COLUMN IF NOT EXISTS iGM_AiReason TEXT;
ALTER TABLE iGM_QuestionBank ADD COLUMN IF NOT EXISTS iGM_ModelUsed TEXT;
ALTER TABLE iGM_QuestionBank ADD COLUMN IF NOT EXISTS iGM_SourceExamId TEXT;

CREATE INDEX IF NOT EXISTS iGM_Idx_QuestionBank_ReviewStatus
  ON iGM_QuestionBank (iGM_ReviewStatus);

-- ===== 2. 试卷 AI 亮点候选题暂存表 =====
CREATE TABLE IF NOT EXISTS iGM_AIQuestionSelections (
  iGM_Id                   TEXT PRIMARY KEY,
  iGM_ExamId               TEXT NOT NULL,
  iGM_CreatorId            TEXT NOT NULL,
  iGM_QuestionIndex        INTEGER NOT NULL,
  iGM_Stem                 TEXT NOT NULL,
  iGM_Type                 TEXT NOT NULL DEFAULT 'single',
  iGM_Options              TEXT NOT NULL DEFAULT '[]',
  iGM_Answer               TEXT NOT NULL DEFAULT '',
  iGM_Analysis             TEXT NOT NULL DEFAULT '',
  iGM_QualityScore         REAL NOT NULL DEFAULT 0,
  iGM_DifficultyCoefficient REAL NOT NULL DEFAULT 0,
  iGM_DifficultyLevel      TEXT NOT NULL DEFAULT 'medium',
  iGM_Reason               TEXT NOT NULL DEFAULT '',
  iGM_Tags                 TEXT NOT NULL DEFAULT '',
  iGM_TextbookCode         TEXT NOT NULL DEFAULT '',
  iGM_TextbookName         TEXT NOT NULL DEFAULT '',
  iGM_Status               TEXT NOT NULL DEFAULT 'candidate',
  iGM_CreatedAt            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS iGM_Idx_AIQuestionSelections_Exam
  ON iGM_AIQuestionSelections (iGM_ExamId, iGM_QualityScore DESC);

CREATE INDEX IF NOT EXISTS iGM_Idx_AIQuestionSelections_Status
  ON iGM_AIQuestionSelections (iGM_Status);

COMMIT;
