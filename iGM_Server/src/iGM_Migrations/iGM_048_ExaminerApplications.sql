-- =====================================================================
-- iGM_048_ExaminerApplications.sql  —  重建命题创作者申请表（独立页面申请版）
-- =====================================================================
-- 背景：
--   iGM_047 清理迁移已 DROP iGM_ExaminerApplications；
--   当前任务要求恢复该表，但本次申请入口为前端独立路由 /apply-creator，
--   不再集成于考试管理内部；申请审核仍由后端管理员执行。
-- 约束：
--   - 绝对不改 042 / 044 / 047，幂等（CREATE TABLE IF NOT EXISTS）
--   - 列设计与 042 保持一致，避免历史代码冲突
-- =====================================================================

BEGIN;

-- 命题创作者申请表：独立路由 /apply-creator 入口
CREATE TABLE IF NOT EXISTS iGM_ExaminerApplications (
  iGM_Id            TEXT PRIMARY KEY,
  iGM_UserId        TEXT NOT NULL,
  iGM_RealName      TEXT NOT NULL,
  iGM_Contact       TEXT NOT NULL,
  iGM_Bio           TEXT NOT NULL,
  -- 命题方向，逗号分隔多选：minecraft_java / redstone / build / server_dev / mod_dev / general
  iGM_Directions    TEXT NOT NULL DEFAULT '',
  iGM_PortfolioUrl  TEXT,
  iGM_Reason        TEXT NOT NULL,
  -- pending / approved / rejected
  iGM_Status        TEXT NOT NULL DEFAULT 'pending',
  iGM_ReviewerId    TEXT,
  iGM_ReviewComment TEXT,
  iGM_CreatedAt     TEXT NOT NULL,
  iGM_UpdatedAt     TEXT NOT NULL,
  -- 同意规范勾选（提交时强制 TRUE）
  iGM_AgreedToRules BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS iGM_Idx_ExaminerApps_User
  ON iGM_ExaminerApplications (iGM_UserId, iGM_CreatedAt DESC);

CREATE INDEX IF NOT EXISTS iGM_Idx_ExaminerApps_Status
  ON iGM_ExaminerApplications (iGM_Status, iGM_CreatedAt DESC);

COMMIT;
