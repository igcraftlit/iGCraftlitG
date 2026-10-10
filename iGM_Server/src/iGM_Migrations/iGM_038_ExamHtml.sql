-- =====================================================================
-- iGM_038_ExamHtml.sql  —  iG&M 教育考试系统：pdf2htmlEX 高保真 HTML 转换
-- =====================================================================
-- 模块：iG&M 教育考试系统（PDF → 自包含 HTML）
-- 影响：iGM_Exams（HTML 目录）、iGM_ExamFiles（转换状态与时间）
-- 说明：
--   - 试卷由「结构化 Block 解析」改为 pdf2htmlEX 高保真转换，
--     产物为自包含 HTML 目录，iGM_HtmlPath 保存相对存储根目录的目录路径
--   - 原 iGM_ContentBlocks（JSONB）与 iGM_ImagesPath 废弃，直接删除
--   - 文件表逐页解析进度字段随结构化解析一并废弃
--   - iGM_ParseStatus → iGM_ConvertStatus，iGM_ParseError → iGM_ConvertError，
--     新增 iGM_ConvertedAt（转换完成时间），删除 iGM_ConfirmedAt
-- =====================================================================

BEGIN;

-- ===== 1. 试卷主表：转换生成的 HTML 目录 =====
ALTER TABLE iGM_Exams ADD COLUMN IF NOT EXISTS iGM_HtmlPath TEXT;
ALTER TABLE iGM_Exams DROP COLUMN IF EXISTS iGM_ContentBlocks;
ALTER TABLE iGM_Exams DROP COLUMN IF EXISTS iGM_ImagesPath;

-- ===== 2. 试卷文件表：转换状态与时间 =====
ALTER TABLE iGM_ExamFiles RENAME COLUMN iGM_ParseStatus TO iGM_ConvertStatus;
ALTER TABLE iGM_ExamFiles RENAME COLUMN iGM_ParseError TO iGM_ConvertError;
ALTER TABLE iGM_ExamFiles ADD COLUMN IF NOT EXISTS iGM_ConvertedAt TEXT;
ALTER TABLE iGM_ExamFiles DROP COLUMN IF EXISTS iGM_ParsedPages;
ALTER TABLE iGM_ExamFiles DROP COLUMN IF EXISTS iGM_TotalPages;
ALTER TABLE iGM_ExamFiles DROP COLUMN IF EXISTS iGM_ConfirmedAt;

-- 临时文件清理任务改按转换状态 + 上传时间扫描
DROP INDEX IF EXISTS iGM_Idx_ExamFiles_ParseStatus;
CREATE INDEX IF NOT EXISTS iGM_Idx_ExamFiles_ConvertStatus
  ON iGM_ExamFiles (iGM_ConvertStatus, iGM_UploadedAt);

COMMIT;