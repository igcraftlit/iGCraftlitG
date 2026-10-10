-- =====================================================================
-- iGM_035_Exam.sql  —  iG&M 教育考试系统（独立子站点 exam.igcraftlit.com）
-- =====================================================================
-- 模块：iG&M 教育考试系统
-- 影响：iGM_Exams（试卷主表）、iGM_ExamFiles（试卷文件与原始文本）、
--       iGM_ExamSubmissions（交卷记录）
-- 说明：
--   - 试卷元数据由 PDF 上传后自动识别，管理员校对后发布
--   - iGM_FileUrl 存储试卷 PDF 相对存储根目录的内部路径，绝不对外暴露
--   - 本模块暂不做登录与权限，iGM_CreatedBy / iGM_UserId 允许为空
-- =====================================================================

BEGIN;

-- ===== 1. 试卷主表 =====
CREATE TABLE IF NOT EXISTS iGM_Exams (
  iGM_Id            TEXT PRIMARY KEY,
  iGM_Title         TEXT,
  iGM_Subject       TEXT,
  iGM_Issuer        TEXT,
  iGM_Reviewer      TEXT,
  iGM_Duration      INTEGER,
  iGM_TotalScore    INTEGER,
  iGM_QuestionCount INTEGER,
  iGM_Notice        TEXT,
  iGM_FileUrl       TEXT,
  iGM_Status        TEXT NOT NULL DEFAULT 'draft',
  iGM_CreatedBy     TEXT,
  iGM_CreatedAt     TEXT NOT NULL,
  iGM_UpdatedAt     TEXT NOT NULL
);

-- 列表页按状态 + 创建时间倒序展示
CREATE INDEX IF NOT EXISTS iGM_Idx_Exams_Status
  ON iGM_Exams (iGM_Status, iGM_CreatedAt DESC);

-- ===== 2. 试卷文件表：记录文件名与前 3 页原始文本（供校对与再次识别） =====
CREATE TABLE IF NOT EXISTS iGM_ExamFiles (
  iGM_Id        TEXT PRIMARY KEY,
  iGM_ExamId    TEXT NOT NULL,
  iGM_FileName  TEXT NOT NULL,
  iGM_RawText   TEXT,
  iGM_CreatedAt TEXT NOT NULL,
  FOREIGN KEY (iGM_ExamId) REFERENCES iGM_Exams (iGM_Id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS iGM_Idx_ExamFiles_Exam
  ON iGM_ExamFiles (iGM_ExamId);

-- ===== 3. 交卷记录表：登录可选，暂存匿名交卷 =====
CREATE TABLE IF NOT EXISTS iGM_ExamSubmissions (
  iGM_Id          TEXT PRIMARY KEY,
  iGM_ExamId      TEXT NOT NULL,
  iGM_UserId      TEXT,
  iGM_SubmittedAt TEXT NOT NULL,
  FOREIGN KEY (iGM_ExamId) REFERENCES iGM_Exams (iGM_Id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS iGM_Idx_ExamSubmissions_Exam
  ON iGM_ExamSubmissions (iGM_ExamId, iGM_SubmittedAt DESC);

COMMIT;
