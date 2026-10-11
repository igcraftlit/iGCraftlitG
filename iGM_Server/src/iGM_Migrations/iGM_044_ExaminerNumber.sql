-- =====================================================================
-- iGM_044_ExaminerNumber.sql  —  命题创作者专属编号
-- =====================================================================
-- 模块：iGC&M 教育考试系统 · 命题创作者权限体系
-- 影响：iGM_Examiners 新增 iGM_CreatorNumber（10 位零填充命题者编号）
-- 说明：
--   - 编号为独立于社区 UID 的顺序号，形如 0000000001（前端统一补 # 前缀）
--   - 历史数据按 (iGM_ApprovedAt, iGM_CreatedAt, iGM_Id) 顺序回填，
--     并接续已有最大编号，保证重复执行 / 部分数据场景下不冲突
--   - PostgreSQL 唯一索引允许多行 NULL，故直接建普通唯一索引即可
-- =====================================================================

BEGIN;

-- ===== 1. 命题创作者编号列 =====
ALTER TABLE iGM_Examiners ADD COLUMN IF NOT EXISTS iGM_CreatorNumber TEXT;

-- ===== 2. 回填历史数据（仅编号为空的行）=====
WITH "iGM_Base" AS (
  SELECT COALESCE(MAX(iGM_CreatorNumber::int), 0) AS iGM_Offset
    FROM iGM_Examiners
   WHERE iGM_CreatorNumber IS NOT NULL
),
"iGM_Pending" AS (
  SELECT iGM_Id,
         ROW_NUMBER() OVER (
           ORDER BY iGM_ApprovedAt, iGM_CreatedAt, iGM_Id
         ) AS iGM_RowNo
    FROM iGM_Examiners
   WHERE iGM_CreatorNumber IS NULL
)
UPDATE iGM_Examiners e
   SET iGM_CreatorNumber = LPAD((b.iGM_Offset + p.iGM_RowNo)::text, 10, '0')
  FROM "iGM_Base" b, "iGM_Pending" p
 WHERE e.iGM_Id = p.iGM_Id;

-- ===== 3. 编号唯一索引 =====
CREATE UNIQUE INDEX IF NOT EXISTS iGM_Idx_Examiners_Number
  ON iGM_Examiners (iGM_CreatorNumber);

COMMIT;
