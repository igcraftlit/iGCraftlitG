-- =====================================================================
-- iGM_034_DeveloperIntro.sql  —  开发者申请规范化 + 开发者初始界面
-- =====================================================================
-- 模块：开发者申请规范化（G_DeveloperIntro 三标签：申请 / 文档 / 公示）
-- 影响：iGM_DeveloperApplications（扩展字段）、
--       iGM_DeveloperBatches（新增批次表）、iGM_DeveloperPublicity（新增公示表）
-- 说明：
--   - 申请表单新增 开发者名称 / 年龄 / 生日（月、日）/ 邮箱 / 手机 /
--     国家 / 省州 / 城市 / 详细地址 / 邮编 / 申请人域名 / 附加说明 / 批次
--   - 项目介绍复用既有 iGM_ProjectDesc（限 1000 字），申请理由复用 iGM_Reason（限 500 字）
--   - 联系方式展示列 iGM_Contact 保留，由应用层写入“邮箱 / 手机”合并文本
--   - 每批次默认名额 30（除联合开发者外，每月上限 30 名）
-- =====================================================================

BEGIN;

-- ===== 1. 扩展开发者申请表：新增规范字段（幂等，保留既有列兼容旧数据） =====
ALTER TABLE iGM_DeveloperApplications ADD COLUMN IF NOT EXISTS iGM_DeveloperName  TEXT;
ALTER TABLE iGM_DeveloperApplications ADD COLUMN IF NOT EXISTS iGM_Age            INTEGER;
ALTER TABLE iGM_DeveloperApplications ADD COLUMN IF NOT EXISTS iGM_BirthMonth     INTEGER;
ALTER TABLE iGM_DeveloperApplications ADD COLUMN IF NOT EXISTS iGM_BirthDay       INTEGER;
ALTER TABLE iGM_DeveloperApplications ADD COLUMN IF NOT EXISTS iGM_ContactEmail   TEXT;
ALTER TABLE iGM_DeveloperApplications ADD COLUMN IF NOT EXISTS iGM_ContactPhone   TEXT;
ALTER TABLE iGM_DeveloperApplications ADD COLUMN IF NOT EXISTS iGM_Country        TEXT;
ALTER TABLE iGM_DeveloperApplications ADD COLUMN IF NOT EXISTS iGM_Province       TEXT;
ALTER TABLE iGM_DeveloperApplications ADD COLUMN IF NOT EXISTS iGM_City           TEXT;
ALTER TABLE iGM_DeveloperApplications ADD COLUMN IF NOT EXISTS iGM_Address        TEXT;
ALTER TABLE iGM_DeveloperApplications ADD COLUMN IF NOT EXISTS iGM_PostalCode     TEXT;
ALTER TABLE iGM_DeveloperApplications ADD COLUMN IF NOT EXISTS iGM_Domain         TEXT;
ALTER TABLE iGM_DeveloperApplications ADD COLUMN IF NOT EXISTS iGM_Additional     TEXT;
ALTER TABLE iGM_DeveloperApplications ADD COLUMN IF NOT EXISTS iGM_BatchId        TEXT;

-- ===== 2. 开发者批次表：每批次名额默认 30，状态 pending / active / closed =====
CREATE TABLE IF NOT EXISTS iGM_DeveloperBatches (
  iGM_Id          TEXT PRIMARY KEY,
  iGM_BatchName   TEXT NOT NULL UNIQUE,
  iGM_Quota       INTEGER NOT NULL DEFAULT 30,
  iGM_PublishedAt TEXT,
  iGM_Status      TEXT NOT NULL DEFAULT 'pending',
  iGM_CreatedAt   TEXT NOT NULL
);

-- ===== 3. 开发者公示表：记录每批次通过审核的开发者名单 =====
CREATE TABLE IF NOT EXISTS iGM_DeveloperPublicity (
  iGM_Id            TEXT PRIMARY KEY,
  iGM_BatchId       TEXT NOT NULL,
  iGM_ApplicationId TEXT NOT NULL,
  iGM_UserId        TEXT NOT NULL,
  iGM_DeveloperName TEXT NOT NULL,
  iGM_ProjectName   TEXT NOT NULL,
  iGM_ApprovedAt    TEXT NOT NULL,
  FOREIGN KEY (iGM_BatchId)  REFERENCES iGM_DeveloperBatches (iGM_Id) ON DELETE CASCADE,
  FOREIGN KEY (iGM_UserId)   REFERENCES iGM_Users (iGM_Id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS iGM_Idx_DeveloperPublicity_Batch
  ON iGM_DeveloperPublicity (iGM_BatchId, iGM_ApprovedAt DESC);
CREATE INDEX IF NOT EXISTS iGM_Idx_DeveloperPublicity_User
  ON iGM_DeveloperPublicity (iGM_UserId);

COMMIT;