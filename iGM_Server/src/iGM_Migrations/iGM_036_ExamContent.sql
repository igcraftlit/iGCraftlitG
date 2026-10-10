-- =====================================================================
-- iGM_036_ExamContent.sql  —  iG&M 教育考试系统：解析全文存储与原文确认删除
-- =====================================================================
-- 模块：iG&M 教育考试系统
-- 影响：iGM_Exams（新增解析全文与解析状态）、iGM_ExamFiles（改为临时文件元数据表）
-- 说明：
--   - 上传后解析出的全文以 Markdown 存入 iGM_Exams.iGM_ContentMarkdown
--   - 原始文件先保留在临时目录，管理员确认后删除；
--     iGM_ExamFiles.iGM_TempPath 为相对存储根目录的内部路径，删除后置空
--   - 磁盘路径绝不出现在对外 DTO
-- =====================================================================

BEGIN;

-- ===== 1. 试卷主表：解析全文与解析状态 =====
ALTER TABLE iGM_Exams ADD COLUMN IF NOT EXISTS iGM_ContentMarkdown TEXT;
ALTER TABLE iGM_Exams ADD COLUMN IF NOT EXISTS iGM_ParseStatus TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE iGM_Exams ADD COLUMN IF NOT EXISTS iGM_OriginalFileDeleted BOOLEAN NOT NULL DEFAULT FALSE;
-- 原 iGM_FileUrl 由临时目录 + iGM_ExamFiles.iGM_TempPath 取代
ALTER TABLE iGM_Exams DROP COLUMN IF EXISTS iGM_FileUrl;

-- ===== 2. 试卷文件表：临时文件元数据与解析状态 =====
ALTER TABLE iGM_ExamFiles ADD COLUMN IF NOT EXISTS iGM_FileType TEXT;
ALTER TABLE iGM_ExamFiles ADD COLUMN IF NOT EXISTS iGM_FileSize BIGINT;
ALTER TABLE iGM_ExamFiles ADD COLUMN IF NOT EXISTS iGM_TempPath TEXT;
ALTER TABLE iGM_ExamFiles ADD COLUMN IF NOT EXISTS iGM_ParseStatus TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE iGM_ExamFiles ADD COLUMN IF NOT EXISTS iGM_ConfirmedAt TEXT;
ALTER TABLE iGM_ExamFiles ADD COLUMN IF NOT EXISTS iGM_DeletedAt TEXT;
-- 全文改存 iGM_Exams.iGM_ContentMarkdown，文件表不再保存原始文本
ALTER TABLE iGM_ExamFiles DROP COLUMN IF EXISTS iGM_RawText;
ALTER TABLE iGM_ExamFiles RENAME COLUMN iGM_CreatedAt TO iGM_UploadedAt;

-- 临时文件清理任务按解析状态 + 上传时间扫描
CREATE INDEX IF NOT EXISTS iGM_Idx_ExamFiles_ParseStatus
  ON iGM_ExamFiles (iGM_ParseStatus, iGM_UploadedAt);

COMMIT;
