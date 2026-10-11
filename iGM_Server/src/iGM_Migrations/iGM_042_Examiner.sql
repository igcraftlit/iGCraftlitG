-- =====================================================================
-- iGM_042_Examiner.sql  —  命题创作者角色、申请审核与命题方预设
-- =====================================================================
-- 模块：iGC&M 教育考试系统 · 命题创作者权限体系
-- 影响：新增 iGM_ExaminerApplications（命题创作者申请）、iGM_Examiners（命题创作者）、
--       iGM_IssuerPresets（命题方预设）；扩展 iGM_Exams（命题方预设归档）
-- 说明：
--   - 命题创作者（examiner）可上传 / 管理试卷，且仅可见自己上传的试卷
--   - 试卷归属复用 iGM_Exams.iGM_CreatedBy（上传时的登录用户 ID）
--   - iGM_Exams.iGM_PresetId 记录关键词归档命中的命题方预设，供目录按预设筛选
--   - 预设默认全站可见（iGM_IsPublic = TRUE）
-- =====================================================================

BEGIN;

-- ===== 1. 命题创作者申请表 =====
CREATE TABLE IF NOT EXISTS iGM_ExaminerApplications (
  iGM_Id            TEXT PRIMARY KEY,
  iGM_UserId        TEXT NOT NULL,
  iGM_RealName      TEXT NOT NULL,
  iGM_Contact       TEXT NOT NULL,
  iGM_Bio           TEXT NOT NULL,
  -- 命题方向，逗号分隔的多选值（minecraft/java/informatics/general 等）
  iGM_Directions    TEXT NOT NULL DEFAULT '',
  iGM_PortfolioUrl  TEXT,
  iGM_Reason        TEXT NOT NULL,
  -- pending / approved / rejected
  iGM_Status        TEXT NOT NULL DEFAULT 'pending',
  iGM_ReviewerId    TEXT,
  iGM_ReviewComment TEXT,
  iGM_CreatedAt     TEXT NOT NULL,
  iGM_UpdatedAt     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS iGM_Idx_ExaminerApps_User
  ON iGM_ExaminerApplications (iGM_UserId, iGM_CreatedAt DESC);

CREATE INDEX IF NOT EXISTS iGM_Idx_ExaminerApps_Status
  ON iGM_ExaminerApplications (iGM_Status, iGM_CreatedAt DESC);

-- ===== 2. 命题创作者表：审核通过后写入 =====
CREATE TABLE IF NOT EXISTS iGM_Examiners (
  iGM_Id         TEXT PRIMARY KEY,
  iGM_UserId     TEXT NOT NULL UNIQUE,
  -- active / suspended
  iGM_Status     TEXT NOT NULL DEFAULT 'active',
  iGM_ApprovedAt TEXT NOT NULL,
  iGM_CreatedAt  TEXT NOT NULL,
  iGM_UpdatedAt  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS iGM_Idx_Examiners_User
  ON iGM_Examiners (iGM_UserId);

-- ===== 3. 命题方预设表 =====
CREATE TABLE IF NOT EXISTS iGM_IssuerPresets (
  iGM_Id         TEXT PRIMARY KEY,
  iGM_Name       TEXT NOT NULL,
  -- 关键词，逗号分隔；试卷命题方文本包含任一关键词即归入该预设
  iGM_Keywords   TEXT NOT NULL DEFAULT '',
  iGM_CreatorId  TEXT NOT NULL,
  iGM_IsPublic   BOOLEAN NOT NULL DEFAULT TRUE,
  iGM_CreatedAt  TEXT NOT NULL,
  iGM_UpdatedAt  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS iGM_Idx_IssuerPresets_Creator
  ON iGM_IssuerPresets (iGM_CreatorId, iGM_CreatedAt DESC);

-- ===== 4. 试卷表扩展：命题方预设归档 =====
ALTER TABLE iGM_Exams ADD COLUMN IF NOT EXISTS iGM_PresetId TEXT;

-- 管理端按上传者隔离查询
CREATE INDEX IF NOT EXISTS iGM_Idx_Exams_Creator
  ON iGM_Exams (iGM_CreatedBy, iGM_CreatedAt DESC);

-- 目录按命题方筛选
CREATE INDEX IF NOT EXISTS iGM_Idx_Exams_Issuer
  ON iGM_Exams (iGM_Issuer);

COMMIT;
