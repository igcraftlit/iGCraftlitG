-- =====================================================================
-- iGM_041_ExamAnswer.sql  —  iGC&M 教育考试系统：答案附件
-- =====================================================================
-- 模块：iGC&M 教育考试系统（答案附件上传）
-- 影响：iGM_Exams（新增 iGM_AnswerPdfPath）
-- 说明：
--   - 管理端在试卷预览页上传答案 PDF，文件保存到
--     <试卷存储根>/<examId>/answer/ 下，路径（相对存储根）写入 iGM_AnswerPdfPath
--   - 未上传答案时该字段为 NULL；磁盘绝对路径绝不对外暴露
--   - 导出静态数据时把答案文件复制到 public/exams/<examId>/answer/，
--     并在单份试卷 JSON 中写入 answerPdfUrl，供详情页在后端不启动时仍可查看
-- =====================================================================

BEGIN;

ALTER TABLE iGM_Exams ADD COLUMN IF NOT EXISTS iGM_AnswerPdfPath TEXT;

COMMIT;
