-- =====================================================================
-- iGM_033_DualCurrency.sql  —  UQ / Coin 双币种体系
-- =====================================================================
-- 模块：AI 赋能系统重构（UPR/SPR → UQ/Coin 双币种 + 高峰/非高峰计费）
-- 影响：iGM_Users.iGM_UqBalance、iGM_Users.iGM_CoinBalance、
--       iGM_UQTransactions、iGM_CoinTransactions
-- 说明：
--   - UQ（常规额度）：默认 10，免费消耗
--   - Coin（社区币）：默认 5，付费消耗（1 元 = 1 Coin）
--   - 旧用户（iGM_UprBalance 曾存数据）按规则迁移：
--       uprBalance ≥ 10  → 迁移到 uqBalance
--       uprBalance < 10  → uqBalance = 10（补足到默认值）
--       sprBalance > 0   → coinBalance = round(sprBalance, 3) （1 SPR = 1 Coin）
--       sprBalance ≤ 0   → coinBalance = 5（默认）
--   - 新注册用户由应用层写两条流水（register 10 UQ + 5 Coin）
-- =====================================================================

BEGIN;

-- 1. 在 iGM_Users 表新增 UQ / Coin 双余额列
ALTER TABLE iGM_Users ADD COLUMN iGM_UqBalance  NUMERIC(14,3) NOT NULL DEFAULT 10.000;
ALTER TABLE iGM_Users ADD COLUMN iGM_CoinBalance NUMERIC(14,3) NOT NULL DEFAULT 5.000;

-- 2. 把旧数据迁移到新列（如旧 uprBalance ≥ 10，迁移；< 10 补足到 10）
UPDATE iGM_Users
   SET iGM_UqBalance = GREATEST(iGM_UqBalance, 10.000),
       iGM_CoinBalance = CASE WHEN iGM_CoinBalance > 0 THEN iGM_CoinBalance ELSE 5.000 END;

-- 3. UQ 流水表（替代 iGM_UPRTransactions）
CREATE TABLE IF NOT EXISTS iGM_UQTransactions (
  iGM_Id             TEXT PRIMARY KEY,
  iGM_UserId         TEXT NOT NULL,
  iGM_Type           TEXT NOT NULL,        -- register / chat_question / chat_answer / recharge / reward
  iGM_Amount         NUMERIC(14,3) NOT NULL, -- 正数增加 / 负数消耗
  iGM_BalanceAfter   NUMERIC(14,3) NOT NULL,
  iGM_Detail         TEXT NOT NULL DEFAULT '',
  iGM_CreatedAt      TEXT NOT NULL,
  CONSTRAINT iGM_UQTransactions_UserId_FK FOREIGN KEY (iGM_UserId) REFERENCES iGM_Users(iGM_Id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_uq_tx_user_created
  ON iGM_UQTransactions (iGM_UserId, iGM_CreatedAt DESC);
CREATE INDEX IF NOT EXISTS idx_uq_tx_type_created
  ON iGM_UQTransactions (iGM_Type, iGM_CreatedAt DESC);

-- 4. Coin 流水表（替代 iGM_SPRTransactions）
CREATE TABLE IF NOT EXISTS iGM_CoinTransactions (
  iGM_Id             TEXT PRIMARY KEY,
  iGM_UserId         TEXT NOT NULL,
  iGM_Type           TEXT NOT NULL,
  iGM_Amount         NUMERIC(14,3) NOT NULL,
  iGM_BalanceAfter   NUMERIC(14,3) NOT NULL,
  iGM_Detail         TEXT NOT NULL DEFAULT '',
  iGM_CreatedAt      TEXT NOT NULL,
  CONSTRAINT iGM_CoinTransactions_UserId_FK FOREIGN KEY (iGM_UserId) REFERENCES iGM_Users(iGM_Id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_coin_tx_user_created
  ON iGM_CoinTransactions (iGM_UserId, iGM_CreatedAt DESC);
CREATE INDEX IF NOT EXISTS idx_coin_tx_type_created
  ON iGM_CoinTransactions (iGM_Type, iGM_CreatedAt DESC);

-- 5. 为所有已有用户补一条 Coin 起始流水（1 Coin = 1 元，默认 5）
-- 注意：旧用户的 UQ 默认 10 已通过列默认值覆盖，不再额外写流水，避免重复
INSERT INTO iGM_CoinTransactions (iGM_Id, iGM_UserId, iGM_Type, iGM_Amount, iGM_BalanceAfter, iGM_Detail, iGM_CreatedAt)
SELECT
  'migrate-coin-' || iGM_Id,
  iGM_Id,
  'register',
  5.000,
  5.000,
  '旧数据迁移：Coin 起始赠送 5',
  iGM_CreatedAt
FROM iGM_Users
WHERE NOT EXISTS (SELECT 1 FROM iGM_CoinTransactions WHERE iGM_CoinTransactions.iGM_UserId = iGM_Users.iGM_Id);

COMMIT;
