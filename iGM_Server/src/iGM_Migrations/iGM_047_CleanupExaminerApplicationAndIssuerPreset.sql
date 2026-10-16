-- =====================================================================
-- iGM_047_CleanupExaminerApplicationAndIssuerPreset.sql  —  删除申请审核与命题方预设
-- =====================================================================
-- 模块：iGC&M 教育考试系统 · 命题创作者权限体系
-- 影响：删除 iGM_ExaminerApplications、iGM_IssuerPresets 两张表；
--       删除 iGM_Exams.iGM_PresetId 列
-- 说明：
--   - 命题创作者（iGM_Examiners）表保留，供 /api/exam/creator/profile 与 revoke 使用
--   - 本迁移幂等（IF EXISTS），可安全重复执行
-- =====================================================================

BEGIN;

DROP TABLE IF EXISTS iGM_ExaminerApplications;

DROP TABLE IF EXISTS iGM_IssuerPresets;

ALTER TABLE iGM_Exams DROP COLUMN IF EXISTS iGM_PresetId;

COMMIT;
