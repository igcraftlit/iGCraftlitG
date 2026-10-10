-- =====================================================================
-- iGM_032_DropLegacy.sql  —  删除 UPR / SPR / DeepSeek 遗留结构
-- =====================================================================
-- 模块：AI 赋能系统重构（UPR/SPR → UQ/Coin 双币种）
-- 影响：iGM_UPRTransactions、iGM_SPRTransactions、
--       iGM_Users.iGM_UprBalance、iGM_Users.iGM_SprBalance
-- 说明：
--   - 两张旧流水表将被整体删除（数据不再迁移）
--   - 用户双余额列替换为 UQ / Coin 新列（在下一个迁移文件新增）
--   - 执行前已通过 SELECT COUNT(*) 确认 UPR 10 个用户、SPR 0 个用户
--   - 已由应用层将 uprBalance 默认 10、sprBalance 默认 0；
--     迁移后新列将按新规则初始化（UQ 10 / Coin 5）
-- =====================================================================

BEGIN;

-- 1. 删除 UPR 流水表（模块三产物，与 SPR 表同构，整体废弃）
DROP TABLE IF EXISTS iGM_UPRTransactions CASCADE;

-- 2. 删除 SPR 流水表（模块四产物，整体废弃）
DROP TABLE IF EXISTS iGM_SPRTransactions CASCADE;

-- 3. 删除 iGM_Users 旧双余额列
ALTER TABLE iGM_Users DROP COLUMN IF EXISTS iGM_UprBalance;
ALTER TABLE iGM_Users DROP COLUMN IF EXISTS iGM_SprBalance;

COMMIT;
